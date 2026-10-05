# Deployment Checklist
<!-- Phase 8 — Deployment | Required artifact -->

**Version:** 1.4.0
**Target environment:** Production
**Deployment lead:** Sam K.
**Date:** 2026-09-23
**Window:** 22:00 UTC – 23:00 UTC

---

## Pre-Deployment
<!-- REQUIRED: pre-deployment-checks — all environment checks, configuration verification, stakeholder notification, and database backup steps completed and signed off -->

### Environment Checks

| Check | Action | Expected Result | Status |
|-------|--------|----------------|--------|
| Staging is healthy | `curl -f https://staging.acme.example/health` | 200 OK | [x] |
| CI pipeline is green | Check https://ci.acme.example/runs/4821 | All tests passing | [x] |
| No active incidents | Check https://status.acme.example | No P0/P1 open | [x] |
| Rollback tested | See rollback section | Procedure verified | [x] |

### Configuration Verification

| Variable | Verify | Status |
|----------|--------|--------|
| `DATABASE_URL` | Points to correct prod DB | [x] |
| `CLAIMS_API_KEY` | Rotated 2026-09-01, still valid | [x] |

### Notification

| Stakeholder | Notified | Method | Time |
|------------|---------|--------|------|
| Claims ops team | Yes | Slack #claims-ops | 2026-09-22 17:00 UTC |

### Database

- [x] Migration script reviewed and tested on copy of production data
- [x] Rollback migration script available and tested: `alembic downgrade -1`
- [x] Backup taken: `pg_dump acme_claims` completed at 2026-09-23 21:30 UTC

---

## Deployment Steps
<!-- REQUIRED: deployment-steps-table — staging and production steps each with actual commands, expected outcomes, and verification commands; staging go/no-go decision must be explicit -->

### Staging

| Step | Action | Expected Outcome | How to Verify | Status |
|------|--------|-----------------|--------------|--------|
| 1 | `kubectl apply -f staging/claims-api.yaml` | Service starts without errors | `kubectl rollout status deploy/claims-api` | [x] |
| 2 | Run DB migrations | No errors | `alembic current` | [x] |
| 3 | Run smoke tests | All passing | `pytest smoke/` | [x] |
| 4 | Verify monitoring | Data flowing | Check Grafana dashboard | [x] |

**Staging decision:** ✅ Proceed to Production

---

### Production

| Step | Action | Expected Outcome | How to Verify | Status |
|------|--------|-----------------|--------------|--------|
| 1 | `kubectl apply -f prod/claims-api.yaml` | Service starts without errors | `kubectl rollout status deploy/claims-api` | [x] |
| 2 | Run DB migrations | No errors | `alembic current` | [x] |
| 3 | Run smoke tests | All passing | `pytest smoke/ --env=prod` | [x] |
| 4 | Verify monitoring | Data flowing | Grafana dashboard URL | [x] |
| 5 | Confirm no error spike | Error rate normal | error-rate alert for 30 minutes | [x] |

---

## Post-Deployment Verification

- [x] All P0 smoke tests passing in production
- [x] Health endpoint returning 200: `https://api.acme.example/health`
- [x] Key metrics in normal range (CPU, memory, error rate, latency)
- [x] No alerts firing
- [x] Release notes published

---

## Rollback Procedure
<!-- REQUIRED: rollback-procedure — explicit rollback triggers, named decision authority, all rollback steps with commands, and date rollback was tested -->

**Roll back if ANY of the following occur:**
- [ ] Error rate > 2% for > 5 minutes
- [ ] P0 smoke test fails
- [ ] Database migration leaves the schema in an inconsistent state

**Rollback decision authority:** Sam K. (Deployment Lead)

**Steps:**
1. `kubectl rollout undo deploy/claims-api`
2. `alembic downgrade -1`
3. Verify: `curl -f https://api.acme.example/health`
4. Notify stakeholders using template in RUNBOOK.md

**Rollback tested on:** 2026-09-20

---

## Sign-Off

| Role | Name | Approval | Time |
|------|------|---------|------|
| Deployment Lead | Sam K. | [x] | 23:05 UTC |
| Stakeholder | Priya N. | [x] | 23:10 UTC |
| On-call Engineer | Jordan T. | [x] | 23:05 UTC |
