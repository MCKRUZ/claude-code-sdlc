"""Tests for validate_team.py — the hand-rolled team-roster validator.

Invoked via its CLI with subprocess so the tests lock the exit-code contract
(exit 0 pass / exit 1 fail) and stay robust to internal function naming.
"""

import subprocess
import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
VALIDATE = SCRIPTS_DIR / "validate_team.py"

sys.path.insert(0, str(SCRIPTS_DIR))
from validate_team import people_handles, team_names, validate_team

# A minimal roster that satisfies every schema rule — individual tests below mutate one thing.
VALID = {
    "version": "1.0",
    "teams": [
        {"name": "claims", "lead": "@priya-n"},
    ],
    "people": [
        {"handle": "@priya-n", "name": "Priya Nair", "team": "claims", "roles": ["owner", "lead"]},
        {"handle": "@jordan-b", "name": "Jordan Baptiste", "team": "claims", "roles": ["developer"]},
    ],
}


def run_validate(*paths):
    return subprocess.run(
        [sys.executable, str(VALIDATE), *[str(p) for p in paths]],
        capture_output=True,
        text=True,
    )


def write_roster(tmp_path, data, name="team.yaml"):
    p = tmp_path / name
    p.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return p


class TestValidRoster:
    def test_valid_passes(self, tmp_path):
        r = run_validate(write_roster(tmp_path, VALID))
        assert r.returncode == 0
        assert "PASS" in r.stdout


class TestRequiredFields:
    def test_missing_teams_fails(self, tmp_path):
        data = {k: v for k, v in VALID.items() if k != "teams"}
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "missing required field 'teams'" in r.stdout

    def test_missing_people_fails(self, tmp_path):
        data = {k: v for k, v in VALID.items() if k != "people"}
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "missing required field 'people'" in r.stdout


class TestDuplicateHandle:
    def test_duplicate_handle_fails(self, tmp_path):
        data = dict(VALID)
        data["people"] = VALID["people"] + [
            {"handle": "@priya-n", "name": "Priya Duplicate", "team": "claims", "roles": ["developer"]},
        ]
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "duplicate handle '@priya-n'" in r.stdout


class TestTeamWithNoLead:
    def test_no_lead_field_fails(self, tmp_path):
        data = dict(VALID)
        data["teams"] = [{"name": "claims"}]
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "no lead" in r.stdout

    def test_lead_not_a_person_with_lead_role_fails(self, tmp_path):
        data = dict(VALID)
        # @jordan-b exists but only holds 'developer', not 'lead'.
        data["teams"] = [{"name": "claims", "lead": "@jordan-b"}]
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "'lead' role" in r.stdout


class TestUnknownRole:
    def test_role_outside_allowed_list_fails(self, tmp_path):
        data = dict(VALID)
        data["people"] = [dict(VALID["people"][0], roles=["wizard"])]
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "'wizard' is not a valid role" in r.stdout


class TestUnderscoreSkip:
    def test_underscore_prefixed_file_is_skipped(self, tmp_path):
        p = write_roster(tmp_path, {"nonsense": True}, name="_schema.yaml")
        r = run_validate(p)
        assert r.returncode == 0
        assert "SKIP" in r.stdout


class TestHelperFunctions:
    """people_handles / team_names are the interface check_spec.py and track_specs.py reuse."""

    def test_people_handles(self):
        assert people_handles(VALID) == {"@priya-n", "@jordan-b"}

    def test_team_names(self):
        assert team_names(VALID) == {"claims"}

    def test_malformed_roster_returns_empty_sets(self):
        assert people_handles({"people": "not a list"}) == set()
        assert team_names({"teams": None}) == set()
        assert people_handles("not even a dict") == set()


class TestValidateTeamFunction:
    """validate_team() itself, exercised directly rather than through the CLI."""

    def test_root_must_be_mapping(self):
        errors = validate_team(["not", "a", "mapping"], {"required": []})
        assert errors == ["Root: roster must be a YAML mapping"]

    def test_people_wrong_shape(self):
        errors = validate_team({"teams": [], "people": "nope"}, {"required": []})
        assert any("people: expected array" in e for e in errors)

    def test_teams_wrong_shape(self):
        errors = validate_team({"teams": "nope", "people": []}, {"required": []})
        assert any("teams: expected array" in e for e in errors)


