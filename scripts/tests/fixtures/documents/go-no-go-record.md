# Go/No-Go Record
<!-- Phase 8 — Deployment | Required artifact -->

The recorded output of the Step 0 ceremony — the most consequential human gate in the lifecycle.

Fill this in **during the gate**, not afterwards. The value of the record is that it captures what
people actually said before anyone knew how the deployment went. A go/no-go reconstructed later is
indistinguishable from a deployment nobody was asked about.

**Principles used:**
- Silence is not agreement — a role that was not polled is recorded as not polled
- Conditions are tracked to a named owner, or they are not conditions
- Risks accepted here are accepted by a person, not by the team

---

## The Decision
<!-- REQUIRED: the-decision — go / no-go / go-with-conditions, dated, tied to a specific release -->

**Decision:** go
**Date and time:** 2026-09-23 21:00 UTC
**Deploying:** v1.4.0 (commit a1b2c3d)
**Target:** staging + production
**Deployment window:** 22:00 to 23:00 UTC
**Chaired by:** Sam K.

---

## Roles Polled
<!-- REQUIRED: roles-polled — every role, the named person, their answer, and any condition attached -->

| Role | Name | Answer | Condition attached |
|------|------|--------|--------------------|
| Engineering | Sam K. | go | none |
| Product | Priya N. | go | none |
| Operations / on-call | Jordan T. | go | none |
| Security | Alex R. | go | none |
| Client sponsor | not polled | not polled | none |

*Add or remove rows to match the roles this engagement actually has. Do not delete a role because
it was hard to reach — record it as `not polled`, which is the fact worth keeping.*

---

## Conditions

| # | Condition | Owner | Clear by | Status |
|---|-----------|-------|----------|--------|
| C-1 | none | — | — | closed |

---

## Risks Accepted

| Risk | Accepted by | Rationale | Mitigation if it lands |
|------|-------------|-----------|------------------------|
| Migration takes longer than the window | Sam K. | Tested at production scale on a data copy | Extend window by 15 min, comms pre-drafted |

---

## Rollback Position

**Trigger condition:** Error rate exceeds 2% for 5 minutes
**Procedure:** RUNBOOK.md §4, rehearsed in rollback-rehearsal.md
**Decision owner during the window:** Sam K.

---

## Notifications

| Audience | When | Channel | Owner |
|----------|------|---------|-------|
| Claims ops team | before | Slack #claims-ops | Sam K. |
| Client sponsor | after | Email | Priya N. |
