# Agent Roster — Phase-to-Subagent Mapping

Maps each SDLC phase to the Claude subagents that MUST or SHOULD be spawned via the Agent tool. This is the authoritative reference for agent orchestration decisions.

## How to Read This Document

- **Primary agents** are spawned for every project in this phase.
- **Conditional agents** are spawned only when a stated condition is true.
- **Parallel group** — agents within the same group MUST be launched in a single message with multiple Agent tool calls.
- **Background** agents run with `run_in_background: true` so they do not block the main workflow.

---

## Phase 0: Discovery

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Codebase exploration | `Explore` | Existing codebase to analyze | — | No |
| Feedback analysis | `feedback-synthesizer` | User feedback data available | — | No |

**Notes:** Phase 0 is primarily human-driven. Agent use is minimal — mostly exploratory reads.

---

## Phase 1: Requirements

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Codebase exploration | `Explore` | Existing codebase to understand | — | No |
| Feedback analysis | `feedback-synthesizer` | User feedback/analytics available | — | No |

---

## Phase 2: Design

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Architecture design | `architect` | Always | — | No |
| Backend API design | `backend-architect` | Project has a backend/API layer | design-A | No |
| Frontend architecture | `frontend-developer` | Project has a frontend | design-A | No |
| Security model review | `security-reviewer` | Auth, payments, or sensitive data in scope | — | No |
| Codebase exploration | `Explore` | Existing codebase being extended | — | No |

**Parallel group `design-A`:** When the project has both backend and frontend, spawn `backend-architect` and `frontend-developer` in the same message.

---

## Phase 3: Planning

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Section plan generation | `deep-plan:section-writer` | 3+ sections to plan | plan-A | No |
| Implementation planning | `Plan` | Complex feature decomposition | — | No |
| Codebase exploration | `Explore` | Need to understand existing code structure | — | No |

**Parallel group `plan-A`:** When multiple section plans have no dependency on each other, spawn one `deep-plan:section-writer` per independent section in a single message.

---

## Phase 4: Implementation

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| TDD enforcement | `tdd-guide` | Profile requires TDD | — | No (sequential before impl) |
| Backend implementation | `backend-architect` | Section is Python/C#/server-side | impl-A | No |
| Frontend implementation | `frontend-developer` | Section is HTML/CSS/Angular/React | impl-A | No |
| Rapid prototyping | `rapid-prototyper` | Section is a spike or proof-of-concept | — | No |
| Code review (rolling) | `code-reviewer` | After each section completes | — | Yes |
| Security review (rolling) | `security-reviewer` | Section touches auth/payments/secrets/PII | — | No (foreground) |
| Build error resolution | `build-error-resolver` | Build or compilation fails | — | No (immediate) |
| Doc updates | `doc-updater` | Implementation changes public interfaces | — | Yes |
| Diff review | `deep-implement:code-reviewer` | After each section, review vs plan | — | Yes |

**Parallel group `impl-A`:** When the sprint plan contains independent sections targeting different domains, spawn domain-specific agents in the same message. Never implement independent sections sequentially.

**Mandatory spawns:**
- `build-error-resolver` on ANY build failure — do not attempt manual fixes first.
- `security-reviewer` on ANY section that handles auth, payments, secrets, or PII.
- `tdd-guide` BEFORE each section when the profile enables TDD.

---

## Phase 5: Quality

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Code review | `code-reviewer` | Always | review-A | No |
| Security review | `security-reviewer` | Always | review-A | No |
| Dead code cleanup | `refactor-cleaner` | Always | — | Yes |
| Root cause investigation | `Explore` | Gate check fails unexpectedly | — | No |

**Parallel group `review-A`:** ALWAYS spawn `code-reviewer` and `security-reviewer` in a single message. Never run them sequentially.

**Mandatory:** If `security-reviewer` finds CRITICAL or HIGH issues, STOP all other work. Fix before advancing.

---

## Phase 6: Testing

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Unit/integration tests | `test-writer-fixer` | Always | test-A | No |
| E2E tests | `e2e-runner` | Project has user-facing flows | test-A | No |
| API contract tests | `api-tester` | Project has API endpoints | test-A | No |
| Performance benchmarks | `performance-benchmarker` | NFRs include performance targets | — | No |
| Build error resolution | `build-error-resolver` | Test compilation fails | — | No |
| Doc updates | `doc-updater` | Test results change public docs | — | Yes |

**Parallel group `test-A`:** Spawn all applicable test agents in a single message. They operate on different test domains and do not conflict.

---

## Phase 7: Documentation

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Documentation updates | `doc-updater` | Always | doc-A | No |
| API doc generation | `backend-architect` | API docs need updating | doc-A | No |

**Parallel group `doc-A`:** API docs and user-facing docs can be generated simultaneously.

---

## Phase 8: Deployment

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| CI/CD configuration | `devops-automator` | Pipeline needs creation or updates | — | No |
| Smoke test execution | `e2e-runner` | Smoke tests defined | — | No |
| Build error resolution | `build-error-resolver` | Deployment build fails | — | No |

---

## Phase 9: Monitoring

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Performance baseline | `performance-benchmarker` | Production metrics available | — | No |
| Feedback synthesis | `feedback-synthesizer` | User feedback exists post-launch | — | No |
| Doc updates | `doc-updater` | Monitoring docs need writing | — | No |

---

## Automatic Escalation Rules

These apply to ALL phases:

| Trigger | Agent | Behavior |
|---------|-------|----------|
| Build or compilation failure | `build-error-resolver` | Spawn immediately. Do not attempt manual fixes first. |
| Code touches auth, payments, secrets, or PII | `security-reviewer` | Foreground. STOP on CRITICAL/HIGH findings. |
| Gate check fails unexpectedly | `Explore` | Investigate root cause before attempting fixes. |
| Test suite failure after implementation | `test-writer-fixer` | Spawn to diagnose and fix. |

---

## Background Agent Policy

Run with `run_in_background: true`:
- `doc-updater` — documentation updates during implementation
- `refactor-cleaner` — dead code cleanup during quality review
- `code-reviewer` — rolling per-section reviews in Phase 4
- `deep-implement:code-reviewer` — diff review against section plans

Never background:
- Security reviews (always foreground, always blocking)
- Build error resolution (always foreground, always blocking)
- Any work producing artifacts required by the current phase gate
