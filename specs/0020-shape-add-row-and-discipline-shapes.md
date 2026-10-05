---
spec: "0020"
name: "shape-add-row-and-discipline-shapes"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md (decision 2: a generic add-row verb; shapes are the gating plugin work)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "document_shape_cli.py's add-instance verb: it composes new text from the shape, inserts it through document_shape.write_document() as one exact span, and leaves every other byte untouched. add-row follows the same shape — one verb, one span, no re-serialising."
created: "2026-10-02"
---

# Spec 0020 — shape-add-row-and-discipline-shapes

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
Any markdown table in a project document can have one row appended by a single deterministic command (addressed by shape field, or by position when the document has no shape), and the fourteen discipline documents the Studio plan depends on, plus the shared review report, each have a shape, so they can be opened and edited by field instead of shown as plain text.

## Why
Studio's plan for the remaining plugin commands (`docs/proposals/studio-command-coverage-plan-v2.md`) turns most of them into buttons: a button creates a document from its template and the person fills it in the structured editor. That only works for a document that has a shape, and sixteen of them do not. Four of those documents are *row tables* that grow one entry at a time (business rules `BR-NN`, golden scenarios `SCEN-NN`, decisions `DL-NN`, the feature decomposition) and the editor can only replace a whole field today, so adding a row would mean the caller reading the table, editing markdown and writing it back — exactly the model-in-the-loop, hand-assembled write this plan exists to avoid. One generic `add-row` verb next to `add-instance` gives all four a deterministic append that allocates the id itself and cannot disturb a byte outside the row.

## Scope

### In scope
- `scripts/document_shape_cli.py` — a new `add-row` subcommand (and its help/usage docstring), addressing a table either by shape (`--shape --section --field`) or by position (`--table-index`). `add-row` composes text and writes through the library's existing `write_document()`, as `add-instance` does. The library `scripts/document_shape.py` changes in exactly one line, `pattern_to_regex` (an id width is a minimum, not an exact count) — see the Decision List.
- `scripts/tests/test_document_shape_add_row.py` and `scripts/tests/test_review_report_template.py` — tests (a new file rather than growing `test_document_shape_cli.py` past the file-size cap).
- New `*.shape.yaml` files beside these existing templates, one each, and one filled fixture each under `scripts/tests/fixtures/documents/`: `templates/phases/00-discovery/{workshop-brief,contradiction-list,question-list,document-registry,document-summary}`, `templates/phases/01-requirements/{feature-brief,user-stories}`, `templates/phases/02-design/data/{data-contract,data-readiness,lineage-audit}`, `templates/phases/02-design/experience/{user-journey,surface-layout,channel-interaction-spec}`, `templates/phases/build/spike`.
- A new shared template `templates/review-report.md` with its shape and fixture (the `/sdlc-review` report, whose `## Gate Results` block `record_findings.py` already parses). One file for every phase, because a report is written into whichever phase folder was reviewed.
- `docs/proposals/studio-command-coverage-plan-v2.md` — the plan this spec implements the first part of.
- `CLAUDE.md` — document `add-row` and the new shapes.

### Out of scope
- `check_gates.py`, `check_spec.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**` — the protected core stays byte-for-byte unchanged. In `scripts/document_shape.py` (the library) only the one `pattern_to_regex` line named above may change; **stop and ask** if anything else in it needs to.
- The text of any existing template: a shape must fit the template as it is. If a template and the shape cannot agree, stop and ask rather than editing the template.
- Any Studio (`studio/`) change — the verb is consumed by a later spec.
- `--json` modes on other scripts, the activities declaration, `capabilities`, `bind_channel.py`, `track_decisions.py` verbs (specs 0021 and 0022).
- Row *deletion* or *editing* verbs: this is append-only; changing an existing row goes through the existing field write.

