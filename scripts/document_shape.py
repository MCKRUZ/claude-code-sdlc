"""Read and write a document against its shape, byte-for-byte outside the fields touched
(spec 0007). Everything Studio (and this plugin's own completeness check) does to a
document depends on this library being trustworthy.

The core design choice, and the reason round-trip fidelity is achievable at all: this never
parses a document into a model and re-serializes it. It locates each recognized field as a
[start, end) BYTE SPAN into the original text, and a write is a list of exact span
replacements applied to that same original text — nothing else in the file is ever touched,
regenerated, or reformatted. `read_document()`'s `blocks` list covers [0, len(text)) with no
gaps (a "free_text" block fills every byte not claimed by a recognized field), so nothing
is silently dropped — concatenating every block's captured text reconstructs the original
document exactly (proven in scripts/tests/test_document_shape.py).

Line endings are NOT touched or normalized anywhere: callers must open files with
`newline=""` (disables Python's universal-newline translation) so CRLF, LF, or a mix
survives untouched — these templates check out as CRLF on Windows, and a naive text-mode
read/write would silently rewrite every line ending, which is not a byte-identical round
trip even when no field changed.

Match semantics (the spec's Decision List, verbatim): every heading the shape declares must
be found in the document with EXACT text, or the WHOLE document reads as one free-text
block with a warning naming what didn't match — never a partial match. A document can carry
headings and content the shape does not mention; those simply end up as free text, same as
any other unrecognized passage.
"""

import re

HEADING2_RE = re.compile(r"^## +([^\r\n]*)", re.MULTILINE)
HEADING3_RE = re.compile(r"^### +([^\r\n]*)", re.MULTILINE)
INLINE_LABEL_TEMPLATE = r"^\*\*{label}:\*\*[ \t]*([^\r\n]*)"
COMMENT_LINE_RE = re.compile(r"^[ \t]*<!--.*-->[ \t]*$")
STAMP_RE = re.compile(r"^<!--\s*template:\s*([a-z0-9][a-z0-9-]*)\s+v([0-9]+\.[0-9]+)\s*-->[ \t]*\r?$", re.MULTILINE)


class ShapeError(Exception):
    """The shape itself is malformed in a way that makes reading/writing impossible —
    distinct from a document simply not matching a well-formed shape."""


# ---------------------------------------------------------------------------
# Line-ending-safe primitives
# ---------------------------------------------------------------------------

def _line_end(text: str, pos: int) -> int:
    """Index right after the line terminator starting at `pos` — handles \\r\\n, \\n, \\r,
    and end-of-text with no trailing terminator (returns `pos` unchanged)."""
    if pos >= len(text):
        return pos
    if text[pos] == "\r":
        return pos + 2 if pos + 1 < len(text) and text[pos + 1] == "\n" else pos + 1
    if text[pos] == "\n":
        return pos + 1
    return pos


def _skip_leading_blanks_and_comments(text: str, start: int, end: int) -> int:
    """Advance `start` past leading blank lines and single-line `<!-- ... -->` comments
    (the REQUIRED-marker scaffold), so a section-anchored field's span starts at real
    content — comments must stay untouched by a write, same as any other free text."""
    pos = start
    while pos < end:
        eol_content = text.find("\n", pos, end)
        line_text_end = eol_content if eol_content != -1 else end
        line = text[pos:line_text_end].rstrip("\r")
        stripped = line.strip()
        if stripped == "" or COMMENT_LINE_RE.match(stripped):
            nxt = _line_end(text, line_text_end)
            if nxt <= pos:
                break
            pos = nxt
            continue
        break
    return min(pos, end)


# ---------------------------------------------------------------------------
# Heading spans
# ---------------------------------------------------------------------------

