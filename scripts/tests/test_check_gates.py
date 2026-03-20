"""Tests for check_gates.py."""

from pathlib import Path

import pytest
import yaml

from check_gates import (
    check_artifact_complete,
    check_artifact_exists,
    check_artifact_not_empty,
    check_phase_gates,
    format_results,
)


class TestCheckArtifactExists:
    def test_file_exists(self, tmp_path):
        (tmp_path / "readme.md").write_text("content")
        passed, msg = check_artifact_exists(tmp_path, "readme.md")
        assert passed is True
        assert "exists" in msg

    def test_file_missing(self, tmp_path):
        passed, msg = check_artifact_exists(tmp_path, "missing.md")
        assert passed is False
        assert "Missing" in msg

    def test_dir_exists_with_files(self, tmp_path):
        d = tmp_path / "reports"
        d.mkdir()
        (d / "report.md").write_text("content")
        passed, msg = check_artifact_exists(tmp_path, "reports")
        assert passed is True
        assert "1 item" in msg

    def test_dir_exists_empty(self, tmp_path):
        (tmp_path / "reports").mkdir()
        passed, msg = check_artifact_exists(tmp_path, "reports")
        assert passed is False
        assert "empty" in msg


class TestCheckArtifactNotEmpty:
    def test_file_with_content(self, tmp_path):
        (tmp_path / "doc.md").write_text("Hello world")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is True

    def test_empty_file(self, tmp_path):
        (tmp_path / "doc.md").write_text("")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is False
        assert "empty" in msg

    def test_whitespace_only_file(self, tmp_path):
        (tmp_path / "doc.md").write_text("   \n  \n  ")
        passed, msg = check_artifact_not_empty(tmp_path, "doc.md")
        assert passed is False
        assert "empty" in msg

    def test_missing_file(self, tmp_path):
        passed, msg = check_artifact_not_empty(tmp_path, "missing.md")
        assert passed is False
        assert "Missing" in msg


class TestCheckArtifactComplete:
    def test_complete_content(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Problem Statement\n\nThis is a real document.")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is True
        assert "complete" in msg

    def test_contains_todo(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Doc\n\nTODO: fill this in")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "placeholder" in msg

    def test_contains_tbd(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Doc\n\nStatus: TBD")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "TBD" in str(msg)

    def test_contains_template_variable(self, tmp_path):
        (tmp_path / "doc.md").write_text("Name: ${PROJECT_NAME}")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False
        assert "${" in str(msg)

    def test_contains_placeholder_keyword(self, tmp_path):
        (tmp_path / "doc.md").write_text("Description: PLACEHOLDER")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False

    def test_contains_insert_bracket(self, tmp_path):
        (tmp_path / "doc.md").write_text("Author: [INSERT NAME]")
        passed, msg = check_artifact_complete(tmp_path, "doc.md")
        assert passed is False

    def test_directory_always_complete(self, tmp_path):
        d = tmp_path / "reports"
        d.mkdir()
        (d / "file.md").write_text("content")
        passed, msg = check_artifact_complete(tmp_path, "reports")
        assert passed is True

    def test_missing_file(self, tmp_path):
        passed, msg = check_artifact_complete(tmp_path, "missing.md")
        assert passed is False


class TestCheckPhaseGates:
    def test_phase_0_no_artifacts(self, sdlc_dir, valid_profile, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(0, state, valid_profile, sdlc_dir / "artifacts")
        # Phase 0 requires problem-statement.md
        failures = [r for r in results if r["passed"] is False]
        assert len(failures) > 0

    def test_phase_0_with_artifact(self, sdlc_dir, valid_profile, state_yaml):
        # Create all required Phase 0 artifacts
        discovery_dir = sdlc_dir / "artifacts" / "00-discovery"
        (discovery_dir / "problem-statement.md").write_text(
            "# Problem Statement\n\nWe need a better process.\n\n## Scope\nIn scope: everything."
        )
        (discovery_dir / "constitution.md").write_text(
            "# Constitution\n\nCore principles and constraints for this project."
        )
        (discovery_dir / "success-criteria.md").write_text(
            "# Success Criteria\n\nThe project succeeds when all users can log in."
        )
        (discovery_dir / "constraints.md").write_text(
            "# Constraints\n\nMust use existing infrastructure."
        )
        (discovery_dir / "phase1-handoff.md").write_text(
            "# Phase 1 Handoff\n\nReady for requirements phase."
        )
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(0, state, valid_profile, sdlc_dir / "artifacts")
        must_failures = [r for r in results if r["passed"] is False and r.get("severity") == "MUST"]
        assert len(must_failures) == 0

    def test_invalid_phase_id(self, sdlc_dir, valid_profile, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(99, state, valid_profile, sdlc_dir / "artifacts")
        assert len(results) == 1
        assert results[0]["passed"] is False
        assert "not found" in results[0]["message"]

    def test_compliance_gates_loaded(self, sdlc_dir, state_yaml):
        """Phase 1 with SOC 2 should include compliance gates.

        Uses microsoft-enterprise profile_id so get_compliance_gates finds the
        actual soc2-gates.yaml on disk.
        """
        # Build a profile whose profile_id matches the real on-disk directory
        ms_profile = {
            "company": {"name": "MS Test", "profile_id": "microsoft-enterprise"},
            "quality": {"coverage_minimum": 80},
            "compliance": {"frameworks": ["soc2"]},
        }
        req_dir = sdlc_dir / "artifacts" / "01-requirements"
        (req_dir / "requirements.md").write_text(
            "# Requirements\n\nAuthentication and authorization are required."
        )
        (req_dir / "acceptance-criteria.md").write_text(
            "# Acceptance Criteria\n\nGiven a user, when they log in, then they see the dashboard."
        )
        state = yaml.safe_load(state_yaml.read_text())
        results = check_phase_gates(1, state, ms_profile, sdlc_dir / "artifacts")
        compliance_gates = [r for r in results if "compliance" in r["gate"]]
        # Should have at least one SOC 2 gate for phase 1
        assert len(compliance_gates) >= 1


class TestFormatResults:
    def test_all_pass(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "PASS" in output
        assert "ALL GATES PASSED" in output

    def test_has_failures(self):
        results = [
            {"gate": "G1", "passed": False, "message": "Missing file", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "FAIL" in output
        assert "BLOCKED" in output

    def test_manual_checks(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
            {"gate": "G4", "passed": None, "message": "Manual check", "severity": "MUST"},
        ]
        output = format_results(results, 0)
        assert "MANUAL" in output
        assert "REVIEW" in output

    def test_summary_counts(self):
        results = [
            {"gate": "G1", "passed": True, "message": "OK", "severity": "MUST"},
            {"gate": "G2", "passed": False, "message": "Fail", "severity": "MUST"},
            {"gate": "G3", "passed": None, "message": "Manual", "severity": "SHOULD"},
        ]
        output = format_results(results, 0)
        assert "1 passed" in output
        assert "1 failed" in output
        assert "1 manual" in output
        assert "3 total" in output
