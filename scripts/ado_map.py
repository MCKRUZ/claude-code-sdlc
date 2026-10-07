"""Azure DevOps JSON → the gh-shaped dicts the plugin already reads (code-host providers, Wave 1;
reconciled with the 2026-10-05 captures in Wave 3 — see fixtures/code_host/azure_devops/captured/CAPTURE-NOTES.md).

Every function here is PURE: an az document in, a normalised dict out, no subprocess. That is
what lets the whole translation be tested on fixture JSON — and it is also where the honesty
lives. Two rules, applied everywhere:

  * An unknown enum value maps to the CONSERVATIVE reading and leaves a note (`_notes` /
    `_note`): a policy status nobody has seen before reads as "completed, no conclusion" —
    pending-ish, never green. A PR status nobody has seen reads as OPEN with a note.
  * A key the mapping NEEDS raises `AdoImportError("unexpected az shape: missing …")` instead of
    defaulting. A wrong field name must fail loudly, because a default is how "nothing here"
    gets fabricated from a rename.

What the capture settled (each is a fact from the data, not a guess): `isRequired` is `null`
when a reviewer is not required (never `false`); `lastMergeCommit` sits on every ACTIVE PR as
the trial merge, so it is trusted only once `status == completed`; `labels` ride `pr list` by
default; an empty policy list on an active PR means "no checks", not "unknown"; threads carry a
typed `properties` bag, so system comments are NEVER parsed as prose; `runs list` has no
`_links`, so a run's web URL is built from the org URL. The second capture (another repository)
added: `mergeStatus` ∈ succeeded · conflicts · null, and the `conflicts` row has NO lastMergeCommit
(nothing here reads mergeStatus, and a null trial merge is simply no merge commit); `labels` is
null on every PR there — null and `[]` both map to `[]`; a run still going has `result: null`
with `status: inProgress` → conclusion None, status in_progress, never a failure; a timeline
record's `result` can be `skipped` → conclusion "skipped", neither green nor red; and BOTH
system-comment wordings exist ("X joined as a reviewer" when self-added, "X added Y as a reviewer"
when another person did) — one more reason the reviewer-added moment comes from `properties`.

`AdoImportError` is defined here, not in `ado_import.py`, only because these normalisers raise it
and the transport module imports this one; `ado_import` re-exports it as its public home.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from code_host import resolve_person  # noqa: E402
from code_host_remote import RemoteInfo  # noqa: E402
from github_import import GitHubImportError  # noqa: E402


class AdoImportError(GitHubImportError):
    """`az` failed, or answered in a shape this mapping does not recognise. A SUBCLASS so every
    existing `except GitHubImportError` — including the frozen scorecard — already catches it."""


# Policy type ids. Build validation, minimum-reviewers and required-reviewers were observed in the
# capture; the status-check id is still from the extension's source only (no org exercised it).
BUILD_POLICY_TYPE = "0609b952-1397-4640-95ec-e00a01b2c241"
STATUS_POLICY_TYPE = "cbdc66da-9728-4af8-aada-9a5a32e4a226"  # unverified
MIN_REVIEWERS_POLICY_TYPE = "fa4e907d-c16b-4a4c-9dfa-4906e5d171dd"
REQUIRED_REVIEWERS_POLICY_TYPE = "fd2167ab-b0be-447a-8ec8-39368250530e"
CHECK_POLICY_TYPES = (BUILD_POLICY_TYPE, STATUS_POLICY_TYPE)

PR_STATE = {"active": "OPEN", "completed": "MERGED", "abandoned": "CLOSED"}
# PolicyEvaluationRecord.status → gh (status, conclusion). `approved` and `queued` were observed;
# the rest are the documented values and stay conservative until seen.
POLICY_STATUS = {
    "queued": ("IN_PROGRESS", None), "running": ("IN_PROGRESS", None),
    "approved": ("COMPLETED", "SUCCESS"), "notApplicable": ("COMPLETED", "SUCCESS"),
    "rejected": ("COMPLETED", "FAILURE"), "broken": ("COMPLETED", "FAILURE"),
}
# Build / timeline `result` → gh conclusion. `succeeded`, `failed`, `canceled` and `skipped` were
# observed (`skipped` on a timeline Stage, second capture) — skipped is its own word, never a success
# or a failure. A null result is an in-flight run (status `inProgress`): no conclusion yet.
RUN_RESULT = {"succeeded": "success", "failed": "failure", "partiallySucceeded": "failure",
              "canceled": "cancelled", "skipped": "skipped", "none": None, None: None}
RUN_REASON = {"pullRequest": "pull_request", "individualCI": "push", "batchedCI": "push"}
APPROVE_VOTE, REJECT_VOTE = 5, -5  # approve-with-suggestions counts; wait-for-author counts against
RAILS_GATE_MARKER = "<!-- rails-gate:"  # the grader/security pipelines open their text comment with it
REVIEW_REQUESTED_THREAD = "ReviewersUpdate"  # properties.CodeReviewThreadType.$value


def _require(obj: dict, key: str, what: str):
    if not isinstance(obj, dict) or key not in obj:
        raise AdoImportError(f"unexpected az shape: missing {what}.{key}")
    return obj[key]


def strip_ref(ref: str | None) -> str:
    if not isinstance(ref, str):
        return ""
    if ref.startswith("refs/heads/"):
        return ref[len("refs/heads/"):]
    if ref.startswith("refs/pull/"):
        return ref[len("refs/"):]
    return ref


def _person(ident: dict | None, roster: dict | None) -> dict:
    login = (ident or {}).get("uniqueName") or ""
    handle = resolve_person(roster, {"login": login, "kind": "upn"}) if login else None
    return {"login": login, "name": (ident or {}).get("displayName"), "handle": handle}


def map_reviews(pr: dict, roster: dict | None = None) -> tuple[list[dict], list[dict], str]:
    """(reviews, reviewRequests, reviewDecision) from `reviewers[].vote`. Groups (`isContainer`) are
    skipped; the author's own vote is skipped because it is not a NON-author approval; required
    reviewers (`isRequired: true` — `null` means not required) are listed first among the pending."""
    author = ((pr.get("createdBy") or {}).get("uniqueName") or "").lower()
    reviews: list[dict] = []
    pending: list[tuple[bool, dict]] = []
    for r in pr.get("reviewers") or []:
        if not isinstance(r, dict) or r.get("isContainer"):
            continue
        who = _person(r, roster)
        if who["login"].lower() == author:
            continue
        vote = r.get("vote") or 0
        entry = {"author": {"login": who["login"], "handle": who["handle"]}, "submittedAt": None}
        if vote >= APPROVE_VOTE:
            reviews.append({"state": "APPROVED", **entry})
        elif vote <= REJECT_VOTE:
            reviews.append({"state": "CHANGES_REQUESTED", **entry})
        else:
            pending.append((r.get("isRequired") is True, who))
    requests = [who for _, who in sorted(pending, key=lambda p: not p[0])]
    states = {r["state"] for r in reviews}
    decision = ("APPROVED" if "APPROVED" in states
                else "CHANGES_REQUESTED" if "CHANGES_REQUESTED" in states else "REVIEW_REQUIRED")
    return reviews, requests, decision


def map_checks(records: list) -> list[dict]:
    """PolicyEvaluationRecord[] → Check[]. Only build-validation and status-check policies are
    checks; approver-count and required-reviewer policies are the approval rung, not CI. An empty
    list is an empty rollup — on an active PR that is "no checks", a legitimate answer."""
    checks: list[dict] = []
    for rec in records or []:
        cfg = _require(rec, "configuration", "PolicyEvaluationRecord")
        type_id = _require(_require(cfg, "type", "configuration"), "id", "configuration.type")
        if type_id not in CHECK_POLICY_TYPES:
            continue
        settings = cfg.get("settings") or {}
        context = rec.get("context") or {}
        name = settings.get("displayName") or context.get("buildDefinitionName") or settings.get("statusName")
        if not name:
            raise AdoImportError("unexpected az shape: missing configuration.settings.displayName")
        raw = _require(rec, "status", "PolicyEvaluationRecord")
        check = {"name": name, "blocking": cfg.get("isBlocking")}
        if raw in POLICY_STATUS:
            check["status"], check["conclusion"] = POLICY_STATUS[raw]
        else:
            check["status"], check["conclusion"] = "COMPLETED", None
            check["_note"] = f"policy status {raw!r} is not a known value; read as completed with no conclusion"
        checks.append(check)
    return checks


def pr_web_url(pr: dict, remote: RemoteInfo | None) -> str | None:
    number = pr.get("pullRequestId")
    if remote is not None and remote.host == "azure-devops":
        return f"{remote.web_url}/pullrequest/{number}"
    repo_web = (pr.get("repository") or {}).get("webUrl")
    return f"{repo_web}/pullrequest/{number}" if repo_web else pr.get("url")


def map_pr(pr: dict, remote: RemoteInfo | None = None, checks: list[dict] | None = None,
           roster: dict | None = None) -> dict:
    """GitPullRequest → PullRequest (gh shape). `checks` is the already-mapped policy list when the
    caller fetched one; None means "not fetched" and the rollup is simply empty — a caller that
    wants to say so sets `_checks_unavailable` itself."""
    number = _require(pr, "pullRequestId", "GitPullRequest")
    raw_status = _require(pr, "status", "GitPullRequest")
    source = _require(pr, "sourceRefName", "GitPullRequest")
    created_by = _require(pr, "createdBy", "GitPullRequest")
    notes: list[str] = []
    state = PR_STATE.get(raw_status)
    if state is None:
        state = "OPEN"
        notes.append(f"pull request status {raw_status!r} is not a known value; read as OPEN")
    merged = state == "MERGED"
    reviews, requests, decision = map_reviews(pr, roster)
    rollup = list(checks or [])
    notes.extend(c["_note"] for c in rollup if "_note" in c)
    author = _person(created_by, roster)
    # Pitfall P7, confirmed: an ACTIVE PR carries lastMergeCommit too (the trial merge).
    merge_sha = (pr.get("lastMergeCommit") or {}).get("commitId") if merged else None
    return {
        "number": number, "url": pr_web_url(pr, remote), "state": state,
        "isDraft": bool(pr.get("isDraft")), "headRefName": strip_ref(source),
        "mergedAt": pr.get("closedDate") if merged else None,
        "updatedAt": None,  # GitPullRequest has no last-moved field; a stand-in would be a lie
        "createdAt": pr.get("creationDate"),
        "author": {"login": author["login"], "handle": author["handle"]},
        "statusCheckRollup": rollup, "reviews": reviews, "reviewRequests": requests,
        "labels": [{"name": lb.get("name")} for lb in (pr.get("labels") or []) if isinstance(lb, dict)],
        "mergeCommit": {"oid": merge_sha} if merge_sha else None,
        "reviewDecision": decision,
        "headRepositoryOwner": {"login": (pr.get("repository") or {}).get("id")},
        "files": None, "_notes": notes,
    }


def run_web_url(build: dict, remote: RemoteInfo | None) -> str | None:
    """`runs list` carries no `_links` (captured); the portal URL is built from the org and project.
    Without a remote the REST `url` is returned — honest, just not a page a person can open."""
    web = ((build.get("_links") or {}).get("web") or {}).get("href")
    if web:
        return web
    if remote is not None and remote.host == "azure-devops":
        return f"{remote.org_url}/{remote.project}/_build/results?buildId={build.get('id')}"
    return build.get("url")


def map_runs(builds: list, remote: RemoteInfo | None = None) -> list[dict]:
    """Build[] → Run[] (gh `run list` shape)."""
    runs: list[dict] = []
    for b in builds or []:
        status = _require(b, "status", "Build")
        result = b.get("result")  # null while `status` is `inProgress` (second capture): conclusion None, never "failure"
        reason = b.get("reason")
        runs.append({
            "databaseId": _require(b, "id", "Build"),
            "conclusion": RUN_RESULT.get(result, result),
            "status": "completed" if status == "completed" else "in_progress",
            "event": RUN_REASON.get(reason, reason),
            "headBranch": strip_ref(_require(b, "sourceBranch", "Build")),
            "createdAt": b.get("queueTime"),
            "url": run_web_url(b, remote),
        })
    return runs


def map_jobs(timeline: dict) -> dict:
    """Build timeline → {jobs: [{name, conclusion}]} (gh `run view --json jobs` shape). Only `Job`
    records; a `skipped` result (captured on a Stage) reads "skipped" — the rollback-job check in
    pipeline_proof asks for "success", so a skipped rollback is never mistaken for one that ran."""
    records = _require(timeline, "records", "Timeline")
    jobs = [{"name": r.get("name") or "", "conclusion": RUN_RESULT.get(r.get("result"), r.get("result"))}
            for r in records if isinstance(r, dict) and r.get("type") == "Job"]
    return {"jobs": jobs}


def map_policies(configs: list, name: str = "branch policies") -> dict:
    """PolicyConfiguration[] (already scoped to one repository + branch by the caller) → Ruleset.
    Enforcing when ANY policy is enabled and blocking; required contexts are the enabled check
    policies' display names; `created_at` is None because ADO has no enforcement-start date."""
    enabled = [c for c in configs or [] if isinstance(c, dict) and c.get("isEnabled")]
    enforcing = any(c.get("isBlocking") for c in enabled)
    contexts = []
    for c in enabled:
        if ((c.get("type") or {}).get("id")) in CHECK_POLICY_TYPES:
            s = c.get("settings") or {}
            ctx = s.get("displayName") or s.get("statusName")
            if ctx:
                contexts.append({"context": ctx})
    return {"id": None, "name": name, "target": "branch",
            "enforcement": "active" if enforcing else "disabled", "created_at": None,
            "rules": [{"type": "required_status_checks",
                       "parameters": {"required_status_checks": contexts}}],
            "bypass_actors": []}