## Acceptance Checks
- [ ] `document_shape_cli.py add-row --doc D --shape S --section "<heading>" --field "<label>" --cells '{"<column>":"<value>"}'` on a `table`-typed field appends exactly one `|`-delimited line directly after the last data row of the field's first table, and prints JSON containing `written: true` and the 1-based `row` number it became.
- [ ] Every byte outside the inserted line is unchanged: `result.replace(inserted_line, "", 1) == original` holds for an LF document, a CRLF document, and a document containing an em dash (U+2014) and curly quotes.
- [ ] On a CRLF document the inserted row ends in `\r\n` and the result contains no `\n` that is not preceded by `\r` (a document with only LF gets only LF).
- [ ] `--id-column "<column>" --id-pattern "BR-%02d"` fills that column with the next free id, found by scanning the **whole** document including prose (an id that appears only in prose is never reused), reports it as `id` in the JSON, and a second call allocates the following number.
- [ ] Supplying a value for the id column in `--cells` while `--id-column` is given exits 1, with the document unchanged.
- [ ] `add-row` removes no row unless `--replace-placeholders` is given; with it, rows are removed only when **every** data row is a template placeholder (more than half of its non-empty cells hold a `[bracketed]` or `<angle>` span; a markdown link `[t](u)` and an HTML tag such as `<br>` do not count), so a table with any real row loses nothing: `| BR-01 | [to confirm] |` (1 of 2 cells) and `| DL-02 | Which DB? | [name/role] | [YYYY-MM-DD] | [YYYY-MM-DD] | open |` (3 of 6) are never deleted, and the JSON reports `replaced_placeholders` as the count removed.
- [ ] An id that appears only in placeholder rows that were actually removed is not treated as used, so a fresh `business-rules.md` with the flag gets `BR-01`; without the flag, or in a table that keeps its rows, every id in the document counts as used.
- [ ] `ds.next_free_number("BR-99 and BR-100", "BR-%02d")` returns `101` and `ds.pattern_to_regex("FR-%03d")` captures all four digits of `FR-1000` while still not matching `FR-12`, so an id past its nominal width is never issued twice.
- [ ] A `|` inside a cell value is written as `\|`, a newline inside a value becomes a single space, and surrounding whitespace is trimmed.
- [ ] A column name in `--cells` that is not in the table's header exits 1 and leaves the document unchanged; columns not supplied are written empty; `--cells` with no non-empty value exits 1.
- [ ] A table with a header and separator but no data rows receives the row on the line directly after the separator, and a table whose last line has no trailing newline at end of file receives it on a new line after an inserted line ending; in both the table's data-row count goes from 0 to 1 (or N to N+1) and `read` returns the new row inside the field's `value`.
- [ ] A field that is not `table`-typed, a field or section that is not in the document, and a table field containing no markdown table each exit 1 with a one-line message on stderr and the document unchanged.
- [ ] After `add-row`, `read` of the same document still returns blocks that tile the whole document (concatenating them reconstructs it) and the table field's value contains the new row.
- [ ] `add-row --table-index N` (no `--shape`) appends to the Nth markdown table of the whole document, skipping tables inside code fences; naming both a shape target and a table index, or neither, exits 1 with the document unchanged; an index past the last table exits 1.
- [ ] Each of the fifteen listed templates (the fourteen discipline templates plus `templates/review-report.md`) has a `.shape.yaml` that passes `validate_shape.py`; `test_shapes_cover_templates.py` passes; each has a filled fixture in `scripts/tests/fixtures/documents/` that reads as matched, round-trips byte-identical, and has every declared field found and non-empty (`test_shaped_templates_roundtrip.py`).
- [ ] For a fresh copy of each shipped row-table template, a test runs `add-row` with an id column and the result has exactly one data row, no `[`-bearing table line, and the preamble and footnote byte-identical: `business-rules`, `golden-scenarios` and `decision-log` through `--table-index 0`, and `feature-brief` through its shape field (where the result also reads as matched).
- [ ] `templates/review-report.md` exists with a shape and fixture; its table columns are exactly `record_findings.FINDING_COLUMNS`; `record_findings.parse_findings_block` ingests the three rows of the fixture; and a report built from the fresh template with two `add-row` calls (`--id-pattern "F%d"`) parses to findings `F1` and `F2`.
- [ ] No existing template, shape or fixture file changes, `READ_CONTRACT` in `document_shape_cli.py` stays `3`, and the full existing `scripts/tests` suite passes unmodified.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** `add-row` writes into documents people have edited, so a bug corrupts someone's work, and the shape library's byte-exact guarantee is the reason Studio can edit documents at all — that argues for care. It stays MEDIUM, not HIGH, because nothing here touches auth, data handling, migrations, pipelines or the protected core; the library itself is unchanged; the verb is append-only and covered by an every-other-byte-identical test; and nothing calls it until a later spec. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/document_shape_cli.py`, `scripts/tests/test_document_shape_cli.py`, `templates/phases/**/*.shape.yaml` (new files only), `templates/phases/<phase>/review-report.md` (new), `scripts/tests/fixtures/documents/*.md` (new files only), `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `document_shape_cli.py`'s `add-instance` — compose the new text, insert it with `ds.write_document()` as one exact span, return JSON; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the scripts under test, `pytest`. Confirm-required: anything outside the scope list above, any edit to an existing template.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker reads the `add-row` diff specifically for the every-other-byte-identical property and for CRLF handling; CI runs the existing shape drift guard and round-trip suites, which now cover the new shapes automatically.

## Decision List
- **Placeholder rows are removed only on request, and only from a table made entirely of them.** A fresh template carries stand-in rows and leaving them puts template residue into a real document, which the gate's placeholder scan flags — but the first version removed any row that was *half* brackets on every call, and the correctness review (PR #83) reproduced it deleting real rows (`| BR-01 | [to confirm] |`). Deleting a person's row on a heuristic is the one failure this verb must not have, so removal now needs `--replace-placeholders`, a strict majority, and a table with no real row. Studio passes the flag when it has just created the document from its template. Owner: @MCKRUZ. Answer: opt-in, all-or-nothing.
- **The library changes by one line.** `pattern_to_regex` read `%02d` as exactly two digits, so once `BR-100` existed it matched as `BR-10` and the next id issued was `BR-100` again (also reachable today through `next-number` and `add-instance`). The width is a minimum; the pattern now accepts that many digits or more. This relaxes the spec's own "library unchanged" line deliberately: the defect is in the library, and fixing it only in `add-row` would leave the other two verbs wrong. Owner: @MCKRUZ. Answer: fix at the root.
- **`business-rules`, `golden-scenarios` and `decision-log` get no shape.** Found while building: each is a preamble and one table with no `## ` heading, and a shape can only anchor a field to a `## ` heading — and real projects' copies have none either, so a shape would never match the documents that exist. Adding a heading to the templates (an edit this spec forbids) would fix only new documents; extending the library to document-level fields is a larger change to the code Studio's editing rests on. Chosen instead: `add-row --table-index`, which needs no shape and works on every such document, old or new. Consequence for a later spec: these three open as plain text with an "add a row" action, not a field editor. Owner: @MCKRUZ. Answer: document-addressed `add-row`.
- **A fresh `decision-log.md` gets `DL-02` for its first decision**, because the template's own prose cites `DL-01` as an example and an id mentioned anywhere is never reused. Left as is rather than editing the template. Owner: @MCKRUZ. Answer: accept.
- **Only the first table in a field is appended to.** A section that mixes prose and one table is the real case; a field with several tables is refused rather than guessed. Owner: @MCKRUZ. Answer: first table.
