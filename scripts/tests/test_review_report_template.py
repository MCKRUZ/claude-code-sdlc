"""The shared review-report template (spec 0020) against the two things that must keep working:
`record_findings.py`, which reads its `## Gate Results` block mechanically, and `add-row`, which is
how Studio will append a finding without hand-assembling markdown.

If the template's heading, column order or table layout drifted from what the parser expects, a
review would silently produce no recorded findings. These tests make that a failure here instead.
"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from document_shape_cli import cmd_add_row
from record_findings import FINDING_COLUMNS, parse_findings_block

ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATE = ROOT / "templates" / "review-report.md"
SHAPE = ROOT / "templates" / "review-report.shape.yaml"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "documents" / "review-report.md"


def raw(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def test_the_filled_fixture_is_ingested_by_the_real_parser():
    findings, error = parse_findings_block(raw(FIXTURE))
    assert error is None
    assert [f["id"] for f in findings] == ["F1", "F2", "F3"]
    assert [f["category"] for f in findings] == ["missing-rollback", "auth-gap", "untestable-criterion"]
    assert {f["severity"] for f in findings} == {"HIGH", "MEDIUM"}


def test_the_table_columns_are_exactly_the_ones_the_parser_reads():
    header = next(line for line in raw(TEMPLATE).splitlines() if line.startswith("| id"))
    assert tuple(c.strip() for c in header.strip("|").split("|")) == FINDING_COLUMNS


def test_a_fresh_template_with_no_findings_is_reported_as_incomplete_not_as_a_clean_review(tmp_path):
    findings, error = parse_findings_block(raw(TEMPLATE))
    assert findings == [] and "no finding rows" in error


def test_add_row_builds_a_parseable_report_one_finding_at_a_time(tmp_path):
    doc = tmp_path / "review-report.md"
    doc.write_bytes(TEMPLATE.read_bytes())

    def add(**cells):
        return cmd_add_row(SimpleNamespace(
            doc=str(doc), shape=str(SHAPE), section="Gate Results", field="Gate Results", table_index=None,
            cells=json.dumps(cells), cells_file=None, id_column="id", id_pattern="F%d"))

    assert add(category="missing-rollback", severity="HIGH", target="design-doc.md:88", disposition="OPEN",
               detail="no rollback for the migration")["id"] == "F1"
    assert add(category="auth-gap", severity="HIGH", target="api-contracts.md:120", disposition="OPEN",
               detail="offline refresh undefined")["id"] == "F2"

    findings, error = parse_findings_block(raw(doc))
    assert error is None
    assert [(f["id"], f["category"], f["severity"]) for f in findings] == [
        ("F1", "missing-rollback", "HIGH"), ("F2", "auth-gap", "HIGH")]
