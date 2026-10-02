"""Tests for `document_shape_cli.py add-row` (spec 0020) — append one row to a shaped document's
table, deterministically.

Business rules (BR-NN), golden scenarios (SCEN-NN), decisions (DL-NN) and a feature's
decomposition are tables that grow one entry at a time. The structured editor can only replace a
whole field, so adding a row meant the caller reading the table, assembling markdown and writing it
back — a hand-built write into a document a person has edited. This verb owns that write.

What these protect, in order of how much it would hurt:
  1. NOTHING ELSE MOVES. Every byte outside the row is unchanged — including CRLF endings and
     non-ASCII text — because the shape library's byte-exactness is why documents are editable.
  2. IDs ARE NEVER REUSED. The next id is found by scanning the whole document, prose included.
  3. A REFUSAL CHANGES NOTHING. Every error leaves the file exactly as it was.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

import document_shape as ds
from document_shape_cli import CliError, cmd_add_row, cmd_read, load_shape

CLI_PATH = Path(__file__).resolve().parent.parent / "document_shape_cli.py"

SHAPE = """\
template: row-demo
version: "1.0"
sections:
  - heading: Rules
    fields:
      - label: Rules
        anchor: section
        type: table
        required: false
        guidance: The rules.
  - heading: Notes
    fields:
      - label: Notes
        anchor: section
        type: longtext
        required: false
        guidance: Notes.
"""

DOC = """\
# Demo

Intro.

## Rules

Some prose that mentions BR-07 in passing.

| ID | Rule | Owner |
|----|------|-------|
| BR-01 | First | Ann |
| BR-02 | Second | Bob |

## Notes

