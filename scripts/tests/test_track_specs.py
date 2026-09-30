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


# --- Sprint layer (additive) ---------------------------------------------------------------------

import json as _json
import sys as _sys

import track_specs as _ts
from track_specs import filter_by_sprint, format_report, sprint_bucket, sprint_ids


def write_spec_with_sprint(specs_dir, spec_id, status, risk, sprint, next_owner=""):
    """A spec carrying the optional sprint-layer keys (as `sprint.py` writes them)."""
    specs_dir.mkdir(parents=True, exist_ok=True)
    (specs_dir / f"{spec_id}-x.md").write_text(
        f'---\nspec: "{spec_id}"\nname: "x{spec_id}"\nstatus: {status}\nrisk: {risk}\n'
        f'sprint: "{sprint}"\nnext_owner: "{next_owner}"\n---\n# Spec\n',
        encoding="utf-8",
    )


def run_cli(argv, capsys):
    old = _sys.argv
    _sys.argv = ["track_specs.py"] + argv
    try:
        with pytest.raises(SystemExit) as ei:
            _ts.main()
        code = ei.value.code
    finally:
        _sys.argv = old
    return code, capsys.readouterr().out


LEGACY_EXPECTED = (
    "Spec Backlog\n"
    "========================================\n"
    "Total specs: 2\n"
    "\n"
    "By status:\n"
    "  draft      0\n"
    "  ready      1\n"
    "  in-flight  1\n"
    "  merged     0\n"
    "\n"
    "By risk tier:\n"
    "  HIGH     1\n"
    "  MEDIUM   0\n"
    "  LOW      1\n"
    "\n"
    "By channel:\n"
    "  unassigned       2\n"
    "\n"
    "In flight (one spec = one branch = one PR):\n"
    "  0002 b [LOW]"
)


class TestSprintPassThrough:
    def test_defaults_to_empty_when_keys_absent(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "draft", "LOW")
        scanned = scan_specs(specs)
        assert scanned[0]["sprint"] == ""
        assert scanned[0]["next_owner"] == ""

    def test_passes_sprint_and_next_owner_through(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07", next_owner="Priya")
        scanned = scan_specs(specs)
        assert scanned[0]["sprint"] == "S07"
        assert scanned[0]["next_owner"] == "Priya"

    def test_comment_after_value_is_stripped(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0001-x.md").write_text(
            '---\nspec: "0001"\nname: x\nstatus: draft\nrisk: LOW\n'
            'sprint: ""               # optional — sprint id\n---\n# Spec\n', encoding="utf-8")
        assert scan_specs(specs)[0]["sprint"] == ""


class TestTemplateExcluded:
    def test_installed_spec_template_is_not_a_spec(self, tmp_path, plugin_root):
        """The harness installs specs/spec-template.md with spec: "NNNN" — never a phantom draft."""
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "spec-template.md").write_text(
            (plugin_root / "templates" / "phases" / "build" / "spec.md").read_text(encoding="utf-8"),
            encoding="utf-8")
        write_spec(specs, "0001", "a", "draft", "LOW")
        scanned = scan_specs(specs)
        assert [s["id"] for s in scanned] == ["0001"]
        assert summarize(scanned)["total"] == 1

    def test_missing_spec_key_keeps_legacy_placeholder(self, tmp_path):
        specs = tmp_path / "specs"
        specs.mkdir()
        (specs / "0001-x.md").write_text("---\nname: x\nstatus: draft\nrisk: LOW\n---\n# Spec\n")
        scanned = scan_specs(specs)
        assert len(scanned) == 1 and scanned[0]["id"] == "????"

    def test_is_spec_id(self):
        assert _ts.is_spec_id("0007") and _ts.is_spec_id(" 12 ")
        assert not _ts.is_spec_id("NNNN") and not _ts.is_spec_id("") and not _ts.is_spec_id(None)


