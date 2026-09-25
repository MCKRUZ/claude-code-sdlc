# ADR-007: Use PostgreSQL for claim storage

**Status:** Accepted
**Date:** 2026-09-23
**Deciders:** Priya N., Sam K.
**Supersedes:** N/A

---

## Context
<!-- REQUIRED: What is the situation that forces a decision? What forces are at play? Include constraints, requirements, and the problem being solved. 2-4 sentences minimum. -->

Claims data needs strong consistency guarantees and the team already operates PostgreSQL for two other services, so the on-call rotation already knows the failure modes.

## Decision
<!-- REQUIRED: What was decided? State it as an active sentence: "We will..." or "We have decided to..." -->

We will use PostgreSQL as the system of record for all claim data.

## Rationale
<!-- REQUIRED: Why this decision over the alternatives? What criteria were used? -->

PostgreSQL's transactional guarantees directly satisfy the duplicate-claim rejection requirement, and reusing an already-operated engine avoids a new on-call burden.

## Alternatives Considered

### Alternative 1: DynamoDB
**Description:** A managed NoSQL store.
**Why rejected:** Weaker consistency guarantees for the duplicate-claim check.

## Consequences

**Positive:**
- Reuses existing operational expertise

**Negative / Trade-offs:**
- Vertical scaling ceiling reached sooner than a distributed store

**Risks:**
- None identified

## Implementation Notes

See src/Claims/ClaimsDbContext.cs.

## Review Trigger

If write throughput exceeds 5k/s sustained.
