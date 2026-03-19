# Runbook
<!-- Phase 7 — Documentation | Required artifact -->

> This runbook is for **3am incidents**. Write for an exhausted engineer who is on-call for the first time.

**System:** [Project name]
**Version:** [Semantic version]
**Last updated:** [YYYY-MM-DD]
**On-call escalation:** [Who to call if this runbook doesn't solve it]

---

## Deployment Procedure

### Prerequisites

- [ ] Verify CI pipeline is green on the release branch
- [ ] Back up database (command: `[command]`)
- [ ] Notify stakeholders of deployment window (template: `[email/Slack template]`)
- [ ] Ensure rollback procedure is understood (see: Rollback section below)

### Deployment Steps
<!-- REQUIRED: deployment-steps — all 7 steps filled in with actual commands and expected outputs, not placeholder text -->

1. **Pull the release:** `[command]`
2. **Run database migrations:** `[command]`
3. **Verify migration result:** `[command to check migration status]`
4. **Deploy application:** `[command]`
5. **Verify service is up:** `[command or URL to check]`
   - Expected response: `[what healthy looks like]`
6. **Run smoke tests:** `[command]`
7. **Check monitoring dashboard:** `[URL or where to look]`
   - What healthy looks like: `[key metrics and expected values]`

### Post-Deployment Checklist

- [ ] All health endpoints returning 200
- [ ] Smoke tests passing
- [ ] No error spike in logs/APM
- [ ] Key metrics in normal range
- [ ] Deployment logged in changelog

---

## Configuration Reference
<!-- REQUIRED: configuration-reference-table — every environment variable and secret the system uses listed with type, description, example/valid values, and whether it is required -->

Every environment variable, secret, and feature flag the system uses:

| Name | Type | Description | Example / Valid Values | Required |
|------|------|-------------|----------------------|---------|
| `[VAR_NAME]` | env var / secret | [What it configures] | `[example]` | Yes / No |
| `DATABASE_URL` | secret | PostgreSQL connection string | `postgresql://user:pass@host/db` | Yes |
| `[FEATURE_FLAG]` | env var | [What feature it controls] | `true / false` | No |

**Secret store:** [Where secrets are kept — Azure Key Vault / AWS Secrets Manager / etc.]
**Accessing secrets:** `[Command or procedure to retrieve a secret]`

---

## Common Operations

### Restart the Service

```bash
[command to restart]
```
Wait [N] seconds, then verify: `[health check command]`

### Scale Up/Down

```bash
# Scale to N instances
[command]

# Verify new instance count
[command]
```

### Run Database Migration

```bash
# Check pending migrations
[command]

# Apply migrations
[command]

# Verify applied
[command]
```

### Roll Back a Deployment

**Decision criteria:** Roll back if ANY of the following are true:
- Error rate > [X]% for > [N] minutes
- P0 smoke test failing
- Database in inconsistent state
- [Other rollback trigger]

```bash
# Step 1: Revert application
[command]

# Step 2: Roll back migration (if applicable)
[command]

# Step 3: Verify rollback
[command]
```

**After rollback:** Notify stakeholders, file incident report, do not re-deploy without root cause analysis.

---

## Failure Scenarios

### Scenario 1: [Service Unresponsive]
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** Health endpoint returning non-200 / timeout / no response

**Diagnosis steps:**
1. Check process is running: `[command]`
2. Check logs for errors: `[command]`
3. Check resource usage: `[command]`
4. Check dependency health (DB, cache, external APIs): `[command]`

**Resolution:**
- If OOM: `[restart command]` and investigate memory leak
- If crashed: `[restart command]`, check logs for panic/exception
- If hung: `[force restart command]`

---

### Scenario 2: [Database Connection Failures]
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** `ECONNREFUSED` or `Connection refused` in logs, 500 errors on data-fetching endpoints

**Diagnosis steps:**
1. Check DB is reachable: `[ping/connect command]`
2. Check connection pool: `[how to view pool stats]`
3. Check DB logs: `[where to find them]`

**Resolution:**
- If DB down: [escalation path, who owns the DB]
- If pool exhausted: [restart or increase pool size, command]
- If credentials wrong: [how to rotate/verify credentials]

---

### Scenario 3: [High Error Rate]
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** Error rate alert fires, 5xx responses climbing

**Diagnosis steps:**
1. Check error logs for common error type: `[log query]`
2. Check if correlated with a deployment: `[how to check]`
3. Check external dependencies: `[what to check]`

**Resolution:**
- If new deployment: roll back (see Rollback section)
- If external dependency: [fallback or degraded mode]
- If unknown: escalate to [name/role]

---

*Add additional failure scenarios for top 5 failure modes.*

---

## Escalation Path

| Severity | Contact | How | Response Time |
|---------|---------|-----|--------------|
| P0 (system down) | [Name] | [Phone / PagerDuty] | 15 minutes |
| P1 (degraded) | [Name] | [Slack / PagerDuty] | 1 hour |
| P2 (minor issue) | [Name] | [Slack / email] | Next business day |