def find_heading_spans(pattern: re.Pattern, text: str, start: int = 0, end: int | None = None):
    """[(heading_text_stripped, heading_start, body_start, body_end), ...] in document
    order, for every match of `pattern` within [start, end). body_end is the next match's
    start, or `end`."""
    end = len(text) if end is None else end
    matches = list(pattern.finditer(text, start, end))
    spans = []
    for i, m in enumerate(matches):
        body_start = _line_end(text, m.end())
        body_end = matches[i + 1].start() if i + 1 < len(matches) else end
        spans.append((m.group(1).rstrip(), m.start(), body_start, body_end))
    return spans


# ---------------------------------------------------------------------------
# Repeating-block numbering
# ---------------------------------------------------------------------------

def pattern_to_regex(numbering_pattern: str) -> re.Pattern:
    """'FR-%03d' -> a regex matching 'FR-001' etc., capturing the digits. Anchored to
    match at the START of whatever it's checked against (a heading, or found anywhere via
    .search on the whole document for the numbering allocator)."""
    m = re.search(r"%0?(\d*)d", numbering_pattern)
    if not m:
        raise ShapeError(f"numbering pattern '{numbering_pattern}' has no %d placeholder")
    width = m.group(1)
    prefix = re.escape(numbering_pattern[: m.start()])
    suffix = re.escape(numbering_pattern[m.end() :])
    digits = rf"\d{{{width}}}" if width else r"\d+"
    return re.compile(prefix + f"({digits})" + suffix)


def next_free_number(text: str, numbering_pattern: str) -> int:
    """The next unused number for a repeating block, scanning the WHOLE document — not
    just recognized instances — so a number mentioned only in free text is never reused."""
    regex = pattern_to_regex(numbering_pattern)
    numbers = [int(m.group(1)) for m in regex.finditer(text)]
    return (max(numbers) + 1) if numbers else 1


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------

def _find_label_match(text: str, start: int, end: int, label: str):
    pattern = re.compile(INLINE_LABEL_TEMPLATE.format(label=re.escape(label)), re.MULTILINE)
    return pattern.search(text, start, end)


def _field_result(text: str, v_start: int, v_end: int, f: dict, anchor: str) -> dict:
    return {
        "value": text[v_start:v_end],
        "start": v_start,
        "end": v_end,
        "type": f["type"],
        "required": f["required"],
        "anchor": anchor,
        "empty": text[v_start:v_end].strip() == "",
    }


def _extract_fields(text: str, body_start: int, body_end: int, field_shapes: list[dict]) -> dict:
    """Fields anchored directly in [body_start, body_end) — see _extract_fields_flat for
    the anchor kinds — plus fields carrying an optional `subheading`: those are located
    within a NAMED `### <subheading>` subsection nested inside this body first, then
    resolved against that narrower span (release-notes.md's fixed, non-repeating "###
    Summary" / "### Breaking Changes" subsections, as opposed to a numbered repeating
    series, which `repeats: true` on the section itself already covers)."""
    direct = [f for f in field_shapes if not f.get("subheading")]
    by_subheading: dict[str, list[dict]] = {}
    for f in field_shapes:
        sub = f.get("subheading")
        if sub:
            by_subheading.setdefault(sub, []).append(f)

    fields = _extract_fields_flat(text, body_start, body_end, direct)

    if by_subheading:
        sub_spans = {h: (sb_start, sb_end) for h, _, sb_start, sb_end
                     in find_heading_spans(HEADING3_RE, text, body_start, body_end)}
        for sub_heading, sub_fields in by_subheading.items():
            span = sub_spans.get(sub_heading)
            if span is None:
                for f in sub_fields:
                    fields[f["label"]] = None
                continue
            fields.update(_extract_fields_flat(text, span[0], span[1], sub_fields))

    return fields


