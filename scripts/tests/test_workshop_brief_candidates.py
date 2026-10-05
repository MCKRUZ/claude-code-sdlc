"""workshop_brief.py candidates — what a person chooses from when curating the brief (spec 0031).

A read-only report built from the build step's own parsers, so a selection form and `build` can never
disagree about what an entry is. What these protect: the report is exactly what the parsers return, the
recommendation is the command's own rule and nothing else, a missing input reads as "no data" with a note
and never an error or a zero, the limits come from the script's constants, and nothing is written.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = ROOT / "scripts"
SCRIPT = SCRIPTS / "workshop_brief.py"
DOCS = Path(__file__).resolve().parent / "fixtures" / "documents"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}
sys.path.insert(0, str(SCRIPTS))
import workshop_brief as wb  # noqa: E402

LISTS = {"contradiction-list.md": "contradictions", "question-list.md": "questions", "document-registry.md": "registry"}


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True,
                          encoding="utf-8", env=ENV)


@pytest.fixture
def project(tmp_path):
    root = tmp_path.resolve()
    folder = root / ".sdlc" / "artifacts" / "00-discovery"
    folder.mkdir(parents=True)
    (root / ".sdlc" / "state.yaml").write_text("project: fixture\n", encoding="utf-8")
    for name in LISTS:
        shutil.copy(DOCS / name, folder / name)
    return root


def candidates(root, *extra):
    proc = run("candidates", "--state", str(root / ".sdlc" / "state.yaml"), "--json", *extra)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def text_of(name):
    return (DOCS / name).read_text(encoding="utf-8").replace("\r\n", "\n")


class TestWhatItReports:
    def test_contradictions_are_exactly_what_the_build_parser_returns(self, project):
        doc = candidates(project)
        parsed = wb.parse_contradictions(text_of("contradiction-list.md"))
        assert [c["id"] for c in doc["contradictions"]] == [e["id"] for e in parsed] == ["CON-01", "CON-02"]
        first = doc["contradictions"][0]
        assert (first["title"], first["severity"], first["question"]) == (parsed[0]["title"], "blocks-outcome", parsed[0]["question"])
        assert first["sources"] == [
            {"side": side, "document": parsed[0]["sources"][side][0], "quote": parsed[0]["sources"][side][1]}
            for side in ("A", "B")]
        assert first["sources"][0]["document"] == "DOC-001 s2.1"

    def test_questions_carry_their_block_and_route(self, project):
        doc = candidates(project)
        parsed = wb.parse_questions(text_of("question-list.md"))
        assert [q["id"] for q in doc["questions"]] == [f"Q-0{n}" for n in range(1, 9)]
        assert [(q["id"], q["block"], q["route"], q["question"]) for q in doc["questions"]] == \
               [(e["id"], e["block"], e["route"], e["question"]) for e in parsed]
        routes = {q["id"]: q["route"] for q in doc["questions"]}
        assert routes["Q-01"] == "workshop" and routes["Q-02"] == "pre-workshop" and routes["Q-08"] == "interview"

    def test_documents_are_the_registrys_rows(self, project):
        doc = candidates(project)
        assert doc["documents"] == wb.parse_registry(text_of("document-registry.md"))
        assert [d["id"] for d in doc["documents"]][:3] == ["DOC-001", "DOC-002", "DOC-003"]


class TestRecommendation:
    @pytest.mark.parametrize("severity, expected", [
        ("blocks-outcome", True), ("shapes-design", True), ("minor", False), ("", False), ("urgent", False)])
    def test_only_the_two_severities_the_command_pre_ticks_are_recommended(self, project, severity, expected):
        path = project / ".sdlc" / "artifacts" / "00-discovery" / "contradiction-list.md"
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        parsed = wb.parse_contradictions(text)
        path.write_text(text.replace(f"**Severity:** {parsed[0]['severity']}", f"**Severity:** {severity}", 1), encoding="utf-8")
        assert candidates(project)["contradictions"][0]["recommended"] is expected
        assert candidates(project)["contradictions"][1]["recommended"] is True  # CON-02 unchanged: shapes-design


class TestLimitsAndStanding:
    def test_limits_are_the_scripts_own_constants(self, project):
        limits = candidates(project)["limits"]
        assert limits == {"contradictions": wb.MAX_CONTRADICTIONS, "questions": wb.MAX_QUESTIONS,
                          "decisions": list(wb.DECISION_RANGE), "load_bearing": list(wb.LOAD_BEARING_RANGE)}
        assert (limits["contradictions"], limits["questions"]) == (5, 12)

    def test_standing_decisions_are_the_numbered_placeholder_free_ones_the_template_already_has(self, project):
        assert candidates(project)["standing_decisions"] == 2


class TestMissingInputs:
    @pytest.mark.parametrize("name, key, mentions", [
        ("contradiction-list.md", "contradictions", "contradiction-list.md"),
        ("question-list.md", "questions", "question-list.md"),
        ("document-registry.md", "documents", "document-registry.md"),
    ])
    def test_a_missing_input_is_no_data_with_a_note_not_an_error_or_a_zero(self, project, name, key, mentions):
        (project / ".sdlc" / "artifacts" / "00-discovery" / name).unlink()
        doc = candidates(project)
        assert doc["has_data"] is False and doc[key] == []
        assert any(mentions in note for note in doc["notes"])

    def test_with_all_three_present_it_has_data_and_no_notes(self, project):
        doc = candidates(project)
        assert doc["has_data"] is True and doc["notes"] == []

    def test_a_missing_list_does_not_hide_the_others(self, project):
        (project / ".sdlc" / "artifacts" / "00-discovery" / "question-list.md").unlink()
        doc = candidates(project)
        assert len(doc["contradictions"]) == 2 and len(doc["documents"]) >= 3 and doc["questions"] == []


class TestContext:
    def test_existing_brief_tells_a_form_to_ask_before_overwriting(self, project):
        assert candidates(project)["existing_brief"] is False
        (project / ".sdlc" / "artifacts" / "00-discovery" / "workshop-brief.md").write_text("# Brief\n", encoding="utf-8")
        assert candidates(project)["existing_brief"] is True

    def test_provisional_ids_only_without_a_project_state_file(self, project):
        assert candidates(project)["provisional_ids"] is False
        (project / ".sdlc" / "state.yaml").unlink()
        standalone = json.loads(run("candidates", "--repo", str(project), "--json").stdout)
        assert standalone["provisional_ids"] is True and len(standalone["contradictions"]) == 2

    def test_file_overrides_work_with_no_project_at_all(self, tmp_path):
        proc = run("candidates", "--repo", str(tmp_path), "--json",
                   "--contradictions-file", str(DOCS / "contradiction-list.md"),
                   "--questions-file", str(DOCS / "question-list.md"),
                   "--registry-file", str(DOCS / "document-registry.md"))
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)
        # The brief goes beside the first override, and the shipped fixtures folder holds a filled one.
        assert doc["has_data"] is True and doc["provisional_ids"] is True and doc["existing_brief"] is True


class TestOutput:
    def test_it_writes_nothing(self, project):
        def snapshot():
            return {str(p.relative_to(project)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted(project.rglob("*")) if p.is_file()}
        before = snapshot()
        candidates(project)
        assert run("candidates", "--state", str(project / ".sdlc" / "state.yaml")).returncode == 0
        assert snapshot() == before

    def test_json_is_exactly_one_document_with_the_documented_keys(self, project):
        proc = run("candidates", "--state", str(project / ".sdlc" / "state.yaml"), "--json")
        doc = json.loads(proc.stdout)  # nothing before or after it, or this raises
        assert list(doc) == ["has_data", "notes", "contradictions", "questions", "documents", "limits",
                             "standing_decisions", "existing_brief", "provisional_ids"]

    def test_text_mode_states_the_same_facts_in_plain_lines(self, project):
        proc = run("candidates", "--state", str(project / ".sdlc" / "state.yaml"))
        assert proc.returncode == 0
        for fact in ("CON-01", "blocks-outcome", "recommended", "Q-02", "pre-workshop", "DOC-003", "limit"):
            assert fact in proc.stdout

    def test_a_usage_error_exits_2(self):
        assert run("candidates").returncode == 2


class TestBuildIsUntouched:
    def test_build_still_lists_every_flag_it_had(self):
        help_text = run("build", "--help").stdout
        for flag in ("--state", "--repo", "--contradictions", "--questions", "--decisions-json", "--logistics-json",
                     "--claims-json", "--load-bearing", "--contradictions-file", "--questions-file",
                     "--registry-file", "--output", "--force", "--json"):
            assert flag in help_text


class TestRefusalsAreOneLine:
    """Found by the correctness review of PR #95. Run as a script, `brief_candidates` imported a SECOND copy of
    `workshop_brief`, so a refusal raised there was not the `BriefError` that `main()` catches, and a caller
    (Studio shows stderr) got a Python traceback instead of one `Error:` line."""

    def test_a_missing_state_file_is_one_error_line_not_a_traceback(self, tmp_path):
        proc = run("candidates", "--state", str(tmp_path / "nope" / "state.yaml"), "--json")
        assert proc.returncode == 1 and proc.stdout == ""
        lines = proc.stderr.strip().splitlines()
        assert len(lines) == 1 and lines[0].startswith("Error: state file not found")
        assert "Traceback" not in proc.stderr
