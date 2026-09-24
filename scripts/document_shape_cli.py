"""Thin CLI wrapper around document_shape.py (spec 0007's library) — a spec 0009
prerequisite. The library is pure Python with no subprocess surface; Studio (a separate
process, written in TypeScript) needs to call it as a program. This wrapper adds no judgment
of its own — it only serializes the library's result to JSON and converts between the
library's Python-string (Unicode code-point) offsets and UTF-8 byte offsets, which is what a
JavaScript/Node caller needs in order to slice a decoded string correctly. Read
document_shape.py's own module docstring for the block model and match semantics this wrapper
is a thin skin over.

Usage:
  document_shape_cli.py read         --doc <path.md> --shape <path.shape.yaml>
  document_shape_cli.py write        --doc <path.md> --updates <path.json>
  document_shape_cli.py next-number  --doc <path.md> --shape <path.shape.yaml> [--section H]
  document_shape_cli.py add-instance --doc <path.md> --shape <path.shape.yaml> [--section H]
                                     [--number N] [--title TEXT]

`next-number` and `add-instance` exist for the repeating blocks a document grows over time
(`### FR-001`, `### FR-002`, ...). Numbers come from the library's own next_free_number(), which
scans the WHOLE document including free text, so an id mentioned only in prose is never reused.
`add-instance` composes the new block from the shape's own field list and inserts it through
write_document(), leaving every other byte untouched — composing that markdown is document-shape
logic, which is why it lives here rather than in whatever calls this.

`write`'s --updates file is a JSON array of [start, end, new_text] triples, with start/end as
UTF-8 BYTE offsets — always the ones `read` emitted for that same document's current content,
never Python string indices and never guessed. `write` takes no --shape: write_document() is a
pure span-replacement operation on the document's own text and does not consult the shape.
Overlapping spans are refused by the library itself (ShapeError), surfaced here as a clean
error, not a traceback.

Both files are always opened with newline="" (per the library's documented requirement) so
line endings are never touched — a Windows CRLF document stays CRLF through a no-op round
trip. Exit 0 on success; exit 1 with a one-line message on stderr for a real failure (bad
path, malformed shape, malformed --updates, an offset that doesn't land on a character
boundary, an overlapping span) — this is a mechanical serialization layer, not a judgment
call, so it does not use the rest of this plugin's "advisory, always exit 0" convention.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import document_shape as ds  # noqa: E402
import yaml  # noqa: E402


class CliError(Exception):
    """A clean, one-line failure this CLI reports on stderr — never a raw traceback."""


def load_shape(shape_path: Path) -> dict:
    if not shape_path.exists():
        raise CliError(f"shape not found: {shape_path}")
    return yaml.safe_load(shape_path.read_text(encoding="utf-8"))


def read_doc_text(doc_path: Path) -> str:
    if not doc_path.exists():
        raise CliError(f"document not found: {doc_path}")
    with open(doc_path, encoding="utf-8", newline="") as f:
        return f.read()


def _build_offset_maps(text: str) -> tuple[list[int], dict[int, int]]:
    """cp_to_byte[i] = the UTF-8 byte offset of code-point index i, for i in 0..len(text).
    byte_to_cp is its inverse, defined only at exact character boundaries — a byte offset
    that splits a multi-byte character has no entry, which is exactly the case a caller
    passing back a stale or hand-edited offset should fail on, not silently misresolve."""
    cp_to_byte = [0] * (len(text) + 1)
    byte_to_cp = {0: 0}
    b = 0
    for i, ch in enumerate(text):
        b += len(ch.encode("utf-8"))
        cp_to_byte[i + 1] = b
        byte_to_cp[b] = i + 1
    return cp_to_byte, byte_to_cp


def _convert_fields(fields: dict, cp_to_byte: list[int]) -> dict:
    out = {}
    for label, f in fields.items():
        if f is None:
            out[label] = None
            continue
        f2 = dict(f)
        f2["start"] = cp_to_byte[f["start"]]
        f2["end"] = cp_to_byte[f["end"]]
        out[label] = f2
    return out


def _convert_blocks(blocks: list[dict], cp_to_byte: list[int]) -> list[dict]:
    out = []
    for block in blocks:
        b = dict(block)
        b["start"] = cp_to_byte[block["start"]]
        b["end"] = cp_to_byte[block["end"]]
        if block["kind"] == "section":
            b["fields"] = _convert_fields(block["fields"], cp_to_byte)
        elif block["kind"] == "repeating_section":
            instances = []
            for inst in block["instances"]:
                inst2 = dict(inst)
                inst2["start"] = cp_to_byte[inst["start"]]
                inst2["end"] = cp_to_byte[inst["end"]]
                inst2["fields"] = _convert_fields(inst["fields"], cp_to_byte)
                instances.append(inst2)
            b["instances"] = instances
        out.append(b)
    return out


def cmd_read(args) -> dict:
    text = read_doc_text(Path(args.doc))
    shape = load_shape(Path(args.shape))
    result = ds.read_document(text, shape)
    cp_to_byte, _ = _build_offset_maps(text)
    return {
        "matched": result["matched"],
        "warnings": result["warnings"],
        "stamp": result["stamp"],
        "blocks": _convert_blocks(result["blocks"], cp_to_byte),
    }


def cmd_write(args) -> dict:
    doc_path = Path(args.doc)
    text = read_doc_text(doc_path)

    updates_path = Path(args.updates)
    if not updates_path.exists():
        raise CliError(f"updates file not found: {updates_path}")
    try:
        raw_updates = json.loads(updates_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise CliError(f"--updates is not valid JSON: {e}") from e
    if not isinstance(raw_updates, list):
        raise CliError("--updates must be a JSON array of [start, end, new_text] triples")

    _, byte_to_cp = _build_offset_maps(text)
    updates = []
    for i, u in enumerate(raw_updates):
        if not (isinstance(u, list) and len(u) == 3):
            raise CliError(f"--updates[{i}] must be a [start, end, new_text] triple")
        b_start, b_end, new_text = u
        bad = b_start if b_start not in byte_to_cp else (b_end if b_end not in byte_to_cp else None)
        if bad is not None:
            raise CliError(
                f"--updates[{i}]: byte offset {bad} does not land on a character boundary — "
                "offsets must come from this same document's own `read` output"
            )
        updates.append((byte_to_cp[b_start], byte_to_cp[b_end], new_text))

    try:
        new_full_text = ds.write_document(text, updates)
    except ds.ShapeError as e:
        raise CliError(str(e)) from e

    with open(doc_path, "w", encoding="utf-8", newline="") as f:
        f.write(new_full_text)
    return {"written": True, "path": str(doc_path)}


def _repeating_section(shape: dict, wanted: str | None) -> dict:
    """The one repeating section this call is about. With several in a shape the caller must
    say which; with exactly one, naming it is optional."""
    repeating = [s for s in (shape.get("sections") or []) if s.get("repeats")]
    if not repeating:
        raise CliError("this shape declares no repeating section")
    if wanted:
        for sec in repeating:
            if sec.get("heading") == wanted:
                return sec
        names = ", ".join(repr(s.get("heading")) for s in repeating)
        raise CliError(f"no repeating section named {wanted!r} in this shape (have: {names})")
    if len(repeating) > 1:
        names = ", ".join(repr(s.get("heading")) for s in repeating)
        raise CliError(f"this shape has several repeating sections — pass --section (have: {names})")
    return repeating[0]


def _numbering_pattern(section: dict) -> str:
    pattern = (section.get("numbering") or {}).get("pattern")
    if not pattern:
        raise CliError(f"repeating section {section.get('heading')!r} declares no numbering pattern")
    return pattern


def cmd_next_number(args) -> dict:
    """The next free id for a repeating section. Delegates to the library's own
    next_free_number(), which scans the WHOLE document — including free text — so a number
    that appears only in prose is never handed out twice."""
    text = read_doc_text(Path(args.doc))
    shape = load_shape(Path(args.shape))
    section = _repeating_section(shape, getattr(args, "section", None))
    pattern = _numbering_pattern(section)
    n = ds.next_free_number(text, pattern)
    return {"heading": section.get("heading"), "pattern": pattern, "number": n, "id": pattern % n}


def _detect_eol(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def _compose_instance(section: dict, instance_id: str, title: str, eol: str) -> str:
    """A new, EMPTY repeating block laid out the way this section's own fields declare it —
    inline fields as `**Label:**` lines, labeled_block fields as a label line followed by an
    empty line for the body. Deliberately empty rather than pre-filled with guidance text: the
    guidance belongs in whatever UI renders the form, and placeholder prose in a real document
    is exactly what the gate's placeholder scan exists to catch."""
    lines = [f"### {instance_id}: {title}", ""]
    for f in section.get("fields") or []:
        anchor = f.get("anchor", "inline")
        if anchor == "labeled_block":
            # A labeled block owns the lines after its label, so it needs air before it and an
            # empty body line after it.
            if lines and lines[-1] != "":
                lines.append("")
            lines.append(f"**{f['label']}:**")
            lines.append("")
        else:
            lines.append(f"**{f['label']}:**")
    if lines and lines[-1] != "":
        lines.append("")
    lines.append("")
    return eol.join(lines)


