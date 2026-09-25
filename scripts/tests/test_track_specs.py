"""Tests for track_specs.py — the Build-loop spec-backlog tracker."""

import argparse

import pytest

from track_specs import (
    format_report,
    format_team_wip,
    resolve_roster_team_names,
    resolve_specs_dir,
    scan_specs,
    summarize,
    team_in_flight_counts,
    wip_warnings,
    wip_warnings_per_team,
)


def write_spec(specs_dir, spec_id, name, status, risk):
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-{name}.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "{name}"\nstatus: {status}\nrisk: {risk}\n---\n# Spec\n',
        encoding="utf-8",
    )


def write_spec_with_channel(specs_dir, spec_id, channel_line):
    """Write a spec whose frontmatter carries an explicit `channel:` line."""
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: draft\nrisk: LOW\n{channel_line}\n---\n# Spec\n',
        encoding="utf-8",
    )


def write_spec_with_people(specs_dir, spec_id, owner="", developer="", checker="", team=""):
    """Write a spec whose frontmatter carries the four people fields."""
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: draft\nrisk: LOW\n'
        f'owner: "{owner}"\ndeveloper: "{developer}"\nchecker: "{checker}"\nteam: "{team}"\n'
        f'---\n# Spec\n',
        encoding="utf-8",
    )


def write_spec_with_team(specs_dir, spec_id, status, team):
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: {status}\nrisk: LOW\nteam: "{team}"\n---\n# Spec\n',
        encoding="utf-8",
    )


def write_deferred_spec(specs_dir, spec_id, reason=""):
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: deferred\nrisk: LOW\n'
        f'deferred_reason: "{reason}"\n---\n# Spec\n',
        encoding="utf-8",
    )


