"""Report a spec's status, read from its pull request (spec 0006).

Once a spec is handed off, the truth about it lives in the code host: which checks ran,
what the grader said, who approved, whether it merged. This reads that — it never sets
status by hand and never votes on a gate. The one write it makes is `status: merged`, and
only once the PR has actually merged, committed straight onto the default branch (best
effort: a protected default branch may reject the push, which is reported, not fatal — the
read side of this tool must still succeed regardless).

Standalone or Workflow:
  - Standalone: --repo <path>
  - Workflow:   --state .sdlc/state.yaml
"""

import argparse
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_spec as cs
from github_import import GitHubImportError, fetch_pr_events, gh_json, run_gh
from handoff import HandoffError, run_git, branch_name_for, resolve_base_branch

VERDICT_HEADING = "Acceptance Check Verdicts"
GRADER_CHECK_NAME = "grader"
SECURITY_CHECK_NAME = "security-review"
NON_TERMINAL_CONCLUSIONS = (None, "SUCCESS", "NEUTRAL", "SKIPPED")


class SpecStatusError(Exception):
    """The spec file itself is unreadable/malformed — distinct from no-code-host-access,
    which is reported, not raised."""


# ---------------------------------------------------------------------------
# Code-host reads
# ---------------------------------------------------------------------------

def find_pr_for_branch(repo_root, branch_name: str) -> dict | None:
    prs = gh_json(
        ["pr", "list", "--head", branch_name, "--state", "all",
         "--json", "number,url,state,mergedAt,isDraft,statusCheckRollup,reviews,reviewRequests"],
        cwd=str(repo_root),
    )
    return prs[0] if prs else None


def fetch_pr_comment_bodies(repo_root, pr_number: int) -> list[str]:
    result = gh_json(["pr", "view", str(pr_number), "--json", "comments"], cwd=str(repo_root))
    return [c.get("body", "") for c in result.get("comments", [])]


# ---------------------------------------------------------------------------
# The `## Acceptance Check Verdicts` block (harness/profile/rubrics/grader.md)
# ---------------------------------------------------------------------------

def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{2,}:?", c.strip() or "-") for c in cells)


def _parse_table(block: str) -> list[dict]:
    rows, header = [], None
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if _is_separator_row(cells):
            continue
        if header is None:
            header = [c.lower() for c in cells]
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def parse_verdict_block(comment_body: str) -> list[dict] | None:
    """None when the heading isn't present at all — distinct from an empty (but present)
    block, which is a real (if odd) answer of zero verdicts."""
    m = re.search(rf"^##\s+{re.escape(VERDICT_HEADING)}\s*$", comment_body, re.IGNORECASE | re.MULTILINE)
    if not m:
        return None
    nxt = re.compile(r"^##\s+", re.MULTILINE).search(comment_body, m.end())
    block = comment_body[m.end(): nxt.start() if nxt else len(comment_body)]
    return [
        {
            "check": (row.get("check") or "").strip(),
            "covered": (row.get("covered") or "").strip().lower() == "covered",
            "reason": (row.get("reason") or "").strip(),
        }
        for row in _parse_table(block)
    ]


def find_grader_verdicts(repo_root, pr_number: int) -> tuple[list[dict] | None, str | None]:
    """(verdicts, error). The latest comment carrying the block wins — the grader updates
    its own comment on re-runs rather than stacking new ones (grader.yml's own instruction)."""
    for body in reversed(fetch_pr_comment_bodies(repo_root, pr_number)):
        verdicts = parse_verdict_block(body)
        if verdicts is not None:
            return verdicts, None
    return None, "no grader verdict block found in the PR's comments"


# ---------------------------------------------------------------------------
# "Waiting on" — the first unmet requirement, in the order the loop actually clears them
# ---------------------------------------------------------------------------

def _humanize_age(iso_timestamp: str) -> str:
    then = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    days = (datetime.now(timezone.utc) - then).days
    if days <= 0:
        return "today"
    return "1 day ago" if days == 1 else f"{days} days ago"


def _reviewer_handle(entry: dict) -> str:
    return entry.get("login") or entry.get("name") or "someone"


