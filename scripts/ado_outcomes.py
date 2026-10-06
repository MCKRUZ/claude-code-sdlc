"""Build-loop outcome events from Azure DevOps history — the `az` twin of `github_import` (Wave 5).

Same fetcher names as `github_import`, same gh-shaped returns, so `github_import.map_*` is reused
VERBATIM: this module translates az JSON into the gh dicts those mappers already understand, then
re-labels the resulting `gh_id` with the `ado-*` prefixes (references/code-host-providers.md), which
never collide with `gh-*`, so one ledger can carry both hosts' history.

What Azure DevOps records differently, and what that costs the numbers (honesty before coverage):
  * A vote carries no timestamp on the PR object; the VoteUpdate system thread does. Approval times
    come from threads. A vote with no thread leaves `accepted_as_is` UNKNOWN (None), never True.
  * There is no "review requested" event. The ReviewersUpdate thread is the nearest moment; a PR
    without one yields a review_wait event WITHOUT `wait_hours` (key omitted, never None — the
    scorecard selects on key presence and its median would choke on None).
  * Deployments are environment deployment records (`--api-version 7.1-preview`; `.1` crashes the
    extension). The deployed SHA is one `pipelines runs show` per terminal record.
  * Incidents are Bugs tagged `incident`; `az boards query` prints nothing when nothing matches.
  * `pr list` has no server-side date filter: 200 completed PRs are read and filtered by closedDate.

Impure seam: `ado_transport.az_json` only (tests patch it). Everything below the fetchers is pure.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ado_import  # noqa: E402
import ado_transport as t  # noqa: E402
import github_import as gi  # noqa: E402
from ado_map import AdoImportError  # noqa: E402
from ado_outcomes_map import (  # noqa: E402,F401  (re-exported: ado_outcomes.<name> is the name to import)
    APPROVE_VOTE, DEPLOY_RESULT, ID_PREFIXES, INCIDENT_WIQL, MERGED_TOP, PREVIEW_API, REJECT_VOTE, SINCE_RE,
    _iso, _need, _value, check_since, commits_to_gh, deployment_to_gh, pr_to_gh, re_id,
    review_requests_from_threads, statuses_from_record, votes_from_threads, work_item_to_gh,
)

# Per-process caches: threads serve two fetchers for one PR; deployment records are read in bulk
# by fetch_deployments and served to fetch_deployment_statuses by id (the gh signature takes an id).
_REPO_ID: dict[str, str] = {}
_THREADS: dict[tuple[str, int], list] = {}
_RECORDS: dict[int, dict] = {}
_SHA: dict[int, str | None] = {}


def clear_caches() -> None:
    for cache in (_REPO_ID, _THREADS, _RECORDS, _SHA):
        cache.clear()


# ── fetchers (same names and signatures as github_import) ─────────────────────────────────

def _invoke(repo_root, area: str, resource: str, route: dict, api_version: str = t.API_VERSION):
    params = [f"{k}={v}" for k, v in route.items()]
    return t.az_json(["devops", "invoke", "--area", area, "--resource", resource, "--route-parameters", *params,
                      "--api-version", api_version, "--org", t.remote(repo_root).org_url], repo_root)


def _repo_id(repo_root) -> str:
    key = str(repo_root)
    if key not in _REPO_ID:
        _REPO_ID[key] = ado_import.repo_view(repo_root)["id"]
    return _REPO_ID[key]


def _threads(repo_root, number: int) -> list:
    key = (str(repo_root), int(number))
    if key not in _THREADS:
        doc = _invoke(repo_root, "git", "pullRequestThreads", {
            "project": t.remote(repo_root).project, "repositoryId": _repo_id(repo_root), "pullRequestId": number})
        _THREADS[key] = _value(doc, "pullRequestThreads")
    return _THREADS[key]


def fetch_merged_prs(repo_root: str, since: str) -> list[dict]:
    prs = t.az_json(["repos", "pr", "list", *t.scope(repo_root), "--status", "completed", "--top", str(MERGED_TOP)], repo_root)
    remote = t.remote(repo_root)
    # `--status completed` is the server's filter; re-checking it here keeps an abandoned PR (which
    # also carries a closedDate) out of the merge count if a caller or a router hands back more.
    mapped = [pr_to_gh(pr, remote) for pr in prs or [] if pr.get("status") == "completed"]
    return [pr for pr in mapped if pr["mergedAt"] and pr["mergedAt"][:10] >= check_since(since)]


def fetch_pr_commits(repo_root: str, number: int) -> list[dict]:
    return commits_to_gh(_invoke(repo_root, "git", "pullRequestCommits", {
        "project": t.remote(repo_root).project, "repositoryId": _repo_id(repo_root), "pullRequestId": number}))


def fetch_pr_events(repo_root: str, number: int) -> list[dict]:
    return review_requests_from_threads(_threads(repo_root, number))


def fetch_pr_reviews(repo_root: str, number: int, author: str) -> list[dict]:
    return votes_from_threads(_threads(repo_root, number), author)


def fetch_deployments(repo_root: str) -> list[dict]:
    project = t.remote(repo_root).project
    out = []
    for env in _value(_invoke(repo_root, "distributedtask", "environments", {"project": project}, PREVIEW_API), "environments"):
        env_id, name = _need(env, "id", "Environment"), _need(env, "name", "Environment")
        recs = _invoke(repo_root, "distributedtask", "environmentdeploymentrecords",
                       {"project": project, "environmentId": env_id}, PREVIEW_API)
        for rec in _value(recs, "environmentdeploymentrecords"):
            dep = deployment_to_gh(rec, name)
            _RECORDS[dep["id"]] = rec
            out.append(dep)
    return out


def fetch_deployment_statuses(repo_root: str, deployment_id: int) -> list[dict]:
    if deployment_id not in _RECORDS:
        raise AdoImportError(f"deployment record {deployment_id} was not read by fetch_deployments")
    return statuses_from_record(_RECORDS[deployment_id])


def fetch_build_sha(repo_root: str, build_id: int) -> str | None:
    if build_id not in _SHA:
        sha = t.az_json(["pipelines", "runs", "show", *t.scope(repo_root, with_repository=False),
                         "--id", str(build_id), "--query", "sourceVersion"], repo_root)
        _SHA[build_id] = sha if isinstance(sha, str) and sha else None
    return _SHA[build_id]


def fetch_incident_issues(repo_root: str, since: str) -> list[dict]:
    items = t.az_json(["boards", "query", *t.scope(repo_root, with_repository=False),
                       "--wiql", INCIDENT_WIQL.format(since=check_since(since))], repo_root)
    return [work_item_to_gh(i) for i in items or []]  # `null` / empty stdout → no work items


# ── orchestration ──────────────────────────────────────────────────────────────────────────

def _is_security(pr: dict) -> bool:
    return any((lb.get("name") or "").lower() == gi.SECURITY_LABEL for lb in pr.get("labels", []))


def collect_report(repo_root: str, since: str) -> dict:
    """{events, notes}. Pull-request history failing is fatal (raised before anything is returned).
    Deploys and incidents are each read whole-or-not: a failure there becomes a note naming the
    reason and contributes no events — the scorecard then reads "no data", never a zero."""
    check_since(since)
    merged = fetch_merged_prs(repo_root, since)
    by_sha = {pr["mergeCommit"]["oid"]: pr for pr in merged if pr.get("mergeCommit")}
    events: list[dict] = []
    for pr in merged:
        pr["reviews"] = fetch_pr_reviews(repo_root, pr["number"], pr["_author"])
        merge = gi.map_merge_event(pr, fetch_pr_commits(repo_root, pr["number"]))
        if not pr["reviews"] and pr["_undated_approvals"]:
            merge["accepted_as_is"] = None
            merge["note"] = "approval time not recorded by Azure DevOps (no VoteUpdate thread); accepted-as-is unknown"
        events.append(re_id(merge))
        requests = fetch_pr_events(repo_root, pr["number"])
        wait = gi.map_review_wait_event(pr, requests)
        approvals = [r for r in pr["reviews"] if r["state"] == "APPROVED"]
        if wait is None and not requests and approvals:  # approved, but no request moment to measure from
            wait = {"type": "review_wait", "gh_id": f"gh-pr-review:{pr['number']}", "timestamp": approvals[0]["submittedAt"],
                    "security": _is_security(pr), "url": pr["url"]}
        if wait:
            events.append(re_id(wait))

    notes: dict[str, str | None] = {"deploys": None, "incidents": None}
    try:
        for dep in fetch_deployments(repo_root):
            if dep["created_at"] < since:
                continue
            statuses = fetch_deployment_statuses(repo_root, dep["id"])
            if statuses and dep["_build_id"] is not None:
                dep["sha"] = fetch_build_sha(repo_root, dep["_build_id"])
            ev = gi.map_deploy_event(dep, statuses, by_sha)
            if ev:
                ev["gh_id"] = f"ado-deploy:{dep['environment']}:{dep['id']}"
                events.append(ev)
    except AdoImportError as e:
        notes["deploys"] = str(e)
        events = [ev for ev in events if ev["type"] != "deploy"]
    try:
        incidents = [gi.map_incident_event(i) for i in fetch_incident_issues(repo_root, since)]
        events.extend(re_id(ev) for ev in incidents if ev)
    except AdoImportError as e:
        notes["incidents"] = str(e)
    return {"events": events, "notes": notes}


def collect_events(repo_root: str, since: str) -> list[dict]:
    """The `github_import.collect_events` twin: every category's events, or an AdoImportError."""
    return collect_report(repo_root, since)["events"]
