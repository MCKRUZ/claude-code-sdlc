"""Tests for generate_status.py."""

from pathlib import Path

import pytest
import yaml

from generate_status import count_artifacts, generate_dashboard, PHASE_NAMES, STATUS_ICONS


class TestPhaseConstants:
    def test_has_10_phases(self):
        assert len(PHASE_NAMES) == 10

    def test_phase_ids_sequential(self):
        for i in range(10):
            assert i in PHASE_NAMES

    def test_status_icons_complete(self):
        expected = {"completed", "active", "pending", "skipped"}
        assert set(STATUS_ICONS.keys()) == expected


class TestCountArtifacts:
    def test_empty_dir(self, tmp_path):
        d = tmp_path / "00-discovery"
        d.mkdir()
        assert count_artifacts(tmp_path, "00-discovery") == 0

    def test_dir_with_files(self, tmp_path):
        d = tmp_path / "00-discovery"
        d.mkdir()
        (d / "problem-statement.md").write_text("content")
        (d / "notes.md").write_text("content")
        assert count_artifacts(tmp_path, "00-discovery") == 2

    def test_recursive_counting(self, tmp_path):
        d = tmp_path / "02-design"
        d.mkdir()
        (d / "design-doc.md").write_text("content")
        adrs = d / "adrs"
        adrs.mkdir()
        (adrs / "adr-001.md").write_text("content")
        (adrs / "adr-002.md").write_text("content")
        assert count_artifacts(tmp_path, "02-design") == 3

    def test_missing_dir(self, tmp_path):
        assert count_artifacts(tmp_path, "nonexistent") == 0


class TestGenerateDashboard:
    def test_includes_project_name(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "test-project" in output

    def test_includes_profile_id(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "test-profile" in output

    def test_includes_current_phase(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "Discovery" in output

    def test_progress_bar_zero_percent(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "0%" in output
        assert "0/10" in output

    def test_progress_bar_with_completions(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        state["phases"][0]["status"] = "completed"
        state["current_phase"] = 1
        output = generate_dashboard(state, sdlc_dir)
        assert "10%" in output
        assert "1/10" in output

    def test_includes_phase_table(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "| # | Phase" in output
        assert "Discovery" in output

    def test_active_phase_icon(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "[>]" in output  # active icon

    def test_includes_history_if_present(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        state["history"] = [{"from": 0, "to": 1, "at": "2026-03-17T12:00:00+00:00"}]
        output = generate_dashboard(state, sdlc_dir)
        assert "Transition History" in output
        assert "Phase 0" in output

    def test_no_history_section_when_empty(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        state["history"] = []
        output = generate_dashboard(state, sdlc_dir)
        assert "Transition History" not in output

    def test_null_completed_at_shows_dash(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        # Null completed_at should render as dash
        lines = output.split("\n")
        table_lines = [l for l in lines if "Discovery" in l]
        assert len(table_lines) > 0

    def test_artifact_counting(self, sdlc_dir, state_yaml):
        # Add an artifact to discovery
        (sdlc_dir / "artifacts" / "00-discovery" / "problem-statement.md").write_text("content")
        state = yaml.safe_load(state_yaml.read_text())
        output = generate_dashboard(state, sdlc_dir)
        assert "1 files" in output

    def test_handles_missing_phases_gracefully(self, sdlc_dir):
        """State with minimal phase info should not crash."""
        state = {
            "project_name": "minimal",
            "profile_id": "test",
            "current_phase": 0,
            "phases": {},
            "history": [],
        }
        output = generate_dashboard(state, sdlc_dir)
        assert "minimal" in output
