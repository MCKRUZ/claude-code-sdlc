"""Tests for document_shape_cli.py — the thin CLI/JSON/byte-offset skin over
document_shape.py that Studio (a separate TypeScript process) calls as a subprocess.

The library itself is already proven by test_document_shape.py and
test_shaped_templates_roundtrip.py; these tests are scoped to what the wrapper adds: byte-offset
conversion (the thing a Node caller actually needs and the library itself doesn't provide),
JSON serialization, and clean CLI-shaped errors instead of tracebacks.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from document_shape_cli import (
    CliError,
    _build_offset_maps,
    _compose_instance,
    _repeating_section,
    cmd_add_instance,
    cmd_next_number,
    cmd_read,
    cmd_write,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATES_ROOT = REPO_ROOT / "templates"
FIXTURES_ROOT = Path(__file__).resolve().parent / "fixtures" / "documents"
CLI_PATH = Path(__file__).resolve().parent.parent / "document_shape_cli.py"

REQUIREMENTS_SHAPE = TEMPLATES_ROOT / "phases" / "01-requirements" / "requirements.shape.yaml"
REQUIREMENTS_FIXTURE = FIXTURES_ROOT / "requirements.md"


class Args:
    """A tiny stand-in for argparse.Namespace, so tests can call cmd_read/cmd_write directly."""

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class TestOffsetMaps:
    def test_ascii_text_offsets_match_codepoints(self):
        text = "hello world"
        cp_to_byte, byte_to_cp = _build_offset_maps(text)
        assert cp_to_byte == list(range(len(text) + 1))
        assert byte_to_cp == {i: i for i in range(len(text) + 1)}

    def test_multibyte_character_shifts_later_offsets(self):
        # em dash '—' is 3 bytes in UTF-8
        text = "a—b"
        cp_to_byte, byte_to_cp = _build_offset_maps(text)
        assert cp_to_byte == [0, 1, 4, 5]
        assert byte_to_cp == {0: 0, 1: 1, 4: 2, 5: 3}

    def test_byte_offset_mid_character_has_no_entry(self):
        text = "a—b"
        _, byte_to_cp = _build_offset_maps(text)
        assert 2 not in byte_to_cp
        assert 3 not in byte_to_cp


class TestCmdRead:
    def test_real_fixture_offsets_are_byte_offsets_not_codepoint_offsets(self, tmp_path: Path):
        # requirements.md's header line contains an em dash before the first section —
        # if offsets were codepoint indices instead of byte offsets, this would be 2 bytes short.
        doc_path = tmp_path / "requirements.md"
        with open(REQUIREMENTS_FIXTURE, encoding="utf-8", newline="") as f:
            text = f.read()
        doc_path.write_bytes(text.encode("utf-8"))

        result = cmd_read(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE)))
        assert result["matched"] is True

        raw = doc_path.read_bytes()
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        # Every field's [start, end) byte span must slice the RAW BYTES to exactly its value.
        for label, field in overview["fields"].items():
            if field is None:
                continue
            sliced = raw[field["start"]:field["end"]].decode("utf-8")
            assert sliced == field["value"], f"field {label!r} byte span did not match its value"

    def test_missing_doc_raises_cli_error(self, tmp_path: Path):
        with pytest.raises(CliError, match="document not found"):
            cmd_read(Args(doc=str(tmp_path / "nope.md"), shape=str(REQUIREMENTS_SHAPE)))

    def test_missing_shape_raises_cli_error(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("# Title\n")
        with pytest.raises(CliError, match="shape not found"):
            cmd_read(Args(doc=str(doc_path), shape=str(tmp_path / "nope.shape.yaml")))

    def test_mismatched_document_reports_free_text_not_a_crash(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("# Title\nSome unrelated text with no shaped headings.\n")
        result = cmd_read(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE)))
        assert result["matched"] is False
        assert len(result["blocks"]) == 1
        assert result["blocks"][0]["kind"] == "free_text"


class TestCmdWrite:
    def test_no_updates_is_byte_identical_round_trip(self, tmp_path: Path):
        doc_path = tmp_path / "requirements.md"
        original = REQUIREMENTS_FIXTURE.read_bytes()
        doc_path.write_bytes(original)

        cmd_write(Args(doc=str(doc_path), updates=str(_write_updates(tmp_path, []))))
        assert doc_path.read_bytes() == original

    def test_real_edit_via_read_then_write_offsets(self, tmp_path: Path):
        doc_path = tmp_path / "requirements.md"
        doc_path.write_bytes(REQUIREMENTS_FIXTURE.read_bytes())

        result = cmd_read(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE)))
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        status = overview["fields"]["Status"]
        assert status["value"] == "Draft"

        updates_path = _write_updates(tmp_path, [[status["start"], status["end"], "Approved"]])
        cmd_write(Args(doc=str(doc_path), updates=str(updates_path)))

        with open(doc_path, encoding="utf-8", newline="") as f:
            new_text = f.read()
        assert "**Status:** Approved" in new_text
        assert "**Status:** Draft" not in new_text

    def test_overlapping_updates_raise_cli_error(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("hello world")
        updates_path = _write_updates(tmp_path, [[0, 5, "hi"], [3, 8, "x"]])
        with pytest.raises(CliError):
            cmd_write(Args(doc=str(doc_path), updates=str(updates_path)))

    def test_byte_offset_mid_character_raises_cli_error(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_bytes("a—b".encode("utf-8"))
        updates_path = _write_updates(tmp_path, [[2, 3, "x"]])  # splits the em dash
        with pytest.raises(CliError, match="character boundary"):
            cmd_write(Args(doc=str(doc_path), updates=str(updates_path)))

    def test_malformed_updates_json_raises_cli_error(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("hello")
        updates_path = tmp_path / "updates.json"
        updates_path.write_text("not json")
        with pytest.raises(CliError, match="not valid JSON"):
            cmd_write(Args(doc=str(doc_path), updates=str(updates_path)))

    def test_updates_not_a_list_raises_cli_error(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("hello")
        updates_path = tmp_path / "updates.json"
        updates_path.write_text('{"not": "a list"}')
        with pytest.raises(CliError, match="must be a JSON array"):
            cmd_write(Args(doc=str(doc_path), updates=str(updates_path)))


def _write_updates(tmp_path: Path, updates: list) -> Path:
    p = tmp_path / "updates.json"
    p.write_text(json.dumps(updates))
    return p


class TestCliProcess:
    """One end-to-end subprocess invocation per subcommand, proving the argparse wiring and
    stdout/stderr/exit-code contract Studio actually depends on — everything else exercises
    the functions directly, which is faster and just as precise for logic coverage."""

    def test_read_subcommand_exits_zero_and_prints_json(self, tmp_path: Path):
        doc_path = tmp_path / "requirements.md"
        doc_path.write_bytes(REQUIREMENTS_FIXTURE.read_bytes())
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "read", "--doc", str(doc_path), "--shape", str(REQUIREMENTS_SHAPE)],
            capture_output=True, text=True, timeout=30,
        )
        assert proc.returncode == 0, proc.stderr
        parsed = json.loads(proc.stdout)
        assert parsed["matched"] is True

    def test_read_subcommand_missing_doc_exits_one_with_stderr(self, tmp_path: Path):
        proc = subprocess.run(
            [sys.executable, str(CLI_PATH), "read", "--doc", str(tmp_path / "nope.md"), "--shape", str(REQUIREMENTS_SHAPE)],
            capture_output=True, text=True, timeout=30,
        )
        assert proc.returncode == 1
        assert "Error:" in proc.stderr
        assert proc.stdout == ""


class TestNextNumber:
    def test_next_number_after_the_fixture_two_requirements(self, tmp_path: Path):
        doc_path = tmp_path / "requirements.md"
        doc_path.write_bytes(REQUIREMENTS_FIXTURE.read_bytes())
        result = cmd_next_number(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE), section=None))
        assert result["number"] == 3
        assert result["id"] == "FR-003"
        assert result["heading"] == "Functional Requirements"

    def test_a_number_present_only_in_free_text_is_never_reused(self, tmp_path: Path):
        """The library scans the whole document, not just recognized instances — the fixture's
        traceability table and prose count too. Proven here because this is the specific
        promise the auto-numbering acceptance check rests on."""
        text = REQUIREMENTS_FIXTURE.read_text(encoding="utf-8")
        text += "\n\nSee also FR-042, which we discussed but never wrote up.\n"
        doc_path = tmp_path / "requirements.md"
        doc_path.write_text(text, encoding="utf-8")
        result = cmd_next_number(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE), section=None))
        assert result["number"] == 43

    def test_shape_with_no_repeating_section_is_a_clean_error(self, tmp_path: Path):
        shape = tmp_path / "flat.shape.yaml"
        shape.write_text(
            "template: flat\nversion: '1.0'\nsections:\n  - heading: Overview\n    fields: []\n",
            encoding="utf-8",
        )
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("# T\n\n## Overview\n\nbody\n", encoding="utf-8")
        with pytest.raises(CliError, match="no repeating section"):
            cmd_next_number(Args(doc=str(doc_path), shape=str(shape), section=None))


class TestRepeatingSectionResolution:
    SHAPE_TWO = {
        "sections": [
            {"heading": "A", "repeats": True, "numbering": {"pattern": "A-%03d"}},
            {"heading": "B", "repeats": True, "numbering": {"pattern": "B-%03d"}},
        ]
    }

    def test_several_repeating_sections_require_naming_one(self):
        with pytest.raises(CliError, match="several repeating sections"):
            _repeating_section(self.SHAPE_TWO, None)

    def test_naming_one_selects_it(self):
        assert _repeating_section(self.SHAPE_TWO, "B")["heading"] == "B"

    def test_naming_an_unknown_one_is_a_clean_error(self):
        with pytest.raises(CliError, match="no repeating section named"):
            _repeating_section(self.SHAPE_TWO, "C")


class TestComposeInstance:
    SECTION = {
        "heading": "Functional Requirements",
        "fields": [
            {"label": "Priority", "anchor": "inline"},
            {"label": "Requirement", "anchor": "labeled_block"},
            {"label": "Dependencies", "anchor": "inline"},
        ],
    }

    def test_fields_keep_the_shape_s_declared_order(self):
        out = _compose_instance(self.SECTION, "FR-007", "A title", "\n")
        assert out.index("**Priority:**") < out.index("**Requirement:**") < out.index("**Dependencies:**")

    def test_uses_the_documents_own_line_endings(self):
        assert "\r\n" in _compose_instance(self.SECTION, "FR-007", "t", "\r\n")
        assert "\r" not in _compose_instance(self.SECTION, "FR-007", "t", "\n")

    def test_carries_no_placeholder_prose(self):
        """Guidance belongs in the UI rendering the form. Placeholder text in a real document
        is exactly what the gate's placeholder scan exists to catch."""
        out = _compose_instance(self.SECTION, "FR-007", "A title", "\n")
        for marker in ("TBD", "TODO", "[", "REQUIRED"):
            assert marker not in out


