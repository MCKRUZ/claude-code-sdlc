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
  document_shape_cli.py add-row      --doc <path.md> (--shape S --section H --field L | --table-index N)
                                     (--cells JSON | --cells-file PATH)
                                     [--id-column COL --id-pattern "BR-%02d"]

`add-row` appends ONE row to a markdown table (spec 0020), addressed either by the shape (a
`table`-typed field of a section — the first table inside that field) or, with no shape at all,
by position (`--table-index N`, the Nth table in the document, code fences skipped). The second
form exists because several discipline documents (business rules, golden scenarios, the decision
log) are a preamble and one table with no `## ` heading, which a shape cannot anchor to — and real
projects' copies of them have none either. `--cells` maps column header -> value; an id column is
filled with the next free id, found by scanning the WHOLE document (prose included) so an id is
never reused. A row made only of `[bracketed]` template placeholders is replaced by the first real
row. Everything outside the table's data rows is untouched, line endings included.

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
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import document_shape as ds  # noqa: E402
import yaml  # noqa: E402


# What `read` promises about its output, so a caller can tell an older plugin from a newer one
# by capability rather than by version number (which only works if someone remembers to bump it
# — the reason a stale install went unnoticed for months). An older plugin never emitted the key
# at all, so its absence reads as contract 1. Bump this when `read`'s output gains behaviour a
# caller would need to know is there:
#   1 — (no key) sections the shape declares; a missing required section falls back to free text
#   2 — an optional section may be absent; an undeclared `## ` section comes back as a `custom`
#       section with one whole-body "Content" field
#   3 — a document missing a required section still comes back as sections (`matched` true), with the
#       gap named in `warnings`; only a document in which nothing is recognized is one free-text block
READ_CONTRACT = 3


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
        "contract": READ_CONTRACT,
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


# --- add-row -------------------------------------------------------------------------------

_SEPARATOR_CELL_RE = re.compile(r"^:?-+:?$")
# A `[bracketed]` or `<angle>` placeholder span — but not a markdown link, `[text](url)`, nor a real
# HTML tag such as `<br>`, both of which are content.
_PLACEHOLDER_SPAN_RE = re.compile(
    r"\[[^\]]+\](?!\()"
    r"|<(?!/?(?:br|b|i|u|p|em|strong|code|span|sub|sup|hr|a|img|div)\b)[^<>\n]+>",
    re.IGNORECASE,
)
_FENCE_RE = re.compile(r"^[ \t]*(```|~~~)")
_UNESCAPED_PIPE_RE = re.compile(r"(?<!\\)\|")


def _split_cells(line: str) -> list[str]:
    """A table line's cells, honouring `\\|` as a literal pipe inside a cell."""
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    return [c.strip() for c in _UNESCAPED_PIPE_RE.split(body)]


def _is_separator_line(line: str) -> bool:
    cells = _split_cells(line)
    return bool(cells) and all(_SEPARATOR_CELL_RE.match(c) for c in cells)


def _is_placeholder_row(line: str) -> bool:
    """A template's stand-in row. Real templates keep a genuine id and status in it (`DL-01 | [the
    open question] | [owner] | ... | open`), so "every cell is bracketed" would miss them; instead a
    row is a placeholder when MORE THAN HALF its non-empty cells hold a `[bracketed]` or `<angle>`
    span. Exactly half is not enough: `| BR-01 | [to confirm] |` and a half-filled decision are real
    rows that mention a bracket, and treating them as stand-ins deleted them (found by the
    correctness review of spec 0020)."""
    cells = [c for c in _split_cells(line) if c]
    marked = sum(1 for c in cells if _PLACEHOLDER_SPAN_RE.search(c))
    return marked > 0 and marked * 2 > len(cells)


def _line_spans(text: str, start: int, end: int):
    """(start, end) of each line in [start, end), the line ending included in the span."""
    pos = start
    while pos < end:
        newline = text.find("\n", pos, end)
        stop = newline + 1 if newline != -1 else end
        yield pos, stop
        pos = stop


