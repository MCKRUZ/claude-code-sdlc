"""Tests for audit_gates.py's `--repo` and `--json` modes (spec 0021).

Without `--json` the report must be byte-identical to what the script printed before the flags
existed — pinned by golden captures taken from the unmodified script on the fixture states in
`fixtures/audit_gates/`. With `--json` stdout is exactly one JSON document. `--repo R` is only a
different way of naming `R/.sdlc/state.yaml`.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tests.golden_support import SCRIPTS_DIR, capture, golden_path, read_golden

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "audit_gates"
STATES = ["rich", "thin", "empty"]


def state_file(name: str) -> Path:
    return FIXTURES / f"{name}.state.yaml"


def repo_with(tmp_path: Path, name: str) -> Path:
    """A project root whose .sdlc/state.yaml is the named fixture state."""
    sdlc = tmp_path / "project" / ".sdlc"
    sdlc.mkdir(parents=True)
    shutil.copy(state_file(name), sdlc / "state.yaml")
    return tmp_path / "project"


def golden_args(case: str) -> list[str]:
    if case == "compare":
        return ["--state", str(state_file("rich")), "--compare", str(state_file("thin"))]
    return ["--state", str(state_file(case))]


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPTS_DIR / "audit_gates.py"), *args],
                          capture_output=True, text=True, encoding="utf-8",
                          env={**os.environ, "PYTHONIOENCODING": "utf-8"})


# ── the text mode did not move ────────────────────────────────────────────────

@pytest.mark.parametrize("case", STATES + ["compare"])
def test_text_mode_is_byte_identical_to_the_golden_capture(case, tmp_path):
    assert golden_path(f"audit_gates-{case}").exists()
    assert capture("audit_gates.py", golden_args(case), tmp_path) == read_golden(
        f"audit_gates-{case}")


def test_missing_state_file_message_and_exit_code_are_unchanged(tmp_path):
    proc = run(["--state", str(tmp_path / "nope.yaml")])
    assert proc.returncode == 1
    assert proc.stdout == f"Error: State file not found: {tmp_path / 'nope.yaml'}\n"


# ── --repo is another way to say --state ──────────────────────────────────────

@pytest.mark.parametrize("name", STATES)
def test_repo_produces_the_same_report_as_state(name, tmp_path):
    repo = repo_with(tmp_path, name)
    via_repo = run(["--repo", str(repo)])
    via_state = run(["--state", str(repo / ".sdlc" / "state.yaml")])
    assert via_repo.returncode == via_state.returncode == 0
    assert via_repo.stdout.startswith("Gate Effectiveness Audit")
    assert via_repo.stdout == via_state.stdout
    assert via_repo.stdout == run(["--state", str(state_file(name))]).stdout


@pytest.mark.parametrize("name", STATES)
def test_repo_json_equals_state_json(name, tmp_path):
    repo = repo_with(tmp_path, name)
    assert run(["--repo", str(repo), "--json"]).stdout == run(
        ["--state", str(repo / ".sdlc" / "state.yaml"), "--json"]).stdout


def test_neither_repo_nor_state_is_a_usage_error():
    proc = run([])
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert "--repo" in proc.stderr and "--state" in proc.stderr


def test_both_repo_and_state_is_a_usage_error(tmp_path):
    repo = repo_with(tmp_path, "rich")
    proc = run(["--repo", str(repo), "--state", str(state_file("rich"))])
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert "not allowed with" in proc.stderr


def test_repo_without_a_state_file_reports_the_missing_file(tmp_path):
    proc = run(["--repo", str(tmp_path)])
    assert proc.returncode == 1
    assert "State file not found" in proc.stdout


# ── the JSON mode ─────────────────────────────────────────────────────────────

def audit_json(name: str) -> dict:
    proc = run(["--state", str(state_file(name)), "--json"])
    assert proc.returncode == 0 and proc.stderr == ""
    doc = json.loads(proc.stdout)
    assert proc.stdout == json.dumps(doc, indent=2) + "\n"
    return doc


def gate(doc: dict, name: str) -> dict:
    return next(g for g in doc["gates"] if g["name"] == name)


def test_rich_state_reports_every_gate_with_its_rates():
    doc = audit_json("rich")
    assert doc["phases_completed"] == 3
    assert doc["enough_data"] is True
    assert [g["name"] for g in doc["gates"]] == [
        "integrity", "completeness", "compliance", "metrics", "quality"]
    integrity = gate(doc, "integrity")
    assert (integrity["runs"], integrity["fails"], integrity["fail_rate"]) == (4, 0, 0.0)
    assert integrity["always_passes"] is True and integrity["high_fail"] is False
    completeness = gate(doc, "completeness")
    assert (completeness["runs"], completeness["fails"]) == (3, 2)
    assert completeness["fail_rate"] == pytest.approx(0.6667, abs=1e-4)
    assert completeness["high_fail"] is True and completeness["always_passes"] is False


def test_a_manual_gate_is_not_an_always_pass_gate():
    """Text mode excludes a gate with a manual (passed: null) run from always-pass; so does JSON."""
    quality = gate(audit_json("rich"), "quality")
    assert quality["fails"] == 0 and quality["always_passes"] is False


def test_overrides_are_listed_with_phase_and_justification():
    metrics = gate(audit_json("rich"), "metrics")
    assert metrics["overrides"] == [{"phase": "1", "justification": "client waived the metric"}]
    assert gate(audit_json("rich"), "integrity")["overrides"] == []


def test_recommendations_are_the_text_modes_recommendations():
    doc = audit_json("rich")
    text = run(["--state", str(state_file("rich"))]).stdout
    assert doc["recommendations"]
    for line in doc["recommendations"]:
        assert f"- {line}" in text


def test_below_the_minimum_phases_threshold_there_is_not_enough_data():
    doc = audit_json("thin")
    assert doc["phases_completed"] == 1
    assert doc["enough_data"] is False
    assert [g["name"] for g in doc["gates"]] == ["integrity", "completeness"]


def test_no_gate_results_means_no_data_not_zeros():
    doc = audit_json("empty")
    assert doc["phases_completed"] == 4
    assert doc["enough_data"] is False
    assert doc["gates"] == []
    assert doc["recommendations"] == []


def test_json_with_compare_is_refused_with_a_usage_error():
    proc = run(["--state", str(state_file("rich")), "--compare", str(state_file("thin")),
                "--json"])
    assert proc.returncode == 2
    assert proc.stdout == ""
    assert "--compare" in proc.stderr and "--json" in proc.stderr


def test_json_with_a_missing_state_file_is_one_error_document_and_exit_one(tmp_path):
    proc = run(["--state", str(tmp_path / "nope.yaml"), "--json"])
    assert proc.returncode == 1
    assert list(json.loads(proc.stdout)) == ["error"]
