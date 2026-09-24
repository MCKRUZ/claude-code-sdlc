---
spec: "0015"
name: "document-intake-office-files-and-traceability"
status: draft            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: HIGH
source: "spec 0010 split — see specs/0010-studio-documents.md"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: ""            # who drives the agent and approves the plan — filled at hand-off
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "intake_documents.py's existing catalog + DOC-NNN model, and the shape library from spec 0007 for the traceability field"
created: "2026-09-24"
---

# Spec 0015 — Source documents: Office files, stable ids, and real traceability

## Goal

A person can bring a PowerPoint deck or an Excel workbook into a project as a source document,
and every requirement drawn from it can name it as its source through the shape library — with
source-document ids that stay stable when another file is added later.

## Why

Clients hand over decks and spreadsheets, not Markdown. Today the plugin can catalog neither,
and the one link between a requirement and the document it came from is an unvalidated column in
a table the shape library cannot see — so a front end cannot write it and no check can verify it.

Underneath that sit two defects that make the traceability promise false today, both found while
planning spec 0010:

- Re-running intake **renumbers every existing source document**, because ids are assigned by
  position over a freshly sorted glob. Adding one file silently invalidates every existing
  requirement-to-source reference. Two of the plugin's own reference docs claim the opposite.
- The per-requirement `Source` field means *persona*, not *document*, and the `## Requirement
  Traceability` table is not in `requirements.shape.yaml` at all — it reads as free text.

This spec is separated from spec 0010 deliberately: the document editor and the intake subsystem
are different concerns, they need different security reviews (editing text versus parsing
untrusted binary files someone emailed you), and bundling them would hold the editor behind
plumbing repairs that block nobody today.

## Scope

### In scope
- `scripts/intake_documents.py` — stable ids, PowerPoint and Excel support, a `--repo` mode and
  `--json` output, and its first tests
- `profiles/_schema.yaml` — the `documentation.types` enum, which currently rejects the new types
- `templates/phases/01-requirements/requirements.shape.yaml` and its template — a real, shaped
  source-document field on the requirement block
- `templates/phases/00-discovery/document-summary.md` — per-sheet structure for a workbook
- `references/document-intake.md` — corrected to match what the code actually does

### Out of scope
- The document editor itself — spec 0010. This spec provides the source documents it cites.
- `check_gates.py` and the rest of the protected core.
- Making intake non-optional, or enabling it in a shipped profile.

## Acceptance Checks

- [ ] Adding a new file to the intake folder and re-running leaves every existing DOC-NNN id
      pointing at the same document it did before; only the new file gets a new id.
- [ ] A document that is removed from the intake folder keeps its id reserved — the id is never
      reissued to a different document.
- [ ] A PowerPoint file is cataloged as one source document, and its text is extracted for
      summarisation rather than estimated from its byte size.
- [ ] An Excel workbook is cataloged as one source document whose summary is structured sheet by
      sheet, with each sheet named — never flattened into one undifferentiated block.
- [ ] A requirement can name a source document in a field the shape library reads and writes, so
      a front end can set it without touching free text, and it survives a round trip.
- [ ] `intake_documents.py` runs in `--repo` mode with no `.sdlc/state.yaml`, and emits `--json`
      describing the catalog.
- [ ] Intake runs against a project whose profile has no `documentation` section, using a
      documented default intake path, rather than refusing.
- [ ] A file that fails to parse is reported by name with the reason, and the run still catalogs
      every other file rather than aborting.
- [ ] A malformed or hostile Office file cannot execute anything, read outside the intake folder,
      or hang the run indefinitely.
- [ ] `references/document-intake.md` states the real id behaviour, verified against the code.

## Risk Tier

**Tier:** HIGH
**Why this tier:** it parses untrusted binary files supplied by third parties, and it changes the
identifiers that requirement traceability depends on. A wrong id silently mis-attributes a
requirement's source, which is discovered at audit time, not build time.

## Delegation Plan
- **Scope (file patterns):** `scripts/intake_documents.py`, its new tests, `profiles/_schema.yaml`,
  the requirements template + shape, the document-summary template, `references/document-intake.md`
- **Context (pattern to reuse):** intake's existing catalog + DOC-NNN model, and the shape library
  from spec 0007 for the new traceability field
- **Permissions:** build, test and read auto-allowed. Adding the two Office-parsing dependencies
  needs confirmation — the plugin deliberately runs on two runtime dependencies for ~50 scripts,
  and the one prior optional parser (PyMuPDF) was left out of the dependency list, which is
  exactly why PDF extraction silently does not work on a clean install. Do not copy that pattern
  without deciding it again.
- **Gated paths touched:** none in the plugin; this spec is gated by its own risk tier

## Checking Plan

**Ladder depth:** HIGH — the full ladder
**Specifics:** every mechanical check, the grader, the correctness review, a **security pass on
the Office file parsing specifically** (malformed archives, zip bombs, external entity and macro
content, path traversal in embedded names, and a bounded runtime), and a named human sign-off.
The id-stability checks must be run against a real folder of documents, adding and removing files
between runs — not fixtures alone.

## Decision List
- **How are ids kept stable — persist the assignment in the catalog, or derive the id from the
  file's content checksum?** Persisting keeps ids readable and sequential but means the catalog
  becomes authoritative state that must never be lost; deriving from content is stateless but
  changes the id when the document is edited, which is its own kind of instability.
  Owner: Matt, before this spec is ready.
- **Do the two Office parsers become real runtime dependencies, or optional imports with a
  documented fallback?** The optional pattern matches existing precedent but is the reason PDF
  extraction is quietly broken today. Owner: Matt, before this spec is ready.
