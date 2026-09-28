"""Tests for document_shape.py — the read/write library a wrong write in HIGH-risk spec
0007 depends on being trustworthy.

Every read_document() test asserts the block-tiling invariant (concatenating every block's
own [start:end) slice of the ORIGINAL text reconstructs it exactly) — this is the "nothing
is dropped" acceptance check, checked mechanically rather than trusted by inspection.
"""

import pytest

import document_shape as ds

CRLF_DOC = (
    "# Title\r\n"
    "\r\n"
    "## Overview\r\n"
    "\r\n"
    "**Project:** Acme\r\n"
    "**Status:** Draft\r\n"
    "\r\n"
    "## Notes\r\n"
    "\r\n"
    "Free prose here.\r\n"
)

LF_DOC = CRLF_DOC.replace("\r\n", "\n")


def _assert_tiles(text: str, result: dict):
    reconstructed = "".join(text[b["start"]:b["end"]] for b in result["blocks"])
    assert reconstructed == text


class TestLineEnd:
    def test_crlf(self):
        assert ds._line_end("a\r\nb", 1) == 3

    def test_lf(self):
        assert ds._line_end("a\nb", 1) == 2

    def test_cr_only(self):
        assert ds._line_end("a\rb", 1) == 2

    def test_eof_no_terminator(self):
        assert ds._line_end("abc", 3) == 3


class TestFindHeadingSpans:
    def test_crlf_and_lf_both_locate_the_same_headings(self):
        for text in (CRLF_DOC, LF_DOC):
            spans = ds.find_heading_spans(ds.HEADING2_RE, text)
            assert [h for h, *_ in spans] == ["Overview", "Notes"]

    def test_body_end_is_next_heading_start(self):
        spans = ds.find_heading_spans(ds.HEADING2_RE, CRLF_DOC)
        overview = spans[0]
        assert CRLF_DOC[overview[1]:overview[1] + 2] == "##"  # heading_start points at '##'


class TestPatternToRegex:
    def test_matches_and_captures_digits(self):
        regex = ds.pattern_to_regex("FR-%03d")
        m = regex.match("FR-001: Something")
        assert m and m.group(1) == "001"

    def test_no_placeholder_raises(self):
        with pytest.raises(ds.ShapeError):
            ds.pattern_to_regex("FR-NNN")


class TestNextFreeNumber:
    def test_no_existing_numbers_starts_at_one(self):
        assert ds.next_free_number("nothing here", "FR-%03d") == 1

    def test_finds_max_plus_one(self):
        text = "### FR-001: a\n### FR-003: b\n"
        assert ds.next_free_number(text, "FR-%03d") == 4

    def test_number_only_in_free_text_still_counts(self):
        text = "Some prose mentions FR-010 in passing, no heading at all.\n"
        assert ds.next_free_number(text, "FR-%03d") == 11


class TestStamp:
    def test_no_stamp_is_none(self):
        assert ds.read_stamp(CRLF_DOC) is None

    def test_stamp_document_then_read_stamp_roundtrips(self):
        stamped = ds.stamp_document(CRLF_DOC, "requirements", "1.0")
        assert ds.read_stamp(stamped) == ("requirements", "1.0")

    def test_stamp_placed_right_after_title_preserving_crlf(self):
        stamped = ds.stamp_document(CRLF_DOC, "requirements", "1.0")
        assert stamped.startswith("# Title\r\n<!-- template: requirements v1.0 -->\r\n")

    def test_stamp_placed_right_after_title_preserving_lf(self):
        stamped = ds.stamp_document(LF_DOC, "requirements", "1.0")
        assert stamped.startswith("# Title\n<!-- template: requirements v1.0 -->\n")

    def test_double_stamp_refused(self):
        stamped = ds.stamp_document(CRLF_DOC, "requirements", "1.0")
        with pytest.raises(ds.ShapeError):
            ds.stamp_document(stamped, "requirements", "1.0")

    def test_no_title_refused(self):
        with pytest.raises(ds.ShapeError):
            ds.stamp_document("no title line here\n", "requirements", "1.0")


