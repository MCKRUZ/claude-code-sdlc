"""Import Build-loop outcome events from GitHub's own history (spec 0004).

Reads merged pull requests, reviews, deployments and incident-labelled issues via the
`gh` CLI — no stored credential; auth reuses whatever `gh auth login` session is already
on the machine, which is also this project's stated preferred tool for GitHub work.

Every mapping function here is pure (`gh`-shaped dict in, event dict out) so tests exercise
them against fixture JSON with no live calls and no subprocess. The one impure seam is
`run_gh` — tests monkeypatch it, never `subprocess.run` directly, keeping the mocking
surface to one function.

Conventions this import reuses rather than invents:
  - `risk:high` is this project's existing label for a PR that must clear the security
    workflow (harness/packs/cicd/github/RAILS.md) — reused here as the "this review is a
    security review" signal, so review-wait for it is flagged and reported on its own line.
  - Deploys are read from GitHub's Deployments API, which the shipped `deploy-dev.yml` /
    `deploy-promote.yml` workflows populate via their job-level `environment:` key.
"""

import json
import subprocess
from datetime import datetime, timezone

SECURITY_LABEL = "risk:high"
INCIDENT_LABEL = "incident"
RISK_LABEL_PREFIX = "risk:"
DEPLOY_TERMINAL_STATES = {"success", "failure", "error"}
DEPLOY_FAILURE_STATES = {"failure", "error"}


class GitHubImportError(Exception):
    """`gh` failed — no network, no auth, not a GitHub repo, rate-limited, etc.

    Raised before any event is written, so the caller can abort the whole import cleanly
    with the existing log untouched.
    """