class TestBySprint:
    def test_buckets_partition_the_specs(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07")
        write_spec_with_sprint(specs, "0002", "in-flight", "LOW", "S07")
        write_spec_with_sprint(specs, "0003", "draft", "LOW", "S08")
        write_spec(specs, "0004", "d", "draft", "LOW")        # no sprint -> unassigned
        write_spec(specs, "0005", "e", "merged", "MEDIUM")    # merged, no sprint -> pre-sprint
        summary = summarize(scan_specs(specs))
        assert summary["by_sprint"] == {"S07": 2, "S08": 1, "unassigned": 1, "pre-sprint": 1}
        assert sum(summary["by_sprint"].values()) == summary["total"]
        assert sprint_ids(summary) == ["S07", "S08"]

    def test_sprint_bucket_rules(self):
        assert sprint_bucket({"sprint": "S07", "status": "merged"}) == "S07"
        assert sprint_bucket({"sprint": "", "status": "merged"}) == "pre-sprint"
        assert sprint_bucket({"sprint": "", "status": "draft"}) == "unassigned"
        assert sprint_bucket({"status": "ready"}) == "unassigned"

    def test_sprint_ids_sort_numerically(self):
        assert sprint_ids({"S10": 1, "S9": 1, "S100": 1, "unassigned": 3}) == ["S9", "S10", "S100"]

    def test_existing_keys_unchanged(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "draft", "LOW")
        summary = summarize(scan_specs(specs))
        assert {"total", "by_status", "by_risk", "by_channel", "in_flight"} <= set(summary)


class TestFilterBySprint:
    def test_filter(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07")
        write_spec_with_sprint(specs, "0002", "ready", "LOW", "S08")
        write_spec(specs, "0003", "c", "draft", "LOW")
        scanned = scan_specs(specs)
        assert [s["id"] for s in filter_by_sprint(scanned, "S07")] == ["0001"]
        assert filter_by_sprint(scanned, "S99") == []

    def test_cli_sprint_filter_json(self, tmp_path, capsys):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07")
        write_spec_with_sprint(specs, "0002", "in-flight", "LOW", "S08")
        code, out = run_cli(["--repo", str(tmp_path), "--sprint", "S07", "--json"], capsys)
        assert code == 0
        data = _json.loads(out)
        assert data["total"] == 1
        assert data["by_sprint"] == {"S07": 1}
        assert data["sprint_filter"] == "S07"
        assert data["in_flight"] == []

    def test_cli_sprint_filter_text_header(self, tmp_path, capsys):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07")
        code, out = run_cli(["--repo", str(tmp_path), "--sprint", "S07"], capsys)
        assert code == 0
        assert out.startswith("Spec Backlog — sprint S07\n")
        assert "By sprint:\n  S07          1" in out

    def test_cli_without_sprint_has_null_filter(self, tmp_path, capsys):
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "draft", "LOW")
        code, out = run_cli(["--repo", str(tmp_path), "--json"], capsys)
        assert code == 0
        data = _json.loads(out)
        assert data["sprint_filter"] is None
        assert data["by_sprint"] == {"unassigned": 1}

    def test_wip_exit_code_unchanged(self, tmp_path, capsys):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "in-flight", "LOW", "S07")
        write_spec_with_sprint(specs, "0002", "in-flight", "LOW", "S07")
        code, out = run_cli(["--repo", str(tmp_path), "--wip-cap", "1"], capsys)
        assert code == 1 and "WIP cap breached" in out


class TestLegacyOutputByteIdentical:
    def test_text_report_unchanged_when_no_spec_carries_a_sprint(self, tmp_path):
        """Specs written before the sprint layer (no sprint key) render exactly the pre-1.6 text —
        no 'By sprint' block, same header, same spacing."""
        specs = tmp_path / "specs"
        write_spec(specs, "0001", "a", "ready", "HIGH")
        write_spec(specs, "0002", "b", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        assert format_report(summary, wip_warnings(summary, None)) == LEGACY_EXPECTED
        assert "By sprint" not in LEGACY_EXPECTED

    def test_text_report_unchanged_when_sprint_key_present_but_empty(self, tmp_path):
        """A spec scaffolded from the new template carries `sprint: ""` — still legacy output."""
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "")
        write_spec(specs, "0002", "b", "in-flight", "LOW")
        summary = summarize(scan_specs(specs))
        # Same shape as LEGACY_EXPECTED except the spec names differ (x0001 vs a) — compare structure.
        text = format_report(summary, [])
        assert "By sprint" not in text
        assert text.split("\n")[:3] == ["Spec Backlog", "=" * 40, "Total specs: 2"]

    def test_by_sprint_block_renders_when_a_sprint_exists(self, tmp_path):
        specs = tmp_path / "specs"
        write_spec_with_sprint(specs, "0001", "ready", "HIGH", "S07")
        write_spec(specs, "0002", "b", "draft", "LOW")
        write_spec(specs, "0003", "c", "merged", "LOW")
        summary = summarize(scan_specs(specs))
        text = format_report(summary, [])
        block = text.split("By sprint:\n", 1)[1].split("\n\n", 1)[0]
        assert block == "  S07          1\n  unassigned   1\n  pre-sprint   1"
