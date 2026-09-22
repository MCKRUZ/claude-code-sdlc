---
spec: "0004"
name: "scorecard-from-github"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §13"
channel: ""
harness_context: "the event log and report logic in scripts/scorecard.py (.sdlc/metrics/loop-events.jsonl)"
created: "2026-09-19"
---

# Spec 0004 — The scorecard builds itself from the code host's history

## Goal

The loop scorecard's events are imported from the code host's own record of pull requests, reviews and
deploys, so the numbers appear without anyone recording them by hand.

## Why

The scorecard is how the team steers: how much work is accepted as-is, how long checks wait, how often
a change fails. Today those events only exist if someone remembers to run a command after every merge,
which means in practice the log is empty and the scorecard reads "no data" forever. The history is
already in the code host; reading it there makes the numbers true by construction and identical on
everyone's machine.

## Scope

### In scope
- A new import step on `scripts/scorecard.py` that reads the code host and appends events
- Mapping pull requests, reviews, deploy runs and incident-labelled issues onto the existing event types
- Making the import repeatable without creating duplicates
- `scripts/tests/` with recorded host responses as fixtures
- `phases/build-loop.md` — document the import

### Out of scope
- The report itself, its wording, "no data" handling and its refusal of activity metrics — all unchanged.
- Recording events by hand — the existing command keeps working.
- Anything outside GitHub for now; the Azure DevOps equivalent is a later spec.

## Acceptance Checks

- [ ] `scorecard.py import --repo <path> --since <date>` reads the code host and appends events to
      `.sdlc/metrics/loop-events.jsonl`.
- [ ] Every merged pull request produces a merge event carrying whether it merged without rework —
      defined as no commit pushed after the first approval.
- [ ] Every review produces a review-wait sample measured from review request to first approval, with
      a security review flagged as such so it stays on its own line.
- [ ] Deploy runs produce deploy events; a failed deploy produces a change-failure event.
- [ ] Issues carrying the incident label produce incident events with open and close times.
- [ ] Running the import twice over the same period adds no duplicate events — events carry the host's
      own identifier and are matched on it.
- [ ] An import covering a period with no activity writes nothing and reports "no data", never a zero.
- [ ] The import never writes an activity metric — velocity, story points, pull-request counts or lines
      of code — and a test asserts those fields are absent from every written event.
- [ ] With no network or no permission to read the host, the import fails with a clear message, writes
      nothing, and leaves any existing log untouched.
- [ ] `scorecard.py report` output for a log built by import is identical in shape to one built by hand.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** an integration with an external service that writes to a metrics log. No production
data, nothing hard to undo — a bad log can be deleted and re-imported.

## Delegation Plan
- **Scope (file patterns):** `scripts/scorecard.py`, `scripts/tests/**`, `phases/build-loop.md`
- **Context (pattern to reuse):** the existing event shapes and the append-only JSONL log in
  `scorecard.py` — the import writes the same events the record command already writes
- **Permissions:** build, tests, reads auto-allowed. Network calls to the code host must be confirmed;
  tests use recorded responses, never live calls
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm the duplicate-prevention
test genuinely re-runs the import, and that no host credential is read from anywhere but the existing
sign-in.

## Decision List
- **Does "accepted as-is" mean no commits after the first approval, or no review comments requesting
  changes?** Written here as the first, because it is mechanical. Owner: the Pod Lead, before this
  spec is ready.
