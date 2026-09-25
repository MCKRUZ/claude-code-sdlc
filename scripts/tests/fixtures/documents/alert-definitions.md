# Alert Definitions
<!-- Phase 9 — Monitoring | Required artifact -->

## Alert Philosophy

Every alert here represents a situation that requires a human decision.

---

## Alert Table
<!-- REQUIRED: alert-table — every alert listed with condition, severity, recipient, SLA response time, and runbook link; no alert without a runbook link -->

| Alert Name | Condition | Severity | Recipient | SLA (response time) | Runbook |
|-----------|-----------|----------|-----------|--------------------|---------|
| High Error Rate | Error rate > 5% for 5 min | Critical | On-call | 15 min | RUNBOOK.md#scenario-3 |
| Instance Down | Health check failing for 3 min | Critical | On-call | 15 min | RUNBOOK.md#service-unresponsive |

---

## Critical Alert Details

For every CRITICAL alert, document the exact trigger and response:

---

### CRIT-001: High Error Rate
<!-- REQUIRED: critical-alert-detail — trigger condition with exact query, rationale for threshold, step-by-step response procedure, how to resolve, and false positive conditions -->

**Trigger condition:**
```
error_rate_5m > 0.05
for: 5 minutes
```

**Why this threshold:** 5% was chosen from two months of baseline traffic; above that for 5+ minutes indicates a systemic failure.

**What to do when it fires:**
1. Check error logs via the APM error dashboard
2. Identify most common error type
3. If new deployment: roll back

**How to resolve:** Confirm error rate returns below 1% for 10 consecutive minutes.

**False positive conditions:** During planned deployments, suppress for 10 minutes.

---

### CRIT-002: Instance Down

**Trigger condition:**
```
health_check_status != 200
for: 3 minutes
```

**Why this threshold:** 3 minutes allows for transient restarts without paging.

**What to do when it fires:**
1. Check instance status
2. Attempt restart

**How to resolve:** Instance healthy for 5+ consecutive minutes.

---

*Add CRIT-NNN section for each CRITICAL alert.*

---

## Warning Alert Details

### WARN-001: High Latency

**Trigger condition:** p95 response time > 800ms for 10 minutes

---

## Alert Testing

| Alert | Last Tested | Test Method | Result |
|-------|------------|------------|--------|
| CRIT-001 | 2026-09-01 | Injected errors via fault flag | Fired in 5 minutes |
