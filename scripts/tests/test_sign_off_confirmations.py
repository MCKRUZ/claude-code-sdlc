"""Tests for sign_off_confirmations.py — who confirmed which sign-off question, and when.

The plugin's own sign-off records one name for a whole phase. This is the finer record: each
question a person is asked before signing, ticked by a named person at a known time. The
tests hold three properties: the record is honest (only what was actually ticked, by whom),
it survives being appended to from two machines, and a question whose wording later changes
no longer counts as confirmed — a tick belongs to the question as it was asked.
"""

import json
import subprocess
import sys
from pathlib import Path

import phase_model as pm
import pytest
import stage_readiness as sr
from sign_off_confirmations import (
    LEDGER_NAME,
    all_confirmed,
    confirm,
    current_confirmations,
    question_id,
    withdraw,
)

CLI_PATH = Path(__file__).resolve().parent.parent / "sign_off_confirmations.py"
PHASE0 = pm.get_phase("0")
assert PHASE0 is not None
QUESTIONS = sr.judgement_conditions(PHASE0)


def _qid(i: int = 0) -> str:
    return question_id("0", QUESTIONS[i])


def _cli(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(CLI_PATH), *args, "--repo", str(repo)],
        capture_output=True, text=True, timeout=30,
    )


class TestQuestionId:
    def test_is_stable_for_the_same_question(self):
        assert question_id("0", QUESTIONS[0]) == question_id("0", QUESTIONS[0])

    def test_differs_between_questions(self):
        assert len({question_id("0", q) for q in QUESTIONS}) == len(QUESTIONS)

    def test_differs_between_phases_for_the_same_wording(self):
        assert question_id("0", "Same words") != question_id("1", "Same words")

    def test_ignores_whitespace_differences(self):
        assert question_id("0", "a  b\n c") == question_id("0", "a b c")

    def test_changes_when_the_wording_changes(self):
        assert question_id("0", "Scope is clear") != question_id("0", "Scope is very clear")


class TestRecording:
    def test_a_confirmation_is_read_back_with_who_and_when(self, tmp_path):
        confirm(tmp_path, "0", _qid(0), "Matt K")
        got = current_confirmations(tmp_path, "0")
        assert got[_qid(0)]["actor"] == "Matt K"
        assert got[_qid(0)]["ts"]

    def test_nothing_is_confirmed_until_someone_confirms(self, tmp_path):
        assert current_confirmations(tmp_path, "0") == {}

    def test_withdrawing_removes_it_but_keeps_the_history(self, tmp_path):
        confirm(tmp_path, "0", _qid(0), "Matt K")
        withdraw(tmp_path, "0", _qid(0), "Matt K")
        assert _qid(0) not in current_confirmations(tmp_path, "0")
        lines = (tmp_path / ".sdlc" / "metrics" / LEDGER_NAME).read_text().splitlines()
        assert [json.loads(l)["action"] for l in lines] == ["confirm", "withdraw"]

    def test_the_latest_word_wins(self, tmp_path):
        confirm(tmp_path, "0", _qid(0), "Matt K")
        withdraw(tmp_path, "0", _qid(0), "Matt K")
        confirm(tmp_path, "0", _qid(0), "Priya N")
        assert current_confirmations(tmp_path, "0")[_qid(0)]["actor"] == "Priya N"

    def test_phases_do_not_share_confirmations(self, tmp_path):
        confirm(tmp_path, "0", _qid(0), "Matt K")
        assert current_confirmations(tmp_path, "1") == {}

    def test_a_confirmation_needs_a_named_person(self, tmp_path):
        with pytest.raises(ValueError, match="named person"):
            confirm(tmp_path, "0", _qid(0), "  ")

    def test_an_unknown_question_is_refused(self, tmp_path):
        with pytest.raises(ValueError, match="not a question"):
            confirm(tmp_path, "0", "q-doesnotexist", "Matt K")

    def test_a_torn_line_does_not_lose_the_rest(self, tmp_path):
        confirm(tmp_path, "0", _qid(0), "Matt K")
        ledger = tmp_path / ".sdlc" / "metrics" / LEDGER_NAME
        ledger.write_text(ledger.read_text() + '{"torn\n', encoding="utf-8")
        assert _qid(0) in current_confirmations(tmp_path, "0")

    def test_a_reworded_question_no_longer_counts(self, tmp_path):
        # A tick belongs to the question as it was asked. Seed an entry whose id is what the
        # question used to hash to: it must not carry over to the question as now worded.
        ledger = tmp_path / ".sdlc" / "metrics" / LEDGER_NAME
        ledger.parent.mkdir(parents=True)
        ledger.write_text(json.dumps({
            "ts": "2026-09-01T00:00:00+00:00", "phase": "0", "question_id": question_id("0", "Old wording"),
            "action": "confirm", "actor": "Matt K",
        }) + "\n", encoding="utf-8")
        assert not all_confirmed(tmp_path, "0")
        assert current_confirmations(tmp_path, "0") == {}


