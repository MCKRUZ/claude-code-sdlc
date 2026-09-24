"""Tests for stage_readiness.py — the single read-only "what does this stage still need" call.

The two behaviours worth pinning hardest, because both were deliberate corrections to how the
existing tooling behaves:
  * shapes resolve by PATH, not by the template stamp (nothing writes stamps, so a stamp-based
    scan silently reports a clean bill of health for a document full of holes);
  * it never touches `.sdlc/metrics/gate-log.jsonl`, so a UI can poll it without inflating the
    project's own metrics.
"""

import json
import subprocess
import sys
from pathlib import Path

import yaml

from stage_readiness import (
    assess,
    find_shape_for_document,
    judgement_conditions,
    signoff_state,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FIXTURES_ROOT = Path(__file__).resolve().parent / "fixtures" / "documents"
CLI_PATH = Path(__file__).resolve().parent.parent / "stage_readiness.py"
INIT_PATH = Path(__file__).resolve().parent.parent / "init_project.py"
STARTER_PROFILE = REPO_ROOT / "profiles" / "starter" / "profile.yaml"


def _project(tmp_path: Path) -> Path:
    """A real initialized project, made the way init_project.py makes one."""
    subprocess.run(
        [sys.executable, str(INIT_PATH), "--profile", str(STARTER_PROFILE), "--target", str(tmp_path)],
        capture_output=True, text=True, timeout=60, check=True,
    )
    return tmp_path


class TestFindShapeForDocument:
    def test_resolves_by_path_convention_without_any_stamp(self):
        """The fixture carries no template stamp — exactly like every real document — so this
        is the resolution that has to work."""
        text = (FIXTURES_ROOT / "requirements.md").read_text(encoding="utf-8")
        assert "<!-- template:" not in text  # guard: if stamping ever lands, revisit this test
        shape = find_shape_for_document(".sdlc/artifacts/01-requirements/requirements.md", text)
        assert shape is not None
        assert shape.name == "requirements.shape.yaml"

    def test_windows_separators_resolve_the_same(self):
        text = (FIXTURES_ROOT / "requirements.md").read_text(encoding="utf-8")
        assert find_shape_for_document(r".sdlc\artifacts\01-requirements\requirements.md", text) is not None

    def test_a_document_with_no_matching_template_resolves_to_nothing(self):
        assert find_shape_for_document(".sdlc/artifacts/01-requirements/not-a-template.md", "# x") is None

    def test_a_path_outside_the_artifacts_tree_resolves_to_nothing(self):
        assert find_shape_for_document("README.md", "# x") is None


class TestJudgementConditions:
    def test_keeps_prose_checks_and_drops_artifact_file_checks(self):
        phase_def = {"exit_gate": {"conditions": [
            {"artifact": "requirements.md", "check": "exists_and_complete"},
            {"check": "Scope boundaries are unambiguous"},
            "A bare string condition",
        ]}}
        assert judgement_conditions(phase_def) == [
            "Scope boundaries are unambiguous",
            "A bare string condition",
        ]

    def test_a_phase_with_no_exit_gate_has_no_questions(self):
        assert judgement_conditions({}) == []


class TestSignoffState:
    def test_reads_the_keys_advance_phase_actually_writes(self):
        """advance_phase.py writes gate_results.signed_off_by and a sign_offs sibling list.
        (audit_artifacts._signoff_note looks for `sign_off`/`signed_by`, which nothing writes —
        reading those would mean never showing a name.)"""
        state = {"phases": {"1": {
            "status": "completed",
            "completed_at": "2026-09-24T10:00:00Z",
            "gate_results": {"passed": 4, "signed_off_by": "matt"},
            "sign_offs": [{"discipline": "Design", "section": "UX", "by": "priya", "at": "T"}],
        }}}
        out = signoff_state(state, "1")
        assert out["signed_off_by"] == "matt"
        assert out["status"] == "completed"
        assert out["discipline_sign_offs"][0]["by"] == "priya"

    def test_an_unstarted_phase_reads_as_pending_without_inventing_a_name(self):
        out = signoff_state({"phases": {}}, "1")
        assert out["status"] == "pending"
        assert out["signed_off_by"] is None

    def test_a_malformed_phase_entry_does_not_crash(self):
        out = signoff_state({"phases": {"1": "not a mapping"}}, "1")
        assert out["status"] == "pending"


class TestAssess:
    def test_a_fresh_project_reports_every_required_document_missing(self, tmp_path: Path):
        result = assess(_project(tmp_path), "1")
        assert result["ready"] is False
        assert all(not a["exists"] for a in result["artifacts"])
        assert result["blocking_count"] == len(result["artifacts"])

    def test_a_real_document_is_read_through_its_shape(self, tmp_path: Path):
        repo = _project(tmp_path)
        dest = repo / ".sdlc" / "artifacts" / "01-requirements" / "requirements.md"
        dest.write_bytes((FIXTURES_ROOT / "requirements.md").read_bytes())

        result = assess(repo, "1")
        req = next(a for a in result["artifacts"] if a["name"] == "requirements.md")
        assert req["exists"] is True
        assert req["shaped"] is True
        # The fixture genuinely leaves FR-002's Dependencies empty — a stamp-based scan would
        # have skipped the document entirely and reported nothing.
        assert any(f["field"] == "Dependencies" for f in req["findings"])

    def test_an_unknown_phase_is_reported_not_raised(self, tmp_path: Path):
        result = assess(_project(tmp_path), "not-a-phase")
        assert result["error"]
        assert result["stage"] is None

    def test_current_phase_is_flagged(self, tmp_path: Path):
        result = assess(_project(tmp_path), None)  # defaults to the project's current phase
        assert result["stage"]["is_current"] is True

    def test_a_directory_with_no_project_does_not_crash(self, tmp_path: Path):
        result = assess(tmp_path, "1")
        assert result["ready"] is False
        assert result["stage"]["id"] == "1"


class TestDoesNotWrite:
    def test_reading_readiness_never_touches_the_gate_log(self, tmp_path: Path):
        """The whole reason this script exists rather than shelling out to check_gates.py."""
        repo = _project(tmp_path)
        metrics = repo / ".sdlc" / "metrics"
        before = sorted(p.name for p in metrics.iterdir()) if metrics.exists() else []

        for _ in range(3):  # a UI would poll
            assess(repo, "1")

        after = sorted(p.name for p in metrics.iterdir()) if metrics.exists() else []
        assert after == before
        assert not (metrics / "gate-log.jsonl").exists()

    def test_reading_readiness_does_not_modify_state(self, tmp_path: Path):
        repo = _project(tmp_path)
        state_path = repo / ".sdlc" / "state.yaml"
        before = state_path.read_bytes()
        assess(repo, "1")
        assert state_path.read_bytes() == before


class TestCli:
    def test_json_mode_exits_zero_and_is_parseable(self, tmp_path: Path):
        repo = _project(tmp_path)
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "--repo", str(repo), "--phase", "1", "--json"],
            capture_output=True, text=True, timeout=60,
        )
        assert proc.returncode == 0, proc.stderr
        parsed = json.loads(proc.stdout)
        assert parsed["stage"]["id"] == "1"
        assert "judgement_conditions" in parsed

    def test_a_missing_state_file_still_exits_zero(self, tmp_path: Path):
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "--state", str(tmp_path / "nope.yaml")],
            capture_output=True, text=True, timeout=60,
        )
        assert proc.returncode == 0
        assert "not found" in proc.stdout

    def test_human_output_surfaces_the_judgement_questions(self, tmp_path: Path):
        # Decoded leniently on purpose: the human report contains em dashes, and Python writes
        # them in the console's own codepage on Windows. Studio consumes --json (which escapes
        # non-ASCII), so only these ASCII anchors matter here.
        repo = _project(tmp_path)
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "--repo", str(repo), "--phase", "1"],
            capture_output=True, timeout=60,
        )
        assert proc.returncode == 0
        stdout = proc.stdout.decode("utf-8", errors="replace")
        assert "Questions for whoever signs this off" in stdout
        assert "ADVISORY" in stdout


class TestStateYamlShapeAssumption:
    def test_the_template_state_still_has_the_keys_this_script_reads(self):
        """If state-init.yaml's phase shape changes, this script's sign-off reading goes quiet
        rather than loudly wrong — so pin the assumption here."""
        template = yaml.safe_load(
            (REPO_ROOT / "templates" / "state-init.yaml").read_text(encoding="utf-8")
        )
        phase = template["phases"]["1"]
        assert "status" in phase
        assert "completed_at" in phase
        assert "gate_results" in phase
