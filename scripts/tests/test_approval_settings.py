"""Tests for approval_settings.py."""

from pathlib import Path

from approval_settings import known_handles, load_approval_settings, parse_approval_settings


class TestParseApprovalSettings:
    def test_no_file_content_is_empty_settings_no_errors(self):
        settings, errors = parse_approval_settings("")
        assert settings == {}
        assert errors == []

    def test_no_stages_key_is_empty_settings_no_errors(self):
        settings, errors = parse_approval_settings("version: '1.0'\n")
        assert settings == {}
        assert errors == []

    def test_valid_mixed_settings(self):
        text = """
stages:
  - stage: requirements
    approval_required: false
  - stage: design
    approval_required: true
    approver: "@sam-k"
"""
        settings, errors = parse_approval_settings(text, known_handles={"@sam-k"})
        assert errors == []
        assert settings == {
            "requirements": {"approval_required": False, "approver": None},
            "design": {"approval_required": True, "approver": "@sam-k"},
        }

    def test_approval_required_with_no_approver_is_an_error(self):
        text = "stages:\n  - stage: design\n    approval_required: true\n"
        settings, errors = parse_approval_settings(text)
        assert settings == {}
        assert len(errors) == 1
        assert "no approver is named" in errors[0]

    def test_malformed_handle_is_an_error(self):
        text = 'stages:\n  - stage: design\n    approval_required: true\n    approver: "sam-k"\n'
        settings, errors = parse_approval_settings(text)
        assert settings == {}
        assert "does not look like a @handle" in errors[0]

    def test_duplicate_stage_is_an_error(self):
        text = (
            "stages:\n"
            "  - stage: requirements\n    approval_required: false\n"
            "  - stage: requirements\n    approval_required: false\n"
        )
        settings, errors = parse_approval_settings(text)
        assert "duplicate stage 'requirements'" in errors[0]

    def test_approver_not_on_roster_is_an_error(self):
        text = 'stages:\n  - stage: design\n    approval_required: true\n    approver: "@ghost"\n'
        settings, errors = parse_approval_settings(text, known_handles={"@sam-k"})
        assert settings == {}
        assert "not a person on the team roster" in errors[0]

    def test_no_known_handles_skips_roster_check(self):
        text = 'stages:\n  - stage: design\n    approval_required: true\n    approver: "@anyone"\n'
        settings, errors = parse_approval_settings(text, known_handles=None)
        assert errors == []
        assert settings["design"]["approver"] == "@anyone"

    def test_malformed_yaml_is_a_single_error_not_a_crash(self):
        settings, errors = parse_approval_settings("stages: [unterminated")
        assert settings == {}
        assert len(errors) == 1
        assert "invalid YAML" in errors[0]

    def test_stages_not_a_list_is_an_error(self):
        settings, errors = parse_approval_settings("stages: not-a-list\n")
        assert settings == {}
        assert "expected an array" in errors[0]

    def test_approval_required_not_a_bool_is_an_error(self):
        text = 'stages:\n  - stage: design\n    approval_required: "yes"\n'
        settings, errors = parse_approval_settings(text)
        assert settings == {}
        assert "expected true or false" in errors[0]

    def test_missing_stage_id_is_an_error(self):
        text = "stages:\n  - approval_required: false\n"
        settings, errors = parse_approval_settings(text)
        assert settings == {}
        assert "missing or empty" in errors[0]


class TestKnownHandles:
    def test_no_roster_returns_none(self, tmp_path: Path):
        assert known_handles(tmp_path) is None

    def test_real_roster_returns_handles(self, tmp_path: Path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "team.yaml").write_text(
            "version: '1.0'\n"
            "teams:\n  - name: core\n    lead: '@matt-k'\n"
            "people:\n  - handle: '@matt-k'\n    name: Matt\n    team: core\n    roles: [owner, lead]\n"
        )
        assert known_handles(tmp_path) == {"@matt-k"}


class TestLoadApprovalSettings:
    def test_no_file_is_empty_settings_no_errors(self, tmp_path: Path):
        settings, errors = load_approval_settings(tmp_path)
        assert settings == {}
        assert errors == []

    def test_real_file_round_trip(self, tmp_path: Path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "approval-settings.yaml").write_text(
            "stages:\n  - stage: requirements\n    approval_required: false\n"
        )
        settings, errors = load_approval_settings(tmp_path)
        assert errors == []
        assert settings == {"requirements": {"approval_required": False, "approver": None}}
