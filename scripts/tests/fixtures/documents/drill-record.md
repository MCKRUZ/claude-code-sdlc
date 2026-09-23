# Alert Drill Record
<!-- Phase 9 — Monitoring | Required artifact -->

The proof that the pager works.

**Principles used:**
- Every alert marked Critical gets drilled — no sampling

---

## Drill Summary
<!-- REQUIRED: drill-summary — one row per Critical alert in alert-definitions.md, each with an observed detection time, the person it actually reached, and an outcome -->

| Alert | Date | Trigger method | Detection time | Reached | Expected | Responder | Outcome |
|-------|------|----------------|----------------|---------|----------|-----------|---------|
| High Error Rate | 2026-09-10 | synthetic load | 4m 30s | Sam K. | Sam K. | Sam K. | pass |
| Instance Down | 2026-09-10 | forced error | 2m 10s | Priya N. | Sam K. | Priya N. | corrected |

**Critical alerts defined:** 2
**Drilled:** 2
**Routing corrections made:** 1
**Playbook corrections made:** 0

---

## Per-Alert Detail
<!-- REQUIRED: per-alert-detail — for each Critical alert: how it was triggered, what the responder did, and what changed as a result -->

### High Error Rate

**Triggered by:** Injected a fault flag that forces 10% of requests to 500.
**Condition as configured:** error_rate_5m > 0.05 for 5 minutes.
**Page arrived:** 2026-09-10 14:02 — 4m 30s after the triggering condition.
**Routed to:** Sam K. — expected Sam K.
**Responder:** Sam K.

**What the responder did:**
1. Checked the error dashboard, identified the fault flag
2. Disabled the fault flag

**Was `incident-response.md` sufficient?** yes

**Changed as a result:**
- Nothing

---

*Repeat this section for each Critical alert.*

---

## Alerts Not Drilled

| Alert | Why not drilled | Owner | Drill scheduled for |
|-------|-----------------|-------|---------------------|

---

## Sign-off

**Drills run by:** Sam K.
**Date range:** 2026-09-10 to 2026-09-10
**Reviewed by:** Priya N.
