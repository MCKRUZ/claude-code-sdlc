"""Tests for spec_status.py — a spec's status, read from its pull request (spec 0006).

The git plumbing for `status: merged` (finalize_merge / read_committed_status) is proven
against a real local git repo, no mocking, in test_spec_status_live.py. This file covers
the verdict-block parser, the waiting-on logic, and orchestration, with every `gh` call
monkeypatched.
"""

import pytest

import spec_status as ss
from github_import import GitHubImportError

GRADER_COMMENT = """\
# Grader verdict

Intent: rejects duplicate claims.

| Claim | Verdict | Evidence |
|---|---|---|
| duplicate returns 409 | ✅ met | src/x.py:10 |

Bottom line: LOOKS GOOD

## Acceptance Check Verdicts

| check | covered | reason |
|-------|---------|--------|
| A duplicate submission returns 409 with body `{ "error": "duplicate claim" }` | covered | src/x.py:10 asserts it |
| Two concurrent submissions of the same id persist exactly 1 row | not-covered | no concurrency test |
"""

CHECKS_ALL_GREEN = [
    {"name": "build-and-test", "status": "COMPLETED", "conclusion": "SUCCESS"},
    {"name": "grader", "status": "COMPLETED", "conclusion": "NEUTRAL"},
]

CHECKS_WITH_SECURITY = CHECKS_ALL_GREEN + [
    {"name": "security-review", "status": "COMPLETED", "conclusion": "SUCCESS"},
]


class TestParseVerdictBlock:
    def test_parses_the_block(self):
        verdicts = ss.parse_verdict_block(GRADER_COMMENT)
        assert len(verdicts) == 2
        assert verdicts[0]["covered"] is True
        assert verdicts[1]["covered"] is False
        assert "concurrency" in verdicts[1]["reason"]

    def test_missing_heading_is_none(self):
        assert ss.parse_verdict_block("just some prose, no block") is None

    def test_present_but_empty_block_is_empty_list_not_none(self):
        text = "## Acceptance Check Verdicts\n\nNothing here.\n"
        assert ss.parse_verdict_block(text) == []

    def test_stops_at_next_heading(self):
        text = GRADER_COMMENT + "\n## Something Else\n| a | b |\n|---|---|\n| x | y |\n"
        verdicts = ss.parse_verdict_block(text)
        assert len(verdicts) == 2  # the next heading's table isn't swallowed


class TestFindGraderVerdicts:
    def test_finds_block_in_comments(self, monkeypatch):
        monkeypatch.setattr(ss, "fetch_pr_comment_bodies", lambda repo, n: ["irrelevant", GRADER_COMMENT])
        verdicts, error = ss.find_grader_verdicts(".", 1)
        assert error is None
        assert len(verdicts) == 2

    def test_latest_comment_with_block_wins(self, monkeypatch):
        older = GRADER_COMMENT
        newer = older.replace("not-covered", "covered")
        monkeypatch.setattr(ss, "fetch_pr_comment_bodies", lambda repo, n: [older, newer])
        verdicts, _ = ss.find_grader_verdicts(".", 1)
        assert all(v["covered"] for v in verdicts)

    def test_no_block_anywhere_is_an_error_not_a_crash(self, monkeypatch):
        monkeypatch.setattr(ss, "fetch_pr_comment_bodies", lambda repo, n: ["no block here"])
        verdicts, error = ss.find_grader_verdicts(".", 1)
        assert verdicts is None
        assert "no grader verdict block" in error


