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
