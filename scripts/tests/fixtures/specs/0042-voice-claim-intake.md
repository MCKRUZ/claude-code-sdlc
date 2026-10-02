---
spec: "0042"
name: "voice-claim-intake"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix
risk: MEDIUM
source: "US-012"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@priya-n"
developer: ""
checker: ""
team: "core"
harness_context: ""      # the ONE existing pattern this change reuses (DoR requires this named)
created: "2026-10-02"
---

# Spec 0042 — voice-claim-intake

## Goal
A caller can start a claim by phone and get a claim reference read back to them.

## Why
Claimants without web access currently wait on hold to start a claim; a spoken intake removes the wait for the most common case.

## Scope

### In scope
- `src/voice/**` — the call flow and prompts for starting a claim
- `tests/voice/**` — tests for the same

### Out of scope
- Payments and any change to claim adjudication
- Outbound calls

## Acceptance Checks
- [ ] A completed intake call creates exactly one claim record and reads its 8-character reference back to the caller
- [ ] A caller who hangs up before confirming creates no claim record

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** new business logic behind an existing authenticated telephony integration; no payments or identity changes.

## Delegation Plan
- **Scope (file patterns):** `src/voice/**`, `tests/voice/**`
- **Context (pattern to reuse):** the existing web claim-intake handler
- **Permissions:** auto-allowed: build, test, lint, reads. Confirm-required: installs, network
- **Gated paths touched:** none

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author Checker listens to a recorded sample call.

## Decision List
- none