def cmd_add_instance(args) -> dict:
    """Append an empty numbered block to a repeating section, through write_document() so the
    rest of the file is untouched byte for byte."""
    doc_path = Path(args.doc)
    text = read_doc_text(doc_path)
    shape = load_shape(Path(args.shape))
    section = _repeating_section(shape, getattr(args, "section", None))
    pattern = _numbering_pattern(section)

    number = args.number if getattr(args, "number", None) is not None else ds.next_free_number(text, pattern)
    instance_id = pattern % number

    result = ds.read_document(text, shape)
    if not result["matched"]:
        raise CliError(
            "document does not match its shape, so there is no section to add to: "
            + "; ".join(result["warnings"])
        )

    block = next(
        (b for b in result["blocks"]
         if b["kind"] == "repeating_section" and b["heading"] == section.get("heading")),
        None,
    )
    if block is None:
        raise CliError(f"section {section.get('heading')!r} not found in this document")

    # After the last existing instance, so a new block lands with its siblings rather than
    # after whatever trailing prose closes the section.
    instances = sorted(block.get("instances") or [], key=lambda i: i["start"])
    insert_at = instances[-1]["end"] if instances else block["start"]

    eol = _detect_eol(text)
    new_block = _compose_instance(section, instance_id, args.title, eol)
    new_full_text = ds.write_document(text, [(insert_at, insert_at, new_block)])

    with open(doc_path, "w", encoding="utf-8", newline="") as f:
        f.write(new_full_text)
    return {"written": True, "path": str(doc_path), "id": instance_id, "number": number}


