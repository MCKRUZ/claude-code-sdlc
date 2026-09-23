# Problem Statement
<!-- Phase 0 -- Discovery | Required artifact -->

## Executive Summary
<!-- REQUIRED: 2-3 sentence executive summary written for a non-technical executive - what problem exists, who it affects, and what solving it would mean for the business -->

> Claims adjusters currently have no automated way to catch a duplicate claim submission, which leads to double-payouts that cost the business an estimated $400K a year. Fixing this protects revenue and frees adjusters from manual reconciliation work.

Solving this restores trust in the claims process for both customers and finance.

---

## Stakeholder Personas
<!-- REQUIRED: Minimum 3 personas including at least one technical and one business stakeholder - each row must have all four columns filled in -->

| Persona | Role | Primary Pain Point | Success Looks Like |
|---------|------|-------------------|--------------------|
| Priya N. | Product owner (business) | Can't explain payout variance to finance | Dedup is provably enforced |
| Sam K. | Backend engineer (technical) | No single source of truth for claim state | One system owns claim status |
| Alex R. | Claims adjuster (business) | Manually cross-checks spreadsheets | The system blocks the duplicate for them |

*Minimum: 3 personas. Include at least one technical and one business stakeholder.*

---

## Current State

### Process Flow (As-Is)

```
Adjuster receives claim
    v
Manually checks a shared spreadsheet
    v
Sometimes misses an existing entry
    v
Duplicate claim gets paid out twice
```

### Current State Metrics

| Metric | Current Value | Source | Why It Matters |
|--------|--------------|--------|----------------|
| Duplicate payouts/year | 340 | Finance ledger | Direct cost |
| Average payout | $1,200 | Finance ledger | Sizes the problem |
| Manual reconciliation hours/month | 60 | Ops time tracking | Adjuster time cost |

*Include at least 3 measurable current-state data points. If metrics don't exist, explain why.*

---

## Root Cause Analysis — Five Whys
<!-- REQUIRED: Complete five-whys chain from observable symptom down to root cause, with each level filled in -->

**Symptom observed:** The same claim_id is sometimes paid out twice.

1. **Why?** The claims system accepts any submission without checking for an existing claim_id.
2. **Why?** The submission endpoint was built before claim_id was guaranteed unique upstream.
3. **Why?** The uniqueness guarantee was added later without revisiting the submission path.
4. **Why?** No one owns a cross-team checklist for "upstream guarantee changed."
5. **Why?** There is no automated enforcement of the dedup rule at the point of submission.

<!-- REQUIRED: root-cause-statement -- one clear sentence summarizing the fundamental issue this project addresses -->
**Root Cause Statement:** The claims system has no automated check that rejects a resubmission of an already-processed claim_id.

---

## Problem Scope

**In scope:** What this initiative will address
- Rejecting a duplicate claim_id at submission time

**Out of scope:** What this initiative will NOT address (and why)
- Retroactively auditing historical duplicate payouts -- a separate finance workstream

**Adjacent problems we know exist but are deferring:**
- Claim status visibility for customers

---

## Opportunity Statement

> Completing this project will allow claims adjusters to trust the system's own duplicate check instead of manually cross-referencing a spreadsheet, resulting in an estimated $400K/year in avoided double-payouts.
