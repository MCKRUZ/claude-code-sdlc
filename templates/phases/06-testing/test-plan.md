# Test Plan
<!-- Phase 6 — Testing | Required artifact -->

## Test Strategy

**Project:** [Project name]
**Test lead:** [Name]
**Date:** [YYYY-MM-DD]

The test plan is written BEFORE test execution. If you can't write the plan, you don't know what you're testing.

### Scope
<!-- REQUIRED: test-scope — explicit in-scope and out-of-scope lists; every out-of-scope item must have a rationale for exclusion -->

**In scope:**
- [What will be tested]

**Out of scope:**
- [What will NOT be tested, and why — e.g., "third-party payment SDK: tested by provider"]

### Test Approach

| Test Type | Purpose | Tool | Coverage Target |
|-----------|---------|------|----------------|
| Unit | Validate individual functions/components in isolation | [Jest / xUnit / pytest] | >= [X]% line coverage |
| Integration | Validate component interactions | [Supertest / WebApplicationFactory] | All API endpoints: happy + error |
| E2E | Validate complete user journeys | [Playwright / Cypress] | 1 test per P0 user story |

---

## Pass/Fail Criteria for Advancing to Phase 7
<!-- REQUIRED: pass-fail-criteria — all 6 checklist items present with specific thresholds filled in from the active profile; no item may be left blank -->

**Phase 6 is complete when ALL of the following are true:**

- [ ] Overall coverage >= [X]% (profile: `coverage_minimum`)
- [ ] Critical path coverage >= [Y]% (profile: `coverage_critical`)
- [ ] All E2E tests passing
- [ ] All P0 user stories have a passing E2E test
- [ ] No open defects blocking P0 user stories
- [ ] Full test suite passes in CI

Failing any of the above is a blocker. No exceptions without documented stakeholder override.

---

## Test Data Strategy

**Approach:** [Seeded fixtures / factory pattern / external test DB / mocks]

**Data isolation:** [How test data is kept separate from dev/prod data]

**Setup:** `[Command to seed test data]`
**Cleanup:** `[Command to tear down / how cleanup is automated]`

**Sensitive data handling:** [How PII is masked in test data if applicable]

---

## Test Schedule

| Phase | Activity | Dependency | Expected Duration |
|-------|---------|-----------|-----------------|
| 1 | Unit test execution + gap fill | Implementation complete | [N days] |
| 2 | Integration test execution | Unit tests passing | [N days] |
| 3 | E2E test authoring + execution | Integration tests passing | [N days] |
| 4 | Defect resolution | E2E results | [N days] |
| 5 | Regression + final gate check | All defects resolved | [N days] |

---

## E2E Test Coverage Plan
<!-- REQUIRED: e2e-coverage-plan — every P0 user story listed with its E2E test name, happy path status, and key error cases to cover -->

One E2E test per P0 user story — minimum. Tests should read like user stories.

| Story ID | Story Title | E2E Test Name | Happy Path | Error Cases |
|----------|-------------|--------------|-----------|------------|
| US-001 | | `[test file: describe/it]` | ✅ | [List key error cases] |
| US-002 | | | | |

---

## Test Environment

| Environment | Purpose | Who Manages |
|-------------|---------|------------|
| Local dev | Unit + integration (local) | Developer |
| CI | Full suite on each PR | [CI platform] |
| Staging | E2E against deployed system | [Name] |

**CI pipeline:** [Link or description]
**Test commands:**
```bash
# Unit
[command]

# Integration
[command]

# E2E
[command]
```