class TestComputeWaitingOn:
    def _pr(self, **overrides):
        base = {
            "number": 1, "state": "OPEN", "isDraft": False,
            "statusCheckRollup": [], "reviews": [], "reviewRequests": [],
        }
        return {**base, **overrides}

    def test_merged(self):
        assert ss.compute_waiting_on(".", self._pr(state="MERGED"), None, None) == "merged"

    def test_closed_without_merging(self):
        assert ss.compute_waiting_on(".", self._pr(state="CLOSED"), None, None) == "closed without merging"

    def test_draft(self):
        assert "ready for review" in ss.compute_waiting_on(".", self._pr(isDraft=True), None, None)

    def test_pending_check(self):
        pr = self._pr(statusCheckRollup=[{"name": "build", "status": "IN_PROGRESS", "conclusion": None}])
        assert "build" in ss.compute_waiting_on(".", pr, None, None)

    def test_failing_check(self):
        pr = self._pr(statusCheckRollup=[{"name": "build", "status": "COMPLETED", "conclusion": "FAILURE"}])
        assert "build failed" in ss.compute_waiting_on(".", pr, None, None)

    def test_grader_has_not_run(self):
        pr = self._pr(statusCheckRollup=[{"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS"}])
        assert "grader to run" in ss.compute_waiting_on(".", pr, None, None)

    def test_grader_ran_but_unreadable_verdict(self):
        pr = self._pr(statusCheckRollup=CHECKS_ALL_GREEN)
        assert "readable grader verdict" in ss.compute_waiting_on(".", pr, None, "no block found")

    def test_security_review_required_and_pending(self):
        pr = self._pr(statusCheckRollup=CHECKS_ALL_GREEN + [
            {"name": "security-review", "status": "COMPLETED", "conclusion": "FAILURE"},
        ])
        assert "security review" in ss.compute_waiting_on(".", pr, [], None)

    def test_ready_to_merge_when_approved(self):
        pr = self._pr(statusCheckRollup=CHECKS_WITH_SECURITY, reviews=[{"state": "APPROVED"}])
        assert ss.compute_waiting_on(".", pr, [], None) == "ready to merge"

    def test_waiting_on_named_reviewer_with_age(self, monkeypatch):
        pr = self._pr(
            statusCheckRollup=CHECKS_WITH_SECURITY,
            reviewRequests=[{"login": "priya-n"}],
        )
        monkeypatch.setattr(
            ss, "fetch_pr_events",
            lambda repo, n: [{"event": "review_requested", "created_at": "2020-01-01T00:00:00Z"}],
        )
        result = ss.compute_waiting_on(".", pr, [], None)
        assert "@priya-n" in result and "ago" in result

    def test_waiting_on_reviewer_no_events_omits_age(self, monkeypatch):
        pr = self._pr(statusCheckRollup=CHECKS_WITH_SECURITY, reviewRequests=[{"login": "priya-n"}])
        monkeypatch.setattr(ss, "fetch_pr_events", lambda repo, n: [])
        assert ss.compute_waiting_on(".", pr, [], None) == "waiting for a non-author approval; requested from @priya-n"

    def test_waiting_on_gh_failure_reading_events_is_tolerated(self, monkeypatch):
        pr = self._pr(statusCheckRollup=CHECKS_WITH_SECURITY, reviewRequests=[{"login": "priya-n"}])

        def boom(repo, n):
            raise GitHubImportError("rate limited")
        monkeypatch.setattr(ss, "fetch_pr_events", boom)
        result = ss.compute_waiting_on(".", pr, [], None)
        assert "@priya-n" in result  # degrades to no age, not a crash

    def test_no_reviewer_requested_yet(self):
        pr = self._pr(statusCheckRollup=CHECKS_WITH_SECURITY)
        assert ss.compute_waiting_on(".", pr, [], None) == "waiting for a non-author approval"


class TestSetStatusMerged:
    def test_sets_status_only(self):
        text = '---\nspec: "0007"\nstatus: ready\ndeveloper: "@sam-k"\n---\nbody\n'
        out = ss._set_status_merged(text)
        assert "status: merged" in out
        assert 'developer: "@sam-k"' in out  # untouched

    def test_no_frontmatter_raises(self):
        with pytest.raises(ss.SpecStatusError):
            ss._set_status_merged("no frontmatter here")