class TestReadDocumentFlatSections:
    SHAPE = {"sections": [
        {"heading": "Overview", "fields": [
            {"label": "Project", "anchor": "inline", "type": "text", "required": True},
            {"label": "Status", "anchor": "inline", "type": "enum", "required": True},
        ]},
        {"heading": "Notes", "fields": []},
    ]}

    def test_matches_and_tiles(self):
        result = ds.read_document(CRLF_DOC, self.SHAPE)
        assert result["matched"] is True
        _assert_tiles(CRLF_DOC, result)

    def test_inline_field_values(self):
        result = ds.read_document(CRLF_DOC, self.SHAPE)
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        assert overview["fields"]["Project"]["value"] == "Acme"
        assert overview["fields"]["Status"]["value"] == "Draft"

    def test_missing_field_is_none(self):
        shape = {"sections": [{"heading": "Overview", "fields": [
            {"label": "Nonexistent", "anchor": "inline", "type": "text", "required": False},
        ]}]}
        result = ds.read_document(CRLF_DOC, shape)
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        assert overview["fields"]["Nonexistent"] is None

    def test_heading_mismatch_falls_back_to_whole_document_free_text(self):
        shape = {"sections": [{"heading": "Renamed Section", "fields": []}]}
        result = ds.read_document(CRLF_DOC, shape)
        assert result["matched"] is False
        assert "Renamed Section" in result["warnings"][0]
        assert result["blocks"] == [{"kind": "free_text", "start": 0, "end": len(CRLF_DOC), "text": CRLF_DOC}]

    def test_extra_undeclared_headings_do_not_break_the_match(self):
        shape = {"sections": [{"heading": "Overview", "fields": []}]}
        result = ds.read_document(CRLF_DOC, shape)
        assert result["matched"] is True
        _assert_tiles(CRLF_DOC, result)
        kinds = [b["kind"] for b in result["blocks"]]
        assert kinds.count("free_text") >= 1  # the title above the first section


class TestOptionalSectionsMayBeAbsent:
    """A section whose every field is optional may be missing from a document — a person
    trimmed it, or the document predates the section. That must not throw the whole document
    back to raw text; only a missing REQUIRED section does."""

    OPTIONAL = {"heading": "Notes", "fields": [
        {"label": "Body", "anchor": "section", "type": "longtext", "required": False},
    ]}
    REQUIRED_OVERVIEW = {"heading": "Overview", "fields": [
        {"label": "Project", "anchor": "inline", "type": "text", "required": True},
    ]}
    DOC_WITHOUT_NOTES = "# Title\r\n\r\n## Overview\r\n\r\n**Project:** Acme\r\n"

    def test_absent_optional_section_still_matches(self):
        shape = {"sections": [self.REQUIRED_OVERVIEW, self.OPTIONAL]}
        result = ds.read_document(self.DOC_WITHOUT_NOTES, shape)
        assert result["matched"] is True
        assert result["warnings"] == []
        _assert_tiles(self.DOC_WITHOUT_NOTES, result)

    def test_absent_optional_section_produces_no_block(self):
        shape = {"sections": [self.REQUIRED_OVERVIEW, self.OPTIONAL]}
        result = ds.read_document(self.DOC_WITHOUT_NOTES, shape)
        assert [b.get("heading") for b in result["blocks"] if b["kind"] == "section"] == ["Overview"]

    def test_absent_required_section_still_falls_back_to_free_text(self):
        doc = "# Title\r\n\r\n## Notes\r\n\r\nhi\r\n"
        shape = {"sections": [self.REQUIRED_OVERVIEW, self.OPTIONAL]}
        result = ds.read_document(doc, shape)
        assert result["matched"] is False
        assert "Overview" in result["warnings"][0]
        assert result["blocks"] == [{"kind": "free_text", "start": 0, "end": len(doc), "text": doc}]

    def test_section_with_one_required_field_is_required(self):
        mixed = {"heading": "Notes", "fields": [
            {"label": "Body", "anchor": "section", "type": "longtext", "required": False},
            {"label": "Owner", "anchor": "inline", "type": "text", "required": True},
        ]}
        result = ds.read_document(self.DOC_WITHOUT_NOTES, {"sections": [self.REQUIRED_OVERVIEW, mixed]})
        assert result["matched"] is False

    def test_section_declaring_no_fields_is_treated_as_required(self):
        # Nothing says it is optional, so the original strict behaviour stands.
        bare = {"heading": "Notes", "fields": []}
        result = ds.read_document(self.DOC_WITHOUT_NOTES, {"sections": [self.REQUIRED_OVERVIEW, bare]})
        assert result["matched"] is False

    def test_absent_optional_pattern_section_is_skipped(self):
        optional_pattern = {"heading_pattern": r"^v\d+\.\d+", "fields": [
            {"label": "Summary", "anchor": "section", "type": "longtext", "required": False},
        ]}
        result = ds.read_document(self.DOC_WITHOUT_NOTES, {"sections": [self.REQUIRED_OVERVIEW, optional_pattern]})
        assert result["matched"] is True

    def test_present_optional_section_is_still_read_as_a_field(self):
        doc = self.DOC_WITHOUT_NOTES + "\r\n## Notes\r\n\r\nKept.\r\n"
        result = ds.read_document(doc, {"sections": [self.REQUIRED_OVERVIEW, self.OPTIONAL]})
        notes = next(b for b in result["blocks"] if b.get("heading") == "Notes")
        assert notes["fields"]["Body"]["value"] == "Kept.\r\n"
        assert "custom" not in notes


