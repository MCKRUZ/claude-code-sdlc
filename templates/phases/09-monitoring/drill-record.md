# Alert Drill Record
<!-- Phase 9 — Monitoring | Required artifact -->

The proof that the pager works. Until an alert has fired it is a configuration, not a control — the
threshold may be wrong, or the routing may point at a rota that no longer exists, and the way to
find out is not at 3am during a real incident.

Fill this in **as each drill runs**. A record reconstructed afterwards from memory is worth less
than no record at all, because it reads exactly like one that was observed.

**Principles used:**
- Every alert marked Critical in `alert-definitions.md` gets drilled — no sampling
- The responder works `incident-response.md`, not their memory; a missing playbook step is the
  point of the exercise, not a failed drill
- Detection time is observed, never estimated
- A drill that changed nothing is recorded as one — it is the difference between believing it
  works and having watched it work

---

## Drill Summary
<!-- REQUIRED: drill-summary — one row per Critical alert in alert-definitions.md, each with an observed detection time, the person it actually reached, and an outcome -->

| Alert | Date | Trigger method | Detection time | Reached | Expected | Responder | Outcome |
|-------|------|----------------|----------------|---------|----------|-----------|---------|
| [Alert name from alert-definitions.md] | [YYYY-MM-DD] | [synthetic load / forced error / provider test-fire] | [Nm Ns] | [name] | [name] | [name] | [pass / corrected] |

**Critical alerts defined:** [N]
**Drilled:** [N]
**Routing corrections made:** [N]
**Playbook corrections made:** [N]

> A trigger method of *provider test-fire* proves routing but says nothing about whether the
> threshold is right. Note where that is all that was done.

---

## Per-Alert Detail
<!-- REQUIRED: per-alert-detail — for each Critical alert: how it was triggered, what the responder did, and what changed as a result -->

### [Alert name]

**Triggered by:** [what was actually done to make the condition true]
**Condition as configured:** [the threshold from alert-definitions.md]
**Page arrived:** [YYYY-MM-DD HH:MM] — [Nm Ns] after the triggering condition
**Routed to:** [who was paged] — expected [who alert-definitions.md says]
**Responder:** [name]

**What the responder did:**
1. [Step taken, working from incident-response.md]
2. [Step taken]

**Was `incident-response.md` sufficient?** [yes / no — what was missing or wrong]

**Changed as a result:**
- [Threshold corrected / routing repointed / playbook step rewritten / nothing]

---

*Repeat this section for each Critical alert.*

---

## Alerts Not Drilled
<!-- Leave the table empty if every Critical alert was drilled. An undrilled Critical alert needs a named owner and a date, not an explanation. -->

| Alert | Why not drilled | Owner | Drill scheduled for |
|-------|-----------------|-------|---------------------|

---

## Sign-off

**Drills run by:** [name]
**Date range:** [YYYY-MM-DD] to [YYYY-MM-DD]
**Reviewed by:** [name — the person accountable for the on-call rota]
