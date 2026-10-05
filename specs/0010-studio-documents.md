---
spec: "0010"
name: "studio-documents"
status: draft
type: feature
risk: HIGH
source: "SDLC Studio canvas — screens 1, 2, 2b, 3, 7, 8, 8b, 9, 10"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "the template-shape read/write library from plugin spec 0007 — the only way Studio touches a document"
created: "2026-09-19"
---

# Spec 0010 — Reading and editing the project's documents

## Goal

A person can read any stage document as a page rather than a file, see what changed since they last
looked, edit it deliberately, and see its history — with every change going
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
- Citing a source document on a requirement (the source documents themselves come from spec 0015)
- The readiness check before moving to the next stage

### Out of scope
- Saving to the repository — spec 0009 does that; this spec calls it.
- Specs and the Build board — spec 0011.
- The template library and playbooks — a later spec.
- Any writing that bypasses the shape library.

## Acceptance Checks

- [x] A document opens as its sections and fields, with anything the shape did not recognise shown in
      place as text, never hidden and never dropped.
- [x] Reading a document changes nothing: no file is written when a person only reads, scrolls or
      expands a section.
- [x] Changes made since the person last opened it are marked, with who made each one and why.
- [x] Nothing can be changed except in edit mode — buttons that add or change content do not exist
      outside it, including the add button on a review panel.
- [x] A new requirement is given the next free number across the whole document, and that number is
      shown before the person saves it.
- [x] Asking Claude to draft a field fills that field only, marks it as drafted, and the person can
      accept or discard it before it is saved.
- [x] Every Claude draft is recorded with its outcome — accepted, edited then accepted, or discarded —
      in an audit ledger separate from the document's version history, so a discarded draft is
      answerable later without cluttering the history of what the document actually says.
- [x] Every field shows where the document lives on disk and what it is called, without leaving the page.
- [x] History lists versions with who saved each and why; comparing two shows what changed; restoring
      one creates a new version rather than removing any.
- [x] Editing a signed-off document with approval switched on saves a draft, leaves the signed-off
      version in place for everyone else, and marks it as waiting for the named approver.
- [ ] While a draft waits for approval, only the person who created it can change it — everyone else
      sees the signed-off version and has no way to alter what the approver is being asked to sign.
- [x] With approval switched off, the same edit saves straight away and still records who changed it and why.
<!-- Bringing in PowerPoint/Excel source files moved to spec 0015 on 2026-09-24. It depends on
     three pre-existing intake defects (source-document ids are reassigned whenever a file is
     added; the requirement-to-document link is free text the shape library cannot see; the
     intake script has no test coverage) and needs its own security pass for parsing untrusted
     binary files. Bundling it here would hold the document editor behind repairs that block
     nobody today. This spec is complete as amended, not as originally written. -->
- [x] The readiness check shows what is missing before the stage can be signed off, in plain language,
      each item linking to the field it refers to.
      <!-- Ticked 2026-09-26. The pipeline had been built and unit-tested all along — the plugin
           reports each gap, the main process joins it to the exact field — and the stage home
           rendered only a COUNT and dropped the list, so none of it was ever visible. Now shown
           item by item, each one opening its document and marking the section it is about.
           Proven by studio/test/e2e/documents.spec.ts, verified to FAIL with the rendering
           removed rather than assumed to cover it. -->

