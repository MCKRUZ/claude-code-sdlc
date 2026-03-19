# Security Review Report
<!-- Phase 5 — Quality | Required artifact -->

## OWASP Category Coverage
<!-- REQUIRED: owasp-coverage-table — all 10 categories checked or explicitly marked N/A, with finding counts and reviewer name, review date, and tools used -->

| Category | Checked | Findings | Notes |
|----------|---------|---------|-------|
| A01: Broken Access Control | ✅ / ❌ | [N] | |
| A02: Cryptographic Failures | ✅ / ❌ | [N] | |
| A03: Injection | ✅ / ❌ | [N] | |
| A04: Insecure Design | ✅ / ❌ | [N] | |
| A05: Security Misconfiguration | ✅ / ❌ | [N] | |
| A06: Vulnerable Components | ✅ / ❌ | [N] | |
| A07: Auth & Session Mgmt Failures | ✅ / ❌ | [N] | |
| A08: Software Integrity Failures | ✅ / ❌ | [N] | |
| A09: Logging & Monitoring Failures | ✅ / ❌ | [N] | |
| A10: SSRF | ✅ / ❌ | [N] | |

**Reviewer:** [Name]
**Review date:** [YYYY-MM-DD]
**Tools used:** [Static analysis / manual / dependency scan / etc.]

---

## Findings

### SEC-001: [Short title] — HIGH

| Attribute | Value |
|-----------|-------|
| **OWASP Category** | [A0N: Category name] |
| **Severity** | HIGH / CRITICAL |
| **Status** | Open / Fixed |
| **Location** | `[path/to/file]:[line]` |

**Description:**
[What the vulnerability is. Be specific about the attack vector and what an attacker could do.]

**CVSS-style Impact:**
- **Confidentiality:** [High / Medium / Low / None]
- **Integrity:** [High / Medium / Low / None]
- **Availability:** [High / Medium / Low / None]
- **Exploitability:** [High / Medium / Low] — [what level of access/effort is required]

**Remediation:**
[Specific steps taken or required to fix this]

**Verification:**
[How the fix was verified — test added, manual test, code inspection]

---

*Add SEC-NNN sections for all HIGH and CRITICAL findings.*

---

## All Findings Summary
<!-- REQUIRED: all-findings-summary — every security finding listed with OWASP category, severity, description, location, and current status -->

| ID | Category | Severity | Description | Location | Status |
|----|---------|----------|-------------|----------|--------|
| SEC-001 | A03: Injection | HIGH | | | Fixed |
| SEC-002 | A07: Auth | HIGH | | | Fixed |

---

## Secrets & Configuration Audit

- [ ] No hardcoded secrets in source code (grep verified)
- [ ] All secrets use environment variables or secret store
- [ ] `.gitignore` covers all config files with credentials
- [ ] Dependency versions locked; no known CVEs at critical/high

### Dependency Vulnerability Scan

**Tool:** [npm audit / safety / dependabot / snyk]
**Scan date:** [YYYY-MM-DD]
**Critical:** [N] | **High:** [N] | **Medium:** [N]
**Resolution:** [Updated / accepted risk / mitigated]

---

## Authentication & Authorization Review

| Control | Implemented | Notes |
|---------|------------|-------|
| Auth on all protected endpoints | Yes / No / N/A | |
| Token validation (signature, expiry, audience) | Yes / No | |
| Least privilege access | Yes / No | |
| Rate limiting on auth endpoints | Yes / No | |
| Account lockout / brute force protection | Yes / No | |

---

## Input Validation Summary

| Boundary | Validation Present | Method | Notes |
|---------|-------------------|--------|-------|
| API request bodies | Yes / No | [FluentValidation / Joi / Zod] | |
| Query parameters | Yes / No | | |
| File uploads | Yes / Partial / N/A | | |
| External API responses | Yes / No | | |

---

## Verification Notes

How each finding was confirmed as fixed:

| Finding ID | Verification Method | Verified By | Date |
|-----------|-------------------|------------|------|
| SEC-001 | [Test added / code inspection / manual test] | [Name] | [Date] |