def compute_waiting_on(repo_root, pr: dict, verdicts: list[dict] | None, verdict_error: str | None) -> str:
    if pr["state"] == "MERGED":
        return "merged"
    if pr["state"] == "CLOSED":
        return "closed without merging"
    if pr.get("isDraft"):
        return "waiting for the branch to be marked ready for review"

    checks = pr.get("statusCheckRollup") or []
    # grader and security-review get their own dedicated messages below (advisory vs.
    # gated have different meaning to the human reading this) — excluded here so a
    # failing/pending security-review doesn't get reported as a generic CI failure.
    ordinary_checks = [c for c in checks if c["name"] not in (GRADER_CHECK_NAME, SECURITY_CHECK_NAME)]
    pending = [c for c in ordinary_checks if c.get("status") != "COMPLETED"]
    if pending:
        return f"waiting for CI: {pending[0]['name']} still running"
    failing = [c for c in ordinary_checks if c.get("conclusion") not in NON_TERMINAL_CONCLUSIONS]
    if failing:
        return f"waiting for CI: {failing[0]['name']} failed"

    grader_check = next((c for c in checks if c["name"] == GRADER_CHECK_NAME), None)
    if grader_check is None:
        return "waiting for the grader to run"
    if verdict_error:
        return f"waiting for a readable grader verdict ({verdict_error})"

    security_check = next((c for c in checks if c["name"] == SECURITY_CHECK_NAME), None)
    if security_check and security_check.get("conclusion") not in NON_TERMINAL_CONCLUSIONS:
        return "waiting for the security review"

    approvals = [r for r in pr.get("reviews", []) if r.get("state") == "APPROVED"]
    if approvals:
        return "ready to merge"

    pending_reviewers = pr.get("reviewRequests") or []
    if pending_reviewers:
        who = _reviewer_handle(pending_reviewers[0])
        try:
            events = fetch_pr_events(str(repo_root), pr["number"])
            requested = sorted(e["created_at"] for e in events if e.get("event") == "review_requested")
            age = f" {_humanize_age(requested[-1])}" if requested else ""
        except GitHubImportError:
            age = ""
        return f"waiting for a non-author approval; requested from @{who}{age}"
    return "waiting for a non-author approval"


# ---------------------------------------------------------------------------
# status: merged — the one write this tool makes
# ---------------------------------------------------------------------------

def _set_status_merged(text: str) -> str:
    if not text.startswith("---"):
        raise SpecStatusError("Spec has no frontmatter block")
    end = text.find("\n---", 3)
    if end == -1:
        raise SpecStatusError("Spec frontmatter block is not closed")
    fm_block, rest = text[:end], text[end:]
    fm_block = re.sub(r"^status:.*$", "status: merged", fm_block, count=1, flags=re.MULTILINE)
    return fm_block + rest


def read_committed_status(repo_root, base_branch: str, spec_rel_path: str) -> str | None:
    """The `status` field as actually committed on the default branch — never the caller's
    local checkout, which may be sitting anywhere and would make this check meaningless."""
    run_git(["fetch", "origin", "--", base_branch], cwd=repo_root)
    try:
        content = run_git(["show", f"FETCH_HEAD:{spec_rel_path}"], cwd=repo_root)
    except HandoffError:
        return None
    fm, _ = cs.parse_frontmatter(content)
    return (fm.get("status") or "").strip().lower() or None


