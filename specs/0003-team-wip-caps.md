---
spec: "0003"
name: "team-wip-caps"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §11"
channel: ""
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "wip_warnings() and the --wip-cap flag in scripts/track_specs.py"
created: "2026-09-19"
---

# Spec 0003 — Work-in-progress limits per team, and the review-wait alarm

## Goal

Each team has its own limit on specs in progress and its own review-wait alarm, both read from the
project's cadence plan rather than passed in by hand.

## Why

The limit exists to stop a team opening more work than it can check. One number for the whole project
cannot do that: a team with three checkers and a team with eight sit under the same ceiling, so the
slow queue stays invisible until reviews are days old. The limit also has to live in the project, not
in whoever remembers to type it, or it is not a rule.

## Scope

### In scope
- A structured limits block in the cadence plan, and its template
- `scripts/track_specs.py` — read the block, warn per team, keep the existing flag working
- `scripts/scorecard.py` — read the alarm thresholds so review-wait can be reported against them
- `scripts/tests/`
- `phases/03-foundation.md` and `phases/build-loop.md` — document the block

### Out of scope
- Refusing a hand-off when a team is at its limit. That is spec 0005's job; this one only reports.
- `check_gates.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**`
- Any change to which activity metrics are refused.

## Acceptance Checks

- [ ] The cadence plan carries a machine-readable block listing, per team: the team name, its limit on
      specs in progress, its review-wait alarm and its security-review alarm, both in hours.
- [ ] `track_specs.py` reads that block and reports, per team: specs in progress, the limit, and whether
      the team is at or over it.
- [ ] A team over its limit produces a warning naming the team, the count and the limit.
- [ ] `--wip-cap N` still works and still applies to the whole project; when both are present, the
      per-team limits are used and the output says the flag was ignored.
- [ ] With no block in the cadence plan, `track_specs.py` output is byte-identical to today's.
- [ ] A malformed block — an unknown key, a limit that is not a positive whole number, a team absent
      from the roster in spec 0001 — is reported as a clear error naming the line, and does not crash.
- [ ] `scorecard.py report` shows the median review wait against its alarm threshold, and shows the
      security-review wait against its own threshold on its own line.
- [ ] Defaults when a team is present but a threshold is absent: 24 hours for review, 48 for security.
      The output states that a default was used.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** shared internal tooling, no data or infrastructure, fully reversible. It changes a
number people steer by, so wrong output is misleading rather than dangerous.

## Delegation Plan
- **Scope (file patterns):** `scripts/track_specs.py`, `scripts/scorecard.py`, `scripts/tests/**`,
  the cadence-plan template, `phases/03-foundation.md`, `phases/build-loop.md`
- **Context (pattern to reuse):** `wip_warnings()` — extend it to take a map of limits rather than one
  number, and keep its message shape
- **Permissions:** build, tests, reads auto-allowed; no installs
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The "no block present means identical output" check
is the one to run by hand against a real project.

## Decision List
- none — the thresholds themselves are a per-project setting, not a decision this change makes.
