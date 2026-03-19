# Quality Metrics
<!-- Phase 5 — Quality | Required artifact -->

## Profile Thresholds
<!-- REQUIRED: profile-thresholds-table — all 4 metrics filled in from the active profile (coverage overall, coverage critical, max file lines, max function lines) -->

These are the targets from the active SDLC profile:

| Metric | Profile Threshold | Source |
|--------|-----------------|--------|
| Test coverage (overall) | >= [X]% | `profile.yaml: coverage_minimum` |
| Test coverage (critical paths) | >= [X]% | `profile.yaml: coverage_critical` |
| Max file size | [X] lines | `profile.yaml: max_file_lines` |
| Max function size | [X] lines | `profile.yaml: max_function_lines` |

---

## Actual Measurements

### Test Coverage
<!-- REQUIRED: coverage-measurements — overall percentage vs threshold, pass/fail status, and the per-module breakdown table with line/branch/function coverage -->

**Overall coverage:** [X]% (threshold: [Y]%)
**Status:** ✅ Passing / ❌ Failing

| Module | Line % | Branch % | Function % | Critical Path? |
|--------|--------|---------|-----------|----------------|
| [module name] | [X]% | [X]% | [X]% | Yes / No |
| [module name] | | | | |

**Coverage command:** `[command used to generate coverage]`
**Coverage report:** `[path to full report if generated]`

---

### Critical Path Coverage

| Critical Path | Coverage | Evidence |
|--------------|---------|---------|
| [Path: e.g., Authentication flow] | [X]% | [Test file / line range] |
| [Path: e.g., Data persistence] | [X]% | [Test file / line range] |
| [Path: e.g., P0 user story flow] | [X]% | [Test file / line range] |

---

### File Size Violations

| File | Lines | Threshold | Status | Action |
|------|-------|-----------|--------|--------|
| [path/to/file] | [N] | [Threshold] | ❌ Violation | [Split into X files / refactor] |

*If no violations: "No files exceed the [X]-line threshold."*

---

### Function Size Violations

| Function | File | Lines | Threshold | Status | Action |
|---------|------|-------|-----------|--------|--------|
| [functionName] | [path] | [N] | [Threshold] | ❌ Violation | [Extract X helper] |

*If no violations: "No functions exceed the [X]-line threshold."*

---

## Uncovered Areas

Areas not covered by tests, with rationale for accepting the gap:

| Area | Coverage | Rationale | Risk |
|------|---------|-----------|------|
| [Component/file] | [X]% | [Why not covered — e.g., "integration tested in Phase 6", "third-party adapter"] | Low / Medium / High |

---

## Metrics Trend (if prior phase exists)

| Metric | Previous | Current | Direction |
|--------|---------|---------|-----------|
| Overall coverage | [X]% | [Y]% | ↑ / ↓ / → |
| File size violations | [N] | [N] | ↑ / ↓ / → |

---

## Summary

**All P0 thresholds met:** Yes / No
**Violations requiring remediation:** [N]
**Deferred violations:** [N] — [rationale for deferral]
