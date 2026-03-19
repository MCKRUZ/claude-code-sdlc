# Phase 6 Handoff — From Quality to Testing
<!-- Phase 5 — Quality | Required artifact -->

## Quality Summary
<!-- REQUIRED: quality-summary — total findings by severity, counts fixed vs deferred, coverage achieved overall and for critical paths, completion date, and approver -->

**Total findings:** [N] (CRITICAL: [N], HIGH: [N], MEDIUM: [N], LOW: [N])
**Findings fixed:** [N]
**Findings deferred:** [N]
**Security findings:** [N] HIGH, [N] CRITICAL
**Coverage achieved:** [X]% overall, [Y]% critical paths
**Date completed:** [YYYY-MM-DD]
**Approved by:** [Name]

---

## What's Clean, What to Watch

### Clean Areas
- [Component/area] — no findings, good test coverage

### Areas Needing Test Focus

Based on review findings, testing in Phase 6 should concentrate here:

| Area / Component | Reason for Focus | Suggested Test Types |
|-----------------|-----------------|---------------------|
| [Component] | [CRITICAL finding was here / complexity / uncertainty] | [Unit / Integration / E2E] |
| [Component] | | |

---

## Testing Focus Areas

### Must-Test Scenarios (from Code Review)
<!-- REQUIRED: testing-focus-areas — at least 2 must-test scenarios from code review and at least 1 from security review, each with the reason it needs explicit coverage -->

These scenarios were identified during review as needing explicit test coverage:

- [ ] **[Scenario]** — [Why: edge case, error path, recently changed logic]
- [ ] **[Scenario]** — [Why]

### Must-Test Scenarios (from Security Review)

- [ ] **[SEC finding NNN]** — [Verify the fix works under adversarial input]
- [ ] **[Authentication flow]** — [Verify all paths: valid, expired, missing, tampered]

---

## Deferred Items (MEDIUM/LOW)

These were identified but not fixed. Phase 6 testing will not block on them, but Phase 7 should note them in the technical debt log.

| Finding ID | Description | Rationale for Deferral | Target Phase |
|-----------|-------------|----------------------|-------------|
| CR-NNN | | | Phase N / Next release |
| CR-NNN | | | |

---

## Known Risks Entering Testing

| Risk | Description | Mitigation |
|------|-------------|-----------|
| [Risk] | [What we're uncertain about] | [What Phase 6 should do about it] |

---

## Artifacts Produced in Quality

| Artifact | Status | Notes |
|----------|--------|-------|
| `code-review-report.md` | ✅ Complete | [N] findings, [N] fixed |
| `security-review-report.md` | ✅ Complete | [N] findings, all HIGH fixed |
| `quality-metrics.md` | ✅ Complete | Coverage: [X]% |

---

## Exit Gate Status

- [ ] No CRITICAL findings open in code review report
- [ ] No HIGH findings open in security review report
- [ ] All files within `max_file_lines` profile threshold
- [ ] All functions within `max_function_lines` profile threshold
- [ ] Stakeholder approval received

**Approved by:** [Name] on [Date]