def _find_tables(text: str, start: int, end: int) -> list[dict]:
    """Markdown tables in [start, end), code fences skipped. Each: its header cells, where its
    data rows begin, and every data row's span (line ending included)."""
    lines = list(_line_spans(text, start, end))
    content = [text[s:e].rstrip("\r\n") for s, e in lines]
    tables, in_fence, i = [], False, 0
    while i < len(lines):
        if _FENCE_RE.match(content[i]):
            in_fence = not in_fence
        elif (not in_fence and content[i].lstrip().startswith("|") and i + 1 < len(lines)
              and content[i + 1].lstrip().startswith("|") and _is_separator_line(content[i + 1])):
            rows, j = [], i + 2
            while j < len(lines) and content[j].lstrip().startswith("|"):
                rows.append(lines[j])
                j += 1
            tables.append({"header": _split_cells(content[i]), "data_start": lines[i + 1][1], "rows": rows})
            i = j
            continue
        i += 1
    return tables


def _load_cells(args) -> dict:
    raw = getattr(args, "cells", None)
    path = getattr(args, "cells_file", None)
    if raw is None and path is None:
        raise CliError("give the row's values with --cells (JSON) or --cells-file")
    if raw is None:
        try:
            with open(path, encoding="utf-8") as f:
                raw = f.read()
        except OSError as e:
            raise CliError(f"cannot read --cells-file: {e}") from e
    try:
        cells = json.loads(raw)
    except json.JSONDecodeError as e:
        raise CliError(f"--cells is not valid JSON: {e}") from e
    if not isinstance(cells, dict):
        raise CliError("--cells must be a JSON object mapping column name to value")
    return cells


def _clean_cell(value) -> str:
    """One table cell: a newline cannot live inside a markdown table row, and an unescaped pipe
    would split the cell in two."""
    text = re.sub(r"\s*[\r\n]+\s*", " ", str(value)).strip()
    return _UNESCAPED_PIPE_RE.sub(r"\\|", text)


def _resolve_table(text: str, args) -> dict:
    shape_given = any(getattr(args, name, None) for name in ("shape", "section", "field"))
    index_given = getattr(args, "table_index", None) is not None
    if shape_given == index_given:
        raise CliError("give either --shape with --section and --field, or --table-index (not both, not neither)")

    if index_given:
        tables = _find_tables(text, 0, len(text))
        if not tables:
            raise CliError("this document has no table")
        if args.table_index >= len(tables) or args.table_index < 0:
            raise CliError(f"this document has only {len(tables)} table(s); index {args.table_index} is out of range")
        return tables[args.table_index]

    if not (args.shape and args.section and args.field):
        raise CliError("--shape, --section and --field go together")
    shape = load_shape(Path(args.shape))
    result = ds.read_document(text, shape)
    if not result["matched"]:
        raise CliError("document does not match its shape, so there is no table field to add to: " + "; ".join(result["warnings"]))
    block = next((b for b in result["blocks"] if b["kind"] == "section" and b["heading"] == args.section), None)
    if block is None:
        raise CliError(f"section {args.section!r} not found in this document")
    field = block["fields"].get(args.field)
    if field is None:
        raise CliError(f"field {args.field!r} not found in section {args.section!r}")
    if field["type"] != "table":
        raise CliError(f"field {args.field!r} is a {field['type']} field, not a table")
    tables = _find_tables(text, field["start"], field["end"])
    if not tables:
        raise CliError(f"field {args.field!r} contains no table")
    return tables[0]


