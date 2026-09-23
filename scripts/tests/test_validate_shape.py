"""Tests for validate_shape.py — every error must name the line it came from (spec 0007's
own acceptance check), so these assert on the reported line number, not just the message."""

import pytest

import validate_shape as vs

VALID = """\
template: requirements
version: "1.0"
sections:
  - heading: Overview
    fields:
      - label: Project
        anchor: inline
        type: text
        required: true
        guidance: The project name
  - heading: Functional Requirements
    repeats: true
    numbering:
      pattern: "FR-%03d"
    fields:
      - label: Requirement
        anchor: labeled_block
        type: longtext
        required: true
        guidance: The SHALL statement
"""


class TestValidShape:
    def test_no_errors(self):
        assert vs.validate_shape_text(VALID) == []


class TestMissingTopLevelFields:
    def test_missing_template(self):
        text = VALID.replace('template: requirements\n', '')
        errors = vs.validate_shape_text(text)
        assert any("missing required top-level field 'template'" in e for e in errors)

    def test_bad_version_format(self):
        text = VALID.replace('version: "1.0"', 'version: "v1"')
        errors = vs.validate_shape_text(text)
        assert any("MAJOR.MINOR" in e for e in errors)

    def test_bad_template_id(self):
        text = VALID.replace("template: requirements", "template: Not_Kebab")
        errors = vs.validate_shape_text(text)
        assert any("kebab-case" in e for e in errors)


class TestUnknownFieldType:
    def test_names_the_line(self):
        # __line__ is the mapping's own start (its first key, "label:") — the field entry
        # the error is about, not necessarily the specific "type:" sub-key's own line.
        text = VALID.replace("type: text", "type: bogus")
        errors = vs.validate_shape_text(text)
        assert len(errors) == 1
        assert "line 6:" in errors[0]
        assert "unknown field type 'bogus'" in errors[0]


class TestDuplicateSectionHeading:
    def test_names_both_lines(self):
        text = VALID.replace("heading: Functional Requirements", "heading: Overview")
        errors = vs.validate_shape_text(text)
        dup = [e for e in errors if "duplicate section heading" in e]
        assert len(dup) == 1
        assert "line 11:" in dup[0] and "line 4" in dup[0]


class TestRepeatingSectionNoNumbering:
    def test_names_the_line(self):
        text = VALID.replace('    numbering:\n      pattern: "FR-%03d"\n', "")
        errors = vs.validate_shape_text(text)
        assert any("repeats but has no numbering.pattern" in e for e in errors)


class TestFieldRequiredFlags:
    def test_missing_label(self):
        text = VALID.replace("      - label: Project\n", "      -\n")
        errors = vs.validate_shape_text(text)
        assert any("missing 'label'" in e for e in errors)

    def test_missing_guidance(self):
        text = VALID.replace("        guidance: The project name\n", "")
        errors = vs.validate_shape_text(text)
        assert any("missing 'guidance'" in e for e in errors)

    def test_required_must_be_boolean(self):
        text = VALID.replace("        required: true\n", "        required: yes-please\n", 1)
        errors = vs.validate_shape_text(text)
        assert any("'required' must be true or false" in e for e in errors)

    def test_unknown_anchor(self):
        text = VALID.replace("anchor: inline", "anchor: bogus")
        errors = vs.validate_shape_text(text)
        assert any("unknown anchor 'bogus'" in e for e in errors)


class TestHeadingPattern:
    def test_valid_heading_pattern_section(self):
        text = VALID.replace('heading: Overview', 'heading_pattern: "^v\\\\d+\\\\.\\\\d+"')
        assert vs.validate_shape_text(text) == []

    def test_both_heading_and_pattern_is_an_error(self):
        text = VALID.replace(
            "  - heading: Overview\n", '  - heading: Overview\n    heading_pattern: "^x"\n',
        )
        errors = vs.validate_shape_text(text)
        assert any("both 'heading' and 'heading_pattern'" in e for e in errors)

    def test_neither_heading_nor_pattern_is_an_error(self):
        text = VALID.replace("  - heading: Overview\n", "  -\n")
        errors = vs.validate_shape_text(text)
        assert any("missing 'heading'" in e for e in errors)

    def test_invalid_regex_is_reported(self):
        text = VALID.replace("  - heading: Overview\n", '  - heading_pattern: "[unclosed"\n')
        errors = vs.validate_shape_text(text)
        assert any("not a valid regex" in e for e in errors)


class TestMalformedYaml:
    def test_parse_error_reported_not_raised(self):
        errors = vs.validate_shape_text("template: [unclosed")
        assert len(errors) == 1
        assert "YAML parse error" in errors[0]

    def test_non_mapping_root(self):
        errors = vs.validate_shape_text("- just\n- a\n- list\n")
        assert errors == ["line 1: shape must be a YAML mapping"]

    def test_sections_not_a_list(self):
        text = VALID.split("sections:")[0] + "sections: not-a-list\n"
        errors = vs.validate_shape_text(text)
        assert any("'sections' must be a non-empty list" in e for e in errors)

    def test_empty_sections_list(self):
        text = VALID.split("sections:")[0] + "sections: []\n"
        errors = vs.validate_shape_text(text)
        assert any("'sections' must be a non-empty list" in e for e in errors)


class TestMainCli:
    def test_valid_file_exits_zero(self, tmp_path, capsys):
        p = tmp_path / "x.shape.yaml"
        p.write_text(VALID, encoding="utf-8")
        import sys
        sys.argv = ["validate_shape.py", str(p)]
        with pytest.raises(SystemExit) as exc:
            vs.main()
        assert exc.value.code == 0
        assert "PASS" in capsys.readouterr().out

    def test_invalid_file_exits_one(self, tmp_path, capsys):
        p = tmp_path / "x.shape.yaml"
        p.write_text(VALID.replace("type: text", "type: bogus"), encoding="utf-8")
        import sys
        sys.argv = ["validate_shape.py", str(p)]
        with pytest.raises(SystemExit) as exc:
            vs.main()
        assert exc.value.code == 1
        assert "FAIL" in capsys.readouterr().out

    def test_missing_file_exits_one(self, tmp_path, capsys):
        import sys
        sys.argv = ["validate_shape.py", str(tmp_path / "nope.yaml")]
        with pytest.raises(SystemExit) as exc:
            vs.main()
        assert exc.value.code == 1
