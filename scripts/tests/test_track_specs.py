"""Tests for track_specs.py — the Build-loop spec-backlog tracker."""

import argparse

import pytest

from track_specs import (
    resolve_specs_dir,
    scan_specs,
    summarize,
    wip_warnings,
)


def write_spec(specs_dir, spec_id, name, status, risk):
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-{name}.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "{name}"\nstatus: {status}\nrisk: {risk}\n---\n# Spec\n',
        encoding="utf-8",
    )


def write_spec_with_channel(specs_dir, spec_id, channel_line):
    """Write a spec whose frontmatter carries an explicit `channel:` line."""
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x"\nstatus: draft\nrisk: LOW\n{channel_line}\n---\n# Spec\n',
        encoding="utf-8",
    )


class TestScanSpecs:
    def test_empty_dir(self, tmp_path):
        assert scan_specs(tmp_path / "specs") == []

    def test_parses_frontmatter(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "alpha", "merged", "HIGH")
        write_spec(specs, "0002", "beta", "in-flight", "low")
        scanned = scan_specs(specs)
        assert len(scanned) == 2
        assert scanned[0]["id"] == "0001"
        assert scanned[0]["status"] == "merged"
        assert scanned[1]["risk"] == "LOW"  # normalized

    def test_skips_files_without_frontmatter(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0001-x.md").write_text("# no frontmatter\n")
        assert scan_specs(specs) == []


class TestSummarize:
    def test_counts_by_status_and_risk(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "merged", "HIGH")
        write_spec(specs, "0002", "b", "in-flight", "MEDIUM")
        write_spec(specs, "0003", "c", "ready", "LOW")
        write_spec(specs, "0004", "d", "in-flight", "HIGH")
        summary = summarize(scan_specs(specs))
        assert summary["total"] == 4
        assert summary["by_status"]["in-flight"] == 2
        assert summary["by_status"]["merged"] == 1
        assert summary["by_risk"]["HIGH"] == 2
        assert len(summary["in_flight"]) == 2


class TestWipWarnings:
    def test_breach_flagged(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "in-flight", "LOW")
        write_spec(specs, "0002", "b", "in-flight", "LOW")
        write_spec(specs, "0003", "c", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        assert wip_warnings(summary, wip_cap=2)
        assert not wip_warnings(summary, wip_cap=3)

    def test_no_cap_no_warning(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        assert wip_warnings(summary, wip_cap=None) == []


class TestResolveSpecsDir:
    def test_repo_mode(self, tmp_path):
        args = argparse.Namespace(state=None, repo=str(tmp_path))
        assert resolve_specs_dir(args) == (tmp_path / "specs").resolve()

    def test_state_mode(self, tmp_path):
        sdlc = tmp_path / ".sdlc"
        sdlc.mkdir()
        (sdlc / "state.yaml").write_text("current_phase: build\n")
        args = argparse.Namespace(state=str(sdlc / "state.yaml"), repo=None)
        assert resolve_specs_dir(args) == (tmp_path / "specs").resolve()

    def test_state_missing_exits(self, tmp_path):
        args = argparse.Namespace(state=str(tmp_path / "nope.yaml"), repo=None)
        with pytest.raises(SystemExit):
            resolve_specs_dir(args)


class TestByChannel:
    def test_scan_sets_channel_field(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_channel(specs, "0001", "channel: voice")
        scanned = scan_specs(specs)
        assert scanned[0]["channel"] == "voice"

    def test_summarize_buckets_voice_unassigned_and_agnostic(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_channel(specs, "0001", "channel: voice")   # -> voice
        write_spec(specs, "0002", "b", "draft", "LOW")             # no channel -> unassigned
        write_spec_with_channel(specs, "0003", 'channel: "—"')     # em-dash -> channel-agnostic
        summary = summarize(scan_specs(specs))
        assert summary["by_channel"]["voice"] == 1
        assert summary["by_channel"]["unassigned"] == 1
        assert summary["by_channel"]["channel-agnostic"] == 1
