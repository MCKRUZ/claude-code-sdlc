"""Tests for check_document_completeness.py — the new, separate, advisory check (spec 0007).
Never wired into check_gates.py; every exit path here is 0."""

import sys

import pytest
import yaml

import check_document_completeness as cdc

SHAPE = {
    "template": "adr", "version": "1.0",
    "sections": [
        {"heading": "Decision", "fields": [
            {"label": "Decision", "anchor": "section", "type": "longtext", "required": True,
             "guidance": "x"},
        ]},
        {"heading": "Rationale", "fields": [
            {"label": "Rationale", "anchor": "section", "type": "longtext", "required": False,
             "guidance": "x"},
        ]},
    ],
}

FILLED = "# ADR-001\r\n\r\n## Decision\r\nWe will use PostgreSQL.\r\n\r\n## Rationale\r\nBecause.\r\n"
EMPTY_DECISION = "# ADR-001\r\n\r\n## Decision\r\n\r\n## Rationale\r\nBecause.\r\n"
DELETED_SECTION = "# ADR-001\r\n\r\n## Rationale\r\nBecause.\r\n"


class TestCheckDocument:
    def test_fully_filled_has_no_findings(self):
        assert cdc.check_document(FILLED, SHAPE) == []

    def test_empty_required_field_reported(self):
        findings = cdc.check_document(EMPTY_DECISION, SHAPE)
        assert findings == [{"section": "Decision", "field": "Decision", "reason": "absent or empty"}]

    def test_optional_field_empty_is_not_reported(self):
        text = FILLED.replace("Because.\r\n", "")
        findings = cdc.check_document(text, SHAPE)
        assert findings == []

    def test_deleted_required_section_is_reported(self):
        """The exact gap named in the spec's Why: today's completeness gate passes a
        document with a required section deleted outright."""
        findings = cdc.check_document(DELETED_SECTION, SHAPE)
        assert any(f["reason"] == "section not found" for f in findings)


class TestFormatFindings:
    def test_no_findings(self):
        assert cdc.format_findings([]) == "No missing required fields."

    def test_field_finding(self):
        out = cdc.format_findings([{"section": "Decision", "field": "Decision", "reason": "absent or empty"}])
        assert "Decision > Decision: absent or empty" in out

    def test_section_finding(self):
        out = cdc.format_findings([{"section": "Decision", "field": None, "reason": "section not found"}])
        assert "Decision: section not found" in out


class TestFindShapeForTemplate:
    def test_finds_matching_shape(self, tmp_path):
        (tmp_path / "x.shape.yaml").write_text(yaml.dump(SHAPE), encoding="utf-8")
        found = cdc.find_shape_for_template(tmp_path, "adr")
        assert found == tmp_path / "x.shape.yaml"

    def test_no_match_is_none(self, tmp_path):
        (tmp_path / "x.shape.yaml").write_text(yaml.dump(SHAPE), encoding="utf-8")
        assert cdc.find_shape_for_template(tmp_path, "nope") is None


class TestScanRepo:
    def test_no_artifacts_dir_is_empty(self, tmp_path):
        assert cdc.scan_repo(tmp_path, tmp_path) == {}

    def test_unstamped_document_is_skipped(self, tmp_path, monkeypatch):
        artifacts = tmp_path / ".sdlc" / "artifacts"
        artifacts.mkdir(parents=True)
        (artifacts / "doc.md").write_text("# No stamp here\r\n", encoding="utf-8")
        assert cdc.scan_repo(tmp_path, tmp_path) == {}

    def test_stamped_document_with_a_matching_shape_is_checked(self, tmp_path):
        artifacts = tmp_path / ".sdlc" / "artifacts"
        artifacts.mkdir(parents=True)
        templates = tmp_path / "templates"
        templates.mkdir()
        (templates / "adr.shape.yaml").write_text(yaml.dump(SHAPE), encoding="utf-8")
        (artifacts / "doc.md").write_text(
            "# ADR-001\r\n<!-- template: adr v1.0 -->\r\n\r\n## Decision\r\n\r\n## Rationale\r\nx\r\n",
            encoding="utf-8",
        )
        results = cdc.scan_repo(tmp_path, templates)
        assert "doc.md" in "\n".join(results.keys())  # path is relative, includes .sdlc/artifacts prefix
        assert any(v for v in results.values())

    def test_stamped_document_with_no_matching_shape_is_skipped(self, tmp_path):
        artifacts = tmp_path / ".sdlc" / "artifacts"
        artifacts.mkdir(parents=True)
        (artifacts / "doc.md").write_text(
            "# X\r\n<!-- template: unknown-template v1.0 -->\r\n", encoding="utf-8",
        )
        assert cdc.scan_repo(tmp_path, tmp_path / "templates") == {}


class TestMainCliAlwaysExitsZero:
    def test_single_doc_missing_field_still_exits_zero(self, tmp_path, capsys):
        doc = tmp_path / "doc.md"
        shape = tmp_path / "x.shape.yaml"
        doc.write_text(EMPTY_DECISION, encoding="utf-8")
        shape.write_text(yaml.dump(SHAPE), encoding="utf-8")
        sys.argv = ["check_document_completeness.py", "--doc", str(doc), "--shape", str(shape)]
        with pytest.raises(SystemExit) as exc:
            cdc.main()
        assert exc.value.code == 0
        assert "absent or empty" in capsys.readouterr().out

    def test_missing_shape_flag_exits_zero(self, tmp_path, capsys):
        doc = tmp_path / "doc.md"
        doc.write_text(FILLED, encoding="utf-8")
        sys.argv = ["check_document_completeness.py", "--doc", str(doc)]
        with pytest.raises(SystemExit) as exc:
            cdc.main()
        assert exc.value.code == 0

    def test_scan_mode_no_repo_flag_defaults_to_cwd_and_exits_zero(self, tmp_path, capsys, monkeypatch):
        monkeypatch.chdir(tmp_path)
        sys.argv = ["check_document_completeness.py"]
        with pytest.raises(SystemExit) as exc:
            cdc.main()
        assert exc.value.code == 0
