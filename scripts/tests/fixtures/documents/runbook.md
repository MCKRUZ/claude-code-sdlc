# Runbook
<!-- Phase 7 — Documentation | Required artifact -->

> This runbook is for **3am incidents**. Write for an exhausted engineer who is on-call for the first time.

**System:** Acme Claims Portal
**Version:** 1.4.0
**Last updated:** 2026-09-23
**On-call escalation:** Sam K. (PagerDuty)

---

## Deployment Procedure

### Prerequisites

- [x] Verify CI pipeline is green on the release branch
- [x] Back up database (command: `pg_dump acme_claims > backup.sql`)
- [x] Notify stakeholders of deployment window (template: `#deploys Slack channel`)
- [x] Ensure rollback procedure is understood (see: Rollback section below)

### Deployment Steps
<!-- REQUIRED: deployment-steps — all 7 steps filled in with actual commands and expected outputs, not placeholder text -->

1. **Pull the release:** `git pull origin release/1.4.0`
2. **Run database migrations:** `dotnet ef database update`
3. **Verify migration result:** `dotnet ef migrations list --status`
4. **Deploy application:** `az webapp deployment source config-zip -g acme -n claims-api --src release.zip`
5. **Verify service is up:** `curl https://claims-api.acme.com/health`
   - Expected response: `{"status":"healthy"}` with HTTP 200
6. **Run smoke tests:** `./scripts/smoke-test.sh production`
7. **Check monitoring dashboard:** `https://portal.azure.com/#dashboard/claims-api`
   - What healthy looks like: p99 latency under 300ms, error rate under 0.1%

### Post-Deployment Checklist

- [x] All health endpoints returning 200
- [x] Smoke tests passing
- [x] No error spike in logs/APM
- [x] Key metrics in normal range
- [x] Deployment logged in changelog

---

## Configuration Reference
<!-- REQUIRED: configuration-reference-table — every environment variable and secret the system uses listed with type, description, example/valid values, and whether it is required -->

Every environment variable, secret, and feature flag the system uses:

| Name | Type | Description | Example / Valid Values | Required |
|------|------|-------------|----------------------|---------|
| `DATABASE_URL` | secret | PostgreSQL connection string | `postgresql://user:pass@host/db` | Yes |
| `ENABLE_DUPLICATE_GUARD` | env var | Toggles the duplicate-claim guard | `true / false` | No |

**Secret store:** Azure Key Vault
**Accessing secrets:** `az keyvault secret show --vault-name acme-kv --name DATABASE_URL`

---

## Common Operations

### Restart the Service

```bash
az webapp restart -g acme -n claims-api
```
Wait 30 seconds, then verify: `curl https://claims-api.acme.com/health`

### Scale Up/Down

```bash
az webapp scale -g acme -n claims-api --instance-count 4
az webapp show -g acme -n claims-api --query siteConfig.numberOfWorkers
```

### Run Database Migration

```bash
dotnet ef migrations list --status
dotnet ef database update
dotnet ef migrations list --status
```

### Roll Back a Deployment

**Decision criteria:** Roll back if ANY of the following are true:
- Error rate > 5% for > 5 minutes
- P0 smoke test failing
- Database in inconsistent state

```bash
az webapp deployment slot swap -g acme -n claims-api --slot staging --target-slot production
dotnet ef database update PreviousMigration
curl https://claims-api.acme.com/health
```

**After rollback:** Notify stakeholders, file incident report, do not re-deploy without root cause analysis.

---

## Failure Scenarios

### Scenario 1: Service Unresponsive
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** Health endpoint returning non-200 / timeout / no response

**Diagnosis steps:**
1. Check process is running: `az webapp show -g acme -n claims-api`
2. Check logs for errors: `az webapp log tail -g acme -n claims-api`
3. Check resource usage: `az monitor metrics list --resource claims-api`
4. Check dependency health (DB, cache, external APIs): `curl https://claims-api.acme.com/health/deps`

**Resolution:**
- If OOM: restart and investigate memory leak
- If crashed: restart, check logs for panic/exception
- If hung: force restart via `az webapp restart`

---

### Scenario 2: Database Connection Failures
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** `ECONNREFUSED` or `Connection refused` in logs, 500 errors on data-fetching endpoints

**Diagnosis steps:**
1. Check DB is reachable: `psql $DATABASE_URL -c "select 1"`
2. Check connection pool: view pool stats in the app's `/metrics` endpoint
3. Check DB logs: Azure Portal > claims-db > Logs

**Resolution:**
- If DB down: escalate to the DB owner, Priya N.
- If pool exhausted: restart the app, then raise `Npgsql` max pool size
- If credentials wrong: rotate via `az keyvault secret set`

---

### Scenario 3: High Error Rate
<!-- REQUIRED: failure-scenario — symptoms, numbered diagnosis steps with actual commands, and resolution branches for each likely root cause -->

**Symptoms:** Error rate alert fires, 5xx responses climbing

**Diagnosis steps:**
1. Check error logs for common error type: `az webapp log tail -g acme -n claims-api`
2. Check if correlated with a deployment: compare timestamps against the deploy log
3. Check external dependencies: the payout pipeline's own status page

**Resolution:**
- If new deployment: roll back (see Rollback section)
- If external dependency: enable degraded mode (queue payouts instead of calling synchronously)
- If unknown: escalate to Sam K.

---

*Add additional failure scenarios for top 5 failure modes.*

---

## Escalation Path

| Severity | Contact | How | Response Time |
|---------|---------|-----|--------------|
| P0 (system down) | Sam K. | PagerDuty | 15 minutes |
| P1 (degraded) | Sam K. | Slack | 1 hour |
| P2 (minor issue) | Priya N. | Email | Next business day |
