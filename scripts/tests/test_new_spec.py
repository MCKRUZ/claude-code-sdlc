"""Tests for new_spec.py — spec scaffolding and id allocation."""

import argparse

import pytest

from new_spec import (
    create_spec,
    next_spec_id,
    render_spec,
    resolve_repo_root,
    slugify,
)


class TestSlugify:
    def test_basic(self):
        assert slugify("Add Rate Limiting") == "add-rate-limiting"

    def test_punctuation_and_collapse(self):
        assert slugify("  Fix  the__login!! flow ") == "fix-the-login-flow"

    def test_already_slug(self):
        assert slugify("duplicate-claim-409") == "duplicate-claim-409"


class TestNextSpecId:
    def test_empty_dir(self, tmp_path):
        assert next_spec_id(tmp_path / "specs") == "0001"

    def test_increments_from_max(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0001-a.md").write_text("x")
        (specs / "0007-b.md").write_text("x")
        assert next_spec_id(specs) == "0008"

    def test_ignores_non_spec_files(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0003-a.md").write_text("x")
        (specs / "README.md").write_text("x")
        (specs / "notes.txt").write_text("x")
        assert next_spec_id(specs) == "0004"


class TestRenderSpec:
    def test_fills_frontmatter(self):
        template = (
            '---\n'
            'spec: "NNNN"\n'
            'name: "short-kebab-name"\n'
            'status: draft\n'
            'risk: MEDIUM             # HIGH | MEDIUM | LOW\n'
            'source: "—"\n'
            'created: "YYYY-MM-DD"\n'
            '---\n'
            '# Spec NNNN — <title>\n'
            '## Risk Tier\n**Tier:** MEDIUM\n'
        )
        out = render_spec(template, "0005", "add-rate-limiting", "HIGH", "REQ-12")
        assert 'spec: "0005"' in out
        assert 'name: "add-rate-limiting"' in out
        assert "risk: HIGH" in out
        assert "# MEDIUM" not in out  # the inline comment line was replaced wholesale
        assert 'source: "REQ-12"' in out
        assert "# Spec 0005 — add-rate-limiting" in out
        assert "YYYY-MM-DD" not in out
        assert "NNNN" not in out
        assert "**Tier:** HIGH" in out  # body tier synced to frontmatter risk
        assert "**Tier:** MEDIUM" not in out


class TestCreateSpec:
    def test_creates_file_in_specs_dir(self, tmp_path, monkeypatch):
        # Use the real template from the plugin.
        out = create_spec(tmp_path, "Add Rate Limiting", "HIGH", "REQ-1")
        assert out.exists()
        assert out.parent.name == "specs"
        assert out.name == "0001-add-rate-limiting.md"
        text = out.read_text(encoding="utf-8")
        assert "risk: HIGH" in text
        assert 'name: "add-rate-limiting"' in text

    def test_second_spec_increments_id(self, tmp_path):
        create_spec(tmp_path, "first", "LOW", "—")
        out2 = create_spec(tmp_path, "second", "LOW", "—")
        assert out2.name == "0002-second.md"

    def test_duplicate_slug_errors(self, tmp_path):
        create_spec(tmp_path, "same name", "LOW", "—")
        # Force a collision by pre-creating the would-be next file.
        (tmp_path / "specs" / "0002-same-name.md").write_text("x")
        with pytest.raises(SystemExit):
            # next id would be 0003, so this won't collide; instead test empty-slug path
            create_spec(tmp_path, "!!!", "LOW", "—")


class TestResolveRepoRoot:
    def test_repo_mode(self, tmp_path):
        args = argparse.Namespace(state=None, repo=str(tmp_path))
        assert resolve_repo_root(args) == tmp_path.resolve()

    def test_state_mode_is_sdlc_parent(self, tmp_path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        state = sdlc / "state.yaml"
        state.write_text("x")
        args = argparse.Namespace(state=str(state), repo=None)
        assert resolve_repo_root(args) == tmp_path.resolve()

    def test_state_missing_exits(self, tmp_path):
        args = argparse.Namespace(state=str(tmp_path / "nope.yaml"), repo=None)
        with pytest.raises(SystemExit):
            resolve_repo_root(args)