Tail text.
"""


class Args:
    def __init__(self, **kw):
        self.__dict__.update(kw)


@pytest.fixture
def shape_path(tmp_path):
    p = tmp_path / "demo.shape.yaml"
    p.write_text(SHAPE, encoding="utf-8")
    return p


def make_doc(tmp_path, text=DOC, newline="\n"):
    p = tmp_path / "doc.md"
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(text.replace("\n", newline))
    return p


def read_raw(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def add(doc, shape, cells=None, **over):
    args = dict(
        doc=str(doc), shape=str(shape), section="Rules", field="Rules",
        cells=json.dumps(cells if cells is not None else {"Rule": "Third", "Owner": "Cy"}),
        cells_file=None, id_column=None, id_pattern=None,
    )
    args.update(over)
    return cmd_add_row(Args(**args))


class TestAppend:
    def test_appends_exactly_one_row_after_the_last_data_row(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        result = add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        assert result["written"] is True and result["row"] == 3
        text = read_raw(doc)
        assert "| BR-02 | Second | Bob |\n| BR-03 | Third | Cy |\n\n## Notes" in text

    @pytest.mark.parametrize("newline", ["\n", "\r\n"])
    def test_every_other_byte_is_unchanged(self, tmp_path, shape_path, newline):
        doc = make_doc(tmp_path, newline=newline)
        original = read_raw(doc)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        inserted = "| BR-03 | Third | Cy |" + newline
        assert read_raw(doc).replace(inserted, "", 1) == original

    def test_non_ascii_text_survives_and_the_rest_is_still_identical(self, tmp_path, shape_path):
        original = DOC.replace("First", "First — “quoted”")
        doc = make_doc(tmp_path, original)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Café — “ok”", "Owner": "Cy"})
        text = read_raw(doc)
        assert "| BR-03 | Café — “ok” | Cy |" in text
        assert text.replace("| BR-03 | Café — “ok” | Cy |\n", "", 1) == original

    def test_a_crlf_document_gets_crlf_and_never_a_stray_lf(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, newline="\r\n")
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        data = doc.read_bytes()
        assert data.count(b"\n") == data.count(b"\r\n")

    def test_a_document_with_only_lf_stays_only_lf(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        assert b"\r" not in doc.read_bytes()

    def test_the_result_still_reads_as_matched_and_tiles_the_document(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        text = read_raw(doc)
        result = ds.read_document(text, load_shape(shape_path))
        assert result["matched"]
        assert "".join(text[b["start"]:b["end"]] for b in result["blocks"]) == text
        rules = next(b for b in result["blocks"] if b.get("heading") == "Rules")
        assert "| BR-03 | Third | Cy |" in rules["fields"]["Rules"]["value"]

    def test_the_cli_read_afterwards_reports_consistent_byte_offsets(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, DOC.replace("Intro.", "Intro — with an em dash."))
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        out = cmd_read(Args(doc=str(doc), shape=str(shape_path)))
        field = next(b for b in out["blocks"] if b.get("heading") == "Rules")["fields"]["Rules"]
        raw = doc.read_bytes()
        assert raw[field["start"]:field["end"]].decode("utf-8") == field["value"]


class TestIds:
    def test_allocates_the_next_free_id_scanning_the_whole_document_including_prose(self, tmp_path, shape_path):
        # BR-07 appears only in prose, BR-02 is the last row: the next id must be BR-08.
        doc = make_doc(tmp_path)
        result = add(doc, shape_path, {"Rule": "Third", "Owner": "Cy"}, id_column="ID", id_pattern="BR-%02d")
        assert result["id"] == "BR-08"
        assert "| BR-08 | Third | Cy |" in read_raw(doc)

    def test_a_second_call_allocates_the_following_number(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"Rule": "A"}, id_column="ID", id_pattern="BR-%02d")
        assert add(doc, shape_path, {"Rule": "B"}, id_column="ID", id_pattern="BR-%02d")["id"] == "BR-09"

    def test_supplying_the_id_column_as_well_is_refused_and_changes_nothing(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        before = read_raw(doc)
        with pytest.raises(CliError, match="ID"):
            add(doc, shape_path, {"ID": "BR-99", "Rule": "x"}, id_column="ID", id_pattern="BR-%02d")
        assert read_raw(doc) == before

    def test_an_id_column_that_is_not_in_the_header_is_refused(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        before = read_raw(doc)
        with pytest.raises(CliError, match="Nope"):
            add(doc, shape_path, {"Rule": "x"}, id_column="Nope", id_pattern="BR-%02d")
        assert read_raw(doc) == before

    def test_an_id_column_without_a_pattern_is_refused(self, tmp_path, shape_path):
        with pytest.raises(CliError, match="pattern"):
            add(make_doc(tmp_path), shape_path, {"Rule": "x"}, id_column="ID", id_pattern=None)

    def test_without_an_id_column_no_id_is_reported(self, tmp_path, shape_path):
        assert add(make_doc(tmp_path), shape_path, {"ID": "BR-03", "Rule": "x"})["id"] is None


class TestPlaceholders:
    PLACEHOLDER_DOC = DOC.replace(
        "| BR-01 | First | Ann |\n| BR-02 | Second | Bob |\n",
        "| [BR-NN] | [the rule] | [owner] |\n",
    )

    # The contract, after the correctness review of this PR found the first version deleted real rows:
    #   * NOTHING is ever removed unless the caller passes --replace-placeholders;
    #   * and even then only when EVERY data row is a placeholder (a fresh template) — a table with
    #     a single real row in it is never touched;
    #   * a row is a placeholder only when MORE THAN HALF its non-empty cells hold a [bracketed]
    #     or <angle> span.

    def test_a_fresh_templates_placeholder_row_is_replaced_by_the_first_real_row_when_asked(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, self.PLACEHOLDER_DOC)
        result = add(doc, shape_path, {"Rule": "Real", "Owner": "Ann"}, id_column="ID", id_pattern="BR-%02d",
                     replace_placeholders=True)
        text = read_raw(doc)
        assert "[BR-NN]" not in text
        assert "| BR-08 | Real | Ann |" in text
        assert result["replaced_placeholders"] == 1 and result["row"] == 1

    def test_without_the_flag_a_placeholder_row_is_left_exactly_where_it_is(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, self.PLACEHOLDER_DOC)
        result = add(doc, shape_path, {"Rule": "Real", "Owner": "Ann"}, id_column="ID", id_pattern="BR-%02d")
        text = read_raw(doc)
        assert "| [BR-NN] | [the rule] | [owner] |\n| BR-08 | Real | Ann |" in text
        assert result["replaced_placeholders"] == 0 and result["row"] == 2

    def test_a_table_with_any_real_row_loses_nothing_even_with_the_flag(self, tmp_path, shape_path):
        mixed = DOC.replace("| BR-02 | Second | Bob |\n", "| BR-02 | Second | Bob |\n| [BR-NN] | [rule] | [owner] |\n")
        doc = make_doc(tmp_path, mixed)
        before = read_raw(doc)
        result = add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"}, replace_placeholders=True)
        assert result["replaced_placeholders"] == 0
        assert read_raw(doc).replace("| BR-03 | Third | Cy |\n", "", 1) == before

    def test_a_real_row_that_mentions_a_bracket_is_never_deleted_in_a_two_column_table(self, tmp_path, shape_path):
        # The review's first reproduction: one bracketed cell of two is HALF, not a majority.
        two_col = "# Demo\n\n## Rules\n\n| ID | Rule |\n|----|------|\n| BR-01 | [to confirm] |\n\n## Notes\n\nTail.\n"
        doc = make_doc(tmp_path, two_col)
        result = add(doc, shape_path, {"Rule": "z"}, id_column="ID", id_pattern="BR-%02d", replace_placeholders=True)
        text = read_raw(doc)
        assert "| BR-01 | [to confirm] |" in text and "| BR-02 | z |" in text
        assert result["replaced_placeholders"] == 0

    def test_a_half_filled_decision_row_is_never_deleted(self, tmp_path):
        # The review's second reproduction: 3 of 6 cells bracketed is half, not a majority.
        log = ("# Log\n\n| id | decision | owner | opened | due | status |\n|----|----|----|----|----|----|\n"
               "| DL-02 | Which DB? | [name/role] | [YYYY-MM-DD] | [YYYY-MM-DD] | open |\n")
        doc = make_doc(tmp_path, log)
        result = add_by_table(doc, {"decision": "Another"}, id_column="id", id_pattern="DL-%02d", replace_placeholders=True)
        assert "| DL-02 | Which DB? |" in read_raw(doc)
        assert result["replaced_placeholders"] == 0 and result["id"] == "DL-03"

    def test_an_id_in_a_row_that_was_not_removed_still_counts_as_used(self, tmp_path):
        log = ("# Log\n\n| id | decision |\n|----|----|\n| DL-05 | [tbd] |\n| DL-06 | Real one |\n")
        doc = make_doc(tmp_path, log)
        assert add_by_table(doc, {"decision": "x"}, id_column="id", id_pattern="DL-%02d", replace_placeholders=True)["id"] == "DL-07"

    def test_no_placeholder_means_none_reported(self, tmp_path, shape_path):
        assert add(make_doc(tmp_path), shape_path, {"ID": "BR-03", "Rule": "x"})["replaced_placeholders"] == 0

    def test_a_row_with_one_real_cell_is_not_a_placeholder(self, tmp_path, shape_path):
        partly = DOC.replace("| BR-02 | Second | Bob |", "| BR-02 | [to confirm] | Bob |")
        doc = make_doc(tmp_path, partly)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "x"}, replace_placeholders=True)
        assert "| BR-02 | [to confirm] | Bob |" in read_raw(doc)

    def test_the_process_form_accepts_the_flag(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, self.PLACEHOLDER_DOC)
        r = subprocess.run([sys.executable, str(CLI_PATH), "add-row", "--doc", str(doc), "--shape", str(shape_path),
                            "--section", "Rules", "--field", "Rules", "--cells", json.dumps({"Rule": "x"}),
                            "--id-column", "ID", "--id-pattern", "BR-%02d", "--replace-placeholders"],
                           capture_output=True, text=True, encoding="utf-8")
        assert r.returncode == 0, r.stderr
        assert json.loads(r.stdout)["replaced_placeholders"] == 1


class TestCells:
    def test_a_pipe_in_a_value_is_escaped(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "a | b"})
        assert "| BR-03 | a \\| b |  |" in read_raw(doc)

    def test_an_already_escaped_pipe_is_not_escaped_twice(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "a \\| b"})
        assert "a \\| b" in read_raw(doc) and "\\\\|" not in read_raw(doc)

    def test_newlines_become_one_space_and_edges_are_trimmed(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "  line one\nline two\r\n  "})
        assert "| BR-03 | line one line two |  |" in read_raw(doc)

    def test_columns_not_supplied_are_written_empty(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        add(doc, shape_path, {"ID": "BR-03"})
        assert "| BR-03 |  |  |" in read_raw(doc)

    def test_an_unknown_column_is_refused_naming_the_real_ones_and_changes_nothing(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        before = read_raw(doc)
        with pytest.raises(CliError) as err:
            add(doc, shape_path, {"Colour": "red"})
        assert "Colour" in str(err.value) and "Owner" in str(err.value)
        assert read_raw(doc) == before

    def test_no_non_empty_value_is_refused(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        before = read_raw(doc)
        with pytest.raises(CliError, match="empty"):
            add(doc, shape_path, {"Rule": "  ", "Owner": ""})
        assert read_raw(doc) == before

    def test_cells_may_come_from_a_file_so_no_shell_quoting_is_involved(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        cells = tmp_path / "cells.json"
        cells.write_text(json.dumps({"ID": "BR-03", "Rule": "from a file"}), encoding="utf-8")
        args = Args(doc=str(doc), shape=str(shape_path), section="Rules", field="Rules",
                    cells=None, cells_file=str(cells), id_column=None, id_pattern=None)
        cmd_add_row(args)
        assert "| BR-03 | from a file |  |" in read_raw(doc)

    @pytest.mark.parametrize("bad", ["not json", "[1,2]", "\"str\"", ""])
    def test_malformed_cells_are_a_clean_error(self, tmp_path, shape_path, bad):
        with pytest.raises(CliError):
            cmd_add_row(Args(doc=str(make_doc(tmp_path)), shape=str(shape_path), section="Rules", field="Rules",
                             cells=bad, cells_file=None, id_column=None, id_pattern=None))


class TestTableEdges:
    def test_a_table_with_a_header_and_separator_but_no_rows(self, tmp_path, shape_path):
        empty = DOC.replace("| BR-01 | First | Ann |\n| BR-02 | Second | Bob |\n", "")
        doc = make_doc(tmp_path, empty)
        result = add(doc, shape_path, {"ID": "BR-01", "Rule": "First"})
        assert result["row"] == 1
        assert "|----|------|-------|\n| BR-01 | First |  |\n\n## Notes" in read_raw(doc)

    def test_a_table_whose_last_line_has_no_trailing_newline_at_end_of_file(self, tmp_path, shape_path):
        shape_text = SHAPE.replace("  - heading: Notes", "  - heading: Notes")
        no_tail = DOC.split("## Notes")[0].rstrip("\n")  # ends right after the last table row, no newline
        doc = make_doc(tmp_path, no_tail)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third", "Owner": "Cy"})
        assert read_raw(doc) == no_tail + "\n| BR-03 | Third | Cy |"

    def test_a_header_and_separator_only_table_at_end_of_file_without_newline(self, tmp_path, shape_path):
        bare = "# Demo\n\n## Rules\n\n| ID | Rule |\n|----|------|"
        doc = make_doc(tmp_path, bare)
        add(doc, shape_path, {"ID": "BR-01", "Rule": "First"})
        assert read_raw(doc) == bare + "\n| BR-01 | First |"

    def test_only_the_first_table_in_the_field_is_appended_to(self, tmp_path, shape_path):
        two = DOC.replace("\n## Notes", "\nAnother table:\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n\n## Notes")
        doc = make_doc(tmp_path, two)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third"})
        text = read_raw(doc)
        assert "| BR-03 | Third |  |" in text
        assert "| X | Y |\n|---|---|\n| 1 | 2 |\n" in text

    def test_a_table_in_an_earlier_section_is_not_confused_with_the_target(self, tmp_path, shape_path):
        decoy = DOC.replace("## Rules", "| A | B |\n|---|---|\n| 1 | 2 |\n\n## Rules")
        doc = make_doc(tmp_path, decoy)
        add(doc, shape_path, {"ID": "BR-03", "Rule": "Third"})
        text = read_raw(doc)
        assert text.startswith("# Demo\n\nIntro.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## Rules")
        assert "| BR-03 | Third |  |" in text


class TestRefusals:
    def _unchanged(self, tmp_path, shape_path, match, **over):
        doc = make_doc(tmp_path)
        before = read_raw(doc)
        with pytest.raises(CliError, match=match):
            add(doc, shape_path, **over)
        assert read_raw(doc) == before

    def test_a_field_that_is_not_a_table(self, tmp_path, shape_path):
        self._unchanged(tmp_path, shape_path, "not a table", section="Notes", field="Notes")

    def test_a_section_that_is_not_in_the_document(self, tmp_path, shape_path):
        self._unchanged(tmp_path, shape_path, "Missing", section="Missing")

    def test_a_field_that_is_not_in_the_section(self, tmp_path, shape_path):
        self._unchanged(tmp_path, shape_path, "Ghost", field="Ghost")

    def test_a_table_field_that_contains_no_markdown_table(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, DOC.replace(
            "| ID | Rule | Owner |\n|----|------|-------|\n| BR-01 | First | Ann |\n| BR-02 | Second | Bob |\n", "Nothing here.\n"))
        before = read_raw(doc)
        with pytest.raises(CliError, match="no table"):
            add(doc, shape_path)
        assert read_raw(doc) == before

    def test_a_document_that_does_not_match_its_shape(self, tmp_path, shape_path):
        doc = make_doc(tmp_path, "# Something else\n\nNo sections.\n")
        before = read_raw(doc)
        with pytest.raises(CliError):
            add(doc, shape_path)
        assert read_raw(doc) == before


class TestProcess:
    def run(self, *argv):
        return subprocess.run([sys.executable, str(CLI_PATH), *argv], capture_output=True, text=True, encoding="utf-8")

    def test_prints_json_and_exits_zero(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        r = self.run("add-row", "--doc", str(doc), "--shape", str(shape_path), "--section", "Rules", "--field", "Rules",
                     "--cells", json.dumps({"Rule": "Third"}), "--id-column", "ID", "--id-pattern", "BR-%02d")
        assert r.returncode == 0, r.stderr
        assert json.loads(r.stdout)["id"] == "BR-08"

    def test_a_refusal_exits_one_with_a_single_line_on_stderr_and_no_traceback(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        r = self.run("add-row", "--doc", str(doc), "--shape", str(shape_path), "--section", "Notes", "--field", "Notes",
                     "--cells", json.dumps({"x": "y"}))
        assert r.returncode == 1
        assert r.stderr.startswith("Error:") and "Traceback" not in r.stderr


# ---------------------------------------------------------------------------------------------
# Document-addressed mode: no shape, no section — "the Nth table in this document".
#
# Found while shaping the discipline documents: business-rules, golden-scenarios and decision-log
# are a preamble and ONE table with no `## ` heading at all, and a shape can only anchor a field to
# a `## ` heading. Real projects' decision logs have none either, so a shape added to the template
# would never match the documents that already exist. Appending a row needs no shape — only the
# table — so it can address the table by position and work on every such document, old or new.
# ---------------------------------------------------------------------------------------------

HEADINGLESS = """\
# Decision Log
<!-- Phase 1 | Optional artifact -->

