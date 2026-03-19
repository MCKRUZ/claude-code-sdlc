# Deployment Checklist
<!-- Phase 8 — Deployment | Required artifact -->

**Version:** [X.Y.Z]
**Target environment:** Staging / Production
**Deployment lead:** [Name]
**Date:** [YYYY-MM-DD]
**Window:** [Start time] – [End time]

---

## Pre-Deployment
<!-- REQUIRED: pre-deployment-checks — all environment checks, configuration verification, stakeholder notification, and database backup steps completed and signed off -->

### Environment Checks

| Check | Action | Expected Result | Status |
|-------|--------|----------------|--------|
| Staging is healthy | `[health check command]` | 200 OK | [ ] |
| CI pipeline is green | Check [CI URL] | All tests passing | [ ] |
| No active incidents | Check [monitoring URL] | No P0/P1 open | [ ] |
| Rollback tested | See rollback section | Procedure verified | [ ] |

### Configuration Verification

| Variable | Verify | Status |
|----------|--------|--------|
| `DATABASE_URL` | Points to correct [staging/prod] DB | [ ] |
| `[ENV_VAR]` | [Expected value or how to verify] | [ ] |

### Notification

| Stakeholder | Notified | Method | Time |
|------------|---------|--------|------|
| [Name/team] | [Template sent] | [Email / Slack] | [Time] |

### Database

- [ ] Migration script reviewed and tested on copy of production data
- [ ] Rollback migration script available and tested: `[command]`
- [ ] Backup taken: `[command]` completed at [time]

---

## Deployment Steps
<!-- REQUIRED: deployment-steps-table — staging and production steps each with actual commands, expected outcomes, and verification commands; staging go/no-go decision must be explicit -->

### Staging

| Step | Action | Expected Outcome | How to Verify | Status |
|------|--------|-----------------|--------------|--------|
| 1 | `[deploy command for staging]` | Service starts without errors | `[check command]` | [ ] |
| 2 | Run DB migrations | No errors | `[migration status command]` | [ ] |
| 3 | Run smoke tests | All passing | `[smoke test command]` | [ ] |
| 4 | Verify monitoring | Data flowing | `[check APM/dashboard]` | [ ] |

**Staging decision:** ✅ Proceed to Production / ❌ Halt — [reason]

---

### Production

| Step | Action | Expected Outcome | How to Verify | Status |
|------|--------|-----------------|--------------|--------|
| 1 | `[deploy command for prod]` | Service starts without errors | `[check command]` | [ ] |
| 2 | Run DB migrations | No errors | `[migration status command]` | [ ] |
| 3 | Run smoke tests | All passing | `[smoke test command]` | [ ] |
| 4 | Verify monitoring | Data flowing | `[dashboard URL]` | [ ] |
| 5 | Confirm no error spike | Error rate normal | `[metric/alert]` for [N] minutes | [ ] |

---

## Post-Deployment Verification

- [ ] All P0 smoke tests passing in production
- [ ] Health endpoint returning 200: `[URL]`
- [ ] Key metrics in normal range (CPU, memory, error rate, latency)
- [ ] No alerts firing
- [ ] Release notes published

---

## Rollback Procedure
<!-- REQUIRED: rollback-procedure — explicit rollback triggers, named decision authority, all rollback steps with commands, and date rollback was tested -->

**Roll back if ANY of the following occur:**
- [ ] Error rate > [X]% for > [N] minutes
- [ ] P0 smoke test fails
- [ ] [Other trigger condition]

**Rollback decision authority:** [Name/role]

**Steps:**
1. `[rollback application command]`
2. `[rollback migration command — if needed]`
3. Verify: `[health check command]`
4. Notify stakeholders using template in RUNBOOK.md

**Rollback tested on:** [Date / "Not tested — plan to test during staging"]

---

## Sign-Off

| Role | Name | Approval | Time |
|------|------|---------|------|
| Deployment Lead | [Name] | [ ] | |
| Stakeholder | [Name] | [ ] | |
| On-call Engineer | [Name] | [ ] | |
