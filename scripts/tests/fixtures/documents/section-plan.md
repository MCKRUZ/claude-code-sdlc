# Section 1: Claims intake rejects duplicates
<!-- REQUIRED: Replace N with section number and give it a clear, outcome-focused name -->

**Owner:** Sam K.
**Sprint(s):** Sprint 3 – Sprint 3
**Estimated effort:** M — 3-5 days
**Status:** In Progress

---

## Goal
<!-- REQUIRED: One sentence — what capability does the system have when this section is complete that it didn't have before? -->

The claims API rejects a duplicate claim submission with a 409 instead of double-processing it.

## Epics / Stories Covered

| Epic/Story ID | Title | P-Level |
|--------------|-------|---------|
| US-001 | Reject duplicate claim | P0 |

## Entry Criteria
<!-- REQUIRED: What must be true before work on this section can begin? -->

- [x] Design doc approved
- [x] Database migration for the unique index is ready to apply

## Exit Criteria
<!-- REQUIRED: Specific, verifiable conditions that mark this section complete — not "done when it works" -->

- [x] Resubmitting an existing claim_id returns 409
- [x] All unit tests passing for components in this section
- [x] Code reviewed and approved

## Dependencies

| Depends On | Type | Notes |
|-----------|------|-------|
| Section 0 / Database schema | Blocking | Needs the claims table to exist |

## Implementation Guidance
<!-- REQUIRED: Key design decisions, patterns to follow, pitfalls to avoid — enough for the implementer to start without ambiguity -->

Enforce the uniqueness constraint at the database level with a unique index on claim_id, not only in application code, so a race between two concurrent requests still resolves to exactly one row.

## Interfaces

What this section exposes to other sections:

| Interface | Type | Contract |
|-----------|------|---------|
| POST /claims | External | Returns 201 with the claim, or 409 on duplicate |

## Test Strategy

| Test Type | What to Test | Coverage Target |
|-----------|-------------|----------------|
| Unit | DuplicateGuard | 90% |
| Integration | Concurrent submission | All happy + error paths |

## Risk

| Risk | Mitigation |
|------|-----------|
| Race condition under load | Load test the unique-index path before sign-off |

## Verification Criteria
<!-- How each exit criterion will be verified. Every criterion must be testable by an agent or human. -->

| Criterion | Verification Method | Pass Condition |
|-----------|-------------------|----------------|
| Resubmitting returns 409 | Integration test | HTTP 409 returned, no new row |

## Evaluator Contract
<!-- Defines what the section evaluator agent checks after implementation completes.
     This contract is the grading rubric — the evaluator reads it and grades against it. -->

**Evaluation scope:** src/Claims/**

**Grading rubric:**
1. **Functional completeness** — All exit criteria pass conditions met
2. **Test quality** — Coverage target met, edge cases from Test Strategy covered
3. **Interface compliance** — Exposed interfaces match the Interfaces table above
4. **Code quality** — Functions within profile size limits, no deep nesting, immutability patterns followed
5. **Deviation accountability** — Any deviation from Implementation Guidance is documented with rationale

**Fail conditions (blocking):**
- Any exit criterion pass condition not met
- Test coverage below section target
- Interface contract broken without documented ADR

**Warn conditions (non-blocking):**
- Code style deviations from profile conventions
- Missing edge case tests (when not in critical path)
