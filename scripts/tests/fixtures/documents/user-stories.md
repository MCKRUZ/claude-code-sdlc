# User Stories
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

User stories capture what users want to accomplish. Each story is independent, negotiable, valuable, estimable, small, and testable (INVEST). P0 stories must each have an E2E test before the Build loop is declared feature-complete.

---

## Story Map

```
Stage: Submit → Review → Settle

P0: US-001 Submit claim     US-002 Reject duplicate
P1: US-003 Track status     US-004 Upload extra evidence
P2:                                              US-005 Export history
```

---

## P0 Stories — Must Ship

### US-001: Submit a claim online

**As a** policyholder,
**I want to** submit a claim with photos from my browser,
**so that** I do not have to phone the call centre.

**Priority:** P0
**Estimate:** 5
**Linked requirement:** FR-001

**Acceptance criteria:**
- [ ] **Given** a valid policy, **when** I submit the claim form, **then** I receive a claim reference
- [ ] **Given** photos under 10 MB each, **when** I attach them, **then** they appear on the confirmation page
- [ ] **Given** a missing required field, **when** I submit, **then** the form shows which field needs attention and keeps my draft

**Definition of Done:**
- [ ] Feature implemented
- [ ] Unit tests passing
- [ ] E2E test written and passing
- [ ] Reviewed by the claims operations lead

---

### US-002: Reject a duplicate claim

**As a** claims adjuster,
**I want to** be stopped from creating a claim that already exists,
**so that** we never pay out twice.

**Priority:** P0
**Estimate:** 3
**Linked requirement:** FR-002

**Acceptance criteria:**
- [ ] **Given** an existing claim reference, **when** the same claim is submitted again, **then** the system shows the existing reference

---

*Add additional P0 stories.*

---

## P1 Stories — Should Ship

### US-003: Track claim status

**As a** policyholder,
**I want to** see where my claim is in the process,
**so that** I know when to expect a decision.

**Priority:** P1
**Estimate:** 3
**Linked requirement:** FR-004

**Acceptance criteria:**
- [ ] **Given** a submitted claim, **when** I open its page, **then** I see its current stage and last update time

---

## P2 Stories — Nice to Have

### US-005: Export claim history

**As a** policyholder,
**I want to** download my past claims as a spreadsheet,
**so that** I can keep my own records.

**Priority:** P2
**Estimate:** 2

**Acceptance criteria:**
- [ ] The download contains one row per claim with its reference, date and status

---

## Story Summary

| Story ID | Title | Persona | Priority | Estimate | FR Link |
|----------|-------|---------|---------|---------|---------|
| US-001 | Submit a claim online | Policyholder | P0 | 5 | FR-001 |
| US-002 | Reject a duplicate claim | Claims adjuster | P0 | 3 | FR-002 |
| US-003 | Track claim status | Policyholder | P1 | 3 | FR-004 |
| US-005 | Export claim history | Policyholder | P2 | 2 | |

**Total P0 stories:** 2
**Total P1 stories:** 1
**Total P2 stories:** 1
**Total estimate:** 13 points
