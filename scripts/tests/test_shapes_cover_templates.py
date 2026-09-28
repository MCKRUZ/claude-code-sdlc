"""Drift guard: a shape must account for every `## ` section its template has.

A shape used to cover only the sections the phase gate requires, which left about half of every
real document as raw text in Studio, and nothing noticed. This turns that into a test failure:
add a `## ` section to a shaped template without adding it to the shape and this fails, naming
the template and the heading.

A section a *person* adds to their own document needs no shape entry — the library shows it as
an editable section automatically (see document_shape.py). This test is about the plugin's own
templates staying in step with their shapes.
"""

import re
from pathlib import Path

import pytest
import yaml

TEMPLATES = Path(__file__).resolve().parents[2] / "templates"

# Headings a template carries that are deliberately not shape sections, each with its reason.
NOT_SHAPE_SECTIONS = {
    ("release-notes.md", "[Version X.Y.Z] — [YYYY-MM-DD]"):
        "the raw placeholder for a repeating version heading; the shape matches real version "
        "headings by heading_pattern, which the placeholder text can never satisfy",
}

H2 = re.compile(r"^## +(.+?)\s*$")


def _shape_paths():
    return sorted(p for p in TEMPLATES.rglob("*.shape.yaml") if not p.name.startswith("_"))


def _template_headings(template: Path) -> list[str]:
    headings, in_fence = [], False
    for line in template.read_text(encoding="utf-8").splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
        elif not in_fence and (m := H2.match(line)):
            headings.append(m.group(1))
    return headings


@pytest.mark.parametrize("shape_path", _shape_paths(), ids=lambda p: p.name.removesuffix(".shape.yaml"))
def test_every_template_section_is_in_its_shape(shape_path):
    template = shape_path.with_name(shape_path.name.replace(".shape.yaml", ".md"))
    assert template.exists(), f"{shape_path.name} has no template {template.name} beside it"

    sections = yaml.safe_load(shape_path.read_text(encoding="utf-8")).get("sections") or []
    declared = {s["heading"] for s in sections if "heading" in s}
    patterns = [re.compile(s["heading_pattern"]) for s in sections if "heading_pattern" in s]

    unshaped = [
        h for h in _template_headings(template)
        if h not in declared
        and not any(p.search(h) for p in patterns)
        and (template.name, h) not in NOT_SHAPE_SECTIONS
    ]
    assert not unshaped, (
        f"{template.name} has section(s) its shape does not declare: {unshaped}. "
        f"Add each to {shape_path.name} (as required: false unless the gate must enforce it)."
    )


def test_every_exemption_names_a_real_heading():
    """An exemption for a heading the template no longer has is dead weight that would quietly
    excuse a future section of the same name."""
    for template_name, heading in NOT_SHAPE_SECTIONS:
        matches = [t for t in TEMPLATES.rglob(template_name)]
        assert matches, f"exemption names a template that does not exist: {template_name}"
        assert any(heading in _template_headings(t) for t in matches), (
            f"exemption {heading!r} is not a heading of {template_name} any more — remove it"
        )
