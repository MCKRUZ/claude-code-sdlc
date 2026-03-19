# Phase 5 Handoff — From Implementation to Quality
<!-- Phase 4 — Implementation | Required artifact -->

## Implementation Summary

**Stories completed:** [N P0, N P1, N P2]
**Stories deferred:** [N — listed below]
**Sprints completed:** [N]
**Date completed:** [YYYY-MM-DD]
**Approved by:** [Name]

---

## What Was Built
<!-- REQUIRED: what-was-built — 2-3 paragraphs written for someone not in the room, describing what the system now does and its main components -->

[Two to three paragraphs summarizing what was implemented. Written for someone who wasn't in the room. What does the system now do? What are its main components?]

### Completed Stories

| Story ID | Title | Priority | Notes |
|----------|-------|---------|-------|
| US-001 | | P0 | |
| US-002 | | P0 | |

### Deferred Stories (not implemented)

| Story ID | Title | Priority | Reason | Recommended Action |
|----------|-------|---------|--------|-------------------|
| US-NNN | | P1 | [Why deferred] | [Defer to next release / drop / reschedule] |

---

## Known Issues Entering Quality Review
<!-- REQUIRED: known-issues — technical debt table and design deviations table, even if the answer is "none" — an empty table is acceptable, a missing section is not -->

### Technical Debt Incurred

| # | Description | Location | Priority |
|---|-------------|----------|---------|
| TD-01 | | | P0 / P1 / P2 |

### Deviations from Design

| # | What Changed | Impact | ADR Created? |
|---|-------------|--------|-------------|
| DEV-01 | | Low / Medium / High | Yes / No |

---

## Quality Review Focus Areas

Based on implementation, Phase 5 should pay extra attention to:

- **[Area/component]** — [Why: complexity, uncertainty, late changes, etc.]
- **[Area/component]** — [Why]

### Security Areas of Concern

- [ ] [Authentication implementation] — verify against NFR-SEC01
- [ ] [Input validation] — all user-facing inputs validated
- [ ] [Data handling] — [Any PII or sensitive data handling]

---

## Build Status
<!-- REQUIRED: build-status — all 4 checklist items verified (tests passing, no compilation errors, linting passes, CI green) and last successful build commit recorded -->

- [ ] All unit tests passing (`[test command]`)
- [ ] No compilation errors
- [ ] Linting passes
- [ ] CI pipeline green

**Last successful build:** [Date/commit]

---

## Pre-Quality Checklist

For each of the following, confirm status before Phase 5 begins:

- [ ] No FIXME or TODO in production code paths (only in deferred areas)
- [ ] All P0 story acceptance criteria self-assessed (not necessarily tested)
- [ ] Database migrations tested on a copy of dev data
- [ ] No hardcoded secrets or credentials in code
- [ ] Branch merged to main / release branch

---

## Artifacts Produced in Implementation

| Artifact | Status | Notes |
|----------|--------|-------|
| `implementation-notes.md` | ✅ Complete | [N] decisions, [N] deviations logged |
| Source code | ✅ Complete | [Main branch / tag] |
| Unit tests | ✅ [N]% coverage | |

---

## Exit Gate Status

- [ ] All P0 stories implemented and self-assessed
- [ ] All unit tests passing, no compilation errors
- [ ] Implementation notes document all significant deviations from design
- [ ] Stakeholder approval received

**Approved by:** [Name] on [Date]
