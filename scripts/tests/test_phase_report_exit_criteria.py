"""The stakeholder report has to carry the questions only a human can answer.

1.0.0 (Fix 3) was written because "the approver was shown a file list and asked to sign".
It fixed that in the terminal: `check_gates.py` renders the registry's prose exit
conditions as G7 REVIEW items. The report did not follow — `build_gate_items()` was
built from the artifact list alone, so the page the approver actually opens and signs
still showed exactly a file list, with every judgement call invisible.

These tests hold the report to the same standard as the terminal: whatever the registry
says a human must decide, the report shows, and it shows it above the evidence rather
than below ten documents.
"""

from pathlib import Path

import pytest
import yaml

import phase_model as pm
from generate_phase_report import (
    build_gate_items,
    build_judgement_section,
    generate_report,
    phase_exit_criteria,
)


# ── The registry reader ───────────────────────────────────────────────────────

class TestPhaseExitCriteria:
    def test_discovery_carries_its_judgement_calls(self):
        """Phase 0 is the worked example: four conditions no file check can settle."""
        criteria = phase_exit_criteria(0)
        assert criteria, "Phase 0 declares prose exit conditions; none were read"
        assert any("Scope boundaries" in c for c in criteria)

    def test_artifact_conditions_are_excluded(self):
        """`{artifact: x, check: exists_and_complete}` is G1/G2's job, not a judgement call."""
        criteria = phase_exit_criteria(0)
        assert "exists_and_complete" not in criteria, (
            "a machine-checked artifact condition leaked into the human list"
        )
        for c in criteria:
            assert not c.endswith(".md"), f"'{c}' is a filename, not a question"

    def test_every_registry_phase_is_readable(self):
        """A phase with no prose conditions returns [] — never raises, never invents."""
        for phase_id in pm.all_phase_ids():
            assert isinstance(phase_exit_criteria(phase_id), list)

    def test_unknown_phase_is_empty_not_an_error(self):
        assert phase_exit_criteria("not-a-phase") == []

    def test_conditions_match_what_the_terminal_reports(self):
        """The report and `check_gates.py` must never disagree about what needs deciding.

        Two readers of one registry field is exactly how they drift apart, so this pins
        them together: whatever G7 renders in the terminal is what the report shows.
        """
        from check_gates import check_exit_criteria

        phase_def = pm.get_phase(0)
        terminal = {
            r["message"].replace("Human verification required: ", "")
            for r in check_exit_criteria(phase_def)
        }
        assert set(phase_exit_criteria(0)) == terminal


# ── The rendering ─────────────────────────────────────────────────────────────

class TestJudgementSection:
    def test_every_criterion_reaches_the_page(self):
        criteria = ["Scope is unambiguous", "The metric has a named source"]
        out = build_judgement_section(criteria)
        for c in criteria:
            assert c in out, f"'{c}' was dropped between the registry and the page"

    def test_no_criteria_renders_nothing(self):
        """A phase with no judgement calls must not show an empty prompt to sign."""
        assert build_judgement_section([]) == ""

    def test_criteria_are_escaped(self):
        out = build_judgement_section(['Scope excludes <script>alert("x")</script>'])
        assert "<script>" not in out
        assert "&lt;script&gt;" in out

    def test_count_is_stated_and_agrees_with_the_list(self):
        out = build_judgement_section(["a", "b", "c"])
        assert "3 judgement calls" in out

    def test_singular_reads_correctly(self):
        assert "1 judgement call<" in build_judgement_section(["only one"])


class TestGateItemsCarryTheDecisions:
    def test_sidebar_shows_the_decision_count(self):
        """The file checks can be all-green while the phase is nowhere near done."""
        artifacts = [("a.md", "A")]
        out = build_gate_items(artifacts, {"a.md"}, ["decide this", "and this"])
        assert "2 decisions for a human" in out

    def test_sidebar_omits_the_row_when_there_is_nothing_to_decide(self):
        out = build_gate_items([("a.md", "A")], {"a.md"}, [])
        assert "for a human" not in out

    def test_artifact_rows_are_unaffected(self):
        """Adding the decision row must not disturb the existing pass/fail rendering."""
        artifacts = [("a.md", "A"), ("b.md", "B")]
        out = build_gate_items(artifacts, {"a.md"}, ["x"])
        assert out.count("gate-item pass") == 1
        assert out.count("gate-item fail") == 1


# ── End to end, against a real generated page ────────────────────────────────

@pytest.fixture
def discovery_project(tmp_path):
    """A Phase 0 project whose every required artifact is present and complete.

    The point of the fixture: this is the state where the old report said nothing but
    green. If the judgement calls do not appear *here*, they appear nowhere that counts.
    """
    sdlc = tmp_path / ".sdlc"
    (sdlc / "artifacts" / "00-discovery").mkdir(parents=True)
    (sdlc / "state.yaml").write_text(
        yaml.safe_dump({
            "version": "1.0",
            "project_name": "harbor-claims",
            "profile_id": "microsoft-enterprise",
            "project_type": "service",
            "current_phase": "0",
        }),
        encoding="utf-8",
    )
    for fn, _ in [(f, f) for f in (
        "constitution.md", "problem-statement.md",
        "success-criteria.md", "constraints.md", "phase1-handoff.md",
    )]:
        (sdlc / "artifacts" / "00-discovery" / fn).write_text(
            f"# {fn}\n\nReal content, no placeholders.\n", encoding="utf-8"
        )
    return tmp_path


class TestGeneratedReport:
    def test_the_page_carries_every_judgement_call(self, discovery_project):
        out = discovery_project / "report.html"
        result = generate_report(
            discovery_project / ".sdlc" / "state.yaml", 0, out
        )
        page = out.read_text(encoding="utf-8")

        assert result["missing"] == 0, "fixture should be all-green on the file checks"
        assert result["exit_criteria"] == len(phase_exit_criteria(0))
        for criterion in phase_exit_criteria(0):
            assert criterion in page, (
                f"the approver signs this page without ever seeing: {criterion}"
            )

    def test_the_questions_come_before_the_evidence(self, discovery_project):
        """Under ten artifact sections is not 'shown to the approver'."""
        out = discovery_project / "report.html"
        generate_report(discovery_project / ".sdlc" / "state.yaml", 0, out)
        page = out.read_text(encoding="utf-8")

        assert page.index('id="exit-criteria"') < page.index('class="artifact-section"')

    def test_the_page_is_still_well_formed(self, discovery_project):
        """The template is `.format()`-ed; an unescaped brace silently mangles the CSS."""
        out = discovery_project / "report.html"
        generate_report(discovery_project / ".sdlc" / "state.yaml", 0, out)
        page = out.read_text(encoding="utf-8")

        assert page.count("<section") == page.count("</section>")
        assert page.count("<ul") == page.count("</ul>")
        assert "</html>" in page

        # A new `{placeholder}` that the format() call never fills, or a bare `{` in the
        # CSS that should have been doubled, both survive as literal text on the page.
        assert "{judgement_section}" not in page
        css = page.split("<style>", 1)[1].split("</style>", 1)[0]
        assert "{{" not in css, "a doubled brace escaped into the rendered CSS"