class TestSectionsThePersonAdded:
    """A `## ` section no shape declares is the person's own addition. It is shown as an
    editable section of its own instead of as raw text, and its bytes are addressed exactly
    like any other field's, so an edit touches only them."""

    SHAPE = {"sections": [{"heading": "Overview", "fields": [
        {"label": "Project", "anchor": "inline", "type": "text", "required": True},
    ]}]}
    DOC = (
        "# Title\r\n\r\n"
        "## Overview\r\n\r\n**Project:** Acme\r\n\r\n"
        "## Stakeholder Quotes\r\n\r\n> We lose a day a week.\r\n\r\n"
        "### Source\r\n\r\nInterview, 2026-09-01.\r\n"
    )

    def _custom(self, result):
        return [b for b in result["blocks"] if b.get("custom")]

    def test_an_undeclared_section_becomes_a_custom_section_block(self):
        custom = self._custom(ds.read_document(self.DOC, self.SHAPE))
        assert [b["heading"] for b in custom] == ["Stakeholder Quotes"]
        assert custom[0]["kind"] == "section"

    def test_custom_section_carries_one_whole_body_field(self):
        block = self._custom(ds.read_document(self.DOC, self.SHAPE))[0]
        assert list(block["fields"]) == ["Content"]
        f = block["fields"]["Content"]
        assert f["type"] == "longtext"
        assert f["anchor"] == "section"
        assert f["required"] is False
        assert f["empty"] is False

    def test_custom_field_value_runs_to_the_end_and_keeps_subsections(self):
        f = self._custom(ds.read_document(self.DOC, self.SHAPE))[0]["fields"]["Content"]
        assert f["value"] == (
            "> We lose a day a week.\r\n\r\n### Source\r\n\r\nInterview, 2026-09-01.\r\n"
        )

    def test_custom_blocks_tile_and_sit_in_document_order(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        _assert_tiles(self.DOC, result)
        starts = [b["start"] for b in result["blocks"]]
        assert starts == sorted(starts)

    def test_custom_section_between_two_declared_ones_keeps_its_place(self):
        doc = (
            "## Overview\n\n**Project:** A\n\n"
            "## Mine\n\nmy text\n\n"
            "## Notes\n\nn\n"
        )
        shape = {"sections": [
            {"heading": "Overview", "fields": [
                {"label": "Project", "anchor": "inline", "type": "text", "required": True}]},
            {"heading": "Notes", "fields": [
                {"label": "Body", "anchor": "section", "type": "longtext", "required": True}]},
        ]}
        result = ds.read_document(doc, shape)
        assert [b.get("heading") for b in result["blocks"] if b["kind"] == "section"] == [
            "Overview", "Mine", "Notes"]
        _assert_tiles(doc, result)

    def test_editing_a_custom_field_touches_only_its_own_bytes(self):
        f = self._custom(ds.read_document(self.DOC, self.SHAPE))[0]["fields"]["Content"]
        edited = ds.write_document(self.DOC, [(f["start"], f["end"], "Rewritten.\r\n")])
        assert edited == self.DOC[: f["start"]] + "Rewritten.\r\n" + self.DOC[f["end"]:]
        assert "**Project:** Acme" in edited

    def test_empty_custom_section_reads_as_empty(self):
        doc = "## Overview\n\n**Project:** A\n\n## Blank\n"
        f = self._custom(ds.read_document(doc, self.SHAPE))[0]["fields"]["Content"]
        assert f["empty"] is True

    def test_no_custom_blocks_when_every_heading_is_declared(self):
        doc = "## Overview\n\n**Project:** A\n"
        assert self._custom(ds.read_document(doc, self.SHAPE)) == []

    def test_a_mismatched_document_still_falls_back_with_no_custom_blocks(self):
        shape = {"sections": [{"heading": "Renamed Section", "fields": []}]}
        result = ds.read_document(self.DOC, shape)
        assert result["matched"] is False
        assert self._custom(result) == []

    def test_a_repeating_sections_subheadings_are_not_custom_sections(self):
        doc = "## Requirements\n\n### FR-001: a\n\n**Priority:** P0\n"
        shape = {"sections": [{
            "heading": "Requirements", "repeats": True, "numbering": {"pattern": "FR-%03d"},
            "fields": [{"label": "Priority", "anchor": "inline", "type": "text", "required": True}],
        }]}
        assert self._custom(ds.read_document(doc, shape)) == []


class TestReadDocumentLabeledBlockAndSectionAnchors:
    DOC = (
        "# Title\r\n\r\n"
        "## Decision\r\n"
        "<!-- REQUIRED: what was decided -->\r\n"
        "We will use PostgreSQL.\r\n"
        "\r\n"
        "## FR\r\n"
        "**Requirement:**\r\n"
        "<!-- REQUIRED: the SHALL statement -->\r\n"
        "> The system SHALL do the thing.\r\n"
        "\r\n"
        "**Dependencies:** none\r\n"
    )
    SHAPE = {"sections": [
        {"heading": "Decision", "fields": [
            {"label": "Decision", "anchor": "section", "type": "longtext", "required": True},
        ]},
        {"heading": "FR", "fields": [
            {"label": "Requirement", "anchor": "labeled_block", "type": "longtext", "required": True},
            {"label": "Dependencies", "anchor": "inline", "type": "text", "required": False},
        ]},
    ]}

    def test_tiles(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        _assert_tiles(self.DOC, result)

    def test_section_anchor_skips_the_required_comment(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        decision = next(b for b in result["blocks"] if b.get("heading") == "Decision")
        assert decision["fields"]["Decision"]["value"] == "We will use PostgreSQL.\r\n\r\n"

    def test_labeled_block_skips_the_required_comment_and_stops_before_next_field(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        fr = next(b for b in result["blocks"] if b.get("heading") == "FR")
        assert fr["fields"]["Requirement"]["value"] == "> The system SHALL do the thing.\r\n\r\n"
        assert fr["fields"]["Dependencies"]["value"] == "none"

    def test_empty_flag(self):
        doc = self.DOC.replace("We will use PostgreSQL.\r\n", "")
        result = ds.read_document(doc, self.SHAPE)
        decision = next(b for b in result["blocks"] if b.get("heading") == "Decision")
        assert decision["fields"]["Decision"]["empty"] is True


class TestSectionAnchorAlongsideALabelledSibling:
    """A section-anchored field must not swallow a labelled sibling's bytes.

    `problem-statement.shape.yaml` really does this: the Five Whys chain is unlabelled prose
    (so, a section anchor) and `**Root Cause Statement:**` is an inline field at the end of
    the SAME section. Before this was bounded, the two spans nested — the inline field's
    bytes sat inside the section field's — which an editor cannot render honestly: it would
    show the same sentence as two separately-editable fields, where saving one silently
    reverts the other.

    The rule is the one `labeled_block` already follows: a field's value stops where the next
    recognized field's label line begins.
    """

    DOC = (
        "# Title\r\n\r\n"
        "## Root Cause\r\n"
        "<!-- REQUIRED: the chain -->\r\n"
        "\r\n"
        "1. **Why?** Because of the thing.\r\n"
        "\r\n"
        "**Root Cause Statement:** No automated check rejects it.\r\n"
    )
    SHAPE = {"sections": [
        {"heading": "Root Cause", "fields": [
            {"label": "Chain", "anchor": "section", "type": "longtext", "required": True},
            {"label": "Root Cause Statement", "anchor": "inline", "type": "text", "required": True},
        ]},
    ]}

    def _fields(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        return next(b for b in result["blocks"] if b.get("heading") == "Root Cause")["fields"]

    def test_tiles(self):
        _assert_tiles(self.DOC, ds.read_document(self.DOC, self.SHAPE))

    def test_section_field_stops_before_the_labelled_sibling(self):
        fields = self._fields()
        assert fields["Chain"]["value"] == "1. **Why?** Because of the thing.\r\n\r\n"

    def test_spans_do_not_overlap(self):
        fields = self._fields()
        chain, statement = fields["Chain"], fields["Root Cause Statement"]
        assert chain["end"] <= statement["start"], (
            f"section span {chain['start']}..{chain['end']} overlaps inline span "
            f"{statement['start']}..{statement['end']}"
        )

    def test_the_labelled_sibling_is_still_read(self):
        assert self._fields()["Root Cause Statement"]["value"] == "No automated check rejects it."

    def test_a_lone_section_field_still_takes_the_whole_body(self):
        """The bound only applies when a labelled sibling was actually FOUND — the ordinary
        one-field-per-section case is unchanged."""
        shape = {"sections": [{"heading": "Root Cause", "fields": [
            {"label": "Chain", "anchor": "section", "type": "longtext", "required": True},
        ]}]}
        result = ds.read_document(self.DOC, shape)
        chain = next(b for b in result["blocks"] if b.get("heading") == "Root Cause")["fields"]["Chain"]
        assert "Root Cause Statement" in chain["value"]

    def test_an_absent_labelled_sibling_does_not_truncate(self):
        shape = {"sections": [{"heading": "Root Cause", "fields": [
            {"label": "Chain", "anchor": "section", "type": "longtext", "required": True},
            {"label": "Nowhere", "anchor": "inline", "type": "text", "required": False},
        ]}]}
        result = ds.read_document(self.DOC, shape)
        fields = next(b for b in result["blocks"] if b.get("heading") == "Root Cause")["fields"]
        assert fields["Nowhere"] is None
        assert "Root Cause Statement" in fields["Chain"]["value"]


class TestReadDocumentRepeatingSections:
    DOC = (
        "# Reqs\r\n\r\n"
        "## Functional Requirements\r\n\r\n"
        "### FR-001: First\r\n"
        "**Priority:** P0\r\n"
        "\r\n"
        "### FR-002: Second\r\n"
        "**Priority:** P1\r\n"
        "\r\n"
        "## Traceability\r\n"
        "irrelevant table here\r\n"
    )
    SHAPE = {"sections": [
        {"heading": "Functional Requirements", "repeats": True,
         "numbering": {"pattern": "FR-%03d"},
         "fields": [{"label": "Priority", "anchor": "inline", "type": "enum", "required": True}]},
    ]}

    def test_tiles(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        _assert_tiles(self.DOC, result)

    def test_two_instances_found_in_order_with_numbers(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        rep = next(b for b in result["blocks"] if b["kind"] == "repeating_section")
        assert [i["number"] for i in rep["instances"]] == [1, 2]
        assert rep["instances"][0]["fields"]["Priority"]["value"] == "P0"
        assert rep["instances"][1]["fields"]["Priority"]["value"] == "P1"

    def test_non_matching_subsection_is_not_an_instance(self):
        doc = self.DOC.replace("### FR-002: Second", "### Unrelated: Second")
        result = ds.read_document(doc, self.SHAPE)
        rep = next(b for b in result["blocks"] if b["kind"] == "repeating_section")
        assert len(rep["instances"]) == 1


class TestHeadingPatternAndSubheading:
    DOC = (
        "# Release Notes\r\n\r\n"
        "## v1.4.0 — 2026-09-23\r\n\r\n"
        "### Summary\r\n"
        "<!-- REQUIRED: x -->\r\n"
        "Adds duplicate-claim rejection.\r\n"
        "\r\n"
        "### New Features\r\n"
        "- Something unshaped, stays free text.\r\n"
        "\r\n"
        "### Breaking Changes\r\n"
        "<!-- REQUIRED: x -->\r\n"
        "None.\r\n"
    )
    SHAPE = {"sections": [
        {"heading_pattern": r"^\[?v?\d+\.\d+\.\d+\]?", "fields": [
            {"label": "Summary", "subheading": "Summary", "anchor": "section",
             "type": "longtext", "required": True},
            {"label": "Breaking Changes", "subheading": "Breaking Changes", "anchor": "section",
             "type": "longtext", "required": True},
        ]},
    ]}

    def test_pattern_matches_the_real_heading(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        assert result["matched"] is True
        sec = result["blocks"][1]
        assert sec["heading"] == "v1.4.0 — 2026-09-23"

    def test_tiles(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        _assert_tiles(self.DOC, result)

    def test_subheading_fields_resolved_against_their_own_span(self):
        result = ds.read_document(self.DOC, self.SHAPE)
        sec = result["blocks"][1]
        assert sec["fields"]["Summary"]["value"] == "Adds duplicate-claim rejection.\r\n\r\n"
        assert sec["fields"]["Breaking Changes"]["value"] == "None.\r\n"

    def test_no_pattern_match_is_a_warning(self):
        shape = {"sections": [{"heading_pattern": r"^NOPE-\d+$", "fields": []}]}
        result = ds.read_document(self.DOC, shape)
        assert result["matched"] is False
        assert "NOPE" in result["warnings"][0]

    def test_missing_subheading_is_none_not_a_crash(self):
        shape = {"sections": [
            {"heading_pattern": r"^\[?v?\d+\.\d+\.\d+\]?", "fields": [
                {"label": "Missing", "subheading": "Nonexistent Subsection", "anchor": "section",
                 "type": "longtext", "required": False},
            ]},
        ]}
        result = ds.read_document(self.DOC, shape)
        assert result["blocks"][1]["fields"]["Missing"] is None

    def test_round_trip_identity(self):
        assert ds.write_document(self.DOC, []) == self.DOC


class TestWriteDocument:
    def test_no_updates_is_byte_identical(self):
        assert ds.write_document(CRLF_DOC, []) == CRLF_DOC

    def test_single_replacement(self):
        result = ds.read_document(CRLF_DOC, TestReadDocumentFlatSections.SHAPE)
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        span = overview["fields"]["Project"]
        out = ds.write_document(CRLF_DOC, [(span["start"], span["end"], "NewCo")])
        assert "**Project:** NewCo\r\n" in out
        assert "**Status:** Draft\r\n" in out  # untouched

    def test_only_the_targeted_bytes_change(self):
        result = ds.read_document(CRLF_DOC, TestReadDocumentFlatSections.SHAPE)
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        span = overview["fields"]["Project"]
        out = ds.write_document(CRLF_DOC, [(span["start"], span["end"], "NewCo")])
        assert out[:span["start"]] == CRLF_DOC[:span["start"]]
        assert out[span["start"] + len("NewCo"):] == CRLF_DOC[span["end"]:]

    def test_multiple_non_overlapping_updates(self):
        result = ds.read_document(CRLF_DOC, TestReadDocumentFlatSections.SHAPE)
        overview = next(b for b in result["blocks"] if b.get("heading") == "Overview")
        p = overview["fields"]["Project"]
        s = overview["fields"]["Status"]
        out = ds.write_document(CRLF_DOC, [(p["start"], p["end"], "NewCo"), (s["start"], s["end"], "Final")])
        assert "**Project:** NewCo\r\n" in out
        assert "**Status:** Final\r\n" in out

    def test_overlapping_updates_refused(self):
        with pytest.raises(ds.ShapeError):
            ds.write_document(CRLF_DOC, [(5, 10, "a"), (8, 12, "b")])


class TestSkipLeadingBlanksAndComments:
    def test_skips_blank_lines_and_comment(self):
        text = "\r\n<!-- REQUIRED: x -->\r\nreal content"
        assert ds._skip_leading_blanks_and_comments(text, 0, len(text)) == text.index("real content")

    def test_no_scaffold_is_a_noop(self):
        text = "real content"
        assert ds._skip_leading_blanks_and_comments(text, 0, len(text)) == 0

    def test_stops_at_end_if_all_blank(self):
        text = "\r\n\r\n"
        assert ds._skip_leading_blanks_and_comments(text, 0, len(text)) == len(text)
