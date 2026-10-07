"""The PURE half of `ado_outcomes` — az JSON in, gh-shaped dicts out (code-host providers, Wave 5).

Split from `ado_outcomes.py` for file size only; `ado_outcomes.<name>` re-exports everything here, so
that is the name to import. Nothing in this module touches a subprocess, the network or the disk.

Every shape read here was captured from a live organisation on 2026-10-05
(scripts/tests/fixtures/code_host/azure_devops/captured/CAPTURE-NOTES.md) except the work-item row,
which is still hand-written — so `work_item_to_gh` requires its keys rather than defaulting them.
"""

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ado_map import AdoImportError  # noqa: E402

PREVIEW_API = "7.1-preview"
MERGED_TOP = 200
ID_PREFIXES = {"gh-pr-merge:": "ado-pr-merge:", "gh-pr-review:": "ado-pr-review:", "gh-issue:": "ado-wi:"}
DEPLOY_RESULT = {"succeeded": "success", "succeededWithIssues": "success", "failed": "failure", "abandoned": "failure"}
APPROVE_VOTE, REJECT_VOTE = 5, -5
SINCE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INCIDENT_WIQL = ("SELECT [System.Id],[System.CreatedDate],[Microsoft.VSTS.Common.ClosedDate],[System.State] "
                 "FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Bug' "
                 "AND [System.Tags] CONTAINS 'incident' AND [System.CreatedDate] >= '{since}'")



def _need(obj, key: str, what: str):
    if not isinstance(obj, dict) or key not in obj:
        raise AdoImportError(f"unexpected az shape: missing {what}.{key}")
    return obj[key]


def _value(doc, what: str) -> list:
    value = doc.get("value") if isinstance(doc, dict) else doc
    if not isinstance(value, list):
        raise AdoImportError(f"unexpected az shape: missing {what}.value")
    return value


def _iso(ts) -> str | None:
    """Second-precision UTC `…Z`. az mixes `…Z`, `…+00:00` and 3/6/7-digit fractions; the gh mappers
    compare timestamps as strings, which is only exact when every one has the same shape."""
    if not isinstance(ts, str) or not ts:
        return None
    try:
        d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError as e:
        raise AdoImportError(f"unexpected az shape: unparseable timestamp {ts!r}") from e
    d = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def check_since(since: str) -> str:
    # The date is interpolated into WIQL; the shape check is what keeps that interpolation safe.
    if not isinstance(since, str) or not SINCE_RE.match(since):
        raise AdoImportError(f"--since must be YYYY-MM-DD (got {since!r})")
    return since


def _prop(thread: dict, name: str):
    p = (thread.get("properties") or {}).get(name)
    return p.get("$value") if isinstance(p, dict) else p


def re_id(event: dict) -> dict:
    """gh-prefixed `gh_id` → the ado-* prefix for the same category (deploys are re-labelled inline)."""
    for old, new in ID_PREFIXES.items():
        if event["gh_id"].startswith(old):
            event["gh_id"] = new + event["gh_id"][len(old):]
    return event


def pr_to_gh(pr: dict, remote=None) -> dict:
    """Completed GitPullRequest → the gh `pr list --json` dict `map_merge_event` reads. `reviews` is
    filled later from threads (dated); `_undated_approvals` counts votes with no thread to date them."""
    number = _need(pr, "pullRequestId", "GitPullRequest")
    author = ((pr.get("createdBy") or {}).get("uniqueName") or "").lower()
    undated = [r for r in pr.get("reviewers") or [] if isinstance(r, dict) and not r.get("isContainer")
               and (r.get("vote") or 0) >= APPROVE_VOTE and (r.get("uniqueName") or "").lower() != author]
    merge_commit = (pr.get("lastMergeCommit") or {}).get("commitId") if pr.get("status") == "completed" else None
    web = remote.web_url if remote is not None else (pr.get("repository") or {}).get("webUrl")
    return {"number": number, "mergedAt": _iso(_need(pr, "closedDate", "GitPullRequest")),
            "url": f"{web}/pullrequest/{number}" if web else None,
            "labels": [{"name": lb.get("name")} for lb in pr.get("labels") or [] if isinstance(lb, dict)],
            "reviews": [], "mergeCommit": {"oid": merge_commit} if merge_commit else None,
            "_author": author, "_undated_approvals": len(undated)}


