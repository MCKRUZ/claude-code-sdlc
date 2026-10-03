"""Spec 0025 — `--json` for generate_phase_report.py.

SDLC Studio's "Export this stage's report" button needs the result as data: which file was written
and how many of the stage's documents were found. Two things are pinned:
  1. WITHOUT --json, stdout/stderr/exit code are exactly what the script printed before the flag
     existed (golden captures in fixtures/golden/, taken from the unmodified script).
  2. WITH --json, stdout is exactly one JSON document, the report is written exactly as before,
     and the refusals and exit codes are unchanged.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from golden_support import SCRIPTS_DIR, capture, read_golden

GOLDEN_CASES = {
    "generate_phase_report-single": ["--state", ".sdlc/state.yaml", "--phase", "0"],
    "generate_phase_report-bad-phase": ["--state", ".sdlc/state.yaml", "--phase", "99"],
    "generate_phase_report-no-state": ["--state", ".sdlc/nope.yaml"],
}


@pytest.fixture
def project(tmp_path):
    root = tmp_path.resolve()
    (root / ".sdlc").mkdir()
    (root / ".sdlc" / "state.yaml").write_text(
        'project_name: "Golden"\nprofile_id: "p"\ncurrent_phase: "0"\n', encoding="utf-8")
    return root


def run(args, cwd):
    return subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / "generate_phase_report.py"), *args],
        capture_output=True, text=True, encoding="utf-8", cwd=str(cwd),
    )


@pytest.mark.parametrize("case", sorted(GOLDEN_CASES))
def test_unflagged_output_matches_golden(case, project):
    assert capture("generate_phase_report.py", GOLDEN_CASES[case], project) == read_golden(case)


class TestSinglePhaseJson:
    def test_prints_exactly_one_document_describing_the_report_it_wrote(self, project):
        proc = run(["--state", ".sdlc/state.yaml", "--phase", "0", "--json"], project)
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)  # no leading or trailing text, or this raises
        assert doc["phase"] == "0" and doc["phase_name"]
        assert doc["output"] == ".sdlc/reports/00-discovery-report.html"
        assert (project / doc["output"]).is_file()
        assert doc["found"] == 0 and doc["missing"] == doc["total"] == 5
        assert doc["artifacts"]["constitution.md"] is False

    def test_a_document_that_exists_is_counted_found(self, project):
        folder = project / ".sdlc" / "artifacts" / "00-discovery"
        folder.mkdir(parents=True)
        (folder / "constitution.md").write_text("# Constitution\n", encoding="utf-8")
        doc = json.loads(run(["--state", ".sdlc/state.yaml", "--phase", "0", "--json"], project).stdout)
        assert doc["found"] == 1 and doc["missing"] == 4
        assert doc["artifacts"]["constitution.md"] is True

    def test_output_flag_is_honoured_and_reported(self, project):
        doc = json.loads(run(["--state", ".sdlc/state.yaml", "--phase", "0", "--output", "out/r.html", "--json"],
                             project).stdout)
        assert doc["output"] == "out/r.html" and (project / "out" / "r.html").is_file()

    def test_defaults_to_the_current_phase(self, project):
        doc = json.loads(run(["--state", ".sdlc/state.yaml", "--json"], project).stdout)
        assert doc["phase"] == "0"

    def test_the_html_written_is_the_same_with_and_without_the_flag(self, project):
        run(["--state", ".sdlc/state.yaml", "--phase", "0", "--output", "a.html"], project)
        run(["--state", ".sdlc/state.yaml", "--phase", "0", "--output", "b.html", "--json"], project)
        strip = lambda p: [l for l in (project / p).read_text(encoding="utf-8").splitlines() if "UTC" not in l]
        assert strip("a.html") == strip("b.html")


class TestAllPhasesJson:
    def test_lists_every_report_and_the_index(self, project):
        proc = run(["--state", ".sdlc/state.yaml", "--all", "--json"], project)
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)
        assert [r["phase"] for r in doc["reports"]] == ["0", "1", "2", "3", "build", "7", "8", "9", "close"]
        assert doc["index"] == ".sdlc/reports/index.html"
        assert (project / doc["index"]).is_file()
        assert all((project / r["output"]).is_file() for r in doc["reports"])


class TestAllPhasesText:
    """`--all` crashed before this spec: phase 7 declares an artifact as a mapping
    (`path` / `required_for`), and the report read every entry as a filename. There is no golden
    for the old output — it was a traceback — so the repaired behaviour is pinned directly."""

    def test_every_phase_reports_and_the_command_exits_zero(self, project):
        proc = run(["--state", ".sdlc/state.yaml", "--all"], project)
        assert proc.returncode == 0, proc.stderr
        assert "Phase 7: Documentation" in proc.stdout and "9 reports generated." in proc.stdout
        assert (project / ".sdlc" / "reports" / "index.html").is_file()

    def test_a_mapping_declared_artifact_is_reported_by_its_path(self, project):
        doc = json.loads(run(["--state", ".sdlc/state.yaml", "--phase", "7", "--json"], project).stdout)
        assert "readme-verification.md" in doc["artifacts"]
        assert "runbook-walkthrough.md" in doc["artifacts"]  # declared as {path, required_for}
        assert "README.md" in doc["artifacts"]               # declared as {path, root: repo}


class TestRefusalsAreUnchanged:
    def test_an_invalid_phase_exits_1_with_the_same_message_and_no_stdout(self, project):
        proc = run(["--state", ".sdlc/state.yaml", "--phase", "99", "--json"], project)
        assert proc.returncode == 1 and proc.stdout == ""
        assert "invalid phase id '99'" in proc.stderr

    def test_a_missing_state_file_exits_1_with_no_stdout(self, project):
        proc = run(["--state", ".sdlc/nope.yaml", "--json"], project)
        assert proc.returncode == 1 and proc.stdout == ""
        assert "state file not found" in proc.stderr
