"""One story, two hosts (code-host providers).

The same situation — a PR waiting on a reviewer, a merged PR, a draft, a red CI, a posted grader
verdict, no PR at all — expressed once as gh JSON and once as Azure DevOps JSON, must reach the
pure ladder (`spec_status.compute_waiting_on`, unchanged) as the same normalised PullRequest and
produce the same sentence. The gh dicts are what `spec_status` reads today; the az documents go
through `ado_map`. Nothing is spawned.
"""

import pytest

import ado_import as ai
import ado_transport
import code_host
import spec_status as ss
from tests.ado_fixtures import ADO_REMOTE, FakeAz, load

REMOTE = code_host.parse_remote(ADO_REMOTE)
ROSTER = {"people": [{"handle": "@priya-n", "email": "person2@example.com"},
                     {"handle": "@lee", "email": "person3@example.com"}]}
GREEN = [{"name": "build-and-test", "status": "COMPLETED", "conclusion": "SUCCESS"},
         {"name": "grader", "status": "COMPLETED", "conclusion": "SUCCESS"}]
VERDICT = ("## Acceptance Check Verdicts\n\n| check | covered | reason |\n|---|---|---|\n"
           "| AC-1 | covered | |\n| AC-2 | not-covered | no test |\n")


def _gh(**over):
    base = {"number": 42, "url": "https://gh/pull/42", "state": "OPEN", "isDraft": False, "mergedAt": None,
            "statusCheckRollup": [], "reviews": [], "reviewRequests": []}
    return {**base, **over}


def _az(status="active", draft=False, reviewers=(), closed=None):
    return {"pullRequestId": 42, "status": status, "isDraft": draft, "sourceRefName": "refs/heads/spec/0042-x",
            "creationDate": "2026-09-20T09:00:00Z", "closedDate": closed, "createdBy": {"uniqueName": "person1@example.com"},
            "reviewers": list(reviewers), "labels": [], "lastMergeCommit": {"commitId": "abc"} if closed else None,
            "repository": {"id": "repo-guid"}}


def _policy(name, status):
    return {"status": status, "configuration": {"isBlocking": True, "isEnabled": True,
            "type": {"id": ai.ado_map.BUILD_POLICY_TYPE}, "settings": {"displayName": name}}}


AZ_GREEN = [_policy("build-and-test", "approved"), _policy("grader", "approved")]
REVIEWER = {"uniqueName": "person2@example.com", "displayName": "Person 2", "vote": 0, "isRequired": True}

STORIES = {
    "waiting on a reviewer": (
        _gh(statusCheckRollup=GREEN, reviewRequests=[{"login": "priya-n"}]),
        (_az(reviewers=[REVIEWER]), AZ_GREEN), ([], None)),
    "merged": (
        _gh(state="MERGED", mergedAt="2026-09-22T15:00:00Z"),
        (_az(status="completed", closed="2026-09-22T15:00:00Z"), None), (None, None)),
    "draft": (
        _gh(isDraft=True),
        (_az(draft=True), None), (None, None)),
    "failed CI": (
        _gh(statusCheckRollup=[{"name": "build-and-test", "status": "COMPLETED", "conclusion": "FAILURE"}]),
        (_az(), [_policy("build-and-test", "rejected")]), (None, None)),
    "grader verdict found": (
        _gh(statusCheckRollup=GREEN, reviews=[{"state": "APPROVED", "author": {"login": "lee"}}]),
        (_az(reviewers=[{"uniqueName": "person3@example.com", "vote": 10}]), AZ_GREEN),
        (ss.parse_verdict_block(VERDICT), None)),
}


def _normalised_az(pr, policies):
    checks = ai.map_checks(policies) if policies is not None else None
    return ai.map_pr(pr, REMOTE, checks, ROSTER)


def _essentials(pr):
    return {
        "state": pr["state"], "isDraft": bool(pr.get("isDraft")), "mergedAt": pr.get("mergedAt"),
        "checks": [(c["name"], c["status"], c["conclusion"]) for c in pr.get("statusCheckRollup") or []],
        "approved_by": sorted(r["author"]["login"] for r in pr.get("reviews", []) if r["state"] == "APPROVED"),
        "pending": [r["login"] for r in pr.get("reviewRequests") or []],
    }


