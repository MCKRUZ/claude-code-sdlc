# Incident Response
<!-- Phase 9 — Monitoring | Required artifact -->

## Incident Classification

| Severity | Definition | Examples | Target Response |
|---------|-----------|---------|----------------|
| **P1 — Critical** | System is down or data is at risk. Users cannot complete core tasks. | Production outage, data loss, security breach | Respond in 15 minutes, 24/7 |
| **P2 — High** | Significant degradation. Core features affected but workaround exists. | High error rate, 3x normal latency, partial outage | Respond in 1 hour, business hours + escalation |
| **P3 — Medium** | Minor degradation. Non-core features affected or minor performance issue. | Elevated latency on non-critical path, single user report | Respond next business day |

---

## Response Procedures
<!-- REQUIRED: response-procedures — a Detect/Acknowledge/Diagnose/Communicate/Resolve/Confirm/Close procedure for each CRITICAL alert defined in alert-definitions.md -->

### Detect → Diagnose → Resolve → Communicate

**For each alert type, follow:**

#### [High Error Rate — CRIT-001]

| Step | Action | Owner |
|------|--------|-------|
| **Detect** | Alert fires via [PagerDuty / Slack] | Monitoring system |
| **Acknowledge** | Responder acknowledges within [15] minutes | On-call engineer |
| **Diagnose** | Check error logs: `[query]`. Identify error type and first occurrence. | On-call engineer |
| **Communicate** | Post in [#incidents channel]: "Investigating high error rate on [system] since [time]" | On-call engineer |
| **Resolve** | Apply fix (rollback / config change / restart) per RUNBOOK.md | On-call engineer |
| **Confirm** | Verify error rate returns to normal for 10+ minutes | On-call engineer |
| **Close** | Post resolution in channel. Open post-mortem if P1. | On-call engineer |

---

#### [Service Unavailable — CRIT-002]

| Step | Action |
|------|--------|
| **Detect** | Health check alert fires |
| **Diagnose** | `[instance status command]` → check logs `[log command]` |
| **Resolve** | Restart: `[command]`. If fails: escalate infrastructure. |
| **Confirm** | Health endpoint returns 200 for 5+ minutes |

---

*Add procedure for each alert in alert-definitions.md.*

---

## Escalation Matrix
<!-- REQUIRED: escalation-matrix — all severity levels (P1, P1-continued, P2, P3) with named first responder, escalation target with time window, and after-hours policy -->

| Severity | First Responder | Escalate To (if not resolved in) | After-Hours? |
|---------|----------------|----------------------------------|-------------|
| P1 | On-call engineer | [Engineering lead] in 30 min | Yes |
| P1 (continued) | Engineering lead | [CTO / VP] in 60 min | Yes |
| P2 | On-call engineer | [Engineering lead] in 2 hours | Business hours only |
| P3 | [Team channel] | — | No |

---

## Communication Templates
<!-- REQUIRED: communication-templates — initial notification, progress update, and resolution notice templates all present with channel, timing, and copy-paste-ready message body -->

### Initial Notification (P1/P2)

**Channel:** [#incidents / #status / customer email]
**Timing:** Within 15 minutes of incident declaration

```
🔴 INCIDENT: [Brief description — e.g., "High error rate on API"]
Status: Investigating
Impact: [Who/what is affected]
Started: [Time UTC]
Next update: [Time + 30 min]

Investigating engineer: [Name]
```

---

### Progress Update

**Frequency:** Every 30 minutes during P1, every hour during P2

```
🟡 INCIDENT UPDATE: [Incident name]
Status: [Investigating / Mitigating / Monitoring]
Current impact: [Updated assessment]
Actions taken: [What was done]
Next steps: [What's happening next]
Next update: [Time]
```

---

### Resolution Notice

```
✅ INCIDENT RESOLVED: [Incident name]
Status: Resolved
Duration: [Start time] – [End time] ([N] hours)
Root cause: [Brief root cause — 1 sentence]
Resolution: [What fixed it — 1 sentence]
Follow-up: [Post-mortem scheduled for / no post-mortem required]
```

---

## Post-Incident Process

**P1 incidents require a post-mortem. P2 incidents: judgment call.**

### Post-Mortem Template

**Incident:** [Name]
**Date of incident:** [YYYY-MM-DD]
**Duration:** [N hours/minutes]
**Severity:** P1 / P2
**Author:** [Name]
**Reviewed by:** [Names]

#### Timeline

| Time (UTC) | Event |
|-----------|-------|
| [HH:MM] | Incident started |
| [HH:MM] | Alert fired |
| [HH:MM] | On-call acknowledged |
| [HH:MM] | [Key diagnostic step] |
| [HH:MM] | Resolution applied |
| [HH:MM] | Incident closed |

#### Root Cause

[One paragraph. Specific and honest. "Human error" is never the root cause — the system that allowed the error is.]

#### Impact

[What was affected, for how long, how many users/requests.]

#### What Went Well

- [Something the team did right during the response]

#### What Could Be Better

- [Process gap, monitoring gap, tooling gap]

#### Action Items

| Action | Owner | Due Date |
|--------|-------|---------|
| [Add alert for X] | [Name] | [Date] |
| [Update runbook for Y] | [Name] | [Date] |
