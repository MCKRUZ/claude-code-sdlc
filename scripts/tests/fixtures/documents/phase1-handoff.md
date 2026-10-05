# Phase 1 Handoff -- From Discovery to Requirements
<!-- Phase 0 -- Discovery | Required artifact -->

## Discovery Summary
<!-- REQUIRED: One-sentence problem statement restating the root cause and opportunity, plus primary stakeholders, profile, and completion date -->

**Problem statement in one sentence:**
> Claims adjusters have no reliable way to prevent a claim from being processed twice, causing double-payouts.

**Primary stakeholders:** Priya N. (Product), Sam K. (Engineering), Matt K. (Sponsor)
**Profile:** microsoft-enterprise
**Date completed:** 2026-09-23

---

## Decisions Made in Discovery
<!-- REQUIRED: At least one locked decision (D-01+) with what was decided, rationale, and who approved it -->

These decisions are locked - Phase 1 works within them. Any change requires stakeholder sign-off.

| Decision | What Was Decided | Rationale | Who Approved |
|----------|-----------------|-----------|-------------|
| D-01 | Use claim_id as the dedup key | It is already globally unique upstream | Matt K. / 2026-09-20 |

---

## What Phase 1 Must Capture

Based on Discovery, Requirements must address the following gaps and open questions:

### Open Questions Requiring Resolution
<!-- REQUIRED: At least 2 open questions (Q-01, Q-02+) that Phase 1 must resolve, each with which persona or phase needs the answer -->

- [ ] **Q-01** What HTTP status code should a duplicate return? -- *needed by: Engineering*
- [ ] **Q-02** Should a duplicate attempt be logged as an incident? -- *needed by: Operations*

### Personas to Interview

The following stakeholders have identified needs that weren't fully detailed in Discovery:

| Persona | What We Need From Them | Priority |
|---------|----------------------|---------|
| Claims adjuster | Walkthrough of the current manual dedup process | P0 |

### Constraints to Translate into Requirements

These constraints from `constraints.md` need specific requirements written against them:

- C-01: Must run on Azure -- infra requirement, not a functional one
- C-03: SOC 2 audit trail -- needs an explicit logging requirement

---

## Known Risks Entering Requirements

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Legacy mainframe API changes mid-project | L | H | Lock an API version with the mainframe team |

---

## Artifacts Produced in Discovery

| Artifact | Status | Notes |
|----------|--------|-------|
| `problem-statement.md` | Complete | |
| `success-criteria.md` | Complete | |
| `constraints.md` | Complete | |

---

## Exit Gate Status

- [x] Problem statement reviewed by stakeholders
- [x] Success criteria have measurable thresholds for all P0 dimensions
- [x] All constraints documented with rationale
- [x] Stakeholder approval received

**Approved by:** Matt K. on 2026-09-23