def finalize_merge(repo_root, base_branch: str, spec_rel_path: str, spec_id: str) -> tuple[bool, str | None]:
    """(wrote_anything, error). Idempotent: a spec already `merged` on the base branch is a
    no-op. A push rejection (e.g. branch protection) is reported, never raised — the read
    side of `main()` must still print regardless.

    Built entirely from git plumbing, with no checkout of `base_branch` anywhere — unlike
    handoff.py's new-branch case, this writes onto the SAME branch name the caller's own
    working copy is almost certainly already sitting on (it's the default branch), and
    `git worktree add` refuses to check out a branch that's checked out somewhere else.
    """
    current = read_committed_status(repo_root, base_branch, spec_rel_path)
    if current == "merged":
        return False, None
    base_sha = run_git(["rev-parse", f"origin/{base_branch}"], cwd=repo_root).strip()
    content = run_git(["show", f"{base_sha}:{spec_rel_path}"], cwd=repo_root)
    new_text = _set_status_merged(content)

    with tempfile.TemporaryDirectory() as tmp:
        index_file = str(Path(tmp) / "index")
        env = {"GIT_INDEX_FILE": index_file}
        run_git(["read-tree", base_sha], cwd=repo_root, env=env)
        blob_sha = run_git(["hash-object", "-w", "--stdin"], cwd=repo_root, input_text=new_text).strip()
        run_git(["update-index", "--cacheinfo", f"100644,{blob_sha},{spec_rel_path}"], cwd=repo_root, env=env)
        new_tree = run_git(["write-tree"], cwd=repo_root, env=env).strip()
    new_commit = run_git(
        ["commit-tree", new_tree, "-p", base_sha, "-m", f"chore: spec {spec_id} merged"], cwd=repo_root,
    ).strip()
    try:
        run_git(["push", "origin", f"{new_commit}:refs/heads/{base_branch}"], cwd=repo_root)
    except HandoffError as e:
        return False, str(e)
    return True, None


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def report_status(repo_root: Path, spec_path: Path) -> dict:
    if not spec_path.exists():
        raise SpecStatusError(f"Spec not found: {spec_path}")
    text = spec_path.read_text(encoding="utf-8")
    fm, _ = cs.parse_frontmatter(text)
    if not fm:
        raise SpecStatusError("Spec has no parseable frontmatter")

    spec_id, spec_name = fm.get("spec", "????"), fm.get("name", "unnamed")
    branch_name = branch_name_for(spec_id, spec_name)
    spec_rel_path = str(spec_path.resolve().relative_to(repo_root)).replace("\\", "/")

    try:
        pr = find_pr_for_branch(repo_root, branch_name)
    except GitHubImportError as e:
        return {
            "spec": spec_id, "branch": branch_name, "code_host_available": False,
            "local_status": (fm.get("status") or "").strip(),
            "error": str(e),
        }

    if pr is None:
        return {
            "spec": spec_id, "branch": branch_name, "code_host_available": True,
            "pull_request": None,
        }

    verdicts, verdict_error = (None, None)
    checks = pr.get("statusCheckRollup") or []
    if any(c["name"] == GRADER_CHECK_NAME for c in checks):
        verdicts, verdict_error = find_grader_verdicts(repo_root, pr["number"])

    waiting_on = compute_waiting_on(repo_root, pr, verdicts, verdict_error)

    merge_committed = False
    merge_error = None
    if pr["state"] == "MERGED":
        base_branch = resolve_base_branch(repo_root)
        merge_committed, merge_error = finalize_merge(repo_root, base_branch, spec_rel_path, spec_id)

    return {
        "spec": spec_id,
        "branch": branch_name,
        "code_host_available": True,
        "pull_request": {
            "number": pr["number"],
            "url": pr["url"],
            "state": pr["state"],
            "merged_at": pr.get("mergedAt"),
            "checks": [
                {"name": c["name"], "status": c.get("status"), "conclusion": c.get("conclusion")}
                for c in checks
            ],
            "grader_ran": any(c["name"] == GRADER_CHECK_NAME for c in checks),
            "verdicts": verdicts,
            "verdict_error": verdict_error,
            "security_review": next(
                ({"conclusion": c.get("conclusion")} for c in checks if c["name"] == SECURITY_CHECK_NAME),
                None,
            ),
            "approvals": [
                {"by": r.get("author", {}).get("login"), "at": r.get("submittedAt")}
                for r in pr.get("reviews", []) if r.get("state") == "APPROVED"
            ],
            "waiting_on": waiting_on,
        },
        "status_committed_merged": merge_committed,
        "merge_commit_error": merge_error,
    }


# ---------------------------------------------------------------------------
# Every spec at once, in ONE code-host request (spec 0011's board)
# ---------------------------------------------------------------------------
#
# The board shows hundreds of specs and has two seconds to do it. report_status() above is
# one code-host round trip per spec — measured at 1.05s each even on its fast path, so two
# hundred specs is about three and a half minutes. This asks once instead: every pull
# request in one request, matched to specs locally by the branch-naming rule they already
# share.
#
# Two deliberate differences from report_status(), both of which the board can live with and
# neither of which it should pretend away:
#
#   * It NEVER WRITES. report_status() commits `status: merged` when it sees a merged pull
#     request; a board refreshing on a timer must not commit anything, and spec 0011 says
#     the status view offers no control that changes anything. Merging still gets recorded —
#     by the per-spec call, which is what runs when a person opens one.
#   * The grader's verdicts and the exact age of a review request each need their own
#     per-pull-request fetch, so they are not read here. `waiting_on` is computed from what
#     the one request returns, and `updated_at` is offered as "when this last moved" rather
#     than dressed up as "how long it has been waiting", which would be a different and
#     unmeasured thing.

PR_LIST_FIELDS = (
    "number,url,state,mergedAt,updatedAt,isDraft,headRefName,"
    "statusCheckRollup,reviews,reviewRequests"
)


