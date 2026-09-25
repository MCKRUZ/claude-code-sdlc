# Phase 2 Handoff — From Requirements to Design
<!-- Phase 1 — Requirements | Required artifact -->

## Requirements Summary
<!-- REQUIRED: Total requirement counts (functional and non-functional), P0 epic count, completion date, and name of approver -->

**Total requirements:** 12 functional, 9 non-functional
**P0 epics:** 2
**Date completed:** 2026-09-23
**Approved by:** Priya N.

---

## Decisions Made in Requirements
<!-- REQUIRED: At least one locked decision (D-01+) recording what was decided, the rationale, and who approved it -->

| Decision | What Was Decided | Rationale | Who Approved |
|----------|-----------------|-----------|-------------|
| D-01 | Use PostgreSQL for claim storage | Strong consistency for dedup checks | Priya N. |

---

## What Design Must Address

### Architectural Questions Raised by Requirements
<!-- REQUIRED: At least 2 architectural questions (AQ-01, AQ-02+) that Design must answer, each traced to the FR or NFR that raises it -->

- [ ] **[AQ-01]** How is the duplicate-claim check kept consistent under concurrent writes? — *raised by: FR-001*
- [ ] **[AQ-02]** What index supports the p95 < 300ms lookup? — *raised by: NFR-P01*

### NFRs That Directly Shape Architecture

| NFR ID | Requirement | Design Implication |
|--------|-------------|-------------------|
| NFR-P01 | Response time p95 < 300ms | Needs an index on claim_id |

### P0 Flows That Need System Diagrams

| Epic ID | Title | What the Diagram Must Show |
|---------|-------|---------------------------|
| EP-001 | Reject duplicate claims | The dedup check sequence |

---

## Open Items from Requirements

| Item | Description | Blocking? | Resolution Path |
|------|-------------|-----------|----------------|
| OI-01 | Retention period for rejected claims undecided | No | Legal to confirm by Phase 2 |

---

## Known Risks Entering Design

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Concurrent submission race | M | H | Unique constraint on claim_id |

---

## Artifacts Produced in Requirements

| Artifact | Status | Notes |
|----------|--------|-------|
| `requirements.md` | ✅ Complete | 12 functional requirements |
| `non-functional-requirements.md` | ✅ Complete | 9 NFRs across 6 categories |
| `epics.md` | ✅ Complete | 2 P0, 1 P1, 1 P2 epics |

---

## Exit Gate Status

- [ ] All P0 requirements have measurable acceptance criteria
- [ ] All P0 epics have acceptance criteria with Given/When/Then format
- [ ] NFRs cover performance, security, reliability, and maintainability
- [ ] Stakeholder approval received

**Approved by:** Priya N. on 2026-09-23
