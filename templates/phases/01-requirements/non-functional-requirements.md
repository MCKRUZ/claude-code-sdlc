# Non-Functional Requirements
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

Non-functional requirements define *how* the system must behave, not what it does. They are equally binding on implementation as functional requirements.

---

## Performance
<!-- REQUIRED: At least NFR-P01 and NFR-P02 filled in with specific numeric thresholds and a measurement method — "TBD" is not acceptable -->
<!-- REQUIRED: Measurement Basis column must be one of: "Measured: [source]" | "Industry standard: [ref]" | "Contractual: [doc]" | "[aspirational — validate Phase 6]" -->

| NFR ID | Requirement | Threshold | Measurement Method | Priority | Measurement Basis |
|--------|-------------|-----------|-------------------|---------|------------------|
| NFR-P01 | Response time (p95) | < [X]ms | [How measured — load test, APM] | P0 | [Measured: profiling / Industry standard / aspirational] |
| NFR-P02 | Throughput | [X] req/sec sustained | [How measured] | P0 | [source] |
| NFR-P03 | Response time under load (p99) | < [X]ms at [Y] concurrent users | [How measured] | P1 | [source] |

---

## Reliability & Availability

| NFR ID | Requirement | Threshold | Measurement Method | Priority | Measurement Basis |
|--------|-------------|-----------|-------------------|---------|------------------|
| NFR-R01 | Uptime SLA | [X]% per month | Monitoring dashboard | P0 | [Contractual: SLA doc / aspirational] |
| NFR-R02 | RTO (Recovery Time Objective) | < [X] minutes | DR drill | P0 | [source] |
| NFR-R03 | RPO (Recovery Point Objective) | < [X] minutes of data loss | Backup validation | P0 | [source] |
| NFR-R04 | MTBF (Mean Time Between Failures) | > [X] hours | Incident log | P1 | [source] |

---

## Scalability

| NFR ID | Requirement | Threshold | Notes |
|--------|-------------|-----------|-------|
| NFR-S01 | Horizontal scale | Must scale to [X] instances without code change | |
| NFR-S02 | Data volume | Must handle [X] records / [X] GB without degradation | |
| NFR-S03 | Concurrent users | Must support [X] concurrent users | |

---

## Security
<!-- REQUIRED: All P0 security NFRs (NFR-SEC01 through NFR-SEC06) must have the authentication method, authorization model, and encryption standard specified -->

| NFR ID | Requirement | Standard / Reference | Priority |
|--------|-------------|---------------------|---------|
| NFR-SEC01 | Authentication | [Method: OAuth2, JWT, API key] | P0 |
| NFR-SEC02 | Authorization | [RBAC / ABAC / scope-based] | P0 |
| NFR-SEC03 | Data in transit | TLS 1.2+ for all external communication | P0 |
| NFR-SEC04 | Data at rest | [Encryption standard if PII/sensitive data] | P0 |
| NFR-SEC05 | OWASP compliance | Top 10 reviewed before release | P0 |
| NFR-SEC06 | Secrets management | No hardcoded secrets; use [vault/key store] | P0 |

---

## Maintainability

| NFR ID | Requirement | Threshold |
|--------|-------------|-----------|
| NFR-M01 | Test coverage | >= [X]% line coverage, >= [Y]% critical path |
| NFR-M02 | File size | Max [X] lines per file |
| NFR-M03 | Function size | Max [X] lines per function |
| NFR-M04 | Build time | < [X] minutes for CI pipeline |
| NFR-M05 | New developer setup | < [X] minutes to first run from README |

---

## Compliance

| NFR ID | Regulation / Standard | Specific Requirement | Verification |
|--------|-----------------------|---------------------|-------------|
| NFR-C01 | [GDPR / SOC 2 / HIPAA / etc.] | [Specific control] | [Audit / test / review] |

---

## NFR Acceptance Test Plan
<!-- REQUIRED: Every P0 NFR must appear in this table with a concrete test method, a pass condition with specific numbers, and a named owner -->

For each P0 NFR, describe how it will be verified before release:

| NFR ID | Test Method | Pass Condition | Owner |
|--------|-------------|---------------|-------|
| NFR-P01 | k6 load test at [X] VUs for [Y] minutes | p95 < [X]ms with 0 errors | [Name] |
| NFR-R01 | 30-day uptime monitoring | >= [X]% | [Name] |
