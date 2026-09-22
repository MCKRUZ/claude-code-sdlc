---
spec: "0002"
name: "spec-status-deferred"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §12"
channel: ""
harness_context: "the status list STATUS_ORDER in scripts/track_specs.py and the hand-off assembly in scripts/generate_handoff_report.py"
created: "2026-09-19"
---

# Spec 0002 — A spec can be deferred, with a reason

## Goal

A spec can be marked deferred with a written reason, it stops counting as work in progress, and the
reason lands in the hand-over report that closes Build.

## Why

Build ends when a person declares everything committed is done. Today a spec is only draft, ready,
in-flight or merged, so anything the team decided not to build has nowhere to go — it stays in-flight
forever or is quietly deleted, and the hand-over report cannot say what was dropped or why. Recording
the decision is the difference between an honest hand-over and a silent gap.

## Scope

### In scope
- `templates/phases/build/spec.md` — the status list and a reason field
- `scripts/track_specs.py` — the new status, and excluding it from work in progress
- `scripts/generate_handoff_report.py` — generate the deferred-items section
- Every other reader of the status list found by search
- `scripts/tests/`
- `phases/build-loop.md` — document the status

### Out of scope
- `check_gates.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**`
- Who may defer a spec. That is a Studio rule, in spec 0014.
- Reviving a deferred spec later — it simply goes back to draft by hand.

## Acceptance Checks

- [ ] `status: deferred` is valid in a spec's frontmatter, and `deferred_reason` holds one line of text.
- [ ] `check_spec.py` reports a spec with `status: deferred` and an empty `deferred_reason` as NOT READY,
      naming the missing reason.
- [ ] `track_specs.py` counts deferred specs on their own line and excludes them from the in-flight count,
      so a deferred spec never triggers a work-in-progress warning.
- [ ] `generate_handoff_report.py` fills the hand-off report's deferred-items section with one entry per
      deferred spec: its number, title and reason, in spec-number order.
- [ ] With no deferred specs, that section reads "none" — never an empty heading and never a fabricated zero.
- [ ] Every place that reads the status list handles the new value; the change lists each reader it
      updated in the pull request description, found by searching for the status constant and for each
      literal status string.
- [ ] A repository whose specs use only the four old statuses produces byte-identical `track_specs.py`
      output to before this change.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** a change to a shared internal contract that several scripts read. Easy to undo, no
data or infrastructure involved.

## Delegation Plan
- **Scope (file patterns):** `templates/phases/build/spec.md`, `scripts/track_specs.py`,
  `scripts/generate_handoff_report.py`, `scripts/tests/**`, `phases/build-loop.md`, plus any other
  script the status search turns up
- **Context (pattern to reuse):** the existing status handling in `track_specs.py` — extend the list
  and its counters rather than adding a parallel concept
- **Permissions:** build, tests, reads auto-allowed; no installs; stop and ask before editing anything
  the search turns up outside `scripts/`
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm the search for status
readers was exhaustive — that is where this change can quietly break something.

## Decision List
- **Does a deferred spec keep its number?** Yes, written here: numbers are never reused, so the
  hand-over report and the decision log stay readable. Owner: the Pod Lead; answered.
