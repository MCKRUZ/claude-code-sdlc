"""Tests for cadence_plan.py — the per-team WIP-limit / review-wait-alarm block parser."""

from cadence_plan import (
    DEFAULT_REVIEW_ALARM_HOURS,
    DEFAULT_SECURITY_ALARM_HOURS,
    known_teams,
    load_limits,
    parse_limits_block,
    resolve_cadence_plan_path,
)

VALID = """\
# Cadence Plan

## WIP Limits

| team | wip_limit | review_alarm_hours | security_alarm_hours |
|------|-----------|---------------------|-----------------------|
| claims | 3 | 12 | 24 |
| platform | 2 | 24 | 48 |

## Hardening passes
- none
"""


class TestNoBlockPresent:
    def test_no_heading_at_all(self):
        limits, errors = parse_limits_block("# Cadence Plan\n\nJust prose, no table.\n")
        assert limits == {}
        assert errors == []

    def test_empty_string(self):
        limits, errors = parse_limits_block("")
        assert limits == {}
        assert errors == []


class TestValidBlock:
    def test_parses_every_team(self):
        limits, errors = parse_limits_block(VALID)
        assert errors == []
        assert set(limits) == {"claims", "platform"}

    def test_explicit_values_used_not_defaults(self):
        limits, _ = parse_limits_block(VALID)
        assert limits["claims"]["wip_limit"] == 3
        assert limits["claims"]["review_alarm_hours"] == 12
        assert limits["claims"]["review_alarm_hours_default"] is False
        assert limits["claims"]["security_alarm_hours"] == 24
        assert limits["claims"]["security_alarm_hours_default"] is False

    def test_stops_at_next_heading(self):
        # "## Hardening passes" must not be swallowed into the table scan.
        limits, errors = parse_limits_block(VALID)
        assert errors == []
        assert len(limits) == 2


class TestDefaults:
    def test_blank_optional_columns_use_defaults(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit | review_alarm_hours | security_alarm_hours |\n"
            "|------|-----------|---------------------|-----------------------|\n"
            "| claims | 3 |  |  |\n"
        )
        limits, errors = parse_limits_block(text)
        assert errors == []
        assert limits["claims"]["review_alarm_hours"] == DEFAULT_REVIEW_ALARM_HOURS
        assert limits["claims"]["review_alarm_hours_default"] is True
        assert limits["claims"]["security_alarm_hours"] == DEFAULT_SECURITY_ALARM_HOURS
        assert limits["claims"]["security_alarm_hours_default"] is True

    def test_missing_optional_columns_entirely_use_defaults(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| claims | 3 |\n"
        )
        limits, errors = parse_limits_block(text)
        assert errors == []
        assert limits["claims"]["review_alarm_hours"] == DEFAULT_REVIEW_ALARM_HOURS
        assert limits["claims"]["security_alarm_hours"] == DEFAULT_SECURITY_ALARM_HOURS


class TestMalformed:
    def test_unknown_column_names_the_line(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit | bogus_column |\n"
            "|------|-----------|---------------|\n"
            "| claims | 3 | x |\n"
        )
        _, errors = parse_limits_block(text)
        assert any("unknown column" in e and "bogus_column" in e for e in errors)
        assert any("line 3" in e for e in errors)  # header row is line 3 in this fixture

    def test_missing_required_column(self):
        text = (
            "## WIP Limits\n\n"
            "| team |\n"
            "|------|\n"
            "| claims |\n"
        )
        _, errors = parse_limits_block(text)
        assert any("missing required column" in e and "wip_limit" in e for e in errors)

    def test_non_positive_integer_wip_limit_is_skipped_and_named(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| claims | zero |\n"
        )
        limits, errors = parse_limits_block(text)
        assert "claims" not in limits
        assert any("not a positive whole number" in e for e in errors)

    def test_zero_wip_limit_is_rejected(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| claims | 0 |\n"
        )
        limits, errors = parse_limits_block(text)
        assert "claims" not in limits
        assert any("not a positive whole number" in e for e in errors)

    def test_non_positive_integer_alarm_hours_falls_back_to_default_and_is_named(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit | review_alarm_hours |\n"
            "|------|-----------|---------------------|\n"
            "| claims | 3 | not-a-number |\n"
        )
        limits, errors = parse_limits_block(text)
        assert limits["claims"]["review_alarm_hours"] == DEFAULT_REVIEW_ALARM_HOURS
        assert limits["claims"]["review_alarm_hours_default"] is True
        assert any("review_alarm_hours" in e and "not a positive whole number" in e for e in errors)

    def test_duplicate_team_names_the_line(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| claims | 3 |\n"
            "| claims | 5 |\n"
        )
        limits, errors = parse_limits_block(text)
        assert limits["claims"]["wip_limit"] == 3  # first row wins
        assert any("duplicate team 'claims'" in e for e in errors)

    def test_team_absent_from_roster_is_named_and_not_a_crash(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| ghost-team | 3 |\n"
        )
        limits, errors = parse_limits_block(text, known_teams={"claims", "platform"})
        assert "ghost-team" not in limits
        assert any("ghost-team" in e and "roster" in e for e in errors)

    def test_known_team_passes_the_roster_check(self):
        text = (
            "## WIP Limits\n\n"
            "| team | wip_limit |\n"
            "|------|-----------|\n"
            "| claims | 3 |\n"
        )
        limits, errors = parse_limits_block(text, known_teams={"claims"})
        assert errors == []
        assert "claims" in limits


class TestLoadLimits:
    def test_no_cadence_plan_file_returns_empty(self, tmp_path):
        limits, errors = load_limits(tmp_path)
        assert limits == {}
        assert errors == []

    def test_reads_real_file_and_cross_checks_roster(self, tmp_path):
        cp_path = resolve_cadence_plan_path(tmp_path)
        cp_path.parent.mkdir(parents=True)
        cp_path.write_text(VALID, encoding="utf-8")

        sdlc = tmp_path / ".sdlc"
        (sdlc / "team.yaml").write_text(
            "teams:\n  - name: claims\n    lead: \"@priya-n\"\n"
            "people:\n  - handle: \"@priya-n\"\n    name: Priya\n    team: claims\n"
            "    roles: [owner, lead]\n",
            encoding="utf-8",
        )
        limits, errors = load_limits(tmp_path)
        assert "claims" in limits
        # "platform" is in the cadence plan but not the roster.
        assert any("platform" in e and "roster" in e for e in errors)

    def test_known_teams_empty_set_with_no_roster(self, tmp_path):
        assert known_teams(tmp_path) == set()