def main() -> int:
    parser = argparse.ArgumentParser(description="Read/write a document against its shape (JSON over stdio)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_read = sub.add_parser("read", help="Read a document against its shape, as JSON")
    p_read.add_argument("--doc", required=True)
    p_read.add_argument("--shape", required=True)

    p_write = sub.add_parser("write", help="Apply span replacements to a document")
    p_write.add_argument("--doc", required=True)
    p_write.add_argument(
        "--updates", required=True,
        help="Path to a JSON file of [start, end, new_text] triples (UTF-8 byte offsets)",
    )

    p_next = sub.add_parser("next-number", help="The next free id for a repeating section")
    p_next.add_argument("--doc", required=True)
    p_next.add_argument("--shape", required=True)
    p_next.add_argument("--section", help="Heading of the repeating section (only needed if the shape has several)")

    p_add = sub.add_parser("add-instance", help="Append an empty numbered block to a repeating section")
    p_add.add_argument("--doc", required=True)
    p_add.add_argument("--shape", required=True)
    p_add.add_argument("--section", help="Heading of the repeating section (only needed if the shape has several)")
    p_add.add_argument("--number", type=int, help="Use this number instead of the next free one")
    p_add.add_argument("--title", default="", help="Title text after the id in the heading")

    args = parser.parse_args()

    handlers = {
        "read": cmd_read,
        "write": cmd_write,
        "next-number": cmd_next_number,
        "add-instance": cmd_add_instance,
    }

    try:
        result = handlers[args.command](args)
    except CliError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
