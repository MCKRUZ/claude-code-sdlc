---
spec: "0007"
name: "template-shapes"
status: draft
type: feature
risk: HIGH
source: "docs/proposals/studio-plugin-work.md §1"
channel: ""
harness_context: "profiles/_schema.yaml and scripts/validate_profile.py — the existing schema-plus-validator pattern"
created: "2026-09-19"
---

# Spec 0007 — Templates get a shape, so documents can be shown as forms without losing anything

## Goal

Every document template has a machine-readable shape beside it describing its sections and fields, and a
library that reads a document against its shape and writes it back with anything it did not recognise
preserved byte-for-byte.

## Why

Documents are Markdown whose structure exists only as writing habits — a heading here, a bold label
there. An application cannot draw reliable forms from that: the first renamed heading loses a field, and
the first careless write loses someone's paragraph. Everything Studio does to a document depends on this
one library being trustworthy, and the completeness check currently passes a document with a required
section deleted, which this also closes.

## Scope

### In scope
- The shape format, one file beside each template, and its validator
- Shapes for the 28 templates carrying required-field markers
- A stamp in each new document recording which template and version it came from
- The read-and-write library, with a round-trip test per shaped template
- A new advisory completeness check that uses shapes
- Numbering for repeating blocks, so a new requirement gets the next free number
- `scripts/tests/`, and `docs/templates-artifacts.md`

### Out of scope
- `scripts/check_gates.py` — the protected core. The new check ships separately and advisory;
  whether it ever blocks is a later, deliberate decision.
- Changing any template's wording or structure. Shapes describe what is there.
- Shapes for the remaining 36 templates — a follow-on spec once the format has proven itself.
- Any user interface.

## Acceptance Checks

- [ ] A shape file describes: the template's identifier and version; its sections in order, each with
      its heading, whether it repeats, and the numbering pattern for repeating blocks; and per section
      its fields, each with a label, a type from a fixed list, whether it is required, and its guidance text.
- [ ] The shape validator rejects an unknown field type, a duplicate section heading and a repeating
      section with no numbering pattern, each naming the line.
- [ ] Reading a document returns its fields by section, plus every unrecognised passage as a free-text
      block in its original position — nothing is dropped.
- [ ] For every shaped template: reading a real filled-in document and writing it back with no changes
      produces a byte-identical file. This test runs for each shaped template, not a sample.
- [ ] Writing changes only the fields given to it; every other byte of the file, including free-text
      blocks, comments, blank lines and trailing whitespace, is unchanged.
- [ ] A document whose headings no longer match its shape reads as all free text, with a warning naming
      the sections that did not match — it never guesses and never partially writes.
- [ ] Adding a repeating block allocates the next free number across the whole document, never reusing a
      number already present, including numbers only present in free text.
- [ ] Documents created from now on carry their template identifier and version. A document without one
      is readable and writable as all free text.
- [ ] The advisory completeness check reports a required field that is absent or empty, naming the
      section and field, and exits zero always — it cannot block a gate.
- [ ] `check_gates.py` output is byte-identical with and without this change, proven by running it over
      a project before and after.

## Risk Tier

**Tier:** HIGH
**Why this tier:** the library writes people's documents. A wrong write silently destroys work that may
have taken a workshop to produce, and the damage is discovered later, which is the definition of hard to
undo. It also sits next to the protected gate core.

## Delegation Plan
- **Scope (file patterns):** the new shape schema, validator and read/write library under `scripts/`,
  shape files beside templates under `templates/`, `scripts/tests/**`, `docs/templates-artifacts.md`
- **Context (pattern to reuse):** `profiles/_schema.yaml` with `scripts/validate_profile.py` — the same
  schema-plus-validator shape, the same error style
- **Permissions:** build, tests, reads auto-allowed; no installs. Any edit to `scripts/check_gates.py`,
  `phase_model.py`, `phase-registry.yaml` or `harness/**` is refused — stop and ask
- **Gated paths touched:** none, but the protected core sits adjacent; treat it as untouchable

## Checking Plan

**Ladder depth:** HIGH — the full ladder
**Specifics:** every mechanical check, the grader, the correctness review, a security pass, and a named
human sign-off in the pull request. Two checks a reviewer must run by hand: the round-trip test over
every shaped template, and the byte-identical gate output before and after.

## Decision List
- **What happens when a template's shape and a real document disagree — for example a section someone
  renamed by hand?** Written here as: the whole document falls back to free text with a warning, rather
  than a partial match. Safer, but it means one rename disables the form. Owner: the Pod Lead, before
  this spec is ready.
- **Do documents written before the stamp existed get one added retroactively?** Written here as no —
  they are read as free text until someone edits them through a shape-aware tool. Owner: the Pod Lead.
