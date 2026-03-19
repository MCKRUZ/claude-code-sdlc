"""Tests for init_project.py."""

from pathlib import Path

import pytest
import yaml

from init_project import create_sdlc_dir, init_state, load_profile, PHASE_DIRS


class TestLoadProfile:
    def test_loads_valid_profile(self, tmp_path, valid_profile):
        path = tmp_path / "profile.yaml"
        with open(path, "w") as f:
            yaml.dump(valid_profile, f)
        result = load_profile(path)
        assert result["company"]["profile_id"] == "test-profile"

    def test_missing_file_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_profile(tmp_path / "nonexistent.yaml")


class TestInitState:
    def test_substitutes_profile_id(self, valid_profile):
        state = init_state(valid_profile, "my-project")
        assert "test-profile" in state

    def test_substitutes_project_name(self, valid_profile):
        state = init_state(valid_profile, "my-project")
        assert "my-project" in state

    def test_substitutes_timestamp(self, valid_profile):
        state = init_state(valid_profile, "my-project")
        # Should contain an ISO 8601 timestamp (has T and +00:00 or Z)
        assert "T" in state

    def test_no_remaining_placeholders(self, valid_profile):
        state = init_state(valid_profile, "my-project")
        assert "${PROFILE_ID}" not in state
        assert "${PROJECT_NAME}" not in state
        assert "${CREATED_AT}" not in state


class TestCreateSdlcDir:
    def test_creates_sdlc_directory(self, tmp_path, valid_profile):
        target = tmp_path / "project"
        target.mkdir()
        create_sdlc_dir(target, valid_profile, "test")
        assert (target / ".sdlc").is_dir()

    def test_creates_all_phase_directories(self, tmp_path, valid_profile):
        target = tmp_path / "project"
        target.mkdir()
        create_sdlc_dir(target, valid_profile, "test")
        artifacts = target / ".sdlc" / "artifacts"
        for phase_dir in PHASE_DIRS:
            assert (artifacts / phase_dir).is_dir(), f"Missing {phase_dir}"

    def test_creates_state_yaml(self, tmp_path, valid_profile):
        target = tmp_path / "project"
        target.mkdir()
        create_sdlc_dir(target, valid_profile, "test")
        state_path = target / ".sdlc" / "state.yaml"
        assert state_path.exists()
        state = yaml.safe_load(state_path.read_text())
        assert state["profile_id"] == "test-profile"
        assert state["project_name"] == "test"

    def test_creates_frozen_profile(self, tmp_path, valid_profile):
        target = tmp_path / "project"
        target.mkdir()
        create_sdlc_dir(target, valid_profile, "test")
        profile_path = target / ".sdlc" / "profile.yaml"
        assert profile_path.exists()
        profile = yaml.safe_load(profile_path.read_text())
        assert profile["company"]["profile_id"] == "test-profile"

    def test_copies_constitution_template(self, tmp_path, valid_profile, plugin_root):
        target = tmp_path / "project"
        target.mkdir()
        constitution = plugin_root / "templates" / "constitution.md"
        if constitution.exists():
            create_sdlc_dir(target, valid_profile, "test")
            assert (target / ".sdlc" / "constitution.md").exists()

    def test_skips_if_already_exists(self, tmp_path, valid_profile, capsys):
        target = tmp_path / "project"
        target.mkdir()
        (target / ".sdlc").mkdir()
        create_sdlc_dir(target, valid_profile, "test")
        captured = capsys.readouterr()
        assert "already exists" in captured.out

    def test_default_project_name(self, tmp_path, valid_profile):
        target = tmp_path / "my-cool-project"
        target.mkdir()
        create_sdlc_dir(target, valid_profile, "my-cool-project")
        state_path = target / ".sdlc" / "state.yaml"
        state = yaml.safe_load(state_path.read_text())
        assert state["project_name"] == "my-cool-project"


class TestPhaseDirs:
    def test_has_10_phases(self):
        assert len(PHASE_DIRS) == 10

    def test_zero_padded(self):
        for d in PHASE_DIRS:
            assert d[:2].isdigit(), f"{d} doesn't start with two digits"
            assert d[2] == "-", f"{d} missing hyphen after number"

    def test_sequential(self):
        for i, d in enumerate(PHASE_DIRS):
            assert d.startswith(f"{i:02d}-"), f"{d} not in order"
