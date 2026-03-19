# Alert Definitions
<!-- Phase 9 — Monitoring | Required artifact -->

## Alert Philosophy

Every alert here represents a situation that requires a human decision. If an alert doesn't require action, it shouldn't exist — it creates fatigue that causes real alerts to be ignored.

**Principles used:**
- Alert on symptoms, not causes (users don't care why; they care that something broke)
- Every alert must have a runbook link
- If an alert fires more than once a week without being critical, raise the threshold
- Warning = investigate; Critical = wake someone up now

---

## Alert Table
<!-- REQUIRED: alert-table — every alert listed with condition, severity, recipient, SLA response time, and runbook link; no alert without a runbook link -->

| Alert Name | Condition | Severity | Recipient | SLA (response time) | Runbook |
|-----------|-----------|----------|-----------|--------------------|---------|
| [High Error Rate] | Error rate > [X]% for [N] min | Critical | On-call | 15 min | [RUNBOOK.md#scenario-3] |
| [High Latency] | p95 > [X]ms for [N] min | Warning | On-call | 1 hour | [RUNBOOK.md#high-latency] |
| [Instance Down] | Health check failing for [N] min | Critical | On-call | 15 min | [RUNBOOK.md#service-unresponsive] |
| [DB Connection Exhaustion] | Pool > [X]% for [N] min | Warning | On-call | 1 hour | [RUNBOOK.md#database-connection-failures] |
| [Disk Usage High] | Disk > [X]% | Warning | On-call | 4 hours | [RUNBOOK.md#disk-full] |

---

## Critical Alert Details

For every CRITICAL alert, document the exact trigger and response:

---

### CRIT-001: High Error Rate
<!-- REQUIRED: critical-alert-detail — trigger condition with exact query, rationale for threshold, step-by-step response procedure, how to resolve, and false positive conditions -->

**Trigger condition:**
```
error_rate_5m > 0.05   # 5% of requests are errors
for: 5 minutes
```

**Why this threshold:**
[5% was chosen because below that, errors are within normal variance for [reasons]. Above 5% for 5+ minutes indicates a systemic failure, not random errors.]

**What to do when it fires:**
1. Check error logs: `[log query command]`
2. Identify most common error type
3. If new deployment: roll back (see RUNBOOK.md#rollback)
4. If external dependency: check dependency health dashboard
5. If unknown: escalate to [Name]

**How to resolve:**
- Confirm error rate returns below [X]% for [N] consecutive minutes
- Resolve underlying cause (fix + deploy, rollback, or mark external incident)

**False positive conditions:**
- During planned deployments: suppress alert for [N] minutes using [procedure]
- Scheduled maintenance: [procedure]

---

### CRIT-002: Instance Down

**Trigger condition:**
```
health_check_status != 200
for: 3 minutes
```

**Why this threshold:**
[3 minutes allows for transient restarts without paging. Less than 3 minutes is typically a restart cycle.]

**What to do when it fires:**
1. Check instance status: `[command]`
2. Check recent logs: `[command]`
3. Attempt restart: `[command]`
4. If restart fails: escalate to infrastructure team

**How to resolve:**
- Instance healthy for 5+ consecutive minutes

---

*Add CRIT-NNN section for each CRITICAL alert.*

---

## Warning Alert Details

Warnings require investigation, not immediate response:

### WARN-001: High Latency

**Trigger condition:** p95 response time > [X]ms for [N] minutes
**Investigation steps:** Check DB query times, external API latency, instance CPU
**Escalate if:** Latency continues rising, or p99 approaches [X]ms

---

## Alert Testing

| Alert | Last Tested | Test Method | Result |
|-------|------------|------------|--------|
| CRIT-001 | [Date] | [Inject errors via [method]] | Fired in [N] minutes |
| CRIT-002 | [Date] | [Kill instance / health check] | Fired in [N] minutes |
