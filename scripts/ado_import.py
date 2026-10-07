"""Azure DevOps through the Azure CLI — the `az` twin of `github_import` (code-host providers, Wave 1;
fetchers reconciled with the 2026-10-05 capture in Wave 3).

One function per gh call site, with the SAME name, signature and return shape as the GitHub-side
function it mirrors (`code_host.PROVIDER_FUNCTIONS`; `test_provider_parity.py` pins it), so a
consuming script dispatches at its call site and nothing downstream learns a second vocabulary.

This module is the public home; it is split for file size only:
  * `ado_transport.py` — `run_az` / `az_json`, the parsed-remote scope, the per-process caches;
  * `ado_map.py`       — the PURE normalisers (`map_pr`, `map_checks`, …) and `AdoImportError`;
  * `ado_pipelines.py` — `fetch_runs`, `run_jobs`, `secret_names`.
Everything is re-exported here, so `ado_import.<name>` is always the name to patch or call.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ado_map  # noqa: E402
import ado_transport as t  # noqa: E402
from ado_map import (  # noqa: E402,F401
    AdoImportError, map_checks, map_jobs, map_policies, map_pr, map_reviews, map_runs, map_threads,
)
from ado_pipelines import fetch_runs, find_definition, referenced_variable_groups, run_jobs, secret_names  # noqa: E402,F401
from ado_transport import (  # noqa: E402,F401  (re-exported; the ONE seam to patch is ado_transport.az_json)
    API_VERSION, AZ_ENV, PREVIEW_API_VERSION, az_binary, az_json, clear_caches, run_az,
)

ADO_CHECKS_MAX = 40  # bulk mode: policy evaluations fetched for at most this many active PRs
PR_PROJECTION = ("[].{pullRequestId:pullRequestId,status:status,isDraft:isDraft,sourceRefName:sourceRefName,"
                 "creationDate:creationDate,closedDate:closedDate,createdBy:createdBy,reviewers:reviewers,"
                 "labels:labels,lastMergeCommit:lastMergeCommit,repository:repository}")

_scope = t.scope  # the name the design uses; tests may reach for it


def _roster(repo_root) -> dict | None:
    path = Path(repo_root) / ".sdlc" / "team.yaml"
    try:
        import yaml
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) if path.is_file() else None
    except Exception:  # a broken roster must not break a status read; validate_team owns that
        return None
    return doc if isinstance(doc, dict) else None


def _email_for(repo_root, handle: str) -> str | None:
    """The roster `email` for a handle. Prefers validate_team.email_for (Wave 2's helper) when the
    installed validate_team has it; the local scan below is the same rule for an older one."""
    roster = _roster(repo_root)
    import validate_team as vt
    if roster is not None and hasattr(vt, "email_for"):
        return vt.email_for(roster, handle)
    for p in (roster or {}).get("people") or []:
        if isinstance(p, dict) and p.get("handle") == handle and isinstance(p.get("email"), str):
            return p["email"].strip() or None
    return None


# ── fetchers (same names and signatures as the GitHub side) ────────────────────────────────

def whoami(repo_root) -> dict:
    """Local read of the cached az profile — no network. A PAT-only session has no account. The
    tenant rides along because az's DEFAULT account decides the Azure DevOps token: a person who
    is a guest in the organisation's tenant may be signed in and still be the wrong identity."""
    acct = t.az_json(["account", "show", "--query", "{user:user.name,tenant:tenantId}"], repo_root)
    login = acct.get("user") if isinstance(acct, dict) else None
    if not login:
        raise AdoImportError("signed in with a PAT only; identity unavailable — run `az login`")
    return {"login": login, "kind": "upn", "email": login, "name": None, "id": None, "handle": None,
            "tenant": acct.get("tenant")}


def display_name(repo_root, upn: str) -> str | None:
    """`az devops user show` — OPTIONAL and silent: it needs the "ReadExtended Users" permission,
    which a contractor identity may not hold (captured: Access Denied). None is "not readable"."""
    try:
        user = t.az_json(["devops", "user", "show", "--user", upn, "--org", t.remote(repo_root).org_url], repo_root)
    except AdoImportError:
        return None
    return ((user or {}).get("user") or {}).get("displayName") if isinstance(user, dict) else None


def repo_view(repo_root) -> dict:
    """The repository record, read once per process: the threads and commits routes need its GUID
    for every PR, and a board with a hundred pending reviews must not pay for it a hundred times."""
    r = t.remote(repo_root)
    key = str(repo_root)
    if key not in t._REPO:
        rec = t.az_json(["repos", "show", *t.scope(repo_root)], repo_root)
        t._REPO[key] = {"nameWithOwner": r.slug, "id": ado_map._require(rec, "id", "GitRepository"),
                        "defaultBranch": ado_map.strip_ref(rec.get("defaultBranch")),
                        "webUrl": rec.get("webUrl") or r.web_url, "project": rec.get("project"),
                        "isFork": rec.get("isFork"), "viewerPermission": None}
    return dict(t._REPO[key])


def fetch_pr_checks(repo_root, pr_number: int) -> list[dict]:
    return map_checks(t.az_json(["repos", "pr", "policy", "list", "--id", str(pr_number),
                               "--org", t.remote(repo_root).org_url], repo_root))


def find_pr_for_branch(repo_root, branch_name: str) -> dict | None:
    prs = t.az_json(["repos", "pr", "list", *t.scope(repo_root), "--source-branch", branch_name,
                   "--status", "all", "--top", "5"], repo_root)
    if not prs:
        return None
    newest = max(prs, key=lambda p: p.get("pullRequestId") or 0)
    # Policy evaluations are read only while the PR is active; a completed PR's are history. An
    # active PR whose target has no policies answers `[]` (captured) — that is "no checks", so
    # the rollup is an empty list and never `_checks_unavailable`.
    checks = fetch_pr_checks(repo_root, newest["pullRequestId"]) if newest.get("status") == "active" else None
    return map_pr(newest, t.remote(repo_root), checks, _roster(repo_root))


def _threads(repo_root, pr_number: int) -> dict:
    key = (str(repo_root), int(pr_number))
    if key not in t._THREADS:
        t._THREADS[key] = t.invoke(repo_root, "git", "pullRequestThreads", {
            "project": t.remote(repo_root).project, "repositoryId": repo_view(repo_root)["id"],
            "pullRequestId": pr_number})
    return t._THREADS[key]


def fetch_pr_comment_bodies(repo_root, pr_number: int) -> list[str]:
    return map_threads(_threads(repo_root, pr_number))[0]


def fetch_pr_events(repo_root: str, number: int) -> list[dict]:
    return map_threads(_threads(repo_root, number))[1]


def _list_raw(repo_root, limit: int) -> list[dict]:
    """Every GitPullRequest (projected), newest first, paged by 1000."""
    prs: list[dict] = []
    skip = 0
    while len(prs) < limit:
        page = t.az_json(["repos", "pr", "list", *t.scope(repo_root), "--status", "all",
                        "--top", str(min(1000, limit - len(prs))), "--skip", str(skip),
                        "--query", PR_PROJECTION], repo_root)
        prs.extend(page)
        if len(page) < 1000:
            break
        skip += len(page)
    prs.sort(key=lambda p: p.get("pullRequestId") or 0, reverse=True)
    return prs


def list_pull_requests(repo_root, limit: int = 100) -> list[dict]:
    """Every pull request as a PullRequest view, newest first, WITHOUT checks and without the
    per-branch fold — the twin of pipeline_proof's P2 `gh pr list --state all`, whose merge
    history must count every merged PR even when one branch carried several."""
    remote, roster = t.remote(repo_root), _roster(repo_root)
    return [map_pr(pr, remote, None, roster) for pr in _list_raw(repo_root, limit)]


def fetch_all_pull_requests(repo_root, limit: int = 1000) -> dict[str, dict]:
    """Every pull request, keyed by head branch, newest first per branch. Policy evaluations are
    read for active, non-draft PRs only and for at most ADO_CHECKS_MAX of them — rows past the
    cap carry `_checks_unavailable` so a board says "not read" rather than "no checks"."""
    prs = _list_raw(repo_root, limit)
    remote, roster = t.remote(repo_root), _roster(repo_root)
    by_branch: dict[str, dict] = {}
    fetched = 0
    for pr in prs:
        branch = ado_map.strip_ref(pr.get("sourceRefName"))
        if branch in by_branch:
            continue
        active = pr.get("status") == "active" and not pr.get("isDraft")
        if active and fetched < ADO_CHECKS_MAX:
            fetched += 1
            row = map_pr(pr, remote, fetch_pr_checks(repo_root, pr["pullRequestId"]), roster)
        else:
            row = map_pr(pr, remote, None, roster)
            if active:
                row["_checks_unavailable"] = True
        by_branch[branch] = row
    return by_branch


def branch_policies(cwd) -> tuple[list, str]:
    """(PolicyConfiguration[], branch) scoped to THIS repository and its default branch:
    `repos policy list` is project-wide otherwise and would count sibling repositories' policies
    as this one's (pitfall P6). The raw list, for callers that count; `fetch_branch_policies`
    is the Ruleset view of the same call."""
    view = repo_view(cwd)
    branch = view["defaultBranch"] or "main"
    configs = t.az_json(["repos", "policy", "list", *t.scope(cwd, with_repository=False),
                       "--repository-id", view["id"], "--branch", branch], cwd)
    return (configs if isinstance(configs, list) else []), branch


def fetch_branch_policies(cwd: str, nwo: str, installed_name: str | None) -> dict | None:
    configs, _ = branch_policies(cwd)
    return map_policies(configs, installed_name or "branch policies")


def create_draft_pr(repo_root, branch_name: str, base_branch: str, spec_id: str, spec_name: str,
                    developer: str, checker: str) -> str:
    """Open the draft PR for a hand-off. ADO has no assignee, so the developer is named in the
    description; the checker becomes a required reviewer by roster EMAIL (an `@handle` is a
    CLIError to az). Without an email the PR is still opened and the description says so — the
    caller decides whether that is an assignment_error; the local half is never failed over it."""
    # D-OWNER-3: the developer is a line in the description, with the roster email beside the
    # handle when the roster knows one — ADO has no assignee, and a reader on the PR page should
    # not have to open team.yaml to find who is building this.
    developer_email = _email_for(repo_root, developer) if developer else None
    lines = [f"Hand-off for `specs/{spec_id}-{spec_name}.md`. Delegate beat — plan approval, then build.",
             f"Developer: {developer}" + (f" <{developer_email}>" if developer_email else "")]
    reviewer = None
    if checker:
        reviewer = checker if "@" in checker[1:] else _email_for(repo_root, checker)
        lines.append(f"Checker: {checker}" + ("" if reviewer else
                     " (no email in .sdlc/team.yaml — add one so Azure DevOps can request the review)"))
    args = ["repos", "pr", "create", *t.scope(repo_root), "--source-branch", branch_name,
            "--target-branch", base_branch, "--title", f"Spec {spec_id}: {spec_name}",
            "--description", *lines, "--draft", "true"]
    if reviewer:
        args += ["--required-reviewers", reviewer]
    created = t.az_json([*args, "--query", "pullRequestId"], repo_root)
    return f"{t.remote(repo_root).web_url}/pullrequest/{created}"


def complete_pr(repo_root, pr_number: int) -> str:
    """Fails closed: az refuses when a blocking policy is unmet or the merge has conflicts."""
    t.az_json(["repos", "pr", "update", "--id", str(pr_number), "--org", t.remote(repo_root).org_url,
             "--status", "completed"], repo_root)
    return f"{t.remote(repo_root).web_url}/pullrequest/{pr_number}"


assign_on_host = create_draft_pr  # the GitHub-side name, so a by-name dispatch finds it too

# Every argv prefix this provider issues, for test_az_contract.py (flags checked against local --help).
AZ_CONTRACT: tuple[list[str], ...] = (
    ["account", "show", "--query", "x", "-o", "json"],
    ["repos", "show", "--detect", "false", "--org", "U", "--project", "P", "--repository", "R", "-o", "json"],
    ["repos", "pr", "list", "--detect", "false", "--org", "U", "--project", "P", "--repository", "R",
     "--source-branch", "B", "--status", "all", "--top", "5", "--skip", "0", "--query", "x", "-o", "json"],
    ["repos", "pr", "policy", "list", "--id", "1", "--org", "U", "-o", "json"],
    ["repos", "pr", "create", "--detect", "false", "--org", "U", "--project", "P", "--repository", "R",
     "--source-branch", "H", "--target-branch", "B", "--title", "T", "--description", "L", "--draft", "true",
     "--required-reviewers", "E", "--query", "x", "-o", "json"],
    ["repos", "pr", "update", "--id", "1", "--org", "U", "--status", "completed", "-o", "json"],
    ["repos", "policy", "list", "--detect", "false", "--org", "U", "--project", "P", "--repository-id", "G",
     "--branch", "main", "-o", "json"],
    ["devops", "invoke", "--area", "git", "--resource", "pullRequestThreads", "--route-parameters", "a=b",
     "--api-version", "7.1", "--org", "U", "-o", "json"],
    ["devops", "user", "show", "--user", "E", "--org", "U", "-o", "json"],
    ["pipelines", "list", "--detect", "false", "--org", "U", "--project", "P", "--repository", "R",
     "--repository-type", "tfsgit", "-o", "json"],
    ["pipelines", "show", "--detect", "false", "--org", "U", "--project", "P", "--id", "1", "-o", "json"],
    ["pipelines", "runs", "list", "--detect", "false", "--org", "U", "--project", "P", "--pipeline-ids", "1",
     "--top", "10", "--query-order", "QueueTimeDesc", "-o", "json"],
    ["pipelines", "variable-group", "list", "--detect", "false", "--org", "U", "--project", "P", "-o", "json"],
    ["pipelines", "variable-group", "variable", "list", "--group-id", "1", "--detect", "false", "--org", "U",
     "--project", "P", "-o", "json"],
)