def _extract_fields_flat(text: str, body_start: int, body_end: int, field_shapes: list[dict]) -> dict:
    """Three anchor kinds, all resolved directly within [body_start, body_end):
      - inline: '**Label:** value' — the value is the rest of that same line.
      - labeled_block: '**Label:**' on its own line, value is everything after it up to
        whichever recognized field's label line comes next (or the section's end) — used
        for a label followed by a blockquote, a checklist, or a multi-line paragraph.
      - section: no label line at all; the value is the body (minus leading blank lines /
        the REQUIRED-comment scaffold) up to the first labelled sibling that was found, or
        the section's end when there is none — used for a table, a checklist, or free prose
        with no bold-label header. Usually a section declares only this one field, but it
        may be followed by labelled fields (problem-statement's Five Whys chain is followed
        by **Root Cause Statement:**), and the bound is what keeps their spans disjoint.
    """
    labeled = []  # (field_shape, match_or_None) for anchor in (inline, labeled_block)
    section_field = None
    for f in field_shapes:
        anchor = f.get("anchor", "inline")
        if anchor == "section":
            section_field = f
            continue
        labeled.append((f, _find_label_match(text, body_start, body_end, f["label"])))

    # Positional order of whichever labeled fields were actually found, so a labeled_block
    # field's value can be bounded by the NEXT field's label line, whatever field that is.
    found = sorted((item for item in labeled if item[1] is not None), key=lambda item: item[1].start())

    fields = {}
    for f, m in labeled:
        anchor = f.get("anchor", "inline")
        if m is None:
            fields[f["label"]] = None
            continue
        if anchor == "inline":
            v_start, v_end = m.start(1), m.end(1)
        else:
            pos = next(i for i, item in enumerate(found) if item[1] is m)
            v_end = found[pos + 1][1].start() if pos + 1 < len(found) else body_end
            v_start = _skip_leading_blanks_and_comments(text, _line_end(text, m.end()), v_end)
        fields[f["label"]] = _field_result(text, v_start, v_end, f, anchor)

    if section_field is not None:
        v_start = _skip_leading_blanks_and_comments(text, body_start, body_end)
        # Stop where the first labelled sibling that was actually FOUND begins — the same
        # rule labeled_block already follows. Without this bound the section field swallows
        # its sibling's bytes, and two fields an editor shows separately would then share
        # bytes, so saving one silently reverts the other. When nothing labelled was found
        # (the ordinary one-field-per-section case, and every shape but problem-statement)
        # `found` is empty and the span is the whole body, exactly as before.
        v_end = found[0][1].start() if found else body_end
        fields[section_field["label"]] = _field_result(text, v_start, max(v_start, v_end), section_field, "section")

    return fields


# ---------------------------------------------------------------------------
# The stamp
# ---------------------------------------------------------------------------

def read_stamp(text: str):
    """(template_id, version) from the document's stamp comment, or None if absent —
    a document written before the stamp existed, or never created from a template, reads
    (and writes) as all free text, exactly as if it carried no shape at all."""
    m = STAMP_RE.search(text)
    return (m.group(1), m.group(2)) if m else None


def stamp_line(template_id: str, version: str) -> str:
    return f"<!-- template: {template_id} v{version} -->"


def stamp_document(text: str, template_id: str, version: str) -> str:
    """Insert the stamp as a new line right after the document's H1 title — only for a
    document with no stamp yet; called once, at creation time."""
    if read_stamp(text) is not None:
        raise ShapeError("Document already carries a stamp")
    title_match = re.match(r"^#[ \t]+[^\r\n]*", text)
    if not title_match:
        raise ShapeError("Document has no H1 title line to stamp after")
    insert_at = _line_end(text, title_match.end())
    newline = "\r\n" if text[title_match.end() : insert_at] == "\r\n" else "\n"
    return text[:insert_at] + stamp_line(template_id, version) + newline + text[insert_at:]


# ---------------------------------------------------------------------------
# read_document / write_document
# ---------------------------------------------------------------------------

