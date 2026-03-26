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

**`/deep-plan` orchestration (steps 1–15):** When `/deep-plan` is invoked in this phase, it manages its own subagents internally (Explore for codebase research, web-search-researcher for web research, opus-plan-reviewer or external LLMs for review). These do not need to be spawned separately — `/deep-plan` handles the orchestration. The agents listed above (`architect`, domain agents, `security-reviewer`) operate alongside `/deep-plan` for SDLC-native work like ADR generation and security review.

---

## Phase 3: Planning

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Section plan generation | `deep-plan:section-writer` | 3+ sections to plan | plan-A | No |
| Implementation planning | `Plan` | Complex feature decomposition | — | No |
| Codebase exploration | `Explore` | Need to understand existing code structure | — | No |

**Parallel group `plan-A`:** When multiple section plans have no dependency on each other, spawn one `deep-plan:section-writer` per independent section in a single message.

**`/deep-plan` orchestration (steps 16–22):** `/deep-plan` resumes from the Phase 2 checkpoint and manages `deep-plan:section-writer` subagents internally (batch size up to 7 concurrent). After generation, run `scripts/map_deep_plan_artifacts.py --phase 3` to transform `/deep-plan`'s `sections/section-NN-*.md` files into SDLC's `section-plans/SECTION-NNN.md` format using the converged template. The `Plan` and `Explore` agents listed above are for supplementary work alongside `/deep-plan`.

---

## Phase 4: Implementation

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| TDD enforcement | `tdd-guide` | Profile requires TDD | — | No (sequential before impl) |
| Backend implementation | `backend-architect` | Section is Python/C#/server-side | impl-A | No |
| Frontend implementation | `frontend-developer` | Section is HTML/CSS/Angular/React | impl-A | No |
| Rapid prototyping | `rapid-prototyper` | Section is a spike or proof-of-concept | — | No |
| Section evaluation | `section-evaluator` | After each section implementation completes | — | No (foreground, blocking) |
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
- `section-evaluator` after EACH completed section — foreground, blocking. The section is not marked complete until the evaluator produces a PASS or CONDITIONAL PASS verdict. On FAIL, the implementation agent must address blocking issues and the evaluator re-runs.

**Session handoff:** At the end of each session (or when context window is nearing limits), the orchestrator MUST update `session-handoff.json` in `.sdlc/artifacts/04-implementation/`. At session start, it MUST read this file before beginning work. See `phases/04-implementation.md` Step 0g and Step 3b.

---

## Phase 5: Quality

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Code review | `code-reviewer` | Always | review-A | No |
| Security review | `security-reviewer` | Always | review-A | No |
| Dead code cleanup | `refactor-cleaner` | Always | — | Yes |
| Root cause investigation | `Explore` | Gate check fails unexpectedly | — | No |
| Backend remediation | `backend-architect` | CRITICAL/HIGH findings in backend code | — | No |
| Frontend remediation | `frontend-developer` | CRITICAL/HIGH findings in frontend code | — | No |

**Parallel group `review-A`:** ALWAYS spawn `code-reviewer` and `security-reviewer` in a single message. Never run them sequentially.

**Mandatory:** If `security-reviewer` finds CRITICAL or HIGH issues, STOP all other work. Fix before advancing.

**Remediation:** For CRITICAL/HIGH findings requiring code fixes, spawn the appropriate domain agent (`backend-architect` or `frontend-developer`). Security fixes are done inline, then re-run `security-reviewer` to confirm.

---

## Phase 6: Testing

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Unit/integration tests | `test-writer-fixer` | Always | test-A | No |
| E2E tests | `e2e-runner` | Project has user-facing flows | test-A | No |
| API contract tests | `api-tester` | Project has API endpoints | test-A | No |
| Performance benchmarks | `performance-benchmarker` | NFRs include performance targets | — | No |
| Build error resolution | `build-error-resolver` | Test compilation fails | — | No |
| Backend defect fix | `backend-architect` | Defect in backend code | — | No |
| Frontend defect fix | `frontend-developer` | Defect in frontend code | — | No |
| Doc updates | `doc-updater` | Test results change public docs | — | Yes |

**Parallel group `test-A`:** Spawn all applicable test agents in a single message. They operate on different test domains and do not conflict.

---

## Phase 7: Documentation

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Documentation updates | `doc-updater` | Always | doc-A | No |
| API doc generation | `backend-architect` | API docs need updating (`service`/`app`/`library`/`cli`) | doc-A | No |
| ADR gap analysis | `Explore` | Always — search git history for undocumented decisions | — | No |

**Parallel group `doc-A`:** Spawn `doc-updater` and `backend-architect` in a single message. They write different documents and do not conflict.

**Conditional:** For `skill` projects, replace `backend-architect` with a second `doc-updater` spawn for SKILL.md refinement and example gallery.

**Sequential:** After `doc-A` completes, spawn `Explore` for ADR gap analysis — it reads the outputs of the doc agents to avoid duplicate work.

---

## Phase 8: Deployment

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Staging deployment | `devops-automator` | Always | — | No |
| Smoke test execution | `e2e-runner` | After staging deploy succeeds | — | No |
| Build error resolution | `build-error-resolver` | Deployment build fails | — | No (immediate) |

**Sequential flow:** `devops-automator` (staging) → `e2e-runner` (smoke tests) → production decision.

**Mandatory:** If deployment build fails at any point, spawn `build-error-resolver` immediately. Do not attempt manual fixes.

**Production:** Re-spawn `devops-automator` for production deployment, then re-spawn `e2e-runner` for production smoke tests.

---

## Phase 9: Monitoring

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Performance baseline | `performance-benchmarker` | Always (`service`/`app`); NFR-dependent for others | — | No |
| Feedback synthesis | `feedback-synthesizer` | User feedback exists post-launch | — | Yes |
| Monitoring doc updates | `doc-updater` | Always — writes monitoring-config.md | — | No |

**Sequential:** `performance-benchmarker` runs first to establish baselines. `doc-updater` uses its output to write `monitoring-config.md`.

**Background:** `feedback-synthesizer` runs in background during the retrospective — its output is incorporated when available but does not block the phase.

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
