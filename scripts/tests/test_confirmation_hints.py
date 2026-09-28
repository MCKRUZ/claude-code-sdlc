"""Tests for confirmation_hints.py — what the software can say about a sign-off question.

The rule these tests hold: a hint is a pre-check, never a verdict. The person who signs is
told what was found ("4 dimensions, each with pass/fail thresholds and a source") and asked
to agree; a question no check can answer says so instead of guessing.
"""

from pathlib import Path

import phase_model as pm
import pytest
import stage_readiness as sr
from confirmation_hints import HINT_NEEDLES, hint_for

ARTIFACTS = Path(".sdlc") / "artifacts"

Q_SCOPE = "Scope boundaries are unambiguous"
Q_CRITERIA = "success-criteria.md has at least 3 measurable dimensions"
Q_PERSONAS = "Every persona is a real person or role the human named"
Q_TYPE = "project_type is recorded in state.yaml"
Q_AQ = "Every architectural implication appears in phase2-handoff.md"
Q_DECISIONS = "Every open product decision is recorded in .sdlc/decision-log.md"


def _write(repo: Path, rel: str, text: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _dimension(n: int, *, pass_row="| Pass | 95% of spend attributed | Compare against the pilot log |",
               fail_row="| Fail | Below 80% | Same comparison |") -> str:
    return (
        f"### Dimension {n}: Something measurable\n\n"
        "**What we're measuring:** a thing.\n\n"
        "| Outcome | Threshold | How We'll Measure |\n|---|---|---|\n"
        f"{pass_row}\n{fail_row}\n\n"
    )


def _criteria(*dims: str) -> str:
    return "# Success Criteria\n\n## Measurable Success Dimensions\n\n" + "\n---\n\n".join(dims)


PROBLEM = """# Problem Statement

## Stakeholder Personas

| Persona | Role | Primary Pain Point | Success Looks Like |
|---------|------|-------------------|--------------------|
| Dana | Finance lead | Cannot see spend | One number per team |
| Priya | Platform engineer | Manual reconciliation | Automatic rollup |
| Sam | Security | No audit trail | Every call attributed |

## Problem Scope

**In scope:** What this initiative will address
- Attribution across providers

**Out of scope:** What this initiative will NOT address (and why)
- Billing disputes — a finance-system problem
- Forecasting — not asked for

**Adjacent problems we know exist but are deferring:**
- Chargeback automation
"""


class TestEveryQuestionIsAnsweredHonestly:
    def test_a_question_with_no_check_says_it_needs_judgement(self, tmp_path):
        h = hint_for("Rollback rehearsed in test by the client's operators", tmp_path, {})
        assert h["status"] == "judgement"
        assert "judgement" in h["detail"].lower()

    def test_a_hint_never_claims_the_question_is_settled(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", PROBLEM)
        h = hint_for(Q_SCOPE, tmp_path, {})
        assert h["status"] in {"looks_met", "not_yet", "judgement"}
        assert "confirm" in h["detail"].lower() or "agree" in h["detail"].lower()


class TestScope:
    def test_out_of_scope_items_found_looks_met(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", PROBLEM)
        h = hint_for(Q_SCOPE, tmp_path, {})
        assert h["status"] == "looks_met"
        assert "2" in h["detail"]

    def test_no_out_of_scope_items_is_not_yet(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md",
               PROBLEM.replace("- Billing disputes — a finance-system problem\n- Forecasting — not asked for\n", ""))
        assert hint_for(Q_SCOPE, tmp_path, {})["status"] == "not_yet"

    def test_the_template_placeholder_is_not_an_item(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md",
               PROBLEM.replace("- Billing disputes — a finance-system problem\n- Forecasting — not asked for\n",
                               "- [Bullet — include rationale for exclusion]\n"))
        assert hint_for(Q_SCOPE, tmp_path, {})["status"] == "not_yet"

    def test_a_document_that_words_the_heading_differently_is_still_read(self, tmp_path):
        # Real projects reword template headings; the hint must not depend on the exact bold label.
        text = "# P\n\n## Problem Scope\n\n### Out of scope\n- Billing disputes\n\n### Deferred\n- Later\n"
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", text)
        h = hint_for(Q_SCOPE, tmp_path, {})
        assert h["status"] == "looks_met"
        assert "1" in h["detail"]

    def test_the_count_stops_at_the_next_label(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", PROBLEM)
        # Two out-of-scope bullets, then a deferred one under the next label: counting past the
        # label would report 3 and overstate how much was ruled out.
        detail = hint_for(Q_SCOPE, tmp_path, {})["detail"]
        assert "2" in detail and "3" not in detail

    def test_no_document_is_not_yet(self, tmp_path):
        assert hint_for(Q_SCOPE, tmp_path, {})["status"] == "not_yet"


class TestSuccessCriteria:
    def test_three_complete_dimensions_looks_met(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/success-criteria.md",
               _criteria(_dimension(1), _dimension(2), _dimension(3)))
        h = hint_for(Q_CRITERIA, tmp_path, {})
        assert h["status"] == "looks_met"
        assert "3" in h["detail"]

    def test_two_dimensions_is_not_yet_and_says_how_many(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/success-criteria.md",
               _criteria(_dimension(1), _dimension(2)))
        h = hint_for(Q_CRITERIA, tmp_path, {})
        assert h["status"] == "not_yet"
        assert "2" in h["detail"]

    def test_a_dimension_with_the_template_placeholders_does_not_count(self, tmp_path):
        placeholder = _dimension(3, pass_row="| Pass | [Specific number/condition] | [Measurement method] |")
        _write(tmp_path, ".sdlc/artifacts/00-discovery/success-criteria.md",
               _criteria(_dimension(1), _dimension(2), placeholder))
        assert hint_for(Q_CRITERIA, tmp_path, {})["status"] == "not_yet"

    def test_a_dimension_with_no_named_source_does_not_count(self, tmp_path):
        no_source = _dimension(3, pass_row="| Pass | 95% of spend attributed | — |")
        _write(tmp_path, ".sdlc/artifacts/00-discovery/success-criteria.md",
               _criteria(_dimension(1), _dimension(2), no_source))
        h = hint_for(Q_CRITERIA, tmp_path, {})
        assert h["status"] == "not_yet"
        assert "source" in h["detail"].lower()

    def test_a_dash_in_the_fail_row_source_is_fine(self, tmp_path):
        # Real projects write "—" for how a Fail is measured; the Pass row names the source.
        dim = _dimension(3, fail_row="| Fail | No design partner | — |")
        _write(tmp_path, ".sdlc/artifacts/00-discovery/success-criteria.md",
               _criteria(_dimension(1), _dimension(2), dim))
        assert hint_for(Q_CRITERIA, tmp_path, {})["status"] == "looks_met"

    def test_missing_document_is_not_yet(self, tmp_path):
        assert hint_for(Q_CRITERIA, tmp_path, {})["status"] == "not_yet"


class TestPersonas:
    def test_three_filled_rows_looks_met(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", PROBLEM)
        h = hint_for(Q_PERSONAS, tmp_path, {})
        assert h["status"] == "looks_met"
        assert "3" in h["detail"]

    def test_the_hint_does_not_pretend_to_know_they_are_real(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", PROBLEM)
        assert "real" in hint_for(Q_PERSONAS, tmp_path, {})["detail"].lower()

    def test_placeholder_and_blank_rows_do_not_count(self, tmp_path):
        text = PROBLEM.replace("| Sam | Security | No audit trail | Every call attributed |",
                               "| [Name/title] | [What they do] | [What frustrates them today] | [What they'd celebrate] |\n| | | | |")
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", text)
        h = hint_for(Q_PERSONAS, tmp_path, {})
        assert h["status"] == "not_yet"
        assert "2" in h["detail"]

    def test_a_row_with_a_blank_column_does_not_count(self, tmp_path):
        text = PROBLEM.replace("| Sam | Security | No audit trail | Every call attributed |",
                               "| Sam | Security | | Every call attributed |")
        _write(tmp_path, ".sdlc/artifacts/00-discovery/problem-statement.md", text)
        assert hint_for(Q_PERSONAS, tmp_path, {})["status"] == "not_yet"


class TestProjectType:
    def test_recorded_looks_met_and_names_it(self, tmp_path):
        h = hint_for(Q_TYPE, tmp_path, {"project_type": "app"})
        assert h["status"] == "looks_met"
        assert "app" in h["detail"]

    @pytest.mark.parametrize("state", [{}, {"project_type": ""}, {"project_type": None}])
    def test_absent_or_empty_is_not_yet(self, tmp_path, state):
        assert hint_for(Q_TYPE, tmp_path, state)["status"] == "not_yet"


class TestArchitecturalQuestions:
    def test_numbered_aq_items_are_counted(self, tmp_path):
        text = "## What Design Must Address\n\n- [ ] **[AQ-01]** One?\n- [ ] **[AQ-02]** Two?\n- [x] AQ-03 Three?\n"
        _write(tmp_path, ".sdlc/artifacts/01-requirements/phase2-handoff.md", text)
        h = hint_for(Q_AQ, tmp_path, {})
        assert h["status"] == "looks_met"
        assert "3" in h["detail"]

    def test_the_same_number_twice_is_one_item(self, tmp_path):
        text = "- **[AQ-01]** One?\n- see AQ-01 again\n"
        _write(tmp_path, ".sdlc/artifacts/01-requirements/phase2-handoff.md", text)
        assert "1" in hint_for(Q_AQ, tmp_path, {})["detail"]

    def test_none_listed_is_not_yet(self, tmp_path):
        _write(tmp_path, ".sdlc/artifacts/01-requirements/phase2-handoff.md", "## What Design Must Address\n")
        assert hint_for(Q_AQ, tmp_path, {})["status"] == "not_yet"


class TestDecisionLog:
    TABLE = (
        "| id | decision | owner | opened | due | status |\n|---|---|---|---|---|---|\n"
        "| DL-01 | Pick a cloud | @dana | 2026-09-01 | 2026-09-03 | open |\n"
        "| DL-02 | Pick a region | | 2026-09-01 | 2026-09-03 | open |\n"
        "| DL-03 | Old one | | 2026-08-01 | | closed |\n"
    )

    def test_open_decisions_without_an_owner_are_named(self, tmp_path):
        _write(tmp_path, ".sdlc/decision-log.md", self.TABLE)
        h = hint_for(Q_DECISIONS, tmp_path, {})
        assert h["status"] == "not_yet"
        assert "DL-02" in h["detail"]
        assert "DL-01" not in h["detail"]

    def test_a_closed_decision_needs_no_owner(self, tmp_path):
        _write(tmp_path, ".sdlc/decision-log.md", self.TABLE.replace("| DL-02 | Pick a region | |", "| DL-02 | Pick a region | @sam |"))
        assert hint_for(Q_DECISIONS, tmp_path, {})["status"] == "looks_met"

    def test_no_log_at_all_is_not_yet(self, tmp_path):
        assert hint_for(Q_DECISIONS, tmp_path, {})["status"] == "not_yet"


class TestTheHintsStayTiedToTheRegistry:
    """The registry is fixed core we cannot edit, so a hint is matched by wording. If that
    wording ever changes, a hint would silently stop applying — this fails instead."""

    @pytest.mark.parametrize("needle", HINT_NEEDLES)
    def test_every_hint_matches_exactly_one_real_question(self, needle):
        matches = [
            (p["id"], q)
            for p in pm.all_phases()
            for q in sr.judgement_conditions(p)
            if needle in q
        ]
        assert len(matches) == 1, f"{needle!r} matched {matches}"
