"""Round-trip tests for every shaped template (spec 0007's own acceptance check: this runs
for EACH shaped template, not a sample). Fully data-driven — discovers every
`templates/**/*.shape.yaml`, requires a matching filled fixture at
`scripts/tests/fixtures/documents/<template-id>.md`, and proves:
  1. the shape file itself is valid,
  2. the fixture's headings match the shape (not a free-text fallback),
  3. writing back with zero changes reproduces the fixture byte-for-byte,
  4. every field the shape declares is actually found and filled in the fixture — a shape
     whose fixture never exercises a field it declares is unverified, not proven.

Fixtures are opened with newline="" (no universal-newline translation) — these templates
check out as CRLF, and letting Python's text mode normalize line endings on read would make
every round-trip test pass for the wrong reason.
"""

from pathlib import Path

import pytest
import yaml

import document_shape as ds
import validate_shape as vs

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATES_ROOT = REPO_ROOT / "templates"
FIXTURES_ROOT = Path(__file__).resolve().parent / "fixtures" / "documents"


def _discover_shapes() -> list[Path]:
    return sorted(TEMPLATES_ROOT.rglob("*.shape.yaml"))


SHAPE_PATHS = _discover_shapes()


def _template_id(shape_path: Path) -> str:
    shape = yaml.safe_load(shape_path.read_text(encoding="utf-8"))
    return shape.get("template", shape_path.stem)


def _fixture_path(shape_path: Path) -> Path:
    return FIXTURES_ROOT / f"{_template_id(shape_path)}.md"


def _read_raw(path: Path) -> str:
    """No universal-newline translation — Path.read_text() has no `newline=` kwarg."""
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def _all_field_labels(shape: dict) -> list[tuple[str, str]]:
    """[(section_heading, field_label), ...] — every field the shape declares, for the
    "every declared field actually exercised" check below."""
    out = []
    for sec in shape.get("sections", []):
        heading = sec.get("heading") or sec.get("heading_pattern")
        for f in sec.get("fields", []):
            out.append((heading, f["label"]))
    return out


class TestEveryShapeIsDiscovered:
    def test_at_least_one_shape_exists(self):
        assert SHAPE_PATHS, "no templates/**/*.shape.yaml found — spec 0007 shipped none?"


@pytest.mark.parametrize("shape_path", SHAPE_PATHS, ids=lambda p: p.stem)
class TestShapedTemplateRoundTrip:
    def test_shape_is_valid(self, shape_path):
        errors = vs.validate_shape_text(shape_path.read_text(encoding="utf-8"))
        assert errors == [], f"{shape_path}: {errors}"

    def test_fixture_exists(self, shape_path):
        fixture = _fixture_path(shape_path)
        assert fixture.exists(), f"missing round-trip fixture: {fixture}"

    def test_matches_and_round_trips_byte_identical(self, shape_path):
        fixture = _fixture_path(shape_path)
        if not fixture.exists():
            pytest.skip("covered by test_fixture_exists")
        shape = yaml.safe_load(shape_path.read_text(encoding="utf-8"))
        text = _read_raw(fixture)
        result = ds.read_document(text, shape)
        assert result["matched"], f"{fixture.name} doesn't match {shape_path.name}: {result['warnings']}"
        assert ds.write_document(text, []) == text

    def test_every_declared_field_is_found_and_filled(self, shape_path):
        fixture = _fixture_path(shape_path)
        if not fixture.exists():
            pytest.skip("covered by test_fixture_exists")
        shape = yaml.safe_load(shape_path.read_text(encoding="utf-8"))
        text = _read_raw(fixture)
        result = ds.read_document(text, shape)
        if not result["matched"]:
            pytest.skip("covered by test_matches_and_round_trips_byte_identical")
        # Keyed by label alone, not (heading, label): a `heading_pattern` section's
        # RESOLVED heading text (e.g. "v1.4.0 — 2026-09-23") never equals the pattern
        # string declared in the shape, so heading identity can't be the join key here.
        # Labels are unique per shape in practice — every field belongs to exactly one
        # section — so this is a safe simplification for this "was it exercised" check.
        found = {}
        for block in result["blocks"]:
            if block["kind"] == "section":
                found.update(block["fields"])
            elif block["kind"] == "repeating_section":
                for inst in block["instances"][:1]:  # first instance proves the pattern works
                    found.update(inst["fields"])
        missing = [
            f"{heading} > {label}" for heading, label in _all_field_labels(shape)
            if found.get(label) is None or found[label]["empty"]
        ]
        assert not missing, f"fixture leaves these declared fields empty/unfound: {missing}"

    def test_a_real_write_changes_only_its_own_span(self, shape_path):
        """Exercise the write path for real, not just the zero-update identity case."""
        fixture = _fixture_path(shape_path)
        if not fixture.exists():
            pytest.skip("covered by test_fixture_exists")
        shape = yaml.safe_load(shape_path.read_text(encoding="utf-8"))
        text = _read_raw(fixture)
        result = ds.read_document(text, shape)
        if not result["matched"]:
            pytest.skip("covered by test_matches_and_round_trips_byte_identical")
        target = None
        for block in result["blocks"]:
            if block["kind"] == "section":
                target = next((f for f in block["fields"].values() if f), None)
            elif block["kind"] == "repeating_section" and block["instances"]:
                target = next((f for f in block["instances"][0]["fields"].values() if f), None)
            if target:
                break
        assert target is not None, "fixture has no extractable field to exercise a write against"
        replacement = "REPLACED-FOR-TEST"
        out = ds.write_document(text, [(target["start"], target["end"], replacement)])
        assert out[:target["start"]] == text[:target["start"]]
        assert out[target["start"] + len(replacement):] == text[target["end"]:]
