# Phase 6: Testing

## Purpose
Execute a comprehensive test strategy — unit, integration, and E2E — and produce coverage evidence that meets profile thresholds. Testing is verification: the system does what the requirements said it should.

## Entry Criteria
- Phase 5 exit gate passed and `phase6-handoff.md` reviewed
- All CRITICAL and HIGH quality findings resolved

## Workflow

### Step 1: Test Plan
Define the testing strategy before executing:
- What will be tested (scope)
- What won't be tested and why (exclusions)
- Test types and their coverage goals
- Test data strategy
- Pass/fail criteria for advancing to Phase 7

### Step 2: Parallel Test Agent Launch

Determine which agents apply and spawn all of them in a **single message**:

- `test-writer-fixer` — always applies (unit tests, integration tests, coverage gaps)
- `e2e-runner` — applies when the project has user-facing flows
- `api-tester` — applies when the project has API endpoints
- `performance-benchmarker` — applies when NFRs include performance targets

```
# Single message — all applicable agents spawn simultaneously:
Agent(test-writer-fixer, "Run existing unit tests. Measure coverage against profile thresholds. Fill gaps for critical paths from phase6-handoff.md. Add integration tests for component interactions, API endpoints, and DB integration. Report results and coverage.")
Agent(e2e-runner, "Write and run E2E tests for each P0 user story using Playwright. Capture screenshots/videos as evidence. Report pass/fail per scenario.")
Agent(api-tester, "Run API contract tests against all endpoints. Verify request/response schemas match api-contracts.md. Test auth requirements and error formats. Report contract violations.")
```

If performance NFRs are defined:
```
Agent(performance-benchmarker, "Profile the system against NFR performance targets from non-functional-requirements.md. Measure response times, throughput, and resource usage. Report against defined thresholds.")
```

**On build or test compilation failure:** Spawn `build-error-resolver` immediately.

### Step 3: Test Results Consolidation

When all agents complete, consolidate results:
- **Unit/Integration** (`test-writer-fixer`): coverage must meet `coverage_minimum`; critical paths must meet `coverage_critical`
- **E2E** (`e2e-runner`): each P0 user story must have a passing test; collect screenshots/videos as artifacts
- **API contract** (`api-tester`): all endpoints must match their contracts; document any drift from `api-contracts.md`
- **Performance** (`performance-benchmarker`): compare against NFR targets; flag regressions

### Step 4: Defect Management
Track and resolve defects found during testing:
- Any defect blocking a P0 user story: must fix before advancing
- Document all defects found, their severity, and resolution

For fixes, spawn the appropriate domain agent (`backend-architect`, `frontend-developer`) or `test-writer-fixer`. If a fix breaks the build, spawn `build-error-resolver`.

Spawn `doc-updater` in background if test results reveal documentation inaccuracies.

### Step 5: Phase Handoff
Summarize test results, coverage evidence, and deployment readiness.

### Step 6: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase06-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `test-plan.md` (REQUIRED)
Must contain ALL of:
- **Test strategy** — approach, scope, exclusions with rationale
- **Test types** — unit / integration / E2E with coverage targets per type
- **Test data strategy** — how test data is created, isolated, cleaned up
- **Pass/fail criteria** — explicit threshold for advancing to Phase 7
- **Schedule** — order of test execution and dependencies
- **Agent assignments** — which test agents handle which test domains

### `test-results.md` (REQUIRED)
Must contain ALL of:
- **Execution summary** — total tests run, passed, failed, skipped
- **Results by suite** — breakdown by unit / integration / E2E
- **Defect log** — all defects found with: ID | Description | Severity | Status | Resolution
- **P0 user story coverage** — confirmation each P0 story has a passing E2E test
- **Regression notes** — any previously passing tests that now fail
- **API contract compliance** — contract test results and any drift from Phase 2 design
- **Performance results** — if benchmarked, results vs NFR targets

### `coverage-report.md` (REQUIRED)
Must contain ALL of:
- **Overall coverage** vs profile threshold
- **Coverage by module** — table showing each module's line/branch/function coverage
- **Critical path coverage** — specific coverage evidence for the most important flows
- **Uncovered areas** — what's not covered and the rationale for accepting the gap

### `phase7-handoff.md` (REQUIRED)
Must contain ALL of:
- **Test summary** — pass/fail/skip counts, coverage achieved
- **Open defects** — anything not fixed, with severity and rationale for deferring
- **Deployment readiness assessment** — is the system ready to deploy?
- **Documentation gaps** — what Phase 7 should focus on based on what was discovered
- **Performance baseline** — benchmark measurements for Phase 9 monitoring reference

## Exit Criteria
- [ ] Coverage >= `coverage_minimum` from profile
- [ ] Critical path coverage >= `coverage_critical` from profile
- [ ] All E2E tests passing
- [ ] All P0 user stories covered by passing E2E tests
- [ ] No open defects blocking P0 user stories
- [ ] Automated gate: full test suite passes

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase06-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- The test plan is written BEFORE test execution. If you can't write the plan, you don't know what you're testing.
- Coverage percentage alone is not evidence. 95% coverage of the wrong things is worthless.
- E2E tests should read like user stories — what is the user trying to accomplish?
- Defects found in testing are success, not failure — finding them here is the point.
- Parallel test execution saves significant time. Unit, E2E, and API contract tests operate on different layers — always launch them simultaneously.
