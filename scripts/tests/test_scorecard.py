"""Tests for scorecard.py — outcome-event recording and the steering scorecard."""

import argparse

import pytest

from scorecard import (
    FORBIDDEN_TYPES,
    compute_scorecard,
    format_report,
    format_team_alarms,
    load_events,
    parse_field,
    record_event,
    resolve_metrics_dir,
)


class TestParseField:
    def test_bool(self):
        assert parse_field("accepted_as_is=true") == ("accepted_as_is", True)
        assert parse_field("security=false") == ("security", False)

    def test_numbers(self):
        assert parse_field("wait_hours=12") == ("wait_hours", 12)
        assert parse_field("ttr_hours=1.5") == ("ttr_hours", 1.5)

    def test_string(self):
        assert parse_field("risk=HIGH") == ("risk", "HIGH")

    def test_missing_equals_raises(self):
        with pytest.raises(ValueError):
            parse_field("noequals")


class TestRecordAndLoad:
    def test_roundtrip(self, tmp_path):
        log = tmp_path / "loop-events.jsonl"
        record_event(log, "spec_merged", {"accepted_as_is": True, "risk": "HIGH"}, "2026-06-24T00:00:00+00:00")
        record_event(log, "deploy", {"succeeded": True}, "2026-06-24T01:00:00+00:00")
        events = load_events(log)
        assert len(events) == 2
        assert events[0]["type"] == "spec_merged"
        assert events[0]["accepted_as_is"] is True

    def test_load_missing_is_empty(self, tmp_path):
        assert load_events(tmp_path / "nope.jsonl") == []

    def test_load_skips_bad_lines(self, tmp_path):
        log = tmp_path / "loop-events.jsonl"
        log.write_text('{"type": "deploy"}\nnot json\n{"type": "incident"}\n')
        assert len(load_events(log)) == 2


class TestComputeScorecard:
    def test_empty_is_none_not_zero(self):
        sc = compute_scorecard([])
        assert sc["accepted_as_is_rate"] is None
        assert sc["review_wait_median_hours"] is None
        assert sc["dora"]["change_fail_rate"] is None
        assert sc["escaped_bugs"] == []

    def test_accepted_as_is_rate(self):
        events = [
            {"type": "spec_merged", "accepted_as_is": True},
            {"type": "spec_merged", "accepted_as_is": True},
            {"type": "spec_merged", "accepted_as_is": False},
        ]
        sc = compute_scorecard(events)
        assert sc["accepted_as_is_rate"] == pytest.approx(2 / 3)

    def test_review_wait_median_excludes_security(self):
        events = [
            {"type": "review_wait", "wait_hours": 2},
            {"type": "review_wait", "wait_hours": 4},
            {"type": "review_wait", "wait_hours": 99, "security": True},
        ]
        sc = compute_scorecard(events)
        assert sc["review_wait_median_hours"] == 3  # (2+4)/2, security excluded
        assert sc["security_review_wait_median_hours"] == 99

    def test_dora_change_fail_and_ttr(self):
        events = [
            {"type": "deploy", "succeeded": True, "lead_time_hours": 5, "caused_failure": False},
            {"type": "deploy", "succeeded": True, "lead_time_hours": 7, "caused_failure": True},
            {"type": "incident", "ttr_hours": 3},
        ]
        sc = compute_scorecard(events)
        assert sc["dora"]["deploy_count"] == 2
        assert sc["dora"]["lead_time_median_hours"] == 6
        assert sc["dora"]["change_fail_rate"] == 0.5
        assert sc["dora"]["time_to_recover_median_hours"] == 3

    def test_escaped_bugs_listed(self):
        events = [{"type": "escaped_bug", "which_check": "the grader", "spec": "0007"}]
        sc = compute_scorecard(events)
        assert sc["escaped_bugs"][0]["which_check"] == "the grader"

    def test_bounce_back_rate(self):
        events = [
            {"type": "spec_merged", "accepted_as_is": True},
            {"type": "spec_bounced"},
        ]
        sc = compute_scorecard(events)
        assert sc["bounce_back_rate"] == 0.5  # 1 bounce / (1 merge + 1 bounce)


class TestForbiddenTypes:
    def test_activity_metrics_are_forbidden(self):
        for t in ("velocity", "story_points", "pr_count", "lines_of_code"):
            assert t in FORBIDDEN_TYPES


class TestFormatReport:
    def test_no_data_reads_no_data_not_zero(self):
        out = format_report(compute_scorecard([]), window_days=14)
        assert "no data" in out
        assert "Never tracked: velocity, story points, PR count, lines of code." in out

    def test_window_label(self):
        out = format_report(compute_scorecard([]), window_days=14)
        assert "last 14 days" in out

    def test_no_limits_is_byte_identical_to_before_team_alarms_existed(self):
        # limits omitted (defaults to None) and limits={} must render identically — a project
        # with no cadence-plan.md `## WIP Limits` block sees unchanged output.
        sc = compute_scorecard([{"type": "review_wait", "wait_hours": 5}])
        assert format_report(sc, window_days=14) == format_report(sc, window_days=14, limits={})
        assert "Review-wait alarms by team" not in format_report(sc, window_days=14)


class TestTeamAlarms:
    LIMITS = {
        "claims": {
            "wip_limit": 3,
            "review_alarm_hours": 12,
            "review_alarm_hours_default": False,
            "security_alarm_hours": 48,
            "security_alarm_hours_default": True,
        },
    }

    def test_over_alarm_flagged(self):
        sc = compute_scorecard([{"type": "review_wait", "wait_hours": 30}])
        out = "\n".join(format_team_alarms(sc, self.LIMITS))
        assert "claims" in out
        assert "OVER ALARM" in out

    def test_under_alarm_not_flagged(self):
        sc = compute_scorecard([{"type": "review_wait", "wait_hours": 2}])
        out = "\n".join(format_team_alarms(sc, self.LIMITS))
        assert "under alarm" in out
        assert "OVER ALARM" not in out

    def test_default_threshold_is_stated(self):
        sc = compute_scorecard([])
        out = "\n".join(format_team_alarms(sc, self.LIMITS))
        # review_alarm_hours was explicit (12) — no "(default)" on that line.
        assert "vs alarm 12h" in out and "vs alarm 12h (default)" not in out
        # security_alarm_hours used the default (48) — "(default)" must appear.
        assert "vs alarm 48h (default)" in out

    def test_no_data_reads_no_data_not_a_crash(self):
        sc = compute_scorecard([])  # no review_wait events at all
        out = "\n".join(format_team_alarms(sc, self.LIMITS))
        assert "no data" in out

    def test_appears_in_full_report_only_when_limits_present(self):
        sc = compute_scorecard([{"type": "review_wait", "wait_hours": 30}])
        with_limits = format_report(sc, window_days=None, limits=self.LIMITS)
        without_limits = format_report(sc, window_days=None, limits=None)
        assert "Review-wait alarms by team" in with_limits
        assert "Review-wait alarms by team" not in without_limits


class TestResolveMetricsDir:
    def test_repo_mode(self, tmp_path):
        args = argparse.Namespace(state=None, repo=str(tmp_path))
        assert resolve_metrics_dir(args) == (tmp_path / ".sdlc" / "metrics").resolve()

    def test_state_mode(self, tmp_path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "state.yaml").write_text("current_phase: build\n")
        args = argparse.Namespace(state=str(sdlc / "state.yaml"), repo=None)
        assert resolve_metrics_dir(args) == (sdlc / "metrics").resolve()