# --- Roster identity: optional `email` (code-host providers, Wave 2) --------------------------
# Additive: everything above is byte-identical to before `email` existed.

from validate_team import email_for, people_by_email  # noqa: E402


def _with_emails():
    data = dict(VALID)
    data["people"] = [
        dict(VALID["people"][0], email="priya.nair@example.com"),
        dict(VALID["people"][1], email="jordan.b@example.com"),
    ]
    return data


class TestEmailIsOptional:
    """A roster written before `email` existed validates exactly as it did then."""

    def test_no_email_anywhere_still_passes(self, tmp_path):
        assert "email" not in str(VALID)
        r = run_validate(write_roster(tmp_path, VALID))
        assert r.returncode == 0 and "PASS" in r.stdout

    def test_a_valid_email_passes(self, tmp_path):
        r = run_validate(write_roster(tmp_path, _with_emails()))
        assert r.returncode == 0 and "PASS" in r.stdout

    def test_only_some_people_having_one_passes(self, tmp_path):
        data = dict(VALID)
        data["people"] = [dict(VALID["people"][0], email="priya.nair@example.com"), VALID["people"][1]]
        assert run_validate(write_roster(tmp_path, data)).returncode == 0


class TestEmailRules:
    def test_duplicate_email_fails_case_insensitively(self, tmp_path):
        data = _with_emails()
        data["people"][1]["email"] = "PRIYA.NAIR@example.com"
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "duplicate email 'PRIYA.NAIR@example.com' (first seen at people[0])" in r.stdout

    def test_email_without_an_at_sign_fails(self, tmp_path):
        data = _with_emails()
        data["people"][0]["email"] = "priya.nair.example.com"
        r = run_validate(write_roster(tmp_path, data))
        assert r.returncode == 1
        assert "people[0].email: 'priya.nair.example.com' does not contain '@'" in r.stdout

    def test_email_spanning_two_lines_fails(self):
        data = _with_emails()
        data["people"][0]["email"] = "priya@example.com\n  - handle: '@ghost'"
        errors = validate_team(data, {"required": []})
        assert any("people[0].email: contains a line break" in e for e in errors)

    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_a_present_but_empty_email_fails(self, value):
        # The key present and blank is a mistake, not "unknown" — unknown is the key absent.
        data = _with_emails()
        data["people"][0]["email"] = value
        errors = validate_team(data, {"required": []})
        assert any("people[0].email: present but empty" in e for e in errors)

    def test_existing_error_strings_are_untouched(self, tmp_path):
        # The strings other modules and tests match on must read exactly as before.
        data = dict(VALID)
        data["people"] = VALID["people"] + [
            {"handle": "@priya-n", "name": "Dup", "team": "claims", "roles": ["developer"]}]
        r = run_validate(write_roster(tmp_path, data))
        assert "duplicate handle '@priya-n' (first seen at people[0])" in r.stdout


class TestEmailHelpers:
    """people_by_email / email_for are the ONLY bridge from a host identity to a handle."""

    def test_people_by_email_is_keyed_lower_case(self):
        data = _with_emails()
        data["people"][0]["email"] = "Priya.Nair@Example.com"
        assert people_by_email(data) == {
            "priya.nair@example.com": "@priya-n", "jordan.b@example.com": "@jordan-b"}

    def test_email_for_returns_the_recorded_email_or_none(self):
        assert email_for(_with_emails(), "@priya-n") == "priya.nair@example.com"
        assert email_for(VALID, "@priya-n") is None          # no email recorded
        assert email_for(_with_emails(), "@nobody") is None  # not on the roster

    def test_helpers_never_guess(self):
        # A display name or a UPN prefix that happens to resemble a handle is not a mapping.
        data = dict(VALID)
        data["people"] = [dict(VALID["people"][0], email="jordan-b@example.com")]
        assert people_by_email(data) == {"jordan-b@example.com": "@priya-n"}
        assert email_for(data, "@jordan-b") is None

    def test_malformed_roster_returns_empty(self):
        assert people_by_email({"people": "not a list"}) == {}
        assert people_by_email("not even a dict") == {}
        assert email_for({"people": None}, "@priya-n") is None

    def test_a_person_with_email_but_no_handle_is_skipped(self):
        assert people_by_email({"people": [{"email": "x@y.z"}]}) == {}