def _as_handles(pr):
    """What the GitHub side already carries as a handle, the ADO side carries as `handle` once
    the roster resolves the UPN — Wave 3's `_reviewer_handle` prefers it. Compared here on the
    handle so the story is the same person on both hosts."""
    out = _essentials(pr)
    out["approved_by"] = sorted((r["author"].get("handle") or f"@{r['author']['login']}").lstrip("@")
                                for r in pr.get("reviews", []) if r["state"] == "APPROVED")
    out["pending"] = [(r.get("handle") or f"@{r['login']}").lstrip("@") for r in pr.get("reviewRequests") or []]
    return out


@pytest.mark.parametrize("story", sorted(STORIES), ids=lambda s: s)
def test_the_same_story_normalises_the_same_on_both_hosts(story):
    gh_pr, (az_pr, policies), (verdicts, verdict_error) = STORIES[story]
    az_norm = _normalised_az(az_pr, policies)
    assert _as_handles(az_norm) == _as_handles(gh_pr)

    pending = ("priya-n", None) if gh_pr["reviewRequests"] else None
    gh_text = ss.compute_waiting_on(".", gh_pr, verdicts, verdict_error, pending_wait=pending)
    az_text = ss.compute_waiting_on(".", az_norm, verdicts, verdict_error, pending_wait=pending)
    assert az_text == gh_text


def test_waiting_on_a_reviewer_reads_the_same_rung_and_the_same_person():
    gh_pr, (az_pr, policies), _ = STORIES["waiting on a reviewer"]
    az_norm = _normalised_az(az_pr, policies)
    assert ss.compute_waiting_on(".", gh_pr, [], None, pending_wait=("priya-n", None)) == \
        "waiting for a non-author approval; requested from @priya-n"
    # Today's unmodified spec_status names the raw login; on ADO that is the UPN. The roster
    # handle rides beside it so Wave 3 can prefer it — pinned here as the contract.
    assert az_norm["reviewRequests"][0] == {"login": "person2@example.com", "name": "Person 2", "handle": "@priya-n"}
    assert ss.compute_waiting_on(".", az_norm, [], None, pending_wait=("priya-n", None)).split(";")[0] == \
        "waiting for a non-author approval"


def test_grader_verdict_is_read_from_the_same_block_on_both_hosts():
    """The captured org's grader never posted a verdict block (its gate comments are a security
    review and a correctness review — captured/pr_threads_abandoned.json), so the block itself
    rests on the hand-written thread; what the capture DID verify is the comment shape it rides
    in: a `text` comment whose content opens with `<!-- rails-gate:… -->` (checked below)."""
    bodies, _ = ai.map_threads(load("pr_threads", hand_written=True))
    az_verdicts = next(v for v in (ss.parse_verdict_block(b) for b in reversed(bodies)) if v is not None)
    gh_verdicts = ss.parse_verdict_block(VERDICT)
    assert az_verdicts == gh_verdicts
    assert [v["covered"] for v in az_verdicts] == [True, False]
    captured_bodies, _ = ai.map_threads(load("pr_threads_abandoned"))
    assert captured_bodies and all(ai.ado_map.rails_gate_of(b) for b in captured_bodies)
    assert all(ss.parse_verdict_block(b) is None for b in captured_bodies)  # no block → None, never []


def test_review_requested_time_comes_from_the_same_event_shape_on_both_hosts():
    """GitHub: `issues/N/events` → `review_requested` + `created_at`. Azure DevOps: the
    `ReviewersUpdate` thread's publishedDate (captured — one per reviewer-added moment, whatever
    the system comment's wording). spec_status reads only those two keys."""
    threads = load("pr_threads")
    _, events = ai.map_threads(threads)
    requested = [t for t in threads["value"] if ai.ado_map.thread_property(t, "CodeReviewThreadType") == "ReviewersUpdate"]
    gh_events = [{"event": "review_requested", "created_at": t["publishedDate"]} for t in requested]
    assert gh_events and [{k: e[k] for k in ("event", "created_at")} for e in events] == gh_events


def test_no_pull_request_is_none_on_both_hosts(tmp_path, monkeypatch):
    monkeypatch.setattr(ss, "gh_json", lambda *a, **k: [])
    assert ss.find_pr_for_branch(tmp_path, "spec/9999-none") is None

    monkeypatch.setattr(code_host, "origin_url", lambda root: ADO_REMOTE)
    monkeypatch.setattr(ado_transport, "az_json", FakeAz({"repos pr list": lambda args: []}))
    ai.clear_caches()
    assert ai.find_pr_for_branch(tmp_path, "spec/9999-none") is None
    ai.clear_caches()
