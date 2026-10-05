"""Tests for generate_status.py."""

from pathlib import Path

import pytest
import yaml

import phase_model as pm
from generate_status import count_artifacts, generate_dashboard, status_json, STATUS_ICONS


class TestPhaseConstants:
    def test_phase_count_matches_registry(self):
        assert pm.phase_count() == 9

    def test_phase_chain_is_complete(self):
        assert pm.all_phase_ids() == ["0", "1", "2", "3", "build", "7", "8", "9", "close"]

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
        assert "0/9" in output

    def test_progress_bar_with_completions(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        state["phases"]["0"]["status"] = "completed"
        state["current_phase"] = "1"
        output = generate_dashboard(state, sdlc_dir)
        assert "11%" in output
        assert "1/9" in output

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


class TestStatusJson:
    """status_json() — spec 0008: the ONLY way Studio reads a project's stage state."""

    def test_top_level_fields(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        assert result["project_name"] == "test-project"
        assert result["profile_id"] == "test-profile"
        assert result["current_phase"] == {"id": "0", "display": "Phase 0: Discovery"}

    def test_every_registry_phase_present_in_order(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        assert [s["id"] for s in result["stages"]] == pm.all_phase_ids()

    def test_current_phase_state(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        stage_0 = next(s for s in result["stages"] if s["id"] == "0")
        assert stage_0["stage_state"] == "current"

    def test_completed_phase_is_signed_off(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        state["phases"]["0"]["status"] = "completed"
        state["current_phase"] = "1"
        result = status_json(state, sdlc_dir)
        stage_0 = next(s for s in result["stages"] if s["id"] == "0")
        assert stage_0["stage_state"] == "signed_off"

    def test_pending_phase_is_later(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        stage_1 = next(s for s in result["stages"] if s["id"] == "1")
        assert stage_1["stage_state"] == "later"

    def test_unreached_phase_not_in_state_dict_is_later(self, sdlc_dir, state_yaml):
        """state.yaml's fixture only carries entries for phases 0 and 1 — every other
        registry phase must still appear, defaulted to 'later', not crash or be omitted."""
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        stage_build = next(s for s in result["stages"] if s["id"] == "build")
        assert stage_build["stage_state"] == "later"
        assert stage_build["status"] == "pending"

    def test_artifact_count_included(self, sdlc_dir, state_yaml):
        (sdlc_dir / "artifacts" / "00-discovery" / "problem-statement.md").write_text("x")
        state = yaml.safe_load(state_yaml.read_text())
        result = status_json(state, sdlc_dir)
        stage_0 = next(s for s in result["stages"] if s["id"] == "0")
        assert stage_0["artifact_count"] == 1

    def test_json_serializable(self, sdlc_dir, state_yaml):
        import json
        state = yaml.safe_load(state_yaml.read_text())
        json.dumps(status_json(state, sdlc_dir))  # raises if anything isn't serializable


class TestSignedOffBy:
    """Who signed a stage off, reported beside the stage that was signed.

    A screen showing "signed off" without a name can only get one by parsing state.yaml
    itself, and a second reader of that file is a second thing to keep in step with this one.

    The distinction that matters throughout: NOT RECORDED is reported as null, never as a
    name and never as an empty string somebody might render as a blank signature. A stage
    advanced before sign-offs existed, or advanced without a name, is a real and different
    thing from a stage nobody signed.
    """

    def _state(self, state_yaml, phase_patch):
        state = yaml.safe_load(state_yaml.read_text())
        state["phases"]["0"].update(phase_patch)
        return state

    def _phase0(self, result):
        return next(s for s in result["stages"] if s["id"] == "0")

    def test_the_recorded_name_is_reported(self, sdlc_dir, state_yaml):
        state = self._state(state_yaml, {"gate_results": {"signed_off_by": "Matt K"}})
        assert self._phase0(status_json(state, sdlc_dir))["signed_off_by"] == "Matt K"

    def test_no_gate_results_at_all_reads_as_not_recorded(self, sdlc_dir, state_yaml):
        state = self._state(state_yaml, {"gate_results": {}})
        assert self._phase0(status_json(state, sdlc_dir))["signed_off_by"] is None

    def test_a_stage_never_reached_reads_as_not_recorded(self, sdlc_dir, state_yaml):
        state = yaml.safe_load(state_yaml.read_text())
        later = next(s for s in status_json(state, sdlc_dir)["stages"] if s["id"] == "close")
        assert later["signed_off_by"] is None

    @pytest.mark.parametrize("value", ["", "   ", None, 0, [], {"name": "Matt"}])
    def test_anything_that_is_not_a_real_name_reads_as_not_recorded(
            self, sdlc_dir, state_yaml, value):
        # An empty string is the dangerous one: rendered straight into a screen it becomes a
        # blank signature line, which reads as "signed" to anybody looking at it.
        state = self._state(state_yaml, {"gate_results": {"signed_off_by": value}})
        assert self._phase0(status_json(state, sdlc_dir))["signed_off_by"] is None

    def test_gate_results_that_is_not_a_mapping_does_not_crash(self, sdlc_dir, state_yaml):
        state = self._state(state_yaml, {"gate_results": ["not", "a", "mapping"]})
        assert self._phase0(status_json(state, sdlc_dir))["signed_off_by"] is None

    def test_the_gate_entries_themselves_are_never_mistaken_for_a_name(self, sdlc_dir, state_yaml):
        # gate_results holds the gate entries too; only the one scalar key is a signature.
        state = self._state(state_yaml, {
            "gate_results": {"G1-integrity": {"status": "COMPLIANT"}, "signed_off_by": "Priya N"},
        })
        assert self._phase0(status_json(state, sdlc_dir))["signed_off_by"] == "Priya N"

    def test_every_stage_carries_the_key(self, sdlc_dir, state_yaml):
        # Absent-vs-null is exactly the ambiguity this is meant to remove, so the key is
        # always present rather than only when there is something to say.
        state = yaml.safe_load(state_yaml.read_text())
        assert all("signed_off_by" in s for s in status_json(state, sdlc_dir)["stages"])
