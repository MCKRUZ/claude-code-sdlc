"""Tests for init_project.py."""

import sys
from pathlib import Path

import pytest
import yaml

import init_project
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


class TestMainValidatesProfile:
    """main() validates the profile with the same rules as validate_profile.py and exits 2
    with the errors BEFORE writing anything (init runs first in the setup wizard)."""

    def _run_main(self, monkeypatch, profile_path, target):
        monkeypatch.setattr(sys, "argv",
                            ["init_project.py", "--profile", str(profile_path),
                             "--target", str(target)])
        init_project.main()

    def _write_profile(self, tmp_path, profile):
        path = tmp_path / "profile.yaml"
        path.write_text(yaml.dump(profile), encoding="utf-8")
        return path

    def test_invalid_profile_exits_2_before_writing(self, tmp_path, monkeypatch, capsys):
        bad = {"version": "1.0", "company": {"name": "X", "profile_id": "x"}}  # no stack/quality
        profile_path = self._write_profile(tmp_path, bad)
        target = tmp_path / "proj"
        with pytest.raises(SystemExit) as si:
            self._run_main(monkeypatch, profile_path, target)
        assert si.value.code == 2
        assert not target.exists()                       # nothing written — not even the dir
        out = capsys.readouterr().out
        assert "stack" in out and "quality" in out       # the errors are reported

    def test_wrong_shape_section_exits_2(self, tmp_path, monkeypatch, capsys):
        bad = {"version": "1.0", "company": "acme",
               "stack": {"backend": {"language": "csharp", "framework": "dotnet"}},
               "quality": {"coverage_minimum": 80}}
        profile_path = self._write_profile(tmp_path, bad)
        target = tmp_path / "proj"
        with pytest.raises(SystemExit) as si:
            self._run_main(monkeypatch, profile_path, target)
        assert si.value.code == 2
        assert not (target / ".sdlc").exists()
        assert "company" in capsys.readouterr().out

    def test_valid_profile_creates_sdlc(self, tmp_path, monkeypatch, valid_profile):
        profile_path = self._write_profile(tmp_path, valid_profile)
        target = tmp_path / "proj"
        target.mkdir()
        self._run_main(monkeypatch, profile_path, target)
        assert (target / ".sdlc" / "state.yaml").is_file()


class TestPhaseDirs:
    def test_matches_registry_order(self):
        import phase_model as pm
        assert PHASE_DIRS == [p["slug"] for p in pm.all_phases()]

    def test_includes_build_and_close(self):
        assert "build" in PHASE_DIRS
        assert "close" in PHASE_DIRS

    def test_numbered_phases_zero_padded(self):
        # Numbered phases use NN-name slugs; the continuous/terminal phases are bare slugs.
        for d in PHASE_DIRS:
            if d in ("build", "close"):
                continue
            assert d[:2].isdigit(), f"{d} doesn't start with two digits"
            assert d[2] == "-", f"{d} missing hyphen after number"