class TestAllConfirmed:
    def test_false_until_every_question_is_ticked(self, tmp_path):
        for i in range(len(QUESTIONS) - 1):
            confirm(tmp_path, "0", _qid(i), "Matt K")
        assert not all_confirmed(tmp_path, "0")

    def test_true_when_every_question_is_ticked(self, tmp_path):
        for i in range(len(QUESTIONS)):
            confirm(tmp_path, "0", _qid(i), "Matt K")
        assert all_confirmed(tmp_path, "0")

    def test_an_unknown_phase_is_an_error_not_a_yes(self, tmp_path):
        with pytest.raises(ValueError, match="unknown phase"):
            all_confirmed(tmp_path, "42")


class TestCommandLine:
    def test_confirm_then_status(self, tmp_path):
        r = _cli(tmp_path, "confirm", "--phase", "0", "--question-id", _qid(0), "--actor", "Matt K")
        assert r.returncode == 0, r.stderr + r.stdout
        s = _cli(tmp_path, "status", "--phase", "0", "--json")
        data = json.loads(s.stdout)
        assert data["confirmed"] == 1
        assert data["total"] == len(QUESTIONS)
        assert data["all_confirmed"] is False
        assert data["items"][0]["confirmation"]["actor"] == "Matt K"
        assert data["items"][1]["confirmation"] is None

    def test_confirm_without_an_actor_fails(self, tmp_path):
        r = _cli(tmp_path, "confirm", "--phase", "0", "--question-id", _qid(0), "--actor", " ")
        assert r.returncode == 1
        assert "named person" in (r.stdout + r.stderr)

    def test_confirm_an_unknown_question_fails(self, tmp_path):
        r = _cli(tmp_path, "confirm", "--phase", "0", "--question-id", "q-nope", "--actor", "Matt K")
        assert r.returncode == 1

    def test_withdraw(self, tmp_path):
        _cli(tmp_path, "confirm", "--phase", "0", "--question-id", _qid(0), "--actor", "Matt K")
        r = _cli(tmp_path, "withdraw", "--phase", "0", "--question-id", _qid(0), "--actor", "Matt K")
        assert r.returncode == 0
        assert json.loads(_cli(tmp_path, "status", "--phase", "0", "--json").stdout)["confirmed"] == 0

    def test_status_always_exits_zero_and_lists_the_questions_in_words(self, tmp_path):
        s = _cli(tmp_path, "status", "--phase", "0")
        assert s.returncode == 0
        assert QUESTIONS[0].split(" — ")[0] in s.stdout
        assert "[ ]" in s.stdout

    def test_status_shows_who_ticked_a_question(self, tmp_path):
        _cli(tmp_path, "confirm", "--phase", "0", "--question-id", _qid(0), "--actor", "Matt K")
        s = _cli(tmp_path, "status", "--phase", "0")
        assert "[x]" in s.stdout and "Matt K" in s.stdout

    def test_status_of_the_current_phase_when_none_is_given(self, tmp_path):
        (tmp_path / ".sdlc").mkdir()
        (tmp_path / ".sdlc" / "state.yaml").write_text("current_phase: 0\n", encoding="utf-8")
        data = json.loads(_cli(tmp_path, "status", "--json").stdout)
        assert data["phase"] == "0"

    def test_unknown_phase_is_reported_not_crashed(self, tmp_path):
        s = _cli(tmp_path, "status", "--phase", "42", "--json")
        assert s.returncode == 0
        assert "error" in json.loads(s.stdout)