def cmd_add_row(args) -> dict:
    """Append one row to a table, through write_document() as a single exact span so every byte
    outside the table's data rows is untouched. See the module docstring for the contract."""
    doc_path = Path(args.doc)
    text = read_doc_text(doc_path)
    cells = _load_cells(args)
    table = _resolve_table(text, args)
    header = table["header"]

    unknown = [name for name in cells if name not in header]
    if unknown:
        raise CliError(f"unknown column(s) {unknown}; this table has: {', '.join(header)}")
    if not any(str(v).strip() for v in cells.values()):
        raise CliError("every value is empty, so there is no row to add")

    rows = table["rows"]
    # Rows are removed ONLY when the caller asked, and only from a table that is nothing BUT
    # stand-ins (a fresh template). A table with any real row in it is never touched: deleting a
    # person's row on a heuristic is the one failure this verb must not have.
    all_placeholders = bool(rows) and all(_is_placeholder_row(text[s:e].rstrip("\r\n")) for s, e in rows)
    placeholders = list(rows) if getattr(args, "replace_placeholders", False) and all_placeholders else []
    id_column, id_pattern = getattr(args, "id_column", None), getattr(args, "id_pattern", None)
    row_id = None
    values = {name: _clean_cell(v) for name, v in cells.items()}
    if id_column or id_pattern:
        if not (id_column and id_pattern):
            raise CliError("--id-column and --id-pattern go together (the pattern says what an id looks like, e.g. BR-%02d)")
        if id_column not in header:
            raise CliError(f"id column {id_column!r} is not in this table; it has: {', '.join(header)}")
        if id_column in cells:
            raise CliError(f"the {id_column!r} column is allocated automatically; do not also supply it in --cells")
        # Ids that appear only in a placeholder row about to be removed were never really used:
        # a fresh template's first real rule is BR-01, not BR-04.
        scan_text = text
        for s, e in reversed(placeholders):
            scan_text = scan_text[:s] + scan_text[e:]
        try:
            row_id = id_pattern % ds.next_free_number(scan_text, id_pattern)
        except (ds.ShapeError, TypeError, ValueError) as e:
            raise CliError(f"cannot allocate an id from pattern {id_pattern!r}: {e}") from e
        values[id_column] = row_id

    eol = _detect_eol(text)
    new_row = "| " + " | ".join(values.get(name, "") for name in header) + " |"

    kept = [(s, e) for s, e in rows if (s, e) not in placeholders]
    region_start = table["data_start"]
    region_end = rows[-1][1] if rows else region_start
    # The only line that can lack a line ending is the document's last one.
    original_last_has_eol = region_end == 0 or text[region_end - 1] == "\n"
    previous_end = kept[-1][1] if kept else region_start
    previous_has_eol = previous_end == 0 or text[previous_end - 1] == "\n"

    new_region = (
        "".join(text[s:e] for s, e in kept)
        + ("" if previous_has_eol else eol)
        + new_row
        + (eol if original_last_has_eol else "")
    )
    new_text = ds.write_document(text, [(region_start, region_end, new_region)])
    with open(doc_path, "w", encoding="utf-8", newline="") as f:
        f.write(new_text)
    return {
        "written": True, "path": str(doc_path), "row": len(kept) + 1, "id": row_id,
        "replaced_placeholders": len(rows) - len(kept),
    }


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

    p_row = sub.add_parser("add-row", help="Append one row to a table (by shape field, or by table position)")
    p_row.add_argument("--doc", required=True)
    p_row.add_argument("--shape", help="Shape file (with --section and --field)")
    p_row.add_argument("--section", help="Heading of the section holding the table field")
    p_row.add_argument("--field", help="Label of the table-typed field")
    p_row.add_argument("--table-index", type=int, dest="table_index", help="Address the Nth table in the document instead (0-based)")
    p_row.add_argument("--cells", help="JSON object: column header -> value")
    p_row.add_argument("--cells-file", dest="cells_file", help="Path to a JSON file holding the cells (avoids shell quoting)")
    p_row.add_argument("--id-column", dest="id_column", help="Column to fill with the next free id")
    p_row.add_argument("--id-pattern", dest="id_pattern", help='What an id looks like, e.g. "BR-%%02d"')
    p_row.add_argument("--replace-placeholders", action="store_true", dest="replace_placeholders",
                       help="If EVERY data row is a template placeholder, replace them with this row "
                            "(never removes anything from a table that has a real row)")

    args = parser.parse_args()

    handlers = {
        "read": cmd_read,
        "write": cmd_write,
        "next-number": cmd_next_number,
        "add-instance": cmd_add_instance,
        "add-row": cmd_add_row,
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