def run_gh(args: list[str], cwd: str) -> str:
    """Shell out to `gh`, returning stdout. Never raises anything but GitHubImportError."""
    try:
        result = subprocess.run(
            ["gh", *args], cwd=cwd, capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError as e:
        raise GitHubImportError("The `gh` CLI is not installed or not on PATH.") from e
    except subprocess.TimeoutExpired as e:
        raise GitHubImportError(f"`gh {' '.join(args)}` timed out after 60s.") from e
    if result.returncode != 0:
        detail = result.stderr.strip() or f"`gh {' '.join(args)}` exited {result.returncode}."
        raise GitHubImportError(detail)
    return result.stdout


def gh_json(args: list[str], cwd: str):
    out = run_gh(args, cwd)
    try:
        return json.loads(out) if out.strip() else []
    except json.JSONDecodeError as e:
        raise GitHubImportError(f"`gh {' '.join(args)}` returned unparseable JSON: {e}") from e


def _parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _hours_between(start: str, end: str) -> float:
    return (_parse_iso(end) - _parse_iso(start)).total_seconds() / 3600


# ---------------------------------------------------------------------------
# Fetching (the only functions that call `gh`)
# ---------------------------------------------------------------------------

def fetch_merged_prs(repo_root: str, since: str) -> list[dict]:
    """Merged PRs since `since` (YYYY-MM-DD), with the fields the mappers below need.

    Deliberately does NOT request `commits` here: `gh pr list --json commits` pulls each
    commit's co-authors as a nested GraphQL connection, and verified live against this
    repo, that trips GitHub's 500,000-node query ceiling at a limit as low as 25 once a
    handful of merged PRs are in the window. `fetch_pr_commits` below reads the same data
    from the REST API instead, per PR, where no such ceiling applies.
    """
    return gh_json(
        ["pr", "list", "--state", "merged", "--search", f"merged:>={since}",
         "--json", "number,mergedAt,labels,reviews,mergeCommit,url",
         "--limit", "100"],
        cwd=repo_root,
    )


def fetch_pr_commits(repo_root: str, number: int) -> list[dict]:
    """A PR's commits via REST (see fetch_merged_prs for why not GraphQL)."""
    return gh_json(
        ["api", f"repos/{{owner}}/{{repo}}/pulls/{number}/commits", "--paginate"],
        cwd=repo_root,
    )


def fetch_pr_events(repo_root: str, number: int) -> list[dict]:
    """The PR's timeline via the Issue Events REST API — carries `review_requested`,
    which `gh pr list --json` does not expose."""
    return gh_json(
        ["api", f"repos/{{owner}}/{{repo}}/issues/{number}/events", "--paginate"],
        cwd=repo_root,
    )


def fetch_deployments(repo_root: str) -> list[dict]:
    # A GET's query params go in the path, not via -f/-F — those flags make `gh api`
    # default to POST, which this endpoint rejects (verified live: "ref wasn't supplied").
    return gh_json(
        ["api", "repos/{owner}/{repo}/deployments?per_page=100", "--paginate"],
        cwd=repo_root,
    )


def fetch_deployment_statuses(repo_root: str, deployment_id: int) -> list[dict]:
    return gh_json(
        ["api", f"repos/{{owner}}/{{repo}}/deployments/{deployment_id}/statuses", "--paginate"],
        cwd=repo_root,
    )


def fetch_incident_issues(repo_root: str, since: str) -> list[dict]:
    return gh_json(
        ["issue", "list", "--search", f"label:{INCIDENT_LABEL} created:>={since}",
         "--json", "number,createdAt,closedAt,state", "--limit", "200"],
        cwd=repo_root,
    )


# ---------------------------------------------------------------------------
# Mapping (pure — no `gh` calls, fully covered by fixture-driven tests)
# ---------------------------------------------------------------------------

def _risk_label(labels: list[dict]) -> str | None:
    for label in labels:
        name = (label.get("name") or "").lower()
        if name.startswith(RISK_LABEL_PREFIX):
            tier = name[len(RISK_LABEL_PREFIX):].upper()
            if tier in ("HIGH", "MEDIUM", "LOW"):
                return tier
    return None


def _is_security_pr(labels: list[dict]) -> bool:
    return any((l.get("name") or "").lower() == SECURITY_LABEL for l in labels)


def map_merge_event(pr: dict, commits: list[dict]) -> dict:
    """One `spec_merged` event per merged PR — always produced, even with zero reviews.

    `commits` is REST-shaped (fetch_pr_commits): each commit's push time is
    `commit.committer.date`.

    accepted_as_is: "no commits pushed after the first approval" (the project's chosen
    definition). A PR that merged with no review at all had nothing to push back against,
    so it is accepted_as_is=True by the same definition, not left unmeasured — leaving it
    unmeasured would silently count it in the rate's denominator without ever crediting it
    in the numerator, understating the rate for exactly the PRs that needed no review.
    """
    approvals = sorted(
        (r for r in pr.get("reviews", []) if r.get("state") == "APPROVED"),
        key=lambda r: r["submittedAt"],
    )
    if approvals:
        first_approval_at = approvals[0]["submittedAt"]
        reworked = any(
            c.get("commit", {}).get("committer", {}).get("date", "") > first_approval_at
            for c in commits
        )
        accepted_as_is = not reworked
    else:
        accepted_as_is = True

    event = {
        "type": "spec_merged",
        "gh_id": f"gh-pr-merge:{pr['number']}",
        "timestamp": pr["mergedAt"],
        "accepted_as_is": accepted_as_is,
        "url": pr.get("url"),
    }
    risk = _risk_label(pr.get("labels", []))
    if risk:
        event["risk"] = risk
    return event


def map_review_wait_event(pr: dict, pr_events: list[dict]) -> dict | None:
    """One `review_wait` event: review-request time to first approval. None when no
    review was ever requested, or none has been approved yet (re-picked-up later)."""
    requests = sorted(
        (e["created_at"] for e in pr_events if e.get("event") == "review_requested"),
    )
    if not requests:
        return None
    requested_at = requests[0]

    approvals = sorted(
        (r for r in pr.get("reviews", []) if r.get("state") == "APPROVED"
         and r.get("submittedAt", "") >= requested_at),
        key=lambda r: r["submittedAt"],
    )
    if not approvals:
        return None
    approved_at = approvals[0]["submittedAt"]

    return {
        "type": "review_wait",
        "gh_id": f"gh-pr-review:{pr['number']}",
        "timestamp": approved_at,
        "wait_hours": round(_hours_between(requested_at, approved_at), 2),
        "security": _is_security_pr(pr.get("labels", [])),
        "url": pr.get("url"),
    }


def map_deploy_event(deployment: dict, statuses: list[dict], merged_prs_by_sha: dict[str, dict]) -> dict | None:
    """One `deploy` event from a deployment's latest terminal status. None while the
    deployment is still pending/queued/in_progress — picked up on a later import once it
    concludes, same as an unclosed incident."""
    terminal = sorted(
        (s for s in statuses if s.get("state") in DEPLOY_TERMINAL_STATES),
        key=lambda s: s["created_at"],
    )
    if not terminal:
        return None
    final = terminal[-1]

    event = {
        "type": "deploy",
        "gh_id": f"gh-deploy:{deployment['id']}:{final['id']}",
        "timestamp": final["created_at"],
        "env": deployment.get("environment"),
        "succeeded": final["state"] == "success",
        "caused_failure": final["state"] in DEPLOY_FAILURE_STATES,
    }
    merged_pr = merged_prs_by_sha.get(deployment.get("sha"))
    if merged_pr:
        event["lead_time_hours"] = round(_hours_between(merged_pr["mergedAt"], final["created_at"]), 2)
    return event


def map_incident_event(issue: dict) -> dict | None:
    """One `incident` event once the issue has closed (open and close time both known)."""
    if not issue.get("closedAt"):
        return None
    return {
        "type": "incident",
        "gh_id": f"gh-issue:{issue['number']}",
        "timestamp": issue["closedAt"],
        "ttr_hours": round(_hours_between(issue["createdAt"], issue["closedAt"]), 2),
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def collect_events(repo_root: str, since: str) -> list[dict]:
    """Fetch and map every event category. Raises GitHubImportError on any fetch failure
    before returning anything, so a partial failure never yields a partial write."""
    merged_prs = fetch_merged_prs(repo_root, since)
    merged_prs_by_sha = {
        pr["mergeCommit"]["oid"]: pr for pr in merged_prs if pr.get("mergeCommit")
    }

    events: list[dict] = []
    for pr in merged_prs:
        commits = fetch_pr_commits(repo_root, pr["number"])
        events.append(map_merge_event(pr, commits))
        pr_events = fetch_pr_events(repo_root, pr["number"])
        review_wait = map_review_wait_event(pr, pr_events)
        if review_wait:
            events.append(review_wait)

    for deployment in fetch_deployments(repo_root):
        if deployment.get("created_at", "") < since:
            continue
        statuses = fetch_deployment_statuses(repo_root, deployment["id"])
        deploy_event = map_deploy_event(deployment, statuses, merged_prs_by_sha)
        if deploy_event:
            events.append(deploy_event)

    for issue in fetch_incident_issues(repo_root, since):
        incident_event = map_incident_event(issue)
        if incident_event:
            events.append(incident_event)

    return events