def fetch_all_pull_requests(repo_root, limit: int = 1000) -> dict[str, dict]:
    """Every pull request the code host knows about, keyed by its head branch."""
    prs = gh_json(
        ["pr", "list", "--state", "all", "--limit", str(limit), "--json", PR_LIST_FIELDS],
        cwd=str(repo_root),
    )
    # Newest first is gh's own order; keeping the FIRST occurrence of a branch means a
    # reopened-then-rebuilt branch reports its current pull request, not a stale one.
    by_branch: dict[str, dict] = {}
    for pr in prs:
        by_branch.setdefault(pr.get("headRefName", ""), pr)
    return by_branch


def _safe_spec_row(spec_path: Path, repo_root: Path, by_branch: dict[str, dict] | None) -> dict:
    """One row, and never more than one row's worth of damage.

    The board is the screen somebody opens to find out where the work is. One spec that cannot
    be read is a fact about that spec; it must not become a blank screen that says nothing about
    any of the others.
    """
    try:
        return _spec_row(spec_path, repo_root, by_branch)
    except Exception as e:  # noqa: BLE001
        return {"path": spec_path.name, "error": f"could not be read: {type(e).__name__}: {e}"}


def _spec_row(spec_path: Path, repo_root: Path, by_branch: dict[str, dict] | None) -> dict:
    """One board row. Everything except `pull_request` comes from the file itself, so a row
    is complete and useful before the code host has answered — or when it never does."""
    # errors="replace", matching track_specs.scan_specs, which reads the same files. Without it
    # a single byte that is not valid UTF-8 raises out of the whole board build, and the screen
    # shows nothing at all rather than one row saying which file is the problem. One unreadable
    # spec should cost one row.
    try:
        text = spec_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return {"path": spec_path.name, "error": f"could not be read: {e}"}
    fm, _ = cs.parse_frontmatter(text)
    if not fm:
        return {"path": spec_path.name, "error": "no parseable frontmatter"}

    spec_id = str(fm.get("spec", "????"))
    spec_name = str(fm.get("name", "unnamed"))
    branch = branch_name_for(spec_id, spec_name)

    row = {
        "spec": spec_id,
        "name": spec_name,
        "path": str(spec_path.resolve().relative_to(repo_root)).replace("\\", "/"),
        "title": _spec_title(text),
        "status": (fm.get("status") or "").strip(),
        "risk": (fm.get("risk") or "").strip(),
        "team": (fm.get("team") or "").strip(),
        "channel": (fm.get("channel") or "").strip(),
        "owner": (fm.get("owner") or "").strip(),
        "developer": (fm.get("developer") or "").strip(),
        "checker": (fm.get("checker") or "").strip(),
        "branch": branch,
        "pull_request": None,
    }
    if by_branch is None:
        return row

    pr = by_branch.get(branch)
    if pr is None:
        return row

    row["pull_request"] = {
        "number": pr["number"],
        "url": pr["url"],
        "state": pr["state"],
        "merged_at": pr.get("mergedAt"),
        "updated_at": pr.get("updatedAt"),
        # verdicts/verdict_error are None here on purpose — see this section's header.
        "waiting_on": compute_waiting_on(repo_root, pr, None, None),
        "waiting_on_handle": waiting_on_handle(pr),
    }
    return row


def waiting_on_handle(pr: dict) -> str | None:
    """The one person this pull request is waiting on, as a handle, or None.

    Separate from `waiting_on`, which is a sentence for a person to read. A board needs to
    answer "is this waiting on ME" for hundreds of rows, and doing that by pattern-matching
    an English sentence would break the first time the wording is improved. Only a requested
    reviewer names an individual; everything else — CI, the grader, an unclaimed review — is
    waiting on no one in particular, and says so by returning None rather than guessing."""
    if pr["state"] != "OPEN" or pr.get("isDraft"):
        return None
    requests = pr.get("reviewRequests") or []
    if not requests:
        return None
    handle = _reviewer_handle(requests[0])
    return f"@{handle}" if handle != "someone" else None


def _spec_title(text: str) -> str:
    """The spec's own H1, minus the `Spec NNNN — ` prefix it always carries."""
    for line in text.splitlines():
        if line.startswith("# "):
            return re.sub(r"^Spec\s+\S+\s+[—-]\s*", "", line[2:].strip())
    return ""


