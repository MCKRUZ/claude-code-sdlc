"""Tests for github_import.py — the GitHub-history importer for the steering scorecard.

Fixtures below mirror the exact field shapes verified live against a real GitHub repo
while building this module (gh pr list --json, the REST pulls/{n}/commits, issues/{n}/events
and deployments endpoints) — this project's history has no PR with a human review, a
deployment, or an incident issue to literally capture a response from, so the fixtures are
constructed to that verified shape rather than pasted from a real response.

Every mapping function is pure — no `gh` call — so these tests need no mocking at all for
the mapping layer. `run_gh`/`gh_json` are tested by monkeypatching `subprocess.run`
(the one impure seam), and `collect_events` is tested by monkeypatching the fetch_* seams.
"""

import json
import subprocess

import pytest

from github_import import (
    DEPLOY_FAILURE_STATES,
    GitHubImportError,
    _hours_between,
    collect_events,
    gh_json,
    map_deploy_event,
    map_incident_event,
    map_merge_event,
    map_review_wait_event,
    run_gh,
)

# ---------------------------------------------------------------------------
# Fixtures — verified field shapes, see module docstring
# ---------------------------------------------------------------------------

PR_NO_REVIEW = {
    "number": 50, "mergedAt": "2026-08-28T19:21:40Z",
    "labels": [], "reviews": [], "url": "https://github.com/o/r/pull/50",
}

PR_APPROVED_CLEAN = {
    "number": 60, "mergedAt": "2026-09-01T12:00:00Z",
    "labels": [{"name": "risk:medium"}],
    "reviews": [{"state": "APPROVED", "submittedAt": "2026-09-01T10:00:00Z"}],
    "url": "https://github.com/o/r/pull/60",
}

PR_APPROVED_REWORKED = {
    "number": 61, "mergedAt": "2026-09-02T12:00:00Z",
    "labels": [{"name": "risk:high"}],
    "reviews": [{"state": "APPROVED", "submittedAt": "2026-09-02T10:00:00Z"}],
    "url": "https://github.com/o/r/pull/61",
}

COMMITS_NONE_AFTER = [
    {"commit": {"committer": {"date": "2026-09-01T09:30:00Z"}}},
]

COMMITS_ONE_AFTER = [
    {"commit": {"committer": {"date": "2026-09-02T09:30:00Z"}}},
    {"commit": {"committer": {"date": "2026-09-02T11:00:00Z"}}},  # after the 10:00 approval
]

PR_EVENTS_WITH_REQUEST = [
    {"event": "labeled", "created_at": "2026-09-01T08:00:00Z"},
    {"event": "review_requested", "created_at": "2026-09-01T08:30:00Z"},
]

PR_EVENTS_NO_REQUEST = [
    {"event": "labeled", "created_at": "2026-09-01T08:00:00Z"},
]

DEPLOYMENT = {"id": 1, "sha": "abc123", "environment": "dev", "created_at": "2026-09-01T13:00:00Z"}

STATUSES_SUCCESS = [
    {"id": 10, "state": "pending", "created_at": "2026-09-01T13:00:00Z"},
    {"id": 11, "state": "success", "created_at": "2026-09-01T13:05:00Z"},
]

STATUSES_FAILURE = [
    {"id": 20, "state": "failure", "created_at": "2026-09-01T13:05:00Z"},
]

STATUSES_PENDING_ONLY = [
    {"id": 30, "state": "in_progress", "created_at": "2026-09-01T13:00:00Z"},
]

INCIDENT_CLOSED = {
    "number": 5, "createdAt": "2026-09-01T00:00:00Z", "closedAt": "2026-09-01T03:30:00Z",
}

INCIDENT_OPEN = {"number": 6, "createdAt": "2026-09-01T00:00:00Z", "closedAt": None}


class TestHoursBetween:
    def test_computes_fractional_hours(self):
        assert _hours_between("2026-09-01T10:00:00Z", "2026-09-01T11:30:00Z") == pytest.approx(1.5)