class TestAddInstance:
    def _add(self, tmp_path: Path, **overrides):
        doc_path = tmp_path / "requirements.md"
        doc_path.write_bytes(REQUIREMENTS_FIXTURE.read_bytes())
        args = dict(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE), section=None, number=None, title="")
        args.update(overrides)
        return doc_path, cmd_add_instance(Args(**args))

    def test_appends_the_next_free_id(self, tmp_path: Path):
        doc_path, result = self._add(tmp_path, title="Something new")
        assert result["id"] == "FR-003"
        assert "### FR-003: Something new" in doc_path.read_text(encoding="utf-8")

    def test_the_new_block_reads_back_as_a_real_instance(self, tmp_path: Path):
        doc_path, _ = self._add(tmp_path, title="Something new")
        read = cmd_read(Args(doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE)))
        assert read["matched"] is True
        block = next(b for b in read["blocks"] if b["kind"] == "repeating_section")
        new = next(i for i in block["instances"] if i["number"] == 3)
        # Every field the shape declares must be found, or the form would render incomplete.
        assert all(v is not None for v in new["fields"].values())

    def test_everything_before_the_insertion_point_is_untouched(self, tmp_path: Path):
        doc_path, _ = self._add(tmp_path, title="x")
        before = REQUIREMENTS_FIXTURE.read_text(encoding="utf-8", errors="replace")
        after = doc_path.read_text(encoding="utf-8", errors="replace")
        shared = before.index("### FR-002")
        assert after[:shared] == before[:shared]

    def test_an_explicit_number_is_honoured(self, tmp_path: Path):
        _, result = self._add(tmp_path, number=99)
        assert result["id"] == "FR-099"

    def test_a_document_that_does_not_match_its_shape_is_refused(self, tmp_path: Path):
        doc_path = tmp_path / "doc.md"
        doc_path.write_text("# Title\n\nnothing shaped here\n", encoding="utf-8")
        with pytest.raises(CliError, match="does not match its shape"):
            cmd_add_instance(Args(
                doc=str(doc_path), shape=str(REQUIREMENTS_SHAPE),
                section=None, number=None, title="",
            ))
