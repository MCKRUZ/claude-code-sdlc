# Test Results
<!-- Phase 6 — Testing | Required artifact -->

## Execution Summary
<!-- REQUIRED: execution-summary-table — all metrics filled in (total, passed, failed, skipped, date, duration, environment) -->

| Metric | Value |
|--------|-------|
| **Total tests run** | [N] |
| **Passed** | [N] |
| **Failed** | [N] |
| **Skipped** | [N] |
| **Execution date** | [YYYY-MM-DD] |
| **Duration** | [N minutes] |
| **Environment** | [Staging / CI] |

---

## Results by Suite

### Unit Tests

| Suite / Module | Total | Passed | Failed | Skipped | Coverage |
|----------------|-------|--------|--------|---------|---------|
| [Module name] | [N] | [N] | [N] | [N] | [X]% |
| **Total** | | | | | |

**Run command:** `[command]`
**Status:** ✅ All passing / ❌ [N] failing

---

### Integration Tests

| Suite | Total | Passed | Failed | Notes |
|-------|-------|--------|--------|-------|
| [API endpoint group] | [N] | [N] | [N] | |
| [Database integration] | [N] | [N] | [N] | |
| **Total** | | | | |

**Run command:** `[command]`
**Status:** ✅ All passing / ❌ [N] failing

---

### E2E Tests

| Story ID | Test Name | Environment | Result | Notes |
|----------|-----------|-------------|--------|-------|
| US-001 | [test name] | Staging | ✅ Pass | |
| US-002 | [test name] | Staging | ✅ Pass | |
| US-003 | [test name] | Staging | ❌ Fail | [Defect DEF-001] |

**Run command:** `[command]`
**Evidence:** [Screenshots/videos stored at: path]

---

## P0 User Story Coverage
<!-- REQUIRED: p0-story-coverage — every P0 story listed with its E2E test name and passing/failing status; coverage fraction stated explicitly -->

All P0 stories must have a passing E2E test before advancing.

| Story ID | Story Title | E2E Test | Status |
|----------|-------------|---------|--------|
| US-001 | | [test name] | ✅ Passing |
| US-002 | | [test name] | ✅ Passing |

**P0 coverage: [N/N stories covered]** — ✅ Complete / ❌ Incomplete

---

## Defect Log

| ID | Description | Severity | Story | Status | Resolution |
|----|-------------|----------|-------|--------|-----------|
| DEF-001 | [Description] | P0 / P1 / P2 | US-NNN | Fixed / Open | [How fixed] |

**Open P0 defects:** [N] — must be 0 before advancing

---

## Regression Notes

Tests that previously passed but now fail:

| Test | Previously Passing | Failure Cause | Status |
|------|-------------------|--------------|--------|
| [Test name] | [Yes, commit X] | [Root cause] | Fixed / Investigating |

---

## Go/No-Go Decision
<!-- REQUIRED: go-no-go-decision — explicit GO or NO-GO recommendation with 2-3 sentence rationale; if NO-GO, list every blocker that must be resolved -->

**Recommendation:** ✅ GO / ❌ NO-GO

**Rationale:**
[2–3 sentences explaining the go/no-go decision based on test results]

**Blockers (if NO-GO):**
- [ ] [What must be resolved before advancing]
