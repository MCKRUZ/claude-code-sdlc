# Test Plan

## Project
- **Name:** [Project Name]
- **Phase:** 6 — Testing
- **Date:** [Date]

## Test Strategy

### Coverage Targets
- **Overall minimum:** [from profile: quality.coverage_minimum]%
- **Critical paths:** [from profile: quality.coverage_critical]%
- **Critical paths include:** authentication, authorization, payment processing, core business logic

### Test Types

| Type | Tool | Scope | Run Frequency |
|------|------|-------|---------------|
| Unit | [xUnit/Jasmine] | Individual functions/methods | Every commit |
| Integration | [xUnit/Jasmine] | Cross-component flows | Every PR |
| E2E | [Playwright/Cypress] | Critical user journeys | Pre-merge + nightly |

## Test Scenarios

### Critical User Journeys (E2E)

| ID | Journey | Steps | Priority |
|----|---------|-------|----------|
| E2E-001 | [Journey name] | [Step summary] | P0 |
| E2E-002 | [Journey name] | [Step summary] | P0 |

### Unit Test Coverage Gaps

| Module | Current | Target | Gap |
|--------|---------|--------|-----|
| [Module] | [X]% | [Y]% | [Z]% |

### Security Test Cases

| ID | Test | Requirement | Status |
|----|------|-------------|--------|
| SEC-001 | [Test description] | [NFR/Compliance ref] | Pending |

## Execution Plan

1. Run unit tests: `[command]`
2. Run integration tests: `[command]`
3. Run E2E tests: `[command]`
4. Generate coverage report: `[command]`
5. Verify coverage meets thresholds
6. Archive results to `.sdlc/artifacts/06-testing/`

## Pass/Fail Criteria
- All unit tests pass
- All integration tests pass
- All E2E tests pass
- Coverage >= minimum threshold
- No flaky tests (tests that intermittently fail)
