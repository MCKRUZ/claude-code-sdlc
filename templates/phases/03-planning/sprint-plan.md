# Sprint Plan
<!-- Phase 3 — Planning | Required artifact -->

## Overview

**Project:** [Project name]
**Total sprints:** [N]
**Sprint length:** [1 / 2 weeks]
**Team size:** [N developers]
**Velocity (estimated):** [N story points per sprint]
**Date:** [YYYY-MM-DD]

---

## Section Plans

Each section is a logical unit of implementation with clear entry/exit criteria. Sections may run in parallel if they have no shared dependencies.

### Section [N]: [Section Name]
<!-- REQUIRED: section-plan — goal, owner, sprint assignment, estimated effort, P0 stories covered, entry criteria, and at least 2 verifiable exit criteria -->

**Goal:** [One sentence — what this section delivers]
**Owner:** [Name/role]
**Sprint(s):** [Sprint N – Sprint M]
**Estimated effort:** [Story points / days]
**Dependencies:** [None / Section N must complete first]

**P0 stories covered:**
- [ ] US-NNN: [Story title]

**Entry criteria:** [What must be true before this section starts]

**Exit criteria:**
- [ ] [Specific, verifiable condition]
- [ ] All unit tests passing for this section
- [ ] Code reviewed and approved

**Implementation notes:**
> [Specific guidance for implementing this section — key algorithms, patterns, pitfalls]

---

*Repeat Section for each implementation section.*

---

## Sprint Schedule

### Sprint 1 — [Theme/Goal]
<!-- REQUIRED: sprint-schedule — dates, business-value goal, capacity, story assignments with owners, and Definition of Done checklist -->

**Dates:** [Start] – [End]
**Goal:** [One sentence sprint goal tied to business value]
**Capacity:** [N story points]

| Story | Title | Points | Owner | Section |
|-------|-------|--------|-------|---------|
| US-NNN | | | | |

**Sprint 1 risks:**
- [Anything that could derail this sprint]

**Definition of Sprint Done:**
- [ ] Sprint goal achieved
- [ ] All committed stories accepted
- [ ] No P0 bugs open

---

### Sprint 2 — [Theme/Goal]

**Dates:** [Start] – [End]
**Goal:** [One sentence sprint goal]
**Capacity:** [N story points]

| Story | Title | Points | Owner | Section |
|-------|-------|--------|-------|---------|
| US-NNN | | | | |

---

*Add additional sprint sections as needed.*

---

## Dependency Map

```
[Visual dependency map — which sections/stories block others]

Section 1 (Data Layer)
    ├── Section 2 (API) — depends on Section 1
    │       └── Section 4 (Frontend) — depends on Section 2
    └── Section 3 (Background Jobs) — depends on Section 1
```

---

## Velocity & Capacity Summary

| Sprint | Capacity (pts) | Committed (pts) | Buffer |
|--------|---------------|----------------|--------|
| Sprint 1 | | | |
| Sprint 2 | | | |
| **Total** | | | |

---

## P0 Story Coverage
<!-- REQUIRED: p0-story-coverage — every P0 story listed with its assigned sprint, owner, and risk — no unassigned P0 stories permitted -->

All P0 stories must be assigned to a sprint. Unassigned P0 stories are a planning failure.

| Story ID | Title | Sprint | Owner | Risk |
|----------|-------|--------|-------|------|
| US-001 | | Sprint 1 | | |
| US-002 | | Sprint 2 | | |