def report_all(repo_root: Path) -> dict:
    """Every spec in the repository, with live pull-request state where there is any.

    Read-only, and honest when the code host is unreachable: the rows are still returned,
    built from the spec files, with `code_host_available: false` saying why the live half is
    missing. An empty board would read as "there is no work", which is a different claim."""
    specs_dir = repo_root / "specs"
    spec_paths = sorted(p for p in specs_dir.glob("*.md") if p.name != "README.md") \
        if specs_dir.is_dir() else []

    by_branch: dict[str, dict] | None = None
    error = None
    try:
        by_branch = fetch_all_pull_requests(repo_root)
    except GitHubImportError as e:
        error = str(e)

    return {
        "code_host_available": by_branch is not None,
        "error": error,
        "specs": [_safe_spec_row(p, repo_root, by_branch) for p in spec_paths],
    }


def format_all_report(result: dict) -> str:
    rows = result["specs"]
    lines = [f"{len(rows)} spec(s)"]
    if not result["code_host_available"]:
        lines.append(f"  Live status unavailable: {result.get('error')}")
    for row in rows:
        if "error" in row:
            lines.append(f"  {row['path']}: {row['error']}")
            continue
        pr = row["pull_request"]
        where = pr["waiting_on"] if pr else (row["status"] or "no status")
        lines.append(
            f"  {row['spec']}  {row['risk']:<6} {row['status']:<9} "
            f"{row['owner'] or '-':<12} {row['developer'] or '-':<12} {where}"
        )
    return "\n".join(lines)


def format_report(result: dict) -> str:
    lines = [f"Spec {result['spec']} — {result['branch']}"]
    if not result.get("code_host_available", True):
        lines.append(f"  Local status: {result.get('local_status') or '(unset)'}")
        lines.append(f"  Code-host data unavailable: {result['error']}")
        lines.append("  (Not the same as 'no PR yet' — this is what's known locally only.)")
        return "\n".join(lines)

    pr = result.get("pull_request")
    if pr is None:
        lines.append("  No pull request found for this branch.")
        return "\n".join(lines)

    lines.append(f"  PR #{pr['number']}: {pr['url']} [{pr['state']}]")
    lines.append("  Checks:")
    for c in pr["checks"]:
        lines.append(f"    {c['name']:<28} {c.get('conclusion') or c.get('status')}")
    if pr["grader_ran"]:
        if pr["verdict_error"]:
            lines.append(f"  Grader: ran, but {pr['verdict_error']}")
        else:
            covered = sum(1 for v in pr["verdicts"] if v["covered"])
            lines.append(f"  Grader: {covered}/{len(pr['verdicts'])} acceptance checks covered")
    else:
        lines.append("  Grader: has not run")
    if pr["security_review"]:
        lines.append(f"  Security review: {pr['security_review']['conclusion']}")
    if pr["approvals"]:
        for a in pr["approvals"]:
            lines.append(f"  Approved by: {a['by']}")
    else:
        lines.append("  Approvals: none yet")
    lines.append(f"  Waiting on: {pr['waiting_on']}")
    if result.get("status_committed_merged"):
        lines.append("  Frontmatter status set to `merged` on the default branch.")
    if result.get("merge_commit_error"):
        lines.append(f"  Could not record the merge on the default branch: {result['merge_commit_error']}")
    return "\n".join(lines)


def resolve_repo_root(args) -> Path:
    if args.state:
        state_path = Path(args.state)
        if not state_path.exists():
            print(f"Error: State file not found: {state_path}")
            sys.exit(1)
        return state_path.resolve().parent.parent
    return Path(args.repo).resolve()


def main():
    parser = argparse.ArgumentParser(description="Report a spec's status, read from its pull request")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--state", help="Path to .sdlc/state.yaml (workflow mode)")
    src.add_argument("--repo", default=".", help="Target repo root (standalone mode; default: cwd)")
    what = parser.add_mutually_exclusive_group(required=True)
    what.add_argument("--spec", help="Path to specs/NNNN-name.md")
    what.add_argument(
        "--all", action="store_true",
        help="Every spec, in ONE code-host request (for a board). Read-only: unlike --spec "
             "this never commits `status: merged`.",
    )
    parser.add_argument("--json", action="store_true", help="Emit the report as JSON")
    args = parser.parse_args()

    repo_root = resolve_repo_root(args)

    if args.all:
        result = report_all(repo_root)
        if args.json:
            import json
            print(json.dumps(result, indent=2))
        else:
            print(format_all_report(result))
        return

    spec_path = Path(args.spec)

    try:
        result = report_status(repo_root, spec_path)
    except SpecStatusError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.json:
        import json
        print(json.dumps(result, indent=2))
    else:
        print(format_report(result))


if __name__ == "__main__":
    main()
