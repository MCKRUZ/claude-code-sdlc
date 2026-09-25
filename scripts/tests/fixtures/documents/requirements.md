# Requirements
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

**Project:** Acme Claims Portal
**Version:** 1.0
**Date:** 2026-09-23
**Status:** Draft

Requirements are testable statements of what the system must do. Each requirement traces back to a stakeholder need from Discovery.

---

## Functional Requirements

### FR-001: Reject duplicate claim submissions

**Priority:** P0 (Must Have) / P1 (Should Have) / P2 (Nice to Have)
**Source:** Claims adjuster persona
**Rationale:** Duplicate submissions cause double-payouts and reconciliation work.

**Requirement:**
<!-- REQUIRED: requirement-statement — "The system SHALL [verb] [object] [condition]." — must be testable and unambiguous -->
> The system SHALL reject a claim submission whose claim_id matches an existing claim.

**Acceptance criteria:**
<!-- REQUIRED: acceptance-criteria — at least 2 Given/When/Then statements that a tester can execute to verify this requirement -->
- [ ] Given a claim with an existing claim_id, when it is submitted again, then the API returns 409
- [ ] Given a new claim_id, when it is submitted, then the API returns 201 and persists one row

**Dependencies:** none

---

### FR-002: Persist the first submission

**Priority:** P0 / P1 / P2
**Source:** Claims adjuster persona
**Rationale:** The first submission of any claim must always be recorded.

**Requirement:**
<!-- REQUIRED: requirement-statement — "The system SHALL [verb] [object] [condition]." — must be testable and unambiguous -->
> The system SHALL persist exactly one row for the first submission of a given claim_id.

**Acceptance criteria:**
<!-- REQUIRED: acceptance-criteria — at least 1 Given/When/Then statement that a tester can execute to verify this requirement -->
- [ ] Given a brand-new claim_id, when it is submitted, then exactly one row exists afterward

---

*Add additional FR-NNN sections as needed.*

---

## Requirement Traceability

<!-- Include 'Source Document(s)' column only if document intake was performed in Phase 0 -->
| Req ID | Description | Priority | Source Persona | User Story | Source Document(s) | Status |
|--------|-------------|----------|---------------|------------|-------------------|--------|
| FR-001 | Reject duplicate claims | P0 | Claims adjuster | US-14 | — | Draft |
| FR-002 | Persist first submission | P0 | Claims adjuster | US-15 | — | Draft |

---

## Prioritization Rationale

**P0 criteria:** Blocks go-live if missing
**P1 criteria:** Materially improves the launch but not blocking
**P2 criteria:** Nice to have, deferrable past launch

---

## Requirements Review Notes

| Reviewer | Date | Finding | Resolution |
|----------|------|---------|-----------|
| Priya N. | 2026-09-23 | None | Approved |