class TestRunGh:
    def test_success_returns_stdout(self, monkeypatch):
        def fake_run(*a, **k):
            return subprocess.CompletedProcess(a, 0, stdout="hello\n", stderr="")
        monkeypatch.setattr(subprocess, "run", fake_run)
        assert run_gh(["pr", "list"], cwd=".") == "hello\n"

    def test_nonzero_exit_raises_with_stderr(self, monkeypatch):
        def fake_run(*a, **k):
            return subprocess.CompletedProcess(a, 1, stdout="", stderr="HTTP 401: Bad credentials")
        monkeypatch.setattr(subprocess, "run", fake_run)
        with pytest.raises(GitHubImportError, match="Bad credentials"):
            run_gh(["pr", "list"], cwd=".")

    def test_gh_missing_raises_clear_message(self, monkeypatch):
        def fake_run(*a, **k):
            raise FileNotFoundError()
        monkeypatch.setattr(subprocess, "run", fake_run)
        with pytest.raises(GitHubImportError, match="not installed"):
            run_gh(["pr", "list"], cwd=".")

    def test_timeout_raises_clear_message(self, monkeypatch):
        def fake_run(*a, **k):
            raise subprocess.TimeoutExpired(cmd="gh", timeout=60)
        monkeypatch.setattr(subprocess, "run", fake_run)
        with pytest.raises(GitHubImportError, match="timed out"):
            run_gh(["pr", "list"], cwd=".")


class TestGhJson:
    def test_parses_json(self, monkeypatch):
        monkeypatch.setattr("github_import.run_gh", lambda a, cwd: '{"a": 1}')
        assert gh_json(["x"], cwd=".") == {"a": 1}

    def test_empty_stdout_is_empty_list(self, monkeypatch):
        monkeypatch.setattr("github_import.run_gh", lambda a, cwd: "")
        assert gh_json(["x"], cwd=".") == []

    def test_malformed_json_raises(self, monkeypatch):
        monkeypatch.setattr("github_import.run_gh", lambda a, cwd: "not json")
        with pytest.raises(GitHubImportError, match="unparseable"):
            gh_json(["x"], cwd=".")


class TestMapMergeEvent:
    def test_no_review_is_accepted_as_is(self):
        event = map_merge_event(PR_NO_REVIEW, commits=[])
        assert event["accepted_as_is"] is True
        assert event["gh_id"] == "gh-pr-merge:50"
        assert "risk" not in event  # no risk:* label on this PR

    def test_approved_with_no_later_commit_is_accepted_as_is(self):
        event = map_merge_event(PR_APPROVED_CLEAN, COMMITS_NONE_AFTER)
        assert event["accepted_as_is"] is True
        assert event["risk"] == "MEDIUM"

    def test_approved_with_later_commit_is_not_accepted_as_is(self):
        event = map_merge_event(PR_APPROVED_REWORKED, COMMITS_ONE_AFTER)
        assert event["accepted_as_is"] is False
        assert event["risk"] == "HIGH"

    def test_timestamp_is_merge_time_not_now(self):
        event = map_merge_event(PR_NO_REVIEW, commits=[])
        assert event["timestamp"] == "2026-08-28T19:21:40Z"


class TestMapReviewWaitEvent:
    def test_no_review_requested_is_none(self):
        assert map_review_wait_event(PR_APPROVED_CLEAN, PR_EVENTS_NO_REQUEST) is None

    def test_requested_but_not_yet_approved_is_none(self):
        assert map_review_wait_event(PR_NO_REVIEW, PR_EVENTS_WITH_REQUEST) is None

    def test_wait_hours_and_security_flag(self):
        event = map_review_wait_event(PR_APPROVED_CLEAN, PR_EVENTS_WITH_REQUEST)
        assert event["wait_hours"] == pytest.approx(1.5)  # 08:30 -> 10:00
        assert event["security"] is False  # risk:medium, not risk:high
        assert event["gh_id"] == "gh-pr-review:60"

    def test_risk_high_label_flags_security(self):
        event = map_review_wait_event(PR_APPROVED_REWORKED, PR_EVENTS_WITH_REQUEST)
        assert event["security"] is True


class TestMapDeployEvent:
    def test_pending_only_is_none(self):
        assert map_deploy_event(DEPLOYMENT, STATUSES_PENDING_ONLY, {}) is None

    def test_success_status(self):
        event = map_deploy_event(DEPLOYMENT, STATUSES_SUCCESS, {})
        assert event["succeeded"] is True
        assert event["caused_failure"] is False
        assert event["gh_id"] == "gh-deploy:1:11"
        assert "lead_time_hours" not in event  # no matching merged PR by sha

    def test_failure_status(self):
        event = map_deploy_event(DEPLOYMENT, STATUSES_FAILURE, {})
        assert event["succeeded"] is False
        assert event["caused_failure"] is True

    def test_lead_time_from_matching_merged_pr(self):
        merged_prs_by_sha = {"abc123": {"mergedAt": "2026-09-01T12:00:00Z"}}
        event = map_deploy_event(DEPLOYMENT, STATUSES_SUCCESS, merged_prs_by_sha)
        assert event["lead_time_hours"] == pytest.approx(1.08, abs=0.01)  # 12:00 -> 13:05

    def test_all_forbidden_states_flagged_as_failure(self):
        for state in DEPLOY_FAILURE_STATES:
            statuses = [{"id": 1, "state": state, "created_at": "2026-09-01T13:00:00Z"}]
            assert map_deploy_event(DEPLOYMENT, statuses, {})["caused_failure"] is True


