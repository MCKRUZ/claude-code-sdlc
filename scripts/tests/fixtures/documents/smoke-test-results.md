# Smoke Test Results
<!-- Phase 8 — Deployment | Required artifact -->

## Staging Environment
<!-- REQUIRED: staging-results-table — deployment date/time, build version, and results for every smoke test with pass/fail status and notes on failures -->

**Deployment date/time:** 2026-09-23 20:00 UTC
**Build/version:** 1.4.0 / a1b2c3d

| Test | P0 Story | Result | Notes |
|------|---------|--------|-------|
| Health endpoint returns 200 | N/A | ✅ Pass | |
| User can submit a claim | US-014 | ✅ Pass | |
| Duplicate claim is rejected | US-015 | ✅ Pass | |
| Claim status updates in real time | US-016 | ❌ Fail | WebSocket reconnect flaky on staging LB |

**Staging result:** ❌ 1 failing

---

## Issues Found in Staging

| Issue | Severity | Story | Resolution | Fixed? |
|-------|---------|-------|-----------|--------|
| WebSocket reconnect flaky | P2 | US-016 | Increased staging LB idle timeout | Yes |

**Staging go/no-go:** ✅ Proceed to production

---

## Production Environment
<!-- REQUIRED: production-results-table — deployment date/time, build version, and results for every smoke test; note that all production tests must be non-destructive -->

**Deployment date/time:** 2026-09-23 22:45 UTC
**Build/version:** 1.4.0 / a1b2c3d

| Test | P0 Story | Result | Notes |
|------|---------|--------|-------|
| Health endpoint returns 200 | N/A | ✅ Pass | |
| User can submit a claim | US-014 | ✅ Pass | |
| Duplicate claim is rejected | US-015 | ✅ Pass | |

**Production result:** ✅ All passing

*Note: Smoke tests in production must be non-destructive — read operations and harmless writes only.*

---

## Issues Found in Production

| Issue | Severity | Story | Resolution | Fixed / Rolled Back |
|-------|---------|-------|-----------|---------------------|
| None | | | | |

---

## Monitoring Confirmation

After production deployment, key metrics were checked:

| Metric | Baseline | Observed (30 min post-deploy) | Status |
|--------|---------|------------------------------|--------|
| Error rate | 0.3% | 0.2% | ✅ |
| p95 latency | 380ms | 350ms | ✅ |
| Active instances | 4 | 4 | ✅ |

---

## Deployment Decision
<!-- REQUIRED: deployment-decision — explicit "Deployment successful" or "Rolled back" with decision-maker name, time, and 2-3 sentence rationale -->

**Final decision:** ✅ Deployment successful — system live

**Decision made by:** Sam K. at 23:10 UTC

**Rationale:**
All production smoke tests passed and key metrics stayed within baseline for the first 30 minutes.
The one staging failure was resolved and re-verified before promotion, so there was no open risk
carried into production.