def commits_to_gh(doc) -> list[dict]:
    """pullRequestCommits → the REST `pulls/N/commits` shape (`commit.committer.date`)."""
    out = []
    for c in _value(doc, "pullRequestCommits"):
        committer = _need(c, "committer", "GitCommitRef")
        out.append({"sha": c.get("commitId"),
                    "commit": {"committer": {"date": _iso(_need(committer, "date", "committer"))}}})
    return out


def review_requests_from_threads(threads: list) -> list[dict]:
    """ReviewersUpdate threads → gh `review_requested` issue events. Read from `properties`, never
    from the system comment's prose (observed wording differs between a join and an add)."""
    out = []
    for th in threads:
        if not isinstance(th, dict) or th.get("isDeleted"):
            continue
        if _prop(th, "CodeReviewThreadType") == "ReviewersUpdate" and int(_prop(th, "CodeReviewReviewersUpdatedNumAdded") or 0) > 0:
            when = _iso(th.get("publishedDate"))
            if when:
                out.append({"event": "review_requested", "created_at": when})
    return sorted(out, key=lambda e: e["created_at"])


def votes_from_threads(threads: list, author: str) -> list[dict]:
    """VoteUpdate threads → DATED gh reviews. The author's own vote is skipped (not a non-author
    approval); a voter the thread cannot name is kept with an empty login rather than dropped."""
    out = []
    for th in threads:
        if not isinstance(th, dict) or th.get("isDeleted") or _prop(th, "CodeReviewThreadType") != "VoteUpdate":
            continue
        vote = int(_prop(th, "CodeReviewVoteResult") or 0)
        ident = (th.get("identities") or {}).get(str(_prop(th, "CodeReviewVotedByIdentity"))) or {}
        login = ident.get("uniqueName") or ""
        if login and login.lower() == (author or "").lower():
            continue
        state = "APPROVED" if vote >= APPROVE_VOTE else "CHANGES_REQUESTED" if vote <= REJECT_VOTE else None
        when = _iso(th.get("publishedDate"))
        if state and when:
            out.append({"state": state, "author": {"login": login}, "submittedAt": when})
    return sorted(out, key=lambda r: r["submittedAt"])


def deployment_to_gh(rec: dict, env_name: str) -> dict:
    """EnvironmentDeploymentRecord → gh deployment; `sha` is filled by fetch_build_sha later."""
    return {"id": _need(rec, "id", "EnvironmentDeploymentRecord"), "environment": env_name,
            "created_at": _iso(rec.get("queueTime") or _need(rec, "startTime", "EnvironmentDeploymentRecord")),
            "sha": None, "_build_id": (rec.get("owner") or {}).get("id")}


def statuses_from_record(rec: dict) -> list[dict]:
    """A record's terminal state as a one-element gh status list; [] while it is still running or
    ended in a state the standard does not count (canceled is neither a success nor a failure)."""
    state = DEPLOY_RESULT.get(rec.get("result"))
    finished = _iso(rec.get("finishTime"))
    return [{"id": rec["id"], "state": state, "created_at": finished}] if state and finished else []


def work_item_to_gh(item: dict) -> dict:
    fields = _need(item, "fields", "WorkItem")
    return {"number": _need(item, "id", "WorkItem"), "createdAt": _iso(_need(fields, "System.CreatedDate", "fields")),
            "closedAt": _iso(fields.get("Microsoft.VSTS.Common.ClosedDate")), "state": fields.get("System.State")}