class TestReportStatus:
    def test_no_pr_found_reports_cleanly(self, tmp_path, monkeypatch):
        (tmp_path / "specs").mkdir()
        spec_path = tmp_path / "specs" / "0007-x.md"
        spec_path.write_text('---\nspec: "0007"\nname: "x"\nstatus: ready\n---\nbody\n', encoding="utf-8")
        monkeypatch.setattr(ss, "find_pr_for_branch", lambda repo, branch: None)
        result = ss.report_status(tmp_path, spec_path)
        assert result["pull_request"] is None
        assert result["code_host_available"] is True

    def test_no_code_host_access_reports_local_only(self, tmp_path, monkeypatch):
        (tmp_path / "specs").mkdir()
        spec_path = tmp_path / "specs" / "0007-x.md"
        spec_path.write_text('---\nspec: "0007"\nname: "x"\nstatus: in-flight\n---\nbody\n', encoding="utf-8")

        def boom(repo, branch):
            raise GitHubImportError("no network")
        monkeypatch.setattr(ss, "find_pr_for_branch", boom)
        result = ss.report_status(tmp_path, spec_path)
        assert result["code_host_available"] is False
        assert result["local_status"] == "in-flight"
        assert "no network" in result["error"]

    def test_missing_spec_raises(self, tmp_path):
        with pytest.raises(ss.SpecStatusError):
            ss.report_status(tmp_path, tmp_path / "specs" / "nope.md")

    def test_merged_pr_triggers_finalize_merge(self, tmp_path, monkeypatch):
        (tmp_path / "specs").mkdir()
        spec_path = tmp_path / "specs" / "0007-x.md"
        spec_path.write_text('---\nspec: "0007"\nname: "x"\nstatus: in-flight\n---\nbody\n', encoding="utf-8")
        pr = {
            "number": 1, "url": "https://x/pr/1", "state": "MERGED", "mergedAt": "t",
            "isDraft": False, "statusCheckRollup": [], "reviews": [], "reviewRequests": [],
        }
        monkeypatch.setattr(ss, "find_pr_for_branch", lambda repo, branch: pr)
        monkeypatch.setattr(ss, "resolve_base_branch", lambda repo: "main")
        calls = {}

        def fake_finalize(repo, base, path, spec_id):
            calls["called"] = True
            return True, None

        monkeypatch.setattr(ss, "finalize_merge", fake_finalize)
        result = ss.report_status(tmp_path, spec_path)
        assert calls.get("called") is True
        assert result["status_committed_merged"] is True

    def test_grader_not_yet_run_skips_verdict_lookup(self, tmp_path, monkeypatch):
        (tmp_path / "specs").mkdir()
        spec_path = tmp_path / "specs" / "0007-x.md"
        spec_path.write_text('---\nspec: "0007"\nname: "x"\nstatus: in-flight\n---\nbody\n', encoding="utf-8")
        pr = {
            "number": 1, "url": "u", "state": "OPEN", "mergedAt": None, "isDraft": False,
            "statusCheckRollup": [{"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS"}],
            "reviews": [], "reviewRequests": [],
        }
        monkeypatch.setattr(ss, "find_pr_for_branch", lambda repo, branch: pr)

        def boom(*a, **k):
            raise AssertionError("must not fetch grader comments when the grader check hasn't run")
        monkeypatch.setattr(ss, "find_grader_verdicts", boom)
        result = ss.report_status(tmp_path, spec_path)
        assert result["pull_request"]["grader_ran"] is False


class TestFormatReport:
    def test_no_pr(self):
        out = ss.format_report({"spec": "0007", "branch": "spec/0007-x", "code_host_available": True, "pull_request": None})
        assert "No pull request found" in out

    def test_code_host_unavailable(self):
        out = ss.format_report({
            "spec": "0007", "branch": "spec/0007-x", "code_host_available": False,
            "local_status": "in-flight", "error": "no network",
        })
        assert "unavailable" in out
        assert "in-flight" in out

    def test_full_report(self):
        result = {
            "spec": "0007", "branch": "spec/0007-x", "code_host_available": True,
            "pull_request": {
                "number": 1, "url": "https://x/pr/1", "state": "OPEN",
                "checks": [{"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS"}],
                "grader_ran": True, "verdicts": [{"check": "a", "covered": True, "reason": "r"}],
                "verdict_error": None, "security_review": {"conclusion": "SUCCESS"},
                "approvals": [{"by": "priya-n", "at": "t"}],
                "waiting_on": "ready to merge",
            },
            "status_committed_merged": False, "merge_commit_error": None,
        }
        out = ss.format_report(result)
        assert "1/1 acceptance checks covered" in out
        assert "priya-n" in out
        assert "ready to merge" in out
