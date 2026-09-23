# Non-Functional Requirements
<!-- Phase 1 — Requirements | Required artifact -->

## Overview

Non-functional requirements define *how* the system must behave, not what it does. They are equally binding on implementation as functional requirements.

---

## Performance
<!-- REQUIRED: At least NFR-P01 and NFR-P02 filled in with specific numeric thresholds and a measurement method — "TBD" is not acceptable -->
<!-- REQUIRED: Measurement Basis column must be one of: "Measured: [source]" | "Industry standard: [ref]" | "Contractual: [doc]" | "[aspirational — validate in the Build loop]" -->

| NFR ID | Requirement | Threshold | Measurement Method | Priority | Measurement Basis |
|--------|-------------|-----------|-------------------|---------|------------------|
| NFR-P01 | Response time (p95) | < 300ms | k6 load test | P0 | Measured: staging load test |
| NFR-P02 | Throughput | 200 req/sec sustained | k6 load test | P0 | Measured: staging load test |

---

## Security
<!-- REQUIRED: All P0 security NFRs (NFR-SEC01 through NFR-SEC06) must have the authentication method, authorization model, and encryption standard specified -->

| NFR ID | Requirement | Standard / Reference | Priority |
|--------|-------------|---------------------|---------|
| NFR-SEC01 | Authentication | OAuth2 with Azure AD | P0 |
| NFR-SEC02 | Authorization | RBAC | P0 |
| NFR-SEC03 | Data in transit | TLS 1.2+ | P0 |
| NFR-SEC04 | Data at rest | AES-256 | P0 |
| NFR-SEC05 | OWASP compliance | Top 10 reviewed before release | P0 |
| NFR-SEC06 | Secrets management | Azure Key Vault | P0 |

---

## NFR Acceptance Test Plan
<!-- REQUIRED: Every P0 NFR must appear in this table with a concrete test method, a pass condition with specific numbers, and a named owner -->

| NFR ID | Test Method | Pass Condition | Owner |
|--------|-------------|---------------|-------|
| NFR-P01 | k6 load test at 200 VUs for 10 minutes | p95 < 300ms with 0 errors | Sam K. |
| NFR-SEC01 | Pen test | No critical findings | Priya N. |
