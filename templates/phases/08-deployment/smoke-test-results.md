# Smoke Test Results
<!-- Phase 8 — Deployment | Required artifact -->

## Staging Environment
<!-- REQUIRED: staging-results-table — deployment date/time, build version, and results for every smoke test with pass/fail status and notes on failures -->

**Deployment date/time:** [YYYY-MM-DD HH:MM UTC]
**Build/version:** [X.Y.Z / commit hash]

| Test | P0 Story | Result | Notes |
|------|---------|--------|-------|
| [Test name — e.g., "Health endpoint returns 200"] | N/A | ✅ Pass | |
| [Test name — e.g., "User can [P0 story action]"] | US-001 | ✅ Pass | |
| [Test name] | US-002 | ✅ Pass | |
| [Test name] | US-003 | ❌ Fail | [Error message / what was observed] |

**Staging result:** ✅ All passing / ❌ [N] failing

---

## Issues Found in Staging

| Issue | Severity | Story | Resolution | Fixed? |
|-------|---------|-------|-----------|--------|
| [Issue description] | P0 / P1 / P2 | US-NNN | [How it was fixed] | Yes / No |

**Staging go/no-go:** ✅ Proceed to production / ❌ Halt

---

## Production Environment
<!-- REQUIRED: production-results-table — deployment date/time, build version, and results for every smoke test; note that all production tests must be non-destructive -->

**Deployment date/time:** [YYYY-MM-DD HH:MM UTC]
**Build/version:** [X.Y.Z / commit hash]

| Test | P0 Story | Result | Notes |
|------|---------|--------|-------|
| [Test name — health check] | N/A | ✅ Pass | |
| [Test name — P0 story] | US-001 | ✅ Pass | |
| [Test name — P0 story] | US-002 | ✅ Pass | |

**Production result:** ✅ All passing / ❌ [N] failing

*Note: Smoke tests in production must be non-destructive — read operations and harmless writes only.*

---

## Issues Found in Production

| Issue | Severity | Story | Resolution | Fixed / Rolled Back |
|-------|---------|-------|-----------|---------------------|
| [Issue] | | | | |

---

## Monitoring Confirmation

After production deployment, key metrics were checked:

| Metric | Baseline | Observed (30 min post-deploy) | Status |
|--------|---------|------------------------------|--------|
| Error rate | [X]% | [Y]% | ✅ / ⚠ / ❌ |
| p95 latency | [X]ms | [Y]ms | ✅ / ⚠ / ❌ |
| Active instances | [N] | [N] | ✅ / ⚠ / ❌ |

---

## Deployment Decision
<!-- REQUIRED: deployment-decision — explicit "Deployment successful" or "Rolled back" with decision-maker name, time, and 2-3 sentence rationale -->

**Final decision:** ✅ Deployment successful — system live / ❌ Rolled back — [reason]

**Decision made by:** [Name] at [Time]

**Rationale:**
[2–3 sentences explaining the decision]
