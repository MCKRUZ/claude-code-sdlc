---
spec: "0014"
name: "studio-feature-complete"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screen 24c"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "plugin spec 0002 for the deferred status, and scripts/generate_handoff_report.py for the hand-over document"
created: "2026-09-19"
---

# Spec 0014 — Declaring Build feature-complete

## Goal

A person can end Build: every spec that is not merged is either finished first or deferred with a
reason, each team lead confirms their own list, and the declaration produces the hand-over document
that starts the next stage.

## Why

Build has no final inspection, because every change was already checked on its own. What it has instead
is a decision, and the decision is only honest if nothing can be left unexplained: an unbuilt promise
that nobody wrote down becomes a surprise for whoever inherits the system. This screen makes the
unexplained case impossible.

## Scope

### In scope
- The state of the committed backlog: merged, in progress, not started
- For each spec that is not merged: finish first, or defer with a reason
- Confirmation by each team lead of their own team's list
- The hand-over document drafting itself as choices are made
- The declaration itself, and moving the project to the next stage

### Out of scope
- The contents of the hand-over document beyond the deferred items — the plugin's own generator
  produces the rest.
- Reopening Build after the declaration; late changes ride the loop one spec at a time as usual.
- Anything about the next stage.

## Acceptance Checks

- [ ] The screen lists every spec that is not merged, grouped so a run of related ones can be handled
      together, with its team, state and risk level.
- [ ] Each one must be set to finish first or deferred; deferring requires a reason in the person's own
      words, and a suggested reason may be offered but never saved unedited by default.
- [ ] Deferring writes the deferred status and the reason to the spec file, through the plugin, as a commit.
- [ ] The declaration is refused while any spec is undecided, and says how many are left.
- [ ] The declaration is refused while any spec is set to finish first, naming them and who is building each.
- [ ] Each team lead confirms their own team's list; the declaration is refused until every team with a
      spec in the list has confirmed.
- [ ] The person declaring is recorded by name in the hand-over document and in the commit.
- [ ] The hand-over document is produced by the plugin's own generator, with the deferred items and
      reasons included, and the screen shows which of its sections are complete before declaring.
- [ ] Declaring moves the project to the next stage in its own state file, through the plugin's command,
      and nothing else changes.
- [ ] A spec that is deferred no longer counts towards any team's work in progress.
- [ ] After the declaration the screen becomes read-only and states when it was declared and by whom.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it advances the project's stage and writes several spec files, all recorded and
reversible. The real risk is a dishonest record rather than a technical failure, which the refusals
above address.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** plugin spec 0002 for deferring and the plugin's hand-off generator —
  Studio never writes the hand-over document itself
- **Permissions:** build, test and read auto-allowed. Writing spec files and advancing the stage must
  be confirmed during development
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm each refusal path leaves
the project exactly as it was, including the specs already deferred in that sitting.

## Decision List
- **Who may declare Build feature-complete?** Written here as the project owner, with each team lead
  confirming their own list. Owner: Matt, before this spec is ready.
- **Can a spec be deferred after the declaration?** Written here as no — late work is a new spec.
  Owner: Matt.
