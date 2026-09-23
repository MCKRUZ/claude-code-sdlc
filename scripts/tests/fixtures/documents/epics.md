# Epics
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

Epics are large user-facing capabilities. Each epic will be decomposed into Stories during Phase 2 Design. P0 epics must each have at least one E2E test before the Build loop is declared feature-complete.

---

## Epic Map

```
Stage: [Discovery/Setup] -> [Core Action] -> [Review/Outcome]

P0: [EP-001]               [EP-002]          [-]
```

---

## P0 Epics — Must Ship
<!-- REQUIRED: at-least-one-p0-epic — define at least one P0 epic with a complete Given/When/Then acceptance criterion -->

### EP-001: Reject duplicate claims

**As a** claims adjuster,
**I want to** be blocked from submitting the same claim twice,
**so that** payouts are never duplicated.

**Priority:** P0
**Estimate:** 3
**Linked requirement:** FR-001

**Acceptance criteria:**
- [ ] **Given** an existing claim_id, **when** it is submitted again, **then** the API returns 409
- [ ] **Given** a new claim_id, **when** it is submitted, **then** the API returns 201

**Definition of Done:**
- [ ] Feature implemented
- [ ] Unit tests passing
- [ ] E2E test written and passing
- [ ] Reviewed by Priya N.

---

### EP-002: Persist first submission

**As a** claims adjuster,
**I want to** have my first submission always recorded,
**so that** no claim is silently lost.

**Priority:** P0
**Estimate:** 2
**Linked requirement:** FR-002

**Acceptance criteria:**
- [ ] **Given** a brand-new claim_id, **when** it is submitted, **then** exactly one row exists afterward

---

*Add additional P0 epics.*

---

## P1 Epics — Should Ship

### EP-003: Claim status dashboard

**As a** claims adjuster,
**I want to** see the status of every claim I've filed,
**so that** I don't have to ask engineering.

**Priority:** P1
**Estimate:** 5
**Linked requirement:** FR-010

**Acceptance criteria:**
- [ ] **Given** a filed claim, **when** I open the dashboard, **then** its current status is shown

---

## P2 Epics — Nice to Have

### EP-004: Export claims to CSV

**As a** claims adjuster,
**I want to** export my claims to CSV,
**so that** I can analyze them offline.

**Priority:** P2
**Estimate:** 2

**Acceptance criteria:**
- [ ] Export produces a valid CSV with one row per claim

---

## Epic Summary

| Epic ID | Title | Persona | Priority | Estimate | FR Link |
|---------|-------|---------|---------|---------|---------|
| EP-001 | Reject duplicate claims | Claims adjuster | P0 | 3 | FR-001 |
| EP-002 | Persist first submission | Claims adjuster | P0 | 2 | FR-002 |
| EP-003 | Claim status dashboard | Claims adjuster | P1 | 5 | FR-010 |

**Total P0 epics:** 2
**Total P1 epics:** 1
**Total P2 epics:** 1
**Total estimate:** 12 points
