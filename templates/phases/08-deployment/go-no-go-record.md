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

**Decision:** [go | no-go | go-with-conditions]
**Date and time:** [YYYY-MM-DD HH:MM] [timezone]
**Deploying:** [version / release tag / commit — a specific artifact, not "latest"]
**Target:** [staging only | staging + production]
**Deployment window:** [start] to [end]
**Chaired by:** [name]

---

## Roles Polled
<!-- REQUIRED: roles-polled — every role, the named person, their answer, and any condition attached -->

| Role | Name | Answer | Condition attached |
|------|------|--------|--------------------|
| Engineering | [name] | [go / no-go / not polled] | [none] |
| Product | [name] | [go / no-go / not polled] | [none] |
| Operations / on-call | [name] | [go / no-go / not polled] | [none] |
| Security | [name] | [go / no-go / not polled] | [none] |
| Client sponsor | [name] | [go / no-go / not polled] | [none] |

*Add or remove rows to match the roles this engagement actually has. Do not delete a role because
it was hard to reach — record it as `not polled`, which is the fact worth keeping.*

---

## Conditions
<!-- Leave empty if the decision was an unconditional go. A condition with no owner is not a condition. -->

| # | Condition | Owner | Clear by | Status |
|---|-----------|-------|----------|--------|
| C-1 | [what must be true] | [name] | [before cutover / YYYY-MM-DD] | [open] |

---

## Risks Accepted

| Risk | Accepted by | Rationale | Mitigation if it lands |
|------|-------------|-----------|------------------------|
| [what could go wrong] | [name] | [why it was acceptable] | [what we do] |

---

## Rollback Position

**Trigger condition:** [what would cause us to roll back]
**Procedure:** [reference to RUNBOOK.md section, and the rollback-rehearsal.md that proved it]
**Decision owner during the window:** [name — who can call the rollback without reconvening]

---

## Notifications

| Audience | When | Channel | Owner |
|----------|------|---------|-------|
| [who] | [before / during / after] | [channel] | [name] |