def _resolve_section_heading(sec: dict, doc_headings: dict) -> str | None:
    """The matching doc heading's exact text, by literal equality (`heading`) or by
    `heading_pattern` (a regex `.search`) — the latter for a heading whose text is itself
    data (e.g. release-notes.md's "## [Version X.Y.Z] — [YYYY-MM-DD]", where a real
    document's heading is "## v1.4.0 — 2026-09-23" and can never equal the template's own
    literal placeholder text). Exactly one of the two must be declared per section
    (validate_shape.py enforces this)."""
    if "heading_pattern" in sec:
        regex = re.compile(sec["heading_pattern"])
        return next((h for h in doc_headings if regex.search(h)), None)
    return sec["heading"] if sec["heading"] in doc_headings else None


def read_document(text: str, shape: dict) -> dict:
    """See module docstring for the block model and match semantics."""
    section_shapes = shape.get("sections", [])
    doc_headings = {h: (h_start, body_start, body_end) for h, h_start, body_start, body_end
                    in find_heading_spans(HEADING2_RE, text)}

    warnings = []
    resolved = {}
    for sec in section_shapes:
        heading = _resolve_section_heading(sec, doc_headings)
        if heading is None:
            warnings.append(f"section '{sec.get('heading') or sec.get('heading_pattern')}' not found")
        else:
            resolved[id(sec)] = heading

    if warnings:
        return {
            "matched": False,
            "warnings": warnings,
            "stamp": read_stamp(text),
            "blocks": [{"kind": "free_text", "start": 0, "end": len(text), "text": text}],
        }

    # Ordered by where they actually occur in the document, so blocks tile [0, len(text)).
    ordered = sorted(
        ((sec, *doc_headings[resolved[id(sec)]]) for sec in section_shapes),
        key=lambda t: t[1],
    )

    blocks = []
    cursor = 0
    for sec, heading_start, body_start, body_end in ordered:
        if heading_start > cursor:
            blocks.append({"kind": "free_text", "start": cursor, "end": heading_start,
                            "text": text[cursor:heading_start]})
        if sec.get("repeats"):
            numbering = sec["numbering"]["pattern"]
            regex = pattern_to_regex(numbering)
            instances = []
            sub_cursor = body_start
            for h_text, h_start, sub_body_start, sub_body_end in find_heading_spans(
                HEADING3_RE, text, body_start, body_end
            ):
                if not regex.match(h_text):
                    continue  # a "### " subsection not part of this repeating series is free text
                if h_start > sub_cursor:
                    pass  # left as free text implicitly — not wrapped separately for repeats
                instances.append({
                    "number": int(regex.match(h_text).group(1)),
                    "heading_text": h_text,
                    "start": h_start,
                    "end": sub_body_end,
                    "fields": _extract_fields(text, sub_body_start, sub_body_end, sec.get("fields", [])),
                })
                sub_cursor = sub_body_end
            blocks.append({
                "kind": "repeating_section", "heading": resolved[id(sec)],
                "start": heading_start, "end": body_end, "instances": instances,
            })
        else:
            blocks.append({
                "kind": "section", "heading": resolved[id(sec)],
                "start": heading_start, "end": body_end,
                "fields": _extract_fields(text, body_start, body_end, sec.get("fields", [])),
            })
        cursor = body_end
    if cursor < len(text):
        blocks.append({"kind": "free_text", "start": cursor, "end": len(text), "text": text[cursor:]})

    return {"matched": True, "warnings": [], "stamp": read_stamp(text), "blocks": blocks}


def write_document(text: str, updates: list[tuple[int, int, str]]) -> str:
    """Apply exact span replacements to `text`. Each update is (start, end, new_text) —
    the bytes at [start, end) become `new_text`; every other byte is untouched. Updates
    may be given in any order; overlapping spans are refused (ambiguous intent, not
    silently resolved)."""
    ordered = sorted(updates, key=lambda u: u[0])
    for i in range(1, len(ordered)):
        if ordered[i][0] < ordered[i - 1][1]:
            raise ShapeError(f"overlapping field spans at {ordered[i-1]} and {ordered[i]}")
    out = []
    cursor = 0
    for start, end, new_text in ordered:
        out.append(text[cursor:start])
        out.append(new_text)
        cursor = end
    out.append(text[cursor:])
    return "".join(out)
