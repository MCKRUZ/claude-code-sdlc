# Skill Mapping Reference

Maps each SDLC phase to the Claude Code skills/commands that execute it.

## Phase → Skill Matrix

| Phase | Primary Skills | Secondary Skills | Notes |
|-------|---------------|-----------------|-------|
| 0 Discovery | `/plan` | — | Manual elicitation + structured planning |
| 1 Requirements | `/deep-project` | `/plan` | Decompose into planning units |
| 2 Design | `/deep-plan` | `/plan` | Architecture + ADRs via deep planning |
| 3 Planning | `/deep-plan` | — | Section-level planning with TDD |
| 4 Implementation | `/deep-implement`, `/tdd` | `/code-review` | TDD-driven implementation |
| 5 Quality | `/code-review`, `/security-review` | — | Review gates before testing |
| 6 Testing | `/e2e`, `/test-coverage` | `/tdd` | Coverage enforcement |
| 7 Documentation | `/update-docs` | — | Sync docs with code |
| 8 Deployment | CI/CD pipeline | — | External automation |
| 9 Monitoring | Manual | — | Alert/dashboard configuration |

## Skill Details

### /deep-project
- **Phase:** Requirements (1)
- **Purpose:** Decomposes vague, high-level project requirements into well-scoped planning units
- **Input:** Problem statement, stakeholder notes
- **Output:** Structured requirements, acceptance criteria

### /deep-plan
- **Phases:** Design (2), Planning (3)
- **Purpose:** Creates detailed, sectionized, TDD-oriented implementation plans
- **Input:** Requirements, design constraints
- **Output:** Section plans with implementation order

### /deep-implement
- **Phase:** Implementation (4)
- **Purpose:** Implements code from /deep-plan section files with TDD methodology
- **Input:** Section plan files
- **Output:** Source code, tests, git commits

### /tdd
- **Phases:** Implementation (4), Testing (6)
- **Purpose:** Enforce test-driven development workflow
- **Input:** Feature specification
- **Output:** Tests first, then implementation

### /code-review
- **Phase:** Quality (5)
- **Purpose:** Expert code review for quality, security, maintainability
- **Input:** Code diffs
- **Output:** Review report with severity ratings

### /security-review
- **Phase:** Quality (5)
- **Purpose:** Security vulnerability detection
- **Input:** Code handling user input, auth, APIs, sensitive data
- **Output:** Security report with OWASP Top 10 analysis

### /e2e
- **Phase:** Testing (6)
- **Purpose:** Generate and run end-to-end tests
- **Input:** Critical user flows
- **Output:** Playwright tests, screenshots, traces

### /test-coverage
- **Phase:** Testing (6)
- **Purpose:** Analyze and report test coverage
- **Input:** Test suite
- **Output:** Coverage report vs. profile thresholds

### /update-docs
- **Phase:** Documentation (7)
- **Purpose:** Sync documentation with code changes
- **Input:** Code changes, existing docs
- **Output:** Updated README, API docs, guides

## Agent Mapping

| Agent | Phase(s) | Purpose |
|-------|----------|---------|
| sdlc-orchestrator | All | Coordinates phase transitions and skill invocation |
| requirements-analyst | 0, 1 | Guides discovery interviews and requirement decomposition |
| compliance-checker | All (if compliance enabled) | Validates compliance gates at phase transitions |