class TestMapIncidentEvent:
    def test_open_issue_is_none(self):
        assert map_incident_event(INCIDENT_OPEN) is None

    def test_closed_issue_computes_ttr(self):
        event = map_incident_event(INCIDENT_CLOSED)
        assert event["ttr_hours"] == pytest.approx(3.5)
        assert event["gh_id"] == "gh-issue:5"


class TestNoForbiddenFields:
    """The import must never write an activity metric onto any event it produces."""

    FORBIDDEN = {"velocity", "story_points", "pr_count", "lines_of_code"}

    def test_every_mapper_output_is_clean(self):
        events = [
            map_merge_event(PR_APPROVED_REWORKED, COMMITS_ONE_AFTER),
            map_review_wait_event(PR_APPROVED_CLEAN, PR_EVENTS_WITH_REQUEST),
            map_deploy_event(DEPLOYMENT, STATUSES_SUCCESS, {"abc123": {"mergedAt": "2026-09-01T12:00:00Z"}}),
            map_incident_event(INCIDENT_CLOSED),
        ]
        for event in events:
            assert not (self.FORBIDDEN & event.keys())


class TestCollectEvents:
    """Orchestration, with every fetch_* seam monkeypatched — no `gh` call."""

    def _patch_all(self, monkeypatch, *, prs=None, commits_by_pr=None, events_by_pr=None,
                    deployments=None, statuses_by_deploy=None, issues=None):
        monkeypatch.setattr("github_import.fetch_merged_prs", lambda root, since: prs or [])
        monkeypatch.setattr(
            "github_import.fetch_pr_commits",
            lambda root, number: (commits_by_pr or {}).get(number, []),
        )
        monkeypatch.setattr(
            "github_import.fetch_pr_events",
            lambda root, number: (events_by_pr or {}).get(number, []),
        )
        monkeypatch.setattr("github_import.fetch_deployments", lambda root: deployments or [])
        monkeypatch.setattr(
            "github_import.fetch_deployment_statuses",
            lambda root, dep_id: (statuses_by_deploy or {}).get(dep_id, []),
        )
        monkeypatch.setattr("github_import.fetch_incident_issues", lambda root, since: issues or [])

    def test_empty_period_yields_no_events(self, monkeypatch):
        self._patch_all(monkeypatch)
        assert collect_events(".", "2026-09-01") == []

    def test_merge_and_review_wait_both_produced(self, monkeypatch):
        self._patch_all(
            monkeypatch,
            prs=[PR_APPROVED_CLEAN],
            commits_by_pr={60: COMMITS_NONE_AFTER},
            events_by_pr={60: PR_EVENTS_WITH_REQUEST},
        )
        types = [e["type"] for e in collect_events(".", "2026-09-01")]
        assert types == ["spec_merged", "review_wait"]

    def test_deploy_before_since_is_skipped(self, monkeypatch):
        old_deploy = {**DEPLOYMENT, "created_at": "2026-01-01T00:00:00Z"}
        self._patch_all(
            monkeypatch, deployments=[old_deploy], statuses_by_deploy={1: STATUSES_SUCCESS},
        )
        assert collect_events(".", "2026-09-01") == []

    def test_incident_produced(self, monkeypatch):
        self._patch_all(monkeypatch, issues=[INCIDENT_CLOSED])
        events = collect_events(".", "2026-09-01")
        assert len(events) == 1 and events[0]["type"] == "incident"

    def test_fetch_failure_propagates_without_partial_result(self, monkeypatch):
        monkeypatch.setattr("github_import.fetch_merged_prs", lambda root, since: [PR_NO_REVIEW])

        def boom(root, number):
            raise GitHubImportError("no network")
        monkeypatch.setattr("github_import.fetch_pr_commits", boom)

        with pytest.raises(GitHubImportError, match="no network"):
            collect_events(".", "2026-09-01")
