# Phase 6: Testing

## Purpose
Execute a comprehensive test strategy and produce coverage evidence that meets profile thresholds. Testing is verification: the system does what the requirements said it should.

## Project Type Adaptation

**Before starting Phase 6, read `project_type` from `state.yaml`.**

| project_type | Testing Approach |
|--------------|-----------------|
| `service` / `app` | Standard: unit tests, integration tests, E2E with Playwright, API contract tests. Use parallel agent launch (Step 2). |
| `library` / `cli` | Focused: unit tests for public API surface, integration tests for key workflows. E2E = invocation tests. Skip `e2e-runner`; use `test-writer-fixer` + `api-tester` as appropriate. |
| `skill` | Scenario-based: no compiled code to instrument. Replace the parallel agent launch with manual scenario execution against the requirement list. See Step 2 variant below. Coverage = % of requirements exercised by a passing scenario, not line coverage. |

## Entry Criteria
- Phase 5 exit gate passed and `phase6-handoff.md` reviewed
- All CRITICAL and HIGH quality findings resolved

## Workflow

### Step 0: HITL Gate — Confirm Test Scope

> **HITL GATE:** Before writing the test plan, read `phase6-handoff.md`. Present the following to the human: (1) Confirm test scope — what is in and what is out of testing? (2) Are the profile coverage targets (`coverage_minimum`, `coverage_critical`) acceptable for this project, or should they be adjusted? (3) Are there specific edge cases, user scenarios, or failure modes the human wants covered? (4) For `skill` projects: confirm the scenario list covers the full requirement set — present the requirement-to-scenario mapping for review. Do not write `test-plan.md` until the human confirms the test scope.

### Step 1: Test Plan
Define the testing strategy before executing:
- What will be tested (scope)
- What won't be tested and why (exclusions)
- Test types and their coverage goals
- Test data strategy
- Pass/fail criteria for advancing to Phase 7

**Requirement Traceability (REQUIRED — all project types):** Before finalizing the test plan, build a coverage map: every test scenario must reference at least one requirement ID. Then audit the map for redundancy:
- If two scenarios exercise exactly the same requirement in exactly the same way → consolidate them into one
- If scenarios > requirements × 3 → you have redundancy; review and prune before proceeding
- Mark each scenario's verification method: `runtime` (must be executed) or `static` (code/logic review is sufficient). Scenarios marked `static` do not count toward runtime coverage.

This gate exists because AI tooling can generate 40 scenarios for a 10-requirement system in minutes, producing volume that looks like rigor but isn't. The traceability map makes coverage gaps and duplicate coverage visible before the test run, not after.

### Step 2: Test Execution

#### For project_type: service / app (standard)

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

#### For project_type: skill (scenario-based)

There is no compiled code to instrument. Do not spawn `e2e-runner`, `api-tester`, or `test-writer-fixer` for coverage measurement — they will produce no useful output.

Instead:
1. For each scenario in the test plan (from the requirement traceability map in Step 1), execute the scenario manually: invoke the skill, observe the output, record pass/fail against the defined criteria.
2. Coverage is measured as: (passing runtime scenarios / total requirements) × 100. Target: `coverage_minimum` from profile for P1 requirements; 100% for P0.
3. For scenarios marked `static` in Step 1: perform a logic review of the instruction file and record the finding as `static-pass` or `static-fail`. These count toward coverage but not toward runtime pass rate.
4. Spawn `performance-benchmarker` only if performance NFRs require instrumented measurement (e.g., token overhead, wall-clock timing).

**Skill test setup tip:** Create scratch git repos in a temp directory to exercise edge cases (empty diff, binary file, rename, non-git directory). Clean up after each scenario.

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

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase06-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 6 (Testing):**
- Test results by category (unit, integration, E2E) — pass/fail counts
- Coverage heatmap by game system
- Scenario-to-requirement traceability matrix
- Performance benchmark results (if applicable)

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase06-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `test-plan.md` (REQUIRED)
Must contain ALL of:
- **Test strategy** — approach, scope, exclusions with rationale
- **Test types** — unit / integration / E2E with coverage targets per type (or scenario-based for skills)
- **Requirement traceability map** — table: Scenario ID | Requirement ID(s) | Verification Method (runtime / static) | Pass Criteria
- **Redundancy audit** — confirmation that scenario count ≤ requirements × 3, or justification if exceeded
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

## Test Expansion Protocol

After each QA run, actively expand the test suite:

1. **Healer pattern:** When tests fail, diagnose the root cause before fixing. Is it a broken test (fix the test) or a real bug (fix the code)? Never blindly fix test assertions to match broken output.

2. **Expander pattern:** After each successful test run, identify 3-5 untested edge cases and add tests for them. Focus on:
   - Boundary conditions not yet covered
   - Error paths that only have happy-path tests
   - Concurrent/timing scenarios
   - Data edge cases (empty, null, max-length, Unicode)

3. **Bug-to-test pipeline:** When bugs are found (in this phase or later):
   - Write the regression test FIRST (RED — test fails, proving the bug exists)
   - Fix the bug (GREEN — test passes)
   - Add the test to the permanent regression suite
   - Never fix a bug without a test that would have caught it

This ensures the test suite grows with every QA cycle and every bug fix, not just during initial test writing.

## Guidance
- The test plan is written BEFORE test execution. If you can't write the plan, you don't know what you're testing.
- Coverage percentage alone is not evidence. 95% coverage of the wrong things is worthless.
- E2E tests should read like user stories — what is the user trying to accomplish?
- Defects found in testing are success, not failure — finding them here is the point.
- Parallel test execution saves significant time. Unit, E2E, and API contract tests operate on different layers — always launch them simultaneously.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no tests written)
- "What's your test strategy — unit-heavy, integration-heavy, or E2E-heavy?"
- "What coverage target are you aiming for? Your profile requires [X]%."
- "Which user journeys are most critical to test end-to-end?"

### Progress Check (some tests passing)
- "Unit tests are at [X]% coverage. Integration tests cover [Y] scenarios."
- "E2E test [Z] is failing. Want to debug it together?"

### Ready Check (test suite green)
- "Test suite is green with [X]% coverage. Any edge cases you're worried about?"
- "Are the E2E tests covering the critical user journeys identified in Phase 1?"