class TestScanSpecs:
    def test_empty_dir(self, tmp_path):
        assert scan_specs(tmp_path / "specs") == []

    def test_parses_frontmatter(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "alpha", "merged", "HIGH")
        write_spec(specs, "0002", "beta", "in-flight", "low")
        scanned = scan_specs(specs)
        assert len(scanned) == 2
        assert scanned[0]["id"] == "0001"
        assert scanned[0]["status"] == "merged"
        assert scanned[1]["risk"] == "LOW"  # normalized

    def test_skips_files_without_frontmatter(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0001-x.md").write_text("# no frontmatter\n")
        assert scan_specs(specs) == []


class TestSummarize:
    def test_counts_by_status_and_risk(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "merged", "HIGH")
        write_spec(specs, "0002", "b", "in-flight", "MEDIUM")
        write_spec(specs, "0003", "c", "ready", "LOW")
        write_spec(specs, "0004", "d", "in-flight", "HIGH")
        summary = summarize(scan_specs(specs))
        assert summary["total"] == 4
        assert summary["by_status"]["in-flight"] == 2
        assert summary["by_status"]["merged"] == 1
        assert summary["by_risk"]["HIGH"] == 2
        assert len(summary["in_flight"]) == 2


class TestWipWarnings:
    def test_breach_flagged(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "in-flight", "LOW")
        write_spec(specs, "0002", "b", "in-flight", "LOW")
        write_spec(specs, "0003", "c", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        assert wip_warnings(summary, wip_cap=2)
        assert not wip_warnings(summary, wip_cap=3)

    def test_no_cap_no_warning(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        assert wip_warnings(summary, wip_cap=None) == []


class TestResolveSpecsDir:
    def test_repo_mode(self, tmp_path):
        args = argparse.Namespace(state=None, repo=str(tmp_path))
        assert resolve_specs_dir(args) == (tmp_path / "specs").resolve()

    def test_state_mode(self, tmp_path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "state.yaml").write_text("current_phase: build\n")
        args = argparse.Namespace(state=str(sdlc / "state.yaml"), repo=None)
        assert resolve_specs_dir(args) == (tmp_path / "specs").resolve()

    def test_state_missing_exits(self, tmp_path):
        args = argparse.Namespace(state=str(tmp_path / "nope.yaml"), repo=None)
        with pytest.raises(SystemExit):
            resolve_specs_dir(args)


class TestByTeam:
    def test_scan_sets_people_fields(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_people(specs, "0001", owner="@priya-n", developer="@jordan-b",
                                checker="@sam-oduya", team="claims")
        scanned = scan_specs(specs)
        assert scanned[0]["owner"] == "@priya-n"
        assert scanned[0]["developer"] == "@jordan-b"
        assert scanned[0]["checker"] == "@sam-oduya"
        assert scanned[0]["team"] == "claims"

    def test_summarize_buckets_team_and_unassigned(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_people(specs, "0001", team="claims")
        write_spec(specs, "0002", "b", "draft", "LOW")            # no team -> unassigned
        write_spec_with_people(specs, "0003", team="—")           # em-dash -> unassigned
        summary = summarize(scan_specs(specs))
        assert summary["by_team"]["claims"] == 1
        assert summary["by_team"]["unassigned"] == 2

    def test_summarize_preseeds_from_roster_team_names(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_people(specs, "0001", team="claims")
        # "platform" has zero specs but is still a real team — it must appear at 0.
        summary = summarize(scan_specs(specs), team_names=["claims", "platform"])
        assert summary["by_team"]["claims"] == 1
        assert summary["by_team"]["platform"] == 0

    def test_resolve_roster_team_names_reads_sdlc_team_yaml(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "team.yaml").write_text(
            "teams:\n  - name: claims\n    lead: \"@priya-n\"\n"
            "  - name: platform\n    lead: \"@sam-oduya\"\n"
            "people:\n  - handle: \"@priya-n\"\n    name: Priya\n    team: claims\n"
            "    roles: [owner, lead]\n"
            "  - handle: \"@sam-oduya\"\n    name: Sam\n    team: platform\n"
            "    roles: [owner, lead]\n",
            encoding="utf-8",
        )
        assert resolve_roster_team_names(specs) == ["claims", "platform"]

    def test_resolve_roster_team_names_empty_when_no_roster(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        assert resolve_roster_team_names(specs) == []


class TestDeferredStatus:
    def test_scan_sets_deferred_reason(self, tmp_path):
        specs = tmp_path / "specs"
        write_deferred_spec(specs, "0001", reason="superseded by 0009")
        scanned = scan_specs(specs)
        assert scanned[0]["status"] == "deferred"
        assert scanned[0]["deferred_reason"] == "superseded by 0009"

    def test_non_deferred_spec_has_empty_deferred_reason(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "draft", "LOW")
        assert scan_specs(specs)[0]["deferred_reason"] == ""

    def test_deferred_counted_but_never_in_flight(self, tmp_path):
        specs = tmp_path / "specs"
        write_deferred_spec(specs, "0001")
        summary = summarize(scan_specs(specs))
        assert summary["by_status"]["deferred"] == 1
        assert summary["in_flight"] == []

    def test_deferred_never_triggers_wip_warning(self, tmp_path):
        specs = tmp_path / "specs"
        write_deferred_spec(specs, "0001")
        write_deferred_spec(specs, "0002")
        write_deferred_spec(specs, "0003")
        summary = summarize(scan_specs(specs))
        assert wip_warnings(summary, wip_cap=0) == []

    def test_report_shows_deferred_line_only_when_present(self, tmp_path):
        specs = tmp_path / "specs"
        write_deferred_spec(specs, "0001")
        summary = summarize(scan_specs(specs))
        report = format_report(summary, [])
        assert "deferred" in report
        assert "  deferred   1" in report

    def test_old_status_only_repo_report_is_byte_identical(self, tmp_path):
        """The literal backward-compatibility acceptance check: a repository whose specs use
        only the four old statuses produces the same track_specs.py report as before deferred
        existed — no extra "deferred 0" line."""
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "merged", "HIGH")
        write_spec(specs, "0002", "b", "in-flight", "MEDIUM")
        write_spec(specs, "0003", "c", "ready", "LOW")
        write_spec(specs, "0004", "d", "draft", "LOW")
        summary = summarize(scan_specs(specs))
        report = format_report(summary, [])
        assert "deferred" not in report
        expected = (
            "Spec Backlog\n"
            "========================================\n"
            "Total specs: 4\n"
            "\n"
            "By status:\n"
            "  draft      1\n"
            "  ready      1\n"
            "  in-flight  1\n"
            "  merged     1\n"
            "\n"
            "By risk tier:\n"
            "  HIGH     1\n"
            "  MEDIUM   1\n"
            "  LOW      2\n"
            "\n"
            "By channel:\n"
            "  unassigned       4\n"
            "\n"
            "By team:\n"
            "  unassigned       4\n"
            "\n"
            "In flight (one spec = one branch = one PR):\n"
            "  0002 b [MEDIUM]"
        )
        assert report == expected


class TestTeamWipLimits:
    def test_team_in_flight_counts_groups_by_team(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_team(specs, "0001", "in-flight", "claims")
        write_spec_with_team(specs, "0002", "in-flight", "claims")
        write_spec_with_team(specs, "0003", "in-flight", "platform")
        write_spec_with_team(specs, "0004", "merged", "claims")  # not in-flight — excluded
        summary = summarize(scan_specs(specs))
        counts = team_in_flight_counts(summary["in_flight"])
        assert counts == {"claims": 2, "platform": 1}

    def test_over_limit_warns_naming_team_count_and_limit(self):
        limits = {"claims": {"wip_limit": 1, "review_alarm_hours": 24,
                              "review_alarm_hours_default": True,
                              "security_alarm_hours": 48, "security_alarm_hours_default": True}}
        warnings = wip_warnings_per_team({"claims": 2}, limits)
        assert len(warnings) == 1
        assert "claims" in warnings[0]
        assert "2" in warnings[0]
        assert "1" in warnings[0]

    def test_at_or_under_limit_no_warning(self):
        limits = {"claims": {"wip_limit": 3, "review_alarm_hours": 24,
                              "review_alarm_hours_default": True,
                              "security_alarm_hours": 48, "security_alarm_hours_default": True}}
        assert wip_warnings_per_team({"claims": 3}, limits) == []
        assert wip_warnings_per_team({"claims": 1}, limits) == []

    def test_team_absent_from_in_flight_counts_is_zero_not_a_crash(self):
        limits = {"claims": {"wip_limit": 1, "review_alarm_hours": 24,
                              "review_alarm_hours_default": True,
                              "security_alarm_hours": 48, "security_alarm_hours_default": True}}
        assert wip_warnings_per_team({}, limits) == []

    def test_format_team_wip_shows_status(self):
        limits = {
            "claims": {"wip_limit": 1, "review_alarm_hours": 24,
                       "review_alarm_hours_default": True,
                       "security_alarm_hours": 48, "security_alarm_hours_default": True},
            "platform": {"wip_limit": 3, "review_alarm_hours": 24,
                         "review_alarm_hours_default": True,
                         "security_alarm_hours": 48, "security_alarm_hours_default": True},
        }
        lines = "\n".join(format_team_wip({"claims": 2, "platform": 1}, limits))
        assert "claims" in lines and "2 / 1" in lines and "OVER LIMIT" in lines
        assert "platform" in lines and "1 / 3" in lines


class TestByChannel:
    def test_scan_sets_channel_field(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_channel(specs, "0001", "channel: voice")
        scanned = scan_specs(specs)
        assert scanned[0]["channel"] == "voice"

    def test_summarize_buckets_voice_unassigned_and_agnostic(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_channel(specs, "0001", "channel: voice")   # -> voice
        write_spec(specs, "0002", "b", "draft", "LOW")             # no channel -> unassigned
        write_spec_with_channel(specs, "0003", 'channel: "—"')     # em-dash -> channel-agnostic
        summary = summarize(scan_specs(specs))
        assert summary["by_channel"]["voice"] == 1
        assert summary["by_channel"]["unassigned"] == 1
        assert summary["by_channel"]["channel-agnostic"] == 1
