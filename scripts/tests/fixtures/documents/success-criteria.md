# Success Criteria
<!-- Phase 0 -- Discovery | Required artifact -->

## Measurable Success Dimensions

For each dimension: define what Pass, Partial, and Fail look like with specific, measurable thresholds. "Better" is not a threshold. "20% faster" is.

---

### Dimension 1: Duplicate Prevention
<!-- REQUIRED: Complete this dimension -- what we're measuring, Pass/Partial/Fail thresholds with specific numbers, and data collection method -->

**What we're measuring:** How often a duplicate claim_id is accepted after launch.

| Outcome | Threshold | How We'll Measure |
|---------|-----------|------------------|
| Pass (exceeds expectations) | 0 duplicates accepted in 90 days | Production audit log query |
| Partial (acceptable, improvement required) | 1-2 duplicates accepted in 90 days | Production audit log query |
| Fail (not acceptable for release) | 3+ duplicates accepted in 90 days | Production audit log query |

**Data collection:** Queried monthly from the claims audit log starting at go-live.

---

### Dimension 2: Adjuster Time Saved
<!-- REQUIRED: Complete this dimension -- what we're measuring, Pass/Partial/Fail thresholds with specific numbers, and data collection method -->

**What we're measuring:** Monthly hours adjusters spend manually reconciling claims.

| Outcome | Threshold | How We'll Measure |
|---------|-----------|------------------|
| Pass | Under 10 hours/month | Ops time tracking |
| Partial | 10-30 hours/month | Ops time tracking |
| Fail | Over 30 hours/month | Ops time tracking |

**Data collection:** Pulled from the existing Ops time tracking tool, compared against the 60-hour baseline.

---

### Dimension 3: Latency
<!-- REQUIRED: Complete this dimension -- what we're measuring, Pass/Partial/Fail thresholds with specific numbers, and data collection method -->

**What we're measuring:** p95 latency of the claim submission endpoint.

| Outcome | Threshold | How We'll Measure |
|---------|-----------|------------------|
| Pass | Under 200ms p95 | Application Insights |
| Partial | 200-300ms p95 | Application Insights |
| Fail | Over 300ms p95 | Application Insights |

**Data collection:** Continuous, from Application Insights dashboards.

---

*Add additional dimensions as needed. Minimum: 3 dimensions.*

---

## Non-Negotiable Requirements
<!-- REQUIRED: At least 3 binary requirements that are absolute blockers for release -- not vague, not "better", but specific pass/fail conditions -->

These are binary -- either met or not. The project is not complete unless all of these are true.

- [ ] Must not break the existing claim-status API contract
- [ ] Must be deployed without customer-facing downtime
- [ ] Must pass a SOC 2 audit-trail review before go-live

*Example: "Must not break existing API contracts", "Must be deployed without customer downtime"*

---

## Time to Value

**Target delivery:** Phase 8 (Deployment)
**Full value realized:** 90 days after go-live, once the audit-log measurement window closes
**Review checkpoint:** Phase 9 retrospective

---

## Success Owner

| Dimension | Who owns measuring it | Who reviews results |
|-----------|----------------------|---------------------|
| Duplicate Prevention | Sam K. | Priya N. |
| Adjuster Time Saved | Priya N. | Matt K. |
| Latency | Sam K. | Priya N. |
