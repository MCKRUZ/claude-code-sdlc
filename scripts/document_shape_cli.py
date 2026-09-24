"""Thin CLI wrapper around document_shape.py (spec 0007's library) — a spec 0009
prerequisite. The library is pure Python with no subprocess surface; Studio (a separate
process, written in TypeScript) needs to call it as a program. This wrapper adds no judgment
of its own — it only serializes the library's result to JSON and converts between the
library's Python-string (Unicode code-point) offsets and UTF-8 byte offsets, which is what a
JavaScript/Node caller needs in order to slice a decoded string correctly. Read
document_shape.py's own module docstring for the block model and match semantics this wrapper
is a thin skin over.

Usage:
  document_shape_cli.py read  --doc <path.md> --shape <path.shape.yaml>
  document_shape_cli.py write --doc <path.md> --updates <path.json>

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

    args = parser.parse_args()

    try:
        result = cmd_read(args) if args.command == "read" else cmd_write(args)
    except CliError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
