# Incident Response
<!-- Phase 9 — Monitoring | Required artifact -->

## Incident Classification

| Severity | Definition | Examples | Target Response |
|---------|-----------|---------|----------------|
| **P1 — Critical** | System is down. | Production outage | Respond in 15 minutes, 24/7 |

---

## Response Procedures
<!-- REQUIRED: response-procedures — a Detect/Acknowledge/Diagnose/Communicate/Resolve/Confirm/Close procedure for each CRITICAL alert defined in alert-definitions.md -->

### Detect → Diagnose → Resolve → Communicate

#### High Error Rate — CRIT-001

| Step | Action | Owner |
|------|--------|-------|
| **Detect** | Alert fires via PagerDuty | Monitoring system |
| **Acknowledge** | Responder acknowledges within 15 minutes | On-call engineer |
| **Diagnose** | Check error logs, identify error type | On-call engineer |
| **Communicate** | Post in #incidents | On-call engineer |
| **Resolve** | Apply fix per RUNBOOK.md | On-call engineer |
| **Confirm** | Verify error rate normal for 10+ minutes | On-call engineer |
| **Close** | Post resolution in channel | On-call engineer |

---

## Escalation Matrix
<!-- REQUIRED: escalation-matrix — all severity levels (P1, P1-continued, P2, P3) with named first responder, escalation target with time window, and after-hours policy -->

| Severity | First Responder | Escalate To (if not resolved in) | After-Hours? |
|---------|----------------|----------------------------------|-------------|
| P1 | On-call engineer | Engineering lead in 30 min | Yes |
| P1 (continued) | Engineering lead | CTO in 60 min | Yes |
| P2 | On-call engineer | Engineering lead in 2 hours | Business hours only |
| P3 | #team channel | — | No |

---

## Communication Templates
<!-- REQUIRED: communication-templates — initial notification, progress update, and resolution notice templates all present with channel, timing, and copy-paste-ready message body -->

### Initial Notification (P1/P2)

**Channel:** #incidents
**Timing:** Within 15 minutes of incident declaration

```
INCIDENT: High error rate on Claims API
Status: Investigating
```

### Progress Update

**Frequency:** Every 30 minutes during P1

```
INCIDENT UPDATE
Status: Mitigating
```

### Resolution Notice

```
INCIDENT RESOLVED
Status: Resolved
```

---

## Post-Incident Process

**P1 incidents require a post-mortem.**
