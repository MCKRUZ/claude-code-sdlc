# Code Review Report
<!-- Phase 5 — Quality | Required artifact -->

## Executive Summary
<!-- REQUIRED: executive-summary-table — severity counts table filled in plus reviewer name, review date, scope, build status, and 2-3 sentence overall assessment -->

| Severity | Count | Open | Fixed |
|----------|-------|------|-------|
| CRITICAL | [N] | [N] | [N] |
| HIGH | [N] | [N] | [N] |
| MEDIUM | [N] | [N] | [N] |
| LOW | [N] | [N] | [N] |
| **Total** | | | |

**Reviewer:** [Name]
**Review date:** [YYYY-MM-DD]
**Scope:** [Files / components reviewed]
**Build status at review start:** Passing / Failing

> **Overall assessment:** [2–3 sentences. What is the code quality like? Is it ready to advance after remediation? What's the biggest concern?]

---

## Findings

### CR-001: [Short title] — CRITICAL

| Attribute | Value |
|-----------|-------|
| **File** | `[path/to/file.ts]` |
| **Line** | [N] |
| **Severity** | CRITICAL |
| **Status** | Open / Fixed |

**Issue:**
[What the problem is. Be specific — bad code patterns, incorrect logic, missing validation, etc.]

**Why it matters:**
[What breaks or what risk is created if this isn't fixed]

**Resolution:**
[How it was fixed — or if open, what the recommended fix is]

```[language]
// Before
[problematic code]

// After
[fixed code]
```

---

### CR-002: [Short title] — HIGH

| Attribute | Value |
|-----------|-------|
| **File** | `[path/to/file.ts]` |
| **Line** | [N] |
| **Severity** | HIGH |
| **Status** | Open / Fixed |

**Issue:**
[Description]

**Why it matters:**
[Impact]

**Resolution:**
[Fix or recommendation]

---

*Add CR-NNN sections for all CRITICAL and HIGH findings. MEDIUM and LOW can be in the summary table below.*

---

## All Findings Summary
<!-- REQUIRED: all-findings-summary — every finding (CRITICAL, HIGH, MEDIUM, LOW) listed in this table with file, line, severity, description, and current status -->

| ID | File | Line | Severity | Description | Status |
|----|------|------|----------|-------------|--------|
| CR-001 | | | CRITICAL | | Fixed |
| CR-002 | | | HIGH | | Fixed |
| CR-003 | | | MEDIUM | | Open |
| CR-004 | | | LOW | | Deferred |

---

## Test Quality Observations

| Observation | Location | Recommendation |
|-------------|----------|---------------|
| [Missing coverage for X] | [File/component] | [Add test for Y] |
| [Test doesn't validate the right thing] | | |

---

## Positive Observations

What was done well — important for calibration and for knowing what patterns to repeat:

- [Specific positive observation]
- [Specific positive observation]

---

## Remediation Log

| Finding ID | Fix Applied | Verified By | Date |
|-----------|------------|------------|------|
| CR-001 | [Description of fix] | [Reviewer name] | [Date] |