def thread_property(thread: dict, key: str):
    """`properties[key].$value` — the typed bag ADO hangs on system threads
    (`{"$type": "System.String"|"System.Int32", "$value": …}`); None when absent."""
    prop = (thread.get("properties") or {}).get(key)
    return prop.get("$value") if isinstance(prop, dict) else prop


def rails_gate_of(content: str) -> str | None:
    """The pipeline named by a `<!-- rails-gate:<pipeline> -->` opener, or None for a human comment."""
    if not isinstance(content, str) or not content.startswith(RAILS_GATE_MARKER):
        return None
    end = content.find("-->")
    return content[len(RAILS_GATE_MARKER):end].strip() if end > 0 else None


def map_threads(threads) -> tuple[list[str], list[dict]]:
    """Pull-request threads → (comment bodies oldest→newest, gh-shaped `review_requested` events).
    Bodies are the `text` comments (system ones carry no verdict). The reviewer-added moment is the
    thread whose `CodeReviewThreadType` is `ReviewersUpdate`, stamped with the THREAD's publishedDate;
    its wording is never read — BOTH "X joined as a reviewer" (self) and "X added Y as a reviewer"
    (another person) were captured — so a thread with no properties yields no event rather than a
    guessed one."""
    value = threads.get("value") if isinstance(threads, dict) else threads
    if not isinstance(value, list):
        raise AdoImportError("unexpected az shape: missing threads.value")
    dated: list[tuple[str, str]] = []
    events: list[dict] = []
    for t in value:
        if not isinstance(t, dict) or t.get("isDeleted"):
            continue
        if thread_property(t, "CodeReviewThreadType") == REVIEW_REQUESTED_THREAD:
            added = thread_property(t, "CodeReviewReviewersUpdatedAddedIdentity")
            who = ((t.get("identities") or {}).get(str(added)) or {}).get("uniqueName")
            events.append({"event": "review_requested", "created_at": t.get("publishedDate") or "",
                           "requested_reviewer": {"login": who} if who else None})
        for c in t.get("comments") or []:
            if not isinstance(c, dict) or c.get("isDeleted") or c.get("commentType") != "text":
                continue
            dated.append((c.get("publishedDate") or "", c.get("content") or ""))
    return [body for _, body in sorted(dated, key=lambda d: d[0])], events