<!-- STILL OPEN (2026-09-26), and the only acceptance check on this spec that is. Half of it is
     now built and proven: Studio refuses a second save attempted by anyone but the person who
     opened a still-pending draft, with a clear reason naming them — see
     electron/main/sync.ts's blocksSave() and test/approvalPath.test.ts's "only the owner may
     change a pending draft". That closes the case of one person, one installation, saving
     twice. It does NOT close the case the check's wording ("everyone else") actually means: a
     colleague on their OWN installation of Studio has no way to even know your draft exists,
     because which draft is pending is recorded only in Studio's local settings on the machine
     that opened it, never in the repository (spec 0009's decision 4). Closing that needs a live
     question to GitHub at save time — "is there already an open, unmerged change to this
     document from someone else?" — not another local flag. That is real, separately-scoped
     work, not a quick add-on, so this stays unticked rather than ticked on the half that's done. -->

- [x] Round trip: opening a document and saving it with no edits produces a byte-identical file.

### What is proven, and what is not (2026-09-24)

A ticked box above means a test asserts it, not that someone watched it work.

**Proven by test.** `documentsEndToEnd.test.ts` builds a real initialized project and drives the
real functions: reading writes nothing, numbering is allocated across the whole document before
anything is created, a field edit moves only that field's bytes, versions carry the real person
and reason, comparing and restoring work (including refusing a confirmation that does not carry
the hash of the diff that was shown), and a discarded draft reaches its own ledger without
touching the version history. `shapeRoundTrip.test.ts` round-trips all 28 shaped templates
through Studio's own read/write path.

**Proven in the real window.** `test/e2e/documents.spec.ts` launches the packaged application
against a real initialized project and clicks through it: the stage home lists each document
with what it is for and does not offer one that has not been started, a document opens as its
sections and fields showing where it lives, NOTHING that changes content exists outside edit
mode (asserted as absence, not as disabled), entering edit mode reveals those controls and names
the next id before anything is created, leaving takes them away again, and the history panel is
honest about a document nobody has saved yet rather than inventing an author or a date.

**Also proven.** The changes banner names a second author, their date and their reason, from a
real commit pushed by a separate clone — and merely reading does not clear it, since "mark as
seen" is a separate explicit act. Claude drafting is driven in the window with a real model
call: the draft arrives as a proposal with both choices, the field does not change, discarding
leaves it unchanged, and the discard still reaches the ledger. That test skips with a reason
when no draft comes back rather than passing quietly on a signed-out machine.

**Proven against a real git remote.** `test/approvalPath.test.ts` was written after noticing
that "needs a real code host" was two thirds wrong: a pending draft is a branch, and what makes
it pending is that the push to the shared branch was refused — which a local bare repository
refuses just as well as GitHub does (a server-side hook is indistinguishable from branch
protection on the client side, and "did the direct push get rejected" is this app's own stated
gate). With no approval step the change lands on the shared branch with who and why recorded;
with the push refused the shared branch does not move at all and the work is parked on its own
branch. Only opening the pull request itself still needs GitHub.

**Half-proven: that only the draft's author may change it while it waits (2026-09-26).** The
part this fixture CAN prove turned out to be provable after all: "who opened the draft" is a
name Studio already stores locally the moment a pull request is pushed, so `test/approvalPath.
test.ts` seeds that state directly, then calls the real save() as a different actor and watches
it refuse — before it ever touches the network — while the actual owner's save still lands
(`blocksSave`, unit-tested separately in `test/draftOwnership.test.ts`). What remains NOT proven,
because it is not yet built: a colleague's OWN installation of Studio has no local record of your
pending draft at all, so today it would not refuse them. Closing that needs a live check against
GitHub at save time, not another local fixture. Unticked, and it should stay unticked until that
live check exists.

**The round-trip against real client documents** that this spec's Checking Plan requires has not
been run; the 28 templates are the plugin's own fixtures.

**Security pass: done, and it blocked.** One critical and three high findings, all fixed and
committed, plus four medium/low. The critical was real and reproduced: the Claude CLI ran inside
the opened project, so a repository carrying its own settings got them loaded and its hooks run.
See this spec's Decision List for the authentication decision that came out of it.

## Risk Tier

**Tier:** HIGH
**Why this tier:** it writes the documents the whole engagement depends on. Silent loss of someone's
words is the worst outcome in the product, and it is discovered late.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the shape library from plugin spec 0007 for every read and write, and
  spec 0009 for saving. No direct file writing in this spec's code
- **Permissions:** build, test and read auto-allowed. New dependencies need confirmation. (Office
  file parsing, and the dependencies it needs, moved to spec 0015.)
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** HIGH — the full ladder
**Specifics:** every mechanical check, the grader, the correctness review, a security pass on how
documents are written (the shape library is the only write path; nothing may bypass it), and a named
human sign-off. The round-trip check must be run against real client documents, not fixtures alone.
(The security pass on parsing untrusted Office files belongs to spec 0015.)

## Decision List
- **When Claude drafts into a field, is the draft saved as a version even if discarded?**
  Resolved 2026-09-24 by Matt — **reversing this spec's original draft answer**: a discarded draft IS
  recorded. Every time Claude is asked to draft a field, the offer and its outcome (accepted, edited
  then accepted, or discarded) are appended to an audit ledger, so "how much of this document was
  AI-drafted, including what we turned down" is answerable later. The record goes to its OWN ledger
  (`.sdlc/metrics/draft-log.jsonl`), never into the document's version history — the version history
  stays a record of content that is actually in the document, which is what makes it readable.
- **Who may edit a document that is waiting for approval?**
  Resolved 2026-09-24 by Matt: confirmed as written — only the person who created the draft, until it
  is approved or rejected. The approver signs off exactly what that one named person put in front of
  them; it cannot change underneath them between reading and signing. Someone else needing a change
  means the draft is rejected and re-raised, which is more friction but leaves an honest trail.
- **How does Studio authenticate to Claude, given that the belt-and-braces hardening flag breaks
  the person's existing sign-in?**
  Raised by this spec's security pass, resolved 2026-09-24 by Matt: Studio keeps using the sign-in
  the person already has. The CLI's `--bare` flag is the one that strips settings-defined hooks
  outright, but it also stops the CLI reading the keychain — measured, it turns every draft and
  combine call into "Not logged in" — so taking it would mean Studio managing an API key of its
  own. The actual fix already landed without that cost: the CLI now runs in an empty directory
  Studio owns, and a project's settings, hooks and CLAUDE.md are discovered from the working
  directory, so there is nothing there to discover. Proven both ways — a marker hook planted in a
  scratch repository ran under the old invocation and does not run under the new one.
  **Revisit if** Studio ever gains a reason to run the CLI inside a project directory, because the
  whole defence is that it does not.
