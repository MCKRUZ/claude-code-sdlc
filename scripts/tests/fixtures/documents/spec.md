---
spec: "0042"
name: "duplicate-claim-409"
status: ready
type: feature
risk: HIGH
owner: "@MCKRUZ"
developer: "@sam-k"
checker: "@priya-n"
team: "claims"
harness_context: "the existing claims submission path"
created: "2026-09-24"
---

# Spec 0042 — Reject a duplicate claim

## Goal

A second submission of a claim_id that has already been processed is rejected outright, so the
same claim can never be paid twice.

## Why

Two claims were paid twice last quarter. The money is recoverable; the client's confidence in
the numbers is not, and every downstream report inherits the error silently.

## Scope

### In scope
- The claims submission endpoint
- The dedup check and its database index

### Out of scope
- Refunds and reversals — a separate change with its own risk tier
- The batch import path, which never resubmits

## Acceptance Checks
- [ ] A duplicate submission returns 409 with body `{ "error": "duplicate claim" }`
- [ ] Two concurrent submissions of the same claim_id persist exactly 1 row
- [ ] A first submission of an unseen claim_id still returns 201

## Risk Tier

**Tier:** HIGH
**Why this tier:** it touches money movement and the claims schema, and a wrong rejection is
invisible to the person who submitted it.

## Delegation Plan
- **Scope (file patterns):** the claims service only
- **Context (pattern to reuse):** the existing submission path's validation layer
- **Permissions:** build, test and read auto-allowed; the migration needs confirming
- **Gated paths touched:** migrations

## Checking Plan

**Ladder depth:** HIGH
**Specifics:** every mechanical check, the grader, a correctness review, a security pass on the
money path, and a named human sign-off in the pull request.

## Decision List
- **What does a caller see when the dedup check itself is unavailable?** Resolved by Matt: fail
  closed and return 503 — paying twice is worse than pausing.