> Lives at .sdlc/decision-log.md. DL-09 was mentioned in a note.

---

| id    | decision                  | owner       | opened       | due          | status |
|-------|---------------------------|-------------|--------------|--------------|--------|
| DL-01 | [the open question]       | [name/role] | [YYYY-MM-DD] | [YYYY-MM-DD] | open   |

*Add one row per decision.*
"""


def add_by_table(doc, cells, table_index=0, **over):
    args = dict(doc=str(doc), shape=None, section=None, field=None, table_index=table_index,
                cells=json.dumps(cells), cells_file=None, id_column=None, id_pattern=None)
    args.update(over)
    return cmd_add_row(Args(**args))


class TestDocumentAddressed:
    def test_appends_to_the_table_of_a_document_with_no_headings_and_no_shape(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS)
        result = add_by_table(doc, {"decision": "Fail open or closed?", "owner": "Priya", "opened": "2026-10-02",
                                    "due": "2026-10-06", "status": "open"}, id_column="id", id_pattern="DL-%02d")
        text = read_raw(doc)
        assert result["id"] == "DL-10"  # DL-09 only appears in prose, and is still never reused
        assert "| DL-10 | Fail open or closed? | Priya | 2026-10-02 | 2026-10-06 | open |" in text

    def test_the_template_placeholder_row_is_replaced(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS)
        result = add_by_table(doc, {"decision": "Real"}, id_column="id", id_pattern="DL-%02d", replace_placeholders=True)
        assert "[the open question]" not in read_raw(doc) and result["replaced_placeholders"] == 1

    def test_everything_outside_the_table_rows_is_untouched(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS)
        add_by_table(doc, {"decision": "Real"}, id_column="id", id_pattern="DL-%02d")
        text = read_raw(doc)
        assert text.startswith(HEADINGLESS.split("| id ")[0])
        assert text.endswith("\n*Add one row per decision.*\n")

    def test_a_crlf_document_stays_crlf(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS, newline="\r\n")
        add_by_table(doc, {"decision": "Real"}, id_column="id", id_pattern="DL-%02d")
        data = doc.read_bytes()
        assert data.count(b"\n") == data.count(b"\r\n")

    def test_a_table_index_picks_the_nth_table(self, tmp_path):
        two = HEADINGLESS + "\n| A | B |\n|---|---|\n| 1 | 2 |\n"
        doc = make_doc(tmp_path, two)
        add_by_table(doc, {"A": "3", "B": "4"}, table_index=1)
        assert read_raw(doc).endswith("| 1 | 2 |\n| 3 | 4 |\n")

    def test_a_table_index_past_the_last_table_is_refused_and_changes_nothing(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS)
        before = read_raw(doc)
        with pytest.raises(CliError, match="table"):
            add_by_table(doc, {"decision": "x"}, table_index=3)
        assert read_raw(doc) == before

    def test_a_table_inside_a_code_fence_is_not_a_table(self, tmp_path):
        fenced = "# Doc\n\n```\n| X | Y |\n|---|---|\n| 1 | 2 |\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"
        doc = make_doc(tmp_path, fenced)
        add_by_table(doc, {"A": "3", "B": "4"})
        text = read_raw(doc)
        assert "```\n| X | Y |\n|---|---|\n| 1 | 2 |\n```" in text
        assert text.endswith("| 1 | 2 |\n| 3 | 4 |\n")

    def test_a_document_with_no_table_at_all_is_refused(self, tmp_path):
        doc = make_doc(tmp_path, "# Nothing\n\nJust prose.\n")
        with pytest.raises(CliError, match="no table"):
            add_by_table(doc, {"A": "1"})

    def test_giving_both_a_shape_target_and_a_table_index_is_ambiguous_and_refused(self, tmp_path, shape_path):
        doc = make_doc(tmp_path)
        with pytest.raises(CliError, match="either"):
            cmd_add_row(Args(doc=str(doc), shape=str(shape_path), section="Rules", field="Rules", table_index=0,
                             cells=json.dumps({"Rule": "x"}), cells_file=None, id_column=None, id_pattern=None))

    def test_giving_neither_target_is_refused(self, tmp_path):
        doc = make_doc(tmp_path)
        with pytest.raises(CliError, match="either"):
            cmd_add_row(Args(doc=str(doc), shape=None, section=None, field=None, table_index=None,
                             cells=json.dumps({"Rule": "x"}), cells_file=None, id_column=None, id_pattern=None))

    def test_the_process_form_needs_no_shape_arguments(self, tmp_path):
        doc = make_doc(tmp_path, HEADINGLESS)
        r = subprocess.run([sys.executable, str(CLI_PATH), "add-row", "--doc", str(doc), "--table-index", "0",
                            "--cells", json.dumps({"decision": "Via the CLI"}), "--id-column", "id", "--id-pattern", "DL-%02d"],
                           capture_output=True, text=True, encoding="utf-8")
        assert r.returncode == 0, r.stderr
        assert json.loads(r.stdout)["id"] == "DL-10"


# ---------------------------------------------------------------------------------------------
# The real templates. The synthetic documents above prove the mechanics; these prove the verb on the
# documents it exists for — a FRESH copy of each shipped template — and pin the two things only the
# real rows reveal: a placeholder row keeps a genuine id and status, and uses <angle> as well as
# [bracket] placeholders.
# ---------------------------------------------------------------------------------------------

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "phases" / "01-requirements"


def fresh_copy(tmp_path, name):
    with open(TEMPLATES_DIR / f"{name}.md", encoding="utf-8", newline="") as f:
        text = f.read()
    return make_doc(tmp_path, text.replace("\r\n", "\n"), newline="\n"), text.replace("\r\n", "\n")


def table_lines(text):
    return [line for line in text.splitlines() if line.startswith("|")]


@pytest.mark.parametrize("name, cells, id_column, pattern, expected_id", [
    ("business-rules", {"Condition": "claim over limit", "Outcome": "refer to a manager", "Source": "policy 4.2", "Approver": "Ann"},
     "Rule", "BR-%02d", "BR-01"),
    ("golden-scenarios", {"Input": "a claim for $50", "Expected behavior": "auto-approve"},
     "Scenario", "SCEN-%02d", "SCEN-01"),
    # The decision log's own prose cites `DL-01` as an example, so the first real decision is DL-02:
    # an id mentioned anywhere in the document is never reused.
    ("decision-log", {"decision": "Fail open or closed?", "owner": "Priya", "opened": "2026-10-02", "due (2 business days)": "2026-10-06", "status": "open"},
     "id", "DL-%02d", "DL-02"),
])
def test_a_fresh_copy_of_each_heading_less_template_takes_its_first_real_row(tmp_path, name, cells, id_column, pattern, expected_id):
    doc, original = fresh_copy(tmp_path, name)
    result = add_by_table(doc, cells, id_column=id_column, id_pattern=pattern, replace_placeholders=True)
    text = read_raw(doc)
    assert result["id"] == expected_id
    assert result["replaced_placeholders"] >= 1
    assert not any("[" in line for line in table_lines(text)), "template placeholder rows should be gone"
    assert len(table_lines(text)) == 3  # header, separator, the one real row
    # Everything above the table and everything after it is exactly as the template had it.
    assert text.split("\n| ")[0] == original.split("\n| ")[0]
    assert text.endswith(original[original.rindex("\n\n") + 2:]) or text.endswith(original.split("\n\n")[-1])


def test_a_fresh_feature_brief_takes_a_row_through_its_shape(tmp_path):
    doc, _ = fresh_copy(tmp_path, "feature-brief")
    shape = TEMPLATES_DIR / "feature-brief.shape.yaml"
    heading = "Spec decomposition — owner: Product · one channel per spec"
    result = cmd_add_row(Args(
        doc=str(doc), shape=str(shape), section=heading, field="Spec decomposition", table_index=None,
        cells=json.dumps({"Spec name": "claims-status-page", "Channel": "ag-ui", "Persona": "Claimant",
                          "Proposed risk": "MEDIUM", "Traces to": "FR-004"}),
        cells_file=None, id_column=None, id_pattern=None, replace_placeholders=True))
    text = read_raw(doc)
    assert result["replaced_placeholders"] == 2 and result["row"] == 1
    assert "| claims-status-page | ag-ui | Claimant | MEDIUM | FR-004 |" in text
    rows = "\n".join(table_lines(text))  # the template's guidance prose also mentions these tokens
    assert "[reasoning-core]" not in rows and "<FR-NNN>" not in rows and "[surface-name]" not in rows
    assert ds.read_document(text, load_shape(shape))["matched"]


class TestWhatCountsAsAPlaceholderRow:
    def test_the_decision_log_templates_row_with_a_real_id_and_status_is_a_placeholder(self):
        from document_shape_cli import _is_placeholder_row
        assert _is_placeholder_row("| DL-01 | [the open question] | [name/role] | [YYYY-MM-DD] | [YYYY-MM-DD] | open |")

    def test_a_row_using_angle_placeholders_is_one(self):
        from document_shape_cli import _is_placeholder_row
        assert _is_placeholder_row("| [reasoning-core]   | —         | —         | [HIGH / MEDIUM / LOW] | <FR-NNN>  |")

    def test_a_real_row_with_a_single_bracketed_cell_is_not(self):
        from document_shape_cli import _is_placeholder_row
        assert not _is_placeholder_row("| BR-02 | [to confirm] | Bob |")

    def test_a_markdown_link_is_content_not_a_placeholder(self):
        from document_shape_cli import _is_placeholder_row
        assert not _is_placeholder_row("| BR-02 | [the policy](https://example.com/p) | [the appendix](https://example.com/a) |")

    def test_a_real_html_tag_is_content_not_a_placeholder(self):
        from document_shape_cli import _is_placeholder_row
        assert not _is_placeholder_row("| BR-02 | line one<br>line two | <b>Bob</b> |")

    def test_a_row_of_ordinary_text_is_not(self):
        from document_shape_cli import _is_placeholder_row
        assert not _is_placeholder_row("| BR-01 | First | Ann |")
