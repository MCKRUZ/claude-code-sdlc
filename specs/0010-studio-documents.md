---
spec: "0010"
name: "studio-documents"
status: draft
type: feature
risk: HIGH
source: "SDLC Studio canvas — screens 1, 2, 2b, 3, 7, 8, 8b, 9, 10"
channel: "ag-ui"
harness_context: "the template-shape read/write library from plugin spec 0007 — the only way Studio touches a document"
created: "2026-09-19"
---

# Spec 0010 — Reading and editing the project's documents

## Goal

A person can read any stage document as a page rather than a file, see what changed since they last
looked, edit it deliberately, see its history, and bring in source files — with every change going
through the template-shape library so nothing is ever lost.

## Why

This is the part people spend their day in, and the reason for the whole product: the documents that
decide what gets built are unreadable as raw files and unsafe to edit by hand. Two rules make it
trustworthy — only Edit changes anything, and anything the app does not understand is preserved exactly.

## Scope

### In scope
- The stage home: its documents, what each is for, what needs attention, and readiness to move on
- Reading a document: sections, fields, and changes since the person last looked
- Edit mode: adding and changing fields, automatic numbering for new requirements, Claude drafting into
  a field on request
- History: versions, what changed between them, and restoring one
- Changing a document after its stage was signed off, including the optional approval step
- Bringing in source files, including PowerPoint and Excel
- The readiness check before moving to the next stage

### Out of scope
- Saving to the repository — spec 0009 does that; this spec calls it.
- Specs and the Build board — spec 0011.
- The template library and playbooks — a later spec.
- Any writing that bypasses the shape library.

## Acceptance Checks

- [ ] A document opens as its sections and fields, with anything the shape did not recognise shown in
      place as text, never hidden and never dropped.
- [ ] Reading a document changes nothing: no file is written when a person only reads, scrolls or
      expands a section.
- [ ] Changes made since the person last opened it are marked, with who made each one and why.
- [ ] Nothing can be changed except in edit mode — buttons that add or change content do not exist
      outside it, including the add button on a review panel.
- [ ] A new requirement is given the next free number across the whole document, and that number is
      shown before the person saves it.
- [ ] Asking Claude to draft a field fills that field only, marks it as drafted, and the person can
      accept or discard it before it is saved.
- [ ] Every field shows where the document lives on disk and what it is called, without leaving the page.
- [ ] History lists versions with who saved each and why; comparing two shows what changed; restoring
      one creates a new version rather than removing any.
- [ ] Editing a signed-off document with approval switched on saves a draft, leaves the signed-off
      version in place for everyone else, and marks it as waiting for the named approver.
- [ ] With approval switched off, the same edit saves straight away and still records who changed it and why.
- [ ] Bringing in a PowerPoint or Excel file summarises it as one source document, with a spreadsheet
      summarised sheet by sheet rather than flattened, and every requirement drawn from it can name it
      as its source.
- [ ] The readiness check shows what is missing before the stage can be signed off, in plain language,
      each item linking to the field it refers to.
- [ ] Round trip: opening a document and saving it with no edits produces a byte-identical file.

## Risk Tier

**Tier:** HIGH
**Why this tier:** it writes the documents the whole engagement depends on. Silent loss of someone's
words is the worst outcome in the product, and it is discovered late.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the shape library from plugin spec 0007 for every read and write, and
  spec 0009 for saving. No direct file writing in this spec's code
- **Permissions:** build, test and read auto-allowed. New dependencies need confirmation, particularly
  anything that parses PowerPoint or Excel
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** HIGH — the full ladder
**Specifics:** every mechanical check, the grader, the correctness review, a security pass on the file
parsing, and a named human sign-off. The round-trip check must be run against real client documents,
not fixtures alone.

## Decision List
- **When Claude drafts into a field, is the draft saved as a version even if discarded?** Written here
  as no — a discarded draft leaves no trace. Owner: Matt, before this spec is ready.
- **Who may edit a document that is waiting for approval?** Written here as: only the person who
  created the draft, until it is approved or rejected. Owner: Matt.
