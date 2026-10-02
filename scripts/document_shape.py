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

Match semantics (spec 0007's Decision List, amended twice). The original rule: every heading the
shape declares must be found, or the WHOLE document reads as free text — never a partial, guessed
match. First amendment: a section whose fields are all optional (`required: false`) may be absent, since
shapes now cover every section of a template, not only the gate-required ones. Second: a document
missing a REQUIRED section still reads as sections, and the gap is reported in `warnings`; only a
document in which NO section is recognized reads as one free-text block. The original worry was
guessing which section was which. A section is found only by its heading (exactly, by an alias, or as
the same words), so every section that is shown is definitely the one it says it is. A section that
declares no fields is not treated as optional.

A section is found by its heading as the shape writes it, by an alias the shape lists, or by the
same words with numbering, case and punctuation ignored, or with a qualifier after them ("3. Deployment
steps", "Deployment procedure (deploy-dev)"). A block carries the DOCUMENT'S own heading, whichever way
it matched. See `_resolve_headings`.

A `## ` section the shape does not declare — one the person added to their own document — is
read as a `section` block flagged `custom: true`, with a single field, "Content" (longtext,
optional): its whole body, addressed by byte span like every other field so an edit touches
only those bytes. That is what lets a document grow parts its template never had and still be
editable. It is ONLY for a `## ` heading: text before the first one, and anything else the
shape doesn't recognize, is still free text.
"""

import re

HEADING2_RE = re.compile(r"^## +([^\r\n]*)", re.MULTILINE)
HEADING3_RE = re.compile(r"^### +([^\r\n]*)", re.MULTILINE)
INLINE_LABEL_TEMPLATE = r"^\*\*{label}:\*\*[ \t]*([^\r\n]*)"
# The same line, allowing a qualifier after the label: whitespace, then anything up to the first
# `:**`. Group 1 is kept so both templates yield the same match shape.
LABELED_BLOCK_LABEL_TEMPLATE = r"^\*\*{label}(?:[ \t]+(?:(?!:\*\*)[^\r\n])*)?:\*\*[ \t]*([^\r\n]*)"
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
    # printf's width is a MINIMUM (`%02d` of 100 is "100"), so a number past it must still be read
    # whole: `\d{2}` alone read BR-100 as BR-10, the maximum stayed 99, and BR-100 was issued twice.
    digits = rf"\d{{{width},}}" if width else r"\d+"
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

def _find_label_match(text: str, start: int, end: int, label: str, anchor: str = "inline"):
    """The `**Label:**` line for a field, exact for an inline field.

    A labeled_block field's label owns its line, so a qualifier between the label and the colon
    is unambiguous and is accepted: `**In scope:**` also matches `**In scope (v1) — both halves
    of the one problem:**`. Real documents rewrite a template's label as they go, and a field
    that fails to match reads as absent — its content then drops out of view. The label must
    still end at a word boundary (`**Included:**` is not `**In:**`). Inline fields stay exact:
    `**Owner email:** x` is a different field from `**Owner:** x`."""
    template = LABELED_BLOCK_LABEL_TEMPLATE if anchor == "labeled_block" else INLINE_LABEL_TEMPLATE
    pattern = re.compile(template.format(label=re.escape(label)), re.MULTILINE)
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
        labeled.append((f, _find_label_match(text, body_start, body_end, f["label"], anchor)))

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


# --- headings that drift from the template ---------------------------------------------------
#
# A real document rarely repeats a template's headings verbatim: Claude writes it from guidance,
# so "Requirement Traceability" arrives as "Traceability Matrix" and "Deployment Steps" as
# "3. Deployment steps". Measured across 70 real documents in four projects, 55 failed to match
# their shape at all for this reason and reached Studio as raw text. So a heading matches, in
# order: exactly; by an alias the shape lists; by being the same words once numbering, case and
# punctuation are ignored; or by being the template heading followed by a qualifier. None of the
# last three ever equates different words, which is what keeps them safe.

# "3. ", "3) ", "3.1 ", "2.1.4 ", "A) ". One or two digits only, so a year ("2024 Roadmap") is a
# word of the heading, not its numbering.
_NUMBERING_RE = re.compile(r"^\s*(?:\d{1,2}(?:\.\d+)*[.)]?|[A-Za-z][.)])\s+")
# Where a qualifier starts: an opening bracket, a dash (with spaces, or an em/en dash), or a colon.
_QUALIFIER_RE = re.compile(r"\s*\(|\s*[\u2014\u2013]|\s+-\s+|\s*:")


def _words(text: str) -> str:
    """Lower-cased alphanumeric words, single-spaced: the comparison form of a heading."""
    return re.sub(r"[^0-9a-z]+", " ", text.lower()).strip()


def heading_keys(heading: str) -> set[str]:
    """The comparison forms a document heading can be matched by: its words in full, and its words
    before any qualifier ("Deployment procedure (deploy-dev)" also answers to "deployment procedure").
    A leading number ("3. ", "2.1 ", "A) ") is not part of the name."""
    bare = _NUMBERING_RE.sub("", heading.strip())
    keys = {_words(bare)}
    qualifier = _QUALIFIER_RE.search(bare)
    if qualifier and qualifier.start() > 0:
        keys.add(_words(bare[: qualifier.start()]))
    keys.discard("")
    return keys


def _resolve_headings(section_shapes: list[dict], doc_headings: dict) -> dict:
    """{id(section): the document heading it matched}, for every section that found one.

    Exact matches are settled for EVERY section before any loose match is tried, so a document's
    own "Summary" section is never taken as a shape's alias for "Overview" while another shape
    section is declared "Summary". A document heading is claimed by at most one section."""
    resolved: dict = {}
    taken: set[str] = set()

    for sec in section_shapes:
        heading = _resolve_section_heading(sec, doc_headings)
        if heading is not None and heading not in taken:
            resolved[id(sec)] = heading
            taken.add(heading)

    for sec in section_shapes:
        if id(sec) in resolved or "heading" not in sec:
            continue
        aliases = [a for a in (sec.get("aliases") or []) if isinstance(a, str)]
        candidates = [h for h in doc_headings if h not in taken]
        match = next((a for a in aliases if a in candidates), None)
        if match is None:
            wanted = {_words(_NUMBERING_RE.sub("", n)) for n in [sec["heading"], *aliases]}
            wanted.discard("")
            match = next((h for h in candidates if heading_keys(h) & wanted), None)
        if match is not None:
            resolved[id(sec)] = match
            taken.add(match)
    return resolved


def _section_is_optional(sec: dict) -> bool:
    """A section may be absent from a document only when it declares fields and none of them
    is required. A section declaring no fields says nothing about being optional, so it keeps
    the original strict behaviour and must be present."""
    fields = sec.get("fields") or []
    return bool(fields) and not any(f.get("required") for f in fields)


# The one field a person's own section carries: its whole body. Not a shape-declared field —
# there is no shape entry to declare it — so it is described here, in the same form a shape
# field takes, and read through the same extraction as any other section-anchored field.
_CUSTOM_SECTION_FIELD = {"label": "Content", "anchor": "section", "type": "longtext", "required": False}


def read_document(text: str, shape: dict) -> dict:
    """See module docstring for the block model and match semantics."""
    section_shapes = shape.get("sections", [])
    doc_headings = {h: (h_start, body_start, body_end) for h, h_start, body_start, body_end
                    in find_heading_spans(HEADING2_RE, text)}

    warnings = []
    resolved = _resolve_headings(section_shapes, doc_headings)
    for sec in section_shapes:
        if id(sec) not in resolved and not _section_is_optional(sec):
            warnings.append(f"section '{sec.get('heading') or sec.get('heading_pattern')}' not found")

    # Only a document in which NOTHING was recognized is thrown back to free text. One that lacks a
    # required section still comes back as sections, with the gap named in `warnings`: every section
    # that was found was found by its heading, so it is definitely that section, and hiding all of them
    # because another is missing helped nobody. (Contract 3 of document_shape_cli's `read`.)
    if warnings and not resolved:
        return {
            "matched": False,
            "warnings": warnings,
            "stamp": read_stamp(text),
            "blocks": [{"kind": "free_text", "start": 0, "end": len(text), "text": text}],
        }

    # Ordered by where they actually occur in the document, so blocks tile [0, len(text)).
    # A `## ` section no shape entry claimed is the person's own — it goes in the same
    # sequence with `sec=None` so it is read as an editable section rather than raw text.
    # A heading a `heading_pattern` matches counts as claimed even when the pattern's section
    # resolved to an earlier heading (a second "## v1.3.0" beside "## v1.4.0"): the shape
    # already has a position on those, and it is unchanged.
    patterns = [re.compile(s["heading_pattern"]) for s in section_shapes if "heading_pattern" in s]
    claimed = set(resolved.values())
    entries = [(sec, resolved[id(sec)], *doc_headings[resolved[id(sec)]])
               for sec in section_shapes if id(sec) in resolved]
    entries += [(None, h, *span) for h, span in doc_headings.items()
                if h not in claimed and not any(p.search(h) for p in patterns)]
    ordered = sorted(entries, key=lambda t: t[2])

    blocks = []
    cursor = 0
    for sec, heading, heading_start, body_start, body_end in ordered:
        if heading_start > cursor:
            blocks.append({"kind": "free_text", "start": cursor, "end": heading_start,
                            "text": text[cursor:heading_start]})
        if sec is None:
            blocks.append({
                "kind": "section", "custom": True, "heading": heading,
                "start": heading_start, "end": body_end,
                "fields": _extract_fields(text, body_start, body_end, [_CUSTOM_SECTION_FIELD]),
            })
        elif sec.get("repeats"):
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
                "kind": "repeating_section", "heading": heading,
                "start": heading_start, "end": body_end, "instances": instances,
            })
        else:
            blocks.append({
                "kind": "section", "heading": heading,
                "start": heading_start, "end": body_end,
                "fields": _extract_fields(text, body_start, body_end, sec.get("fields", [])),
            })
        cursor = body_end
    if cursor < len(text):
        blocks.append({"kind": "free_text", "start": cursor, "end": len(text), "text": text[cursor:]})

    return {"matched": True, "warnings": warnings, "stamp": read_stamp(text), "blocks": blocks}


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
