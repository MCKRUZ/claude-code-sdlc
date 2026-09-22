"""Tests for scorecard.py — outcome-event recording and the steering scorecard."""

import argparse

import pytest

from github_import import GitHubImportError
from scorecard import (
    FORBIDDEN_TYPES,
    append_events,
    compute_scorecard,
    format_report,
    format_team_alarms,
    import_events,
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


class TestImportEvents:
    """import_events() — the glue between github_import.collect_events and the JSONL log."""

    EVENTS = [
        {"type": "spec_merged", "gh_id": "gh-pr-merge:1", "timestamp": "t", "accepted_as_is": True},
        {"type": "review_wait", "gh_id": "gh-pr-review:1", "timestamp": "t", "wait_hours": 2},
    ]

    def test_writes_new_events_and_returns_counts(self, tmp_path, monkeypatch):
        monkeypatch.setattr("scorecard.gi.collect_events", lambda root, since: list(self.EVENTS))
        log = tmp_path / "loop-events.jsonl"
        counts = import_events(tmp_path, log, "2026-09-01")
        assert counts == {"spec_merged": 1, "review_wait": 1}
        assert len(load_events(log)) == 2

    def test_rerun_same_window_writes_nothing_new(self, tmp_path, monkeypatch):
        monkeypatch.setattr("scorecard.gi.collect_events", lambda root, since: list(self.EVENTS))
        log = tmp_path / "loop-events.jsonl"
        import_events(tmp_path, log, "2026-09-01")
        counts = import_events(tmp_path, log, "2026-09-01")
        assert counts == {}
        assert len(load_events(log)) == 2  # no duplicates appended

    def test_no_activity_writes_nothing_and_leaves_no_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr("scorecard.gi.collect_events", lambda root, since: [])
        log = tmp_path / "loop-events.jsonl"
        counts = import_events(tmp_path, log, "2026-09-01")
        assert counts == {}
        assert not log.exists()

    def test_gh_error_propagates_without_writing(self, tmp_path, monkeypatch):
        def boom(root, since):
            raise GitHubImportError("no network")
        monkeypatch.setattr("scorecard.gi.collect_events", boom)
        log = tmp_path / "loop-events.jsonl"
        with pytest.raises(GitHubImportError):
            import_events(tmp_path, log, "2026-09-01")
        assert not log.exists()

    def test_existing_hand_recorded_log_is_left_untouched_on_failure(self, tmp_path, monkeypatch):
        log = tmp_path / "loop-events.jsonl"
        record_event(log, "spec_merged", {"accepted_as_is": True}, "2026-09-01T00:00:00+00:00")
        before = log.read_text()

        def boom(root, since):
            raise GitHubImportError("no permission")
        monkeypatch.setattr("scorecard.gi.collect_events", boom)
        with pytest.raises(GitHubImportError):
            import_events(tmp_path, log, "2026-09-01")
        assert log.read_text() == before


class TestAppendEvents:
    def test_appends_verbatim_dicts(self, tmp_path):
        log = tmp_path / "loop-events.jsonl"
        append_events(log, [{"type": "incident", "gh_id": "gh-issue:1", "ttr_hours": 2}])
        events = load_events(log)
        assert events[0]["gh_id"] == "gh-issue:1"


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


class TestMainImport:
    """The `scorecard.py import --repo <path> --since <date>` CLI path end to end."""

    def _run(self, monkeypatch, argv, collect):
        import scorecard
        monkeypatch.setattr(scorecard.gi, "collect_events", collect)
        monkeypatch.setattr("sys.argv", ["scorecard.py", *argv])
        return scorecard.main()

    def test_no_activity_prints_no_data_and_exits_zero(self, tmp_path, monkeypatch, capsys):
        self._run(monkeypatch, ["import", "--repo", str(tmp_path), "--since", "2026-09-01"],
                   lambda root, since: [])
        assert "no data" in capsys.readouterr().out

    def test_new_events_prints_summary_and_writes_log(self, tmp_path, monkeypatch, capsys):
        events = [{"type": "spec_merged", "gh_id": "gh-pr-merge:1", "timestamp": "t", "accepted_as_is": True}]
        self._run(monkeypatch, ["import", "--repo", str(tmp_path), "--since", "2026-09-01"],
                   lambda root, since: events)
        out = capsys.readouterr().out
        assert "1 spec_merged" in out
        assert len(load_events(tmp_path / ".sdlc" / "metrics" / "loop-events.jsonl")) == 1

    def test_gh_failure_prints_error_and_exits_one(self, tmp_path, monkeypatch, capsys):
        def boom(root, since):
            raise GitHubImportError("no network access")
        with pytest.raises(SystemExit) as exc:
            self._run(monkeypatch, ["import", "--repo", str(tmp_path), "--since", "2026-09-01"], boom)
        assert exc.value.code == 1
        assert "no network access" in capsys.readouterr().out
        assert not (tmp_path / ".sdlc" / "metrics" / "loop-events.jsonl").exists()
