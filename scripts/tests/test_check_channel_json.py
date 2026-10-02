"""check_channel.py's `--json` and `--interaction-spec` modes (spec 0021).

Studio's "Bind to a channel" and "Experience" buttons need the advisory channel check as data, not
prose, and the Experience button needs to ask a second question the script never answered: does
this interaction spec have a row for every dimension the channel's descriptor lists?

What these protect:
  * UNCHANGED WITHOUT A FLAG. The text report is pinned against golden captures taken from the
    script before this change.
  * ADVISORY BY CONSTRUCTION. Every path exits 0, including a missing spec or descriptor.
  * ONE DOCUMENT. `--json` prints a single JSON document and nothing else.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / "scripts" / "check_channel.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
SPEC = FIXTURES / "specs" / "0042-voice-claim-intake.md"
INTERACTION = FIXTURES / "specs" / "voice-interaction-spec.md"
GOLDEN = FIXTURES / "golden"
ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}

VOICE_DIMENSIONS = ["turn-taking", "barge-in", "intent-capture", "latency-budget", "readback-confirmation", "fallback-to-human"]


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding="utf-8", env=ENV)


def spec_with(tmp_path, channel="voice", extra_checks=""):
    text = SPEC.read_text(encoding="utf-8").replace('channel: ""', f'channel: {channel}', 1)
    if extra_checks:
        text = text.replace("## Risk Tier", extra_checks + "\n## Risk Tier", 1)
    path = tmp_path / "0042-voice-claim-intake.md"  # the golden captures name this file in their header
    path.write_text(text, encoding="utf-8")
    return path


def normalised(proc):
    return f"exit={proc.returncode}\n{proc.stdout.replace(chr(13) + chr(10), chr(10))}"


class TestUnchangedWithoutAFlag:
    def test_a_bound_spec_with_uncovered_dimensions_reports_exactly_as_before(self, tmp_path):
        assert normalised(run("--spec", str(spec_with(tmp_path)))) == (GOLDEN / "check_channel-voice-uncovered.txt").read_text(encoding="utf-8")

    def test_a_spec_with_no_channel_reports_exactly_as_before(self, tmp_path):
        path = tmp_path / "0042-voice-claim-intake.md"
        path.write_text(SPEC.read_text(encoding="utf-8"), encoding="utf-8")
        assert normalised(run("--spec", str(path))) == (GOLDEN / "check_channel-no-channel.txt").read_text(encoding="utf-8")


class TestJsonForASpec:
    def test_prints_exactly_one_document_and_exits_zero(self, tmp_path):
        proc = run("--spec", str(spec_with(tmp_path)), "--json")
        assert proc.returncode == 0
        doc = json.loads(proc.stdout)  # raises if there is any text before or after the document
        assert doc["advisory"] is True and doc["source"] == "spec"

    def test_lists_every_descriptor_dimension_with_whether_it_is_covered(self, tmp_path):
        doc = json.loads(run("--spec", str(spec_with(tmp_path)), "--json").stdout)
        assert doc["channel"] == "voice" and doc["bound"] is True
        assert [d["id"] for d in doc["dimensions"]] == VOICE_DIMENSIONS
        assert not any(d["covered"] for d in doc["dimensions"])
        assert doc["uncovered"] == VOICE_DIMENSIONS

    def test_a_tagged_acceptance_check_marks_its_dimension_covered(self, tmp_path):
        spec = spec_with(tmp_path, extra_checks="")
        spec.write_text(spec.read_text(encoding="utf-8").replace(
            "- [ ] A caller who hangs up", "- [ ] The agent stops talking within 200 ms of the caller (channel: barge-in)\n- [ ] A caller who hangs up", 1), encoding="utf-8")
        doc = json.loads(run("--spec", str(spec), "--json").stdout)
        assert "barge-in" not in doc["uncovered"]
        assert next(d for d in doc["dimensions"] if d["id"] == "barge-in")["covered"] is True

    def test_a_spec_with_no_channel_is_not_bound_and_has_nothing_to_check(self, tmp_path):
        path = tmp_path / "s.md"
        path.write_text(SPEC.read_text(encoding="utf-8"), encoding="utf-8")
        doc = json.loads(run("--spec", str(path), "--json").stdout)
        assert doc["bound"] is False and doc["channel"] is None and doc["dimensions"] == [] and doc["uncovered"] == []

    def test_a_channel_with_no_descriptor_is_a_note_not_a_crash(self, tmp_path):
        proc = run("--spec", str(spec_with(tmp_path, channel="nonesuch")), "--json")
        doc = json.loads(proc.stdout)
        assert proc.returncode == 0 and doc["dimensions"] == []
        assert any("no descriptor" in n for n in doc["notes"])

    def test_a_missing_spec_still_exits_zero_with_a_note(self, tmp_path):
        proc = run("--spec", str(tmp_path / "missing.md"), "--json")
        doc = json.loads(proc.stdout)
        assert proc.returncode == 0 and doc["bound"] is False and any("not found" in n for n in doc["notes"])

    def test_dimension_order_follows_the_descriptor(self, tmp_path):
        doc = json.loads(run("--spec", str(spec_with(tmp_path)), "--json").stdout)
        assert [d["id"] for d in doc["dimensions"]][:2] == ["turn-taking", "barge-in"]


class TestInteractionSpec:
    def test_reads_the_channel_from_the_document_and_reports_per_dimension_coverage(self):
        proc = run("--interaction-spec", str(INTERACTION), "--json")
        doc = json.loads(proc.stdout)
        assert proc.returncode == 0 and doc["source"] == "interaction-spec" and doc["channel"] == "voice"
        by_id = {d["id"]: d for d in doc["dimensions"]}
        assert [d for d in by_id if by_id[d]["covered"]] == ["turn-taking", "barge-in", "readback-confirmation"]

    def test_a_covered_dimension_carries_its_contract_and_acceptance_check_text(self):
        doc = json.loads(run("--interaction-spec", str(INTERACTION), "--json").stdout)
        barge = next(d for d in doc["dimensions"] if d["id"] == "barge-in")
        assert barge["contract"] == "The caller may interrupt any prompt."
        assert barge["acceptance_check"] == "When the caller speaks during a prompt, the prompt stops within 200 ms."

    def test_a_row_still_holding_template_placeholders_does_not_count(self):
        doc = json.loads(run("--interaction-spec", str(INTERACTION), "--json").stdout)
        latency = next(d for d in doc["dimensions"] if d["id"] == "latency-budget")
        assert latency["covered"] is False and latency["contract"] is None

    def test_uncovered_lists_every_dimension_without_a_real_row(self):
        doc = json.loads(run("--interaction-spec", str(INTERACTION), "--json").stdout)
        assert doc["uncovered"] == ["intent-capture", "latency-budget", "fallback-to-human"]

    def test_the_channel_can_be_named_instead_of_read_from_the_document(self):
        doc = json.loads(run("--interaction-spec", str(INTERACTION), "--channel", "chat", "--json").stdout)
        assert doc["channel"] == "chat" and doc["dimensions"] and not any(d["covered"] for d in doc["dimensions"])

    def test_an_unresolved_channel_placeholder_is_a_note_not_a_guess(self, tmp_path):
        path = tmp_path / "itx.md"
        path.write_text(INTERACTION.read_text(encoding="utf-8").replace("`voice`", "`<channel>`", 1), encoding="utf-8")
        doc = json.loads(run("--interaction-spec", str(path), "--json").stdout)
        assert doc["bound"] is False and doc["dimensions"] == [] and any("channel" in n for n in doc["notes"])

    def test_the_text_report_lists_each_dimension_and_exits_zero(self):
        proc = run("--interaction-spec", str(INTERACTION))
        assert proc.returncode == 0
        assert "COVER" in proc.stdout and "ADVISE" in proc.stdout and "latency-budget" in proc.stdout

    def test_a_missing_interaction_spec_still_exits_zero(self, tmp_path):
        proc = run("--interaction-spec", str(tmp_path / "gone.md"), "--json")
        assert proc.returncode == 0 and json.loads(proc.stdout)["bound"] is False


class TestArguments:
    def test_one_of_spec_or_interaction_spec_is_required(self):
        assert run("--json").returncode == 2


class TestRowMatchingIsExactNotSubstring:
    """A dimension must not take another dimension's contract row as its own coverage just because
    its id is a substring of that row's dimension name (review of spec 0021)."""

    def test_latency_does_not_borrow_the_latency_budget_row(self):
        from check_channel import find_interaction_row, parse_interaction_rows
        text = INTERACTION.read_text(encoding="utf-8")
        rows = parse_interaction_rows(text)
        assert find_interaction_row("latency", rows) is None
        assert find_interaction_row("latency-budget", rows) is not None

    def test_a_row_naming_the_dimension_exactly_still_matches_with_backticks_and_case(self):
        from check_channel import find_interaction_row
        rows = [{"dimension": "barge-in", "contract": "c", "check": "k"}]
        assert find_interaction_row("Barge-In", rows) is rows[0]
