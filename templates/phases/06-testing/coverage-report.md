# Coverage Report
<!-- Phase 6 — Testing | Required artifact -->

## Summary
<!-- REQUIRED: summary-table — all 4 metrics (overall line, critical path, branch, function coverage) with achieved percentage, threshold, and pass/fail status -->

| Metric | Achieved | Threshold | Status |
|--------|---------|-----------|--------|
| Overall line coverage | [X]% | >= [Y]% | ✅ / ❌ |
| Critical path coverage | [X]% | >= [Y]% | ✅ / ❌ |
| Branch coverage | [X]% | (informational) | |
| Function coverage | [X]% | (informational) | |

**Tool:** `[jest --coverage / dotnet test --collect:"XPlat Code Coverage" / pytest-cov]`
**Report generated:** `[YYYY-MM-DD]`

---

## Coverage by Module
<!-- REQUIRED: coverage-by-module — every module/file listed with line count, covered lines, and line/branch/function percentages, including a Total row -->

| Module / File | Lines | Covered | Line % | Branch % | Function % |
|---------------|-------|---------|--------|---------|-----------|
| `[path/module]` | [N] | [N] | [X]% | [X]% | [X]% |
| | | | | | |
| **Total** | | | | | |

---

## Critical Path Coverage

The most important flows must be covered at a higher threshold. For each critical path, identify the coverage evidence.

### Critical Path: [Name — e.g., User Authentication]

**Coverage:** [X]%
**Status:** ✅ / ❌

| Step in Path | Covered By | Coverage % |
|-------------|-----------|-----------|
| [Step description] | [test file:line] | [X]% |

---

### Critical Path: [Name — e.g., Data Persistence]

**Coverage:** [X]%
**Status:** ✅ / ❌

| Step in Path | Covered By | Coverage % |
|-------------|-----------|-----------|
| [Step description] | [test file:line] | [X]% |

---

## Uncovered Areas

Lines/branches/functions not covered — with rationale for accepting the gap.

| Area | Coverage | Lines Uncovered | Rationale | Risk |
|------|---------|----------------|-----------|------|
| `[path/file]` | [X]% | [N] | [e.g., "Error handler for infra failure — tested by integration tests not reflected in unit coverage"] | Low |
| | | | | |

**Accepted gaps total:** [N] lines
**Risk assessment:** [Overall assessment of whether gaps are acceptable]

---

## Coverage Improvement Actions

If coverage is below threshold, list what will be added:

| Gap | Test to Add | Owner | Sprint |
|-----|------------|-------|--------|
| [Uncovered function] | [Test description] | [Name] | [N] |

---

## Coverage Trend

| Phase | Overall | Critical | Date |
|-------|---------|---------|------|
| Phase 5 (at review) | [X]% | [X]% | [Date] |
| Phase 6 (final) | [X]% | [X]% | [Date] |
