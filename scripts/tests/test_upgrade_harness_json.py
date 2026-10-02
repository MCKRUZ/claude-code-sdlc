"""Tests for upgrade_harness.py's `--json` mode (spec 0021).

Two promises are pinned here:

  * Without `--json` the dry-run report is byte-identical to what the script printed before the
    flag existed — golden captures under `fixtures/golden/upgrade_harness-*.txt`, taken from the
    unmodified script on a fixed installed-then-diverged fixture project.
  * With `--json` (dry run only) stdout is exactly one JSON document using the script's own
    classification labels; `--json` together with `--apply` is refused and changes nothing.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from install_harness import install
from tests.golden_support import SCRIPTS_DIR, capture, golden_path, read_golden
from tests.test_install_harness import (
    MANIFEST_REL,
    _profile_file,
    _sha,
    _write,
    make_payload,
)

RULES = Path("packs") / "stacks" / "dotnet" / "rules"
CASES = ["mixed", "legacy", "up-to-date"]


def _tree(root: Path) -> dict[str, str]:
    return {p.relative_to(root).as_posix(): _sha(p) for p in sorted(root.rglob("*")) if p.is_file()}


def build_case(case: str, tmp_path: Path, valid_profile: dict) -> tuple[Path, Path, Path]:
    """Return (payload, target, profile) for a named situation.

    mixed       installed v1, then upstream and the repo each moved: an UPDATE, a CONFLICT, an
                ADAPTED file, a DELETED-LOCALLY file, a NEW upstream file and a RETIRED one.
    legacy      the same payload installed, then its manifest removed: a pre-manifest install.
    up-to-date  installed and untouched.
    """
    payload = make_payload(tmp_path)
    profile = _profile_file(tmp_path, valid_profile)
    target = tmp_path / "repo"
    target.mkdir()
    if case == "mixed":
        _write(payload / "agents" / "old-agent.md", "# soon retired\n")
    assert install(payload, target, force=False, profile_path=profile) == 0
    if case == "mixed":
        _write(payload / RULES / "testing.md", "# testing v2\n")
        _write(payload / RULES / "clean-architecture.md", "# clean architecture v2\n")
        (target / ".claude" / "rules" / "clean-architecture.md").write_text(
            "# adapted by the repo\n", encoding="utf-8")
        (target / ".claude" / "hooks" / "stop-gate.sh").write_text(
            "#!/bin/sh\n# adapted\n", encoding="utf-8")
        (target / ".claude" / "agents" / "code-reviewer.md").unlink()
        _write(payload / "hooks" / "session-start.sh", "#!/bin/sh\n# new hook\n")
        (payload / "agents" / "old-agent.md").unlink()
    elif case == "legacy":
        (target / MANIFEST_REL).unlink()
        (target / ".claude" / "rules" / "testing.md").write_text("# local\n", encoding="utf-8")
        (target / ".claude" / "hooks" / "stop-gate.sh").unlink()
    return payload, target, profile


def args_for(payload: Path, target: Path, profile: Path, *extra: str) -> list[str]:
    return ["--payload", str(payload), "--target", str(target), "--profile", str(profile), *extra]


def run(payload: Path, target: Path, profile: Path, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "upgrade_harness.py"),
         *args_for(payload, target, profile, *extra)],
        capture_output=True, text=True, encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"})


def golden_text(case: str, tmp_path: Path, valid_profile: dict) -> str:
    payload, target, profile = build_case(case, tmp_path, valid_profile)
    return capture("upgrade_harness.py", args_for(payload, target, profile), target)


# ── the text mode did not move ────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES)
def test_dry_run_text_is_byte_identical_to_the_golden_capture(case, tmp_path, valid_profile):
    assert golden_path(f"upgrade_harness-{case}").exists()
    assert golden_text(case, tmp_path, valid_profile) == read_golden(f"upgrade_harness-{case}")


def test_a_bad_target_keeps_its_stderr_message_and_exit_code(tmp_path, valid_profile):
    payload, _, profile = build_case("up-to-date", tmp_path, valid_profile)
    proc = run(payload, tmp_path / "missing", profile)
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert proc.stderr.startswith("ERROR: target not found")


# ── the JSON mode ─────────────────────────────────────────────────────────────

def upgrade_json(case: str, tmp_path: Path, valid_profile: dict) -> dict:
    payload, target, profile = build_case(case, tmp_path, valid_profile)
    before = _tree(target)
    proc = run(payload, target, profile, "--json")
    assert proc.returncode == 0 and proc.stderr == ""
    doc = json.loads(proc.stdout)
    assert proc.stdout == json.dumps(doc, indent=2) + "\n"
    assert _tree(target) == before                      # a dry run changes nothing
    return doc


def by_class(doc: dict) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for f in doc["files"]:
        grouped.setdefault(f["classification"], []).append(f["path"])
    return grouped


def test_mixed_project_reports_each_of_the_scripts_own_labels(tmp_path, valid_profile):
    doc = upgrade_json("mixed", tmp_path, valid_profile)
    assert doc["mode"] == "dry-run" and doc["legacy"] is False
    grouped = by_class(doc)
    assert grouped["UPDATE"] == [".claude/rules/testing.md"]
    assert grouped["CONFLICT"] == [".claude/rules/clean-architecture.md"]
    assert grouped["ADAPTED"] == [".claude/hooks/stop-gate.sh"]
    assert grouped["DELETED-LOCALLY"] == [".claude/agents/code-reviewer.md"]
    assert grouped["NEW"] == [".claude/hooks/session-start.sh"]
    assert len(grouped["RETIRED"]) == 1
    assert doc["counts"] == {name: len(paths) for name, paths in grouped.items()}


def test_every_file_row_carries_the_scripts_own_explanation(tmp_path, valid_profile):
    from upgrade_harness import CLASS_NOTES
    for f in upgrade_json("mixed", tmp_path, valid_profile)["files"]:
        assert set(f) == {"path", "classification", "detail"}
        assert f["detail"] == CLASS_NOTES[f["classification"]]


def test_json_agrees_with_the_text_report_on_totals(tmp_path, valid_profile):
    payload, target, profile = build_case("mixed", tmp_path, valid_profile)
    text = run(payload, target, profile).stdout
    doc = json.loads(run(payload, target, profile, "--json").stdout)
    assert f"Totals: {len(doc['files'])} path(s): " in text
    for name, n in doc["counts"].items():
        assert f"{name} ({n})" in text


def test_legacy_install_is_flagged_and_uses_untracked_labels(tmp_path, valid_profile):
    doc = upgrade_json("legacy", tmp_path, valid_profile)
    assert doc["legacy"] is True
    grouped = by_class(doc)
    assert grouped["CONFLICT-UNTRACKED"] == [".claude/rules/testing.md"]
    assert ".claude/hooks/stop-gate.sh" in grouped["NEW"]
    assert "ADOPT" in grouped
    assert "IDENTICAL" not in grouped and "UPDATE" not in grouped


def test_an_up_to_date_project_is_all_identical(tmp_path, valid_profile):
    doc = upgrade_json("up-to-date", tmp_path, valid_profile)
    assert set(by_class(doc)) == {"IDENTICAL"}
    assert doc["counts"] == {"IDENTICAL": len(doc["files"])}


def test_versions_are_reported_so_a_reader_can_see_what_moved(tmp_path, valid_profile):
    doc = upgrade_json("mixed", tmp_path, valid_profile)
    assert doc["payload_version"] == "unknown"
    assert doc["installed_version"] == "unknown"
    assert upgrade_json("legacy", tmp_path / "l", valid_profile)["installed_version"] is None


# ── --json never applies ──────────────────────────────────────────────────────

def test_json_with_apply_is_refused_and_changes_nothing(tmp_path, valid_profile):
    payload, target, profile = build_case("mixed", tmp_path, valid_profile)
    before = _tree(target)
    proc = run(payload, target, profile, "--json", "--apply")
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert "--apply" in proc.stderr and "--json" in proc.stderr
    assert _tree(target) == before
    assert not list(target.rglob("*.harness-new"))


def test_json_error_is_one_document_with_exit_two(tmp_path, valid_profile):
    payload, _, profile = build_case("up-to-date", tmp_path, valid_profile)
    proc = run(payload, tmp_path / "missing", profile, "--json")
    assert proc.returncode == 2
    assert proc.stderr.startswith("ERROR: target not found")
    doc = json.loads(proc.stdout)
    assert list(doc) == ["error"] and doc["error"].startswith("target not found")
