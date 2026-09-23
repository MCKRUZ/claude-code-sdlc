"""Validate a template shape file against templates/_shape-schema.yaml's rules (spec 0007).

Every error names the line it came from — the shape file's own acceptance check — so this
does NOT run the shape through `jsonschema` (whose error paths are JSON-pointer-shaped, not
line numbers). Instead it parses with a line-tracking YAML loader and checks directly, the
same choice `cadence_plan.py` made for the same reason (spec 0003).

Usage: validate_shape.py <shape.yaml>
"""

import re
import sys
from pathlib import Path

import yaml

FIELD_TYPES = ("text", "longtext", "enum", "boolean", "number", "date", "checklist", "table")
ANCHOR_TYPES = ("inline", "labeled_block", "section")


class _LineLoader(yaml.SafeLoader):
    """A SafeLoader that stamps every mapping with its own 1-indexed source line as
    `__line__`, so validation errors can name the line without a second parse pass."""


def _construct_mapping(loader: yaml.SafeLoader, node: yaml.Node, deep: bool = False) -> dict:
    mapping = yaml.SafeLoader.construct_mapping(loader, node, deep=deep)
    mapping["__line__"] = node.start_mark.line + 1
    return mapping


_LineLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def load_shape_with_lines(text: str) -> dict:
    return yaml.load(text, Loader=_LineLoader)


def _line(node, default: int = 1) -> int:
    return node.get("__line__", default) if isinstance(node, dict) else default


def validate_shape_text(text: str) -> list[str]:
    """Every finding is 'line N: message'. Empty list = valid."""
    try:
        shape = load_shape_with_lines(text)
    except yaml.YAMLError as e:
        return [f"line 1: YAML parse error: {e}"]

    if not isinstance(shape, dict):
        return ["line 1: shape must be a YAML mapping"]

    errors: list[str] = []
    root_line = _line(shape)

    for key in ("template", "version", "sections"):
        if key not in shape:
            errors.append(f"line {root_line}: missing required top-level field '{key}'")

    if "template" in shape and not re.match(r"^[a-z0-9][a-z0-9-]*$", str(shape["template"])):
        errors.append(f"line {root_line}: 'template' must be kebab-case (a-z, 0-9, hyphens)")
    if "version" in shape and not re.match(r"^\d+\.\d+$", str(shape["version"])):
        errors.append(f"line {root_line}: 'version' must be MAJOR.MINOR (e.g. \"1.0\")")

    sections = shape.get("sections")
    if sections is None:
        return errors
    if not isinstance(sections, list) or not sections:
        errors.append(f"line {root_line}: 'sections' must be a non-empty list")
        return errors

    seen_headings: dict[str, int] = {}
    for sec in sections:
        if not isinstance(sec, dict):
            errors.append(f"line {root_line}: each entry in 'sections' must be a mapping")
            continue
        sec_line = _line(sec)
        heading = sec.get("heading")
        pattern = sec.get("heading_pattern")
        if heading and pattern:
            errors.append(f"line {sec_line}: section has both 'heading' and 'heading_pattern' — exactly one")
        elif not heading and not pattern:
            errors.append(f"line {sec_line}: section missing 'heading' (or 'heading_pattern')")
        else:
            identity = heading or pattern
            if identity in seen_headings:
                errors.append(
                    f"line {sec_line}: duplicate section heading '{identity}' "
                    f"(first seen at line {seen_headings[identity]})"
                )
            else:
                seen_headings[identity] = sec_line
        if pattern:
            try:
                re.compile(pattern)
            except re.error as e:
                errors.append(f"line {sec_line}: 'heading_pattern' is not a valid regex: {e}")

        if sec.get("repeats"):
            numbering = sec.get("numbering")
            if not isinstance(numbering, dict) or not (numbering.get("pattern") or "").strip():
                name = heading or pattern
                section_label = f"'{name}'" if name else "(unnamed)"
                errors.append(
                    f"line {sec_line}: section {section_label} repeats but has no numbering.pattern"
                )

        for field in sec.get("fields") or []:
            if not isinstance(field, dict):
                errors.append(f"line {sec_line}: each entry in 'fields' must be a mapping")
                continue
            f_line = _line(field, sec_line)

            label = field.get("label")
            if not isinstance(label, str) or not label.strip():
                errors.append(f"line {f_line}: field missing 'label'")

            ftype = field.get("type")
            if ftype not in FIELD_TYPES:
                errors.append(
                    f"line {f_line}: unknown field type '{ftype}' "
                    f"(must be one of {', '.join(FIELD_TYPES)})"
                )

            anchor = field.get("anchor", "inline")
            if anchor not in ANCHOR_TYPES:
                errors.append(
                    f"line {f_line}: unknown anchor '{anchor}' "
                    f"(must be one of {', '.join(ANCHOR_TYPES)})"
                )

            if "required" not in field or not isinstance(field.get("required"), bool):
                errors.append(f"line {f_line}: field 'required' must be true or false")

            if not (field.get("guidance") or "").strip():
                errors.append(f"line {f_line}: field missing 'guidance'")

    return errors


def main():
    if len(sys.argv) < 2:
        print("Usage: validate_shape.py <shape.yaml>")
        sys.exit(1)

    shape_path = Path(sys.argv[1])
    if not shape_path.exists():
        print(f"Error: {shape_path} not found")
        sys.exit(1)

    errors = validate_shape_text(shape_path.read_text(encoding="utf-8"))

    if errors:
        print(f"FAIL — {len(errors)} error(s) in {shape_path.name}:")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print(f"PASS — {shape_path.name} is a valid shape")
        sys.exit(0)


if __name__ == "__main__":
    main()
