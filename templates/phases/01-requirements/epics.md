# Epics
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

Epics are large user-facing capabilities. Each epic will be decomposed into Stories during Phase 3 Planning. P0 epics must each have at least one E2E test by Phase 6.

---

## Epic Map

```
[Arrange epics in workflow order — the horizontal axis is user journey stages,
 vertical axis is priority (P0 at top). ASCII table or list is fine.]

Stage: [Discovery/Setup] → [Core Action] → [Review/Outcome]

P0: [EP-001]               [EP-003]          [EP-005]
P1: [EP-002]               [EP-004]          [EP-006]
P2:                                           [EP-007]
```

---

## P0 Epics — Must Ship
<!-- REQUIRED: at-least-one-p0-epic — define at least one P0 epic with a complete Given/When/Then acceptance criterion -->

### EP-001: [Epic title]

**As a** [persona],
**I want to** [action],
**so that** [value/outcome].

**Priority:** P0
**Estimate:** [Story points or T-shirt size]
**Linked requirement:** [FR-NNN]

**Acceptance criteria:**
- [ ] **Given** [starting condition], **when** [user action], **then** [observable outcome]
- [ ] **Given** [starting condition], **when** [user action], **then** [observable outcome]
- [ ] **Given** [error condition], **when** [user action], **then** [error is handled gracefully]

**Definition of Done:**
- [ ] Feature implemented
- [ ] Unit tests passing
- [ ] E2E test written and passing
- [ ] Reviewed by [persona/stakeholder]

---

### EP-002: [Epic title]

**As a** [persona],
**I want to** [action],
**so that** [value/outcome].

**Priority:** P0
**Estimate:** [Story points or T-shirt size]
**Linked requirement:** [FR-NNN]

**Acceptance criteria:**
- [ ] **Given** [condition], **when** [action], **then** [outcome]

---

*Add additional P0 epics.*

---

## P1 Epics — Should Ship

### EP-00N: [Epic title]

**As a** [persona],
**I want to** [action],
**so that** [value/outcome].

**Priority:** P1
**Estimate:** [Story points or T-shirt size]
**Linked requirement:** [FR-NNN]

**Acceptance criteria:**
- [ ] **Given** [condition], **when** [action], **then** [outcome]

---

## P2 Epics — Nice to Have

### EP-00N: [Epic title]

**As a** [persona],
**I want to** [action],
**so that** [value/outcome].

**Priority:** P2
**Estimate:** [Story points or T-shirt size]

**Acceptance criteria:**
- [ ] [Criteria]

---

## Epic Summary

| Epic ID | Title | Persona | Priority | Estimate | FR Link |
|---------|-------|---------|---------|---------|---------|
| EP-001 | | | P0 | | FR-001 |
| EP-002 | | | P0 | | |
| EP-003 | | | P1 | | |

**Total P0 epics:** [N]
**Total P1 epics:** [N]
**Total P2 epics:** [N]
**Total estimate:** [N points / days]
