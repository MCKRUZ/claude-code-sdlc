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
| Cross-document analysis | `discovery-analyst` | Step 0d: document intake ran AND a stakeholder workshop is planned | — | No |

**Notes:** Phase 0 is primarily human-driven. Agent use is minimal — mostly exploratory reads.
The `discovery-analyst` produces `contradiction-list.md` and `question-list.md` for the
workshop brief (`/sdlc-brief`); its outputs are questions for humans, never answers.

---

## Phase 1: Requirements

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Codebase exploration | `Explore` | Existing codebase to understand | — | No |
| Feedback analysis | `feedback-synthesizer` | User feedback/analytics available | — | No |
| Feature decomposition (Product) | `feature-architect` | Featuring a channel-bound feature (epic→feature→spec, via `/sdlc-feature`) | — | No |
| Business rules + scenarios (Bizreq) | `bizreq-analyst` | Business rules (BR-NN) or golden scenarios (SCEN-NN) to capture (via `/sdlc-rules`) | — | No |

**Note:** `feature-architect` and `bizreq-analyst` also double as `/sdlc-review` council lenses
(Product / Bizreq viewpoints). They draft and interrogate; a named human decides (the One Rule).

---

## Phase 2: Design

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Architecture design | `architect` | Always | — | No |
| Backend API design | `backend-architect` | Project has a backend/API layer | design-A | No |
| Frontend architecture | `frontend-developer` | Project has a frontend | design-A | No |
| Security model review | `security-reviewer` | Auth, payments, or sensitive data in scope | — | No |
| Multi-perspective review | `multi-reviewer` | Suggested before `/sdlc-gate`; use `--council` mode | — | No |
| Experience design — web | `visual-designer` | A `channel: ag-ui`/web surface is in scope (via `/sdlc-experience`) | design-B | No |
| Experience design — voice/chat | `conversation-designer` | A `channel: voice`/`chat` surface is in scope (via `/sdlc-experience`) | design-B | No |
| Data contract + readiness | `data-analyst` | Feature touches data or PII (via `/sdlc-data`) | — | No |
| Codebase exploration | `Explore` | Existing codebase being extended | — | No |

**Parallel group `design-A`:** When the project has both backend and frontend, spawn `backend-architect` and `frontend-developer` in the same message.

**Parallel group `design-B`:** When a feature spans a web surface and a voice/chat surface, spawn `visual-designer` and `conversation-designer` in the same message — they author different interaction specs and do not conflict. `/sdlc-experience` routes to the right one by the spec's `channel:`.

**Note:** `visual-designer`, `conversation-designer`, and `data-analyst` also double as `/sdlc-review` council lenses (Design / Data viewpoints). They propose and draft; a named human decides.

**`/deep-plan` orchestration (steps 1–15):** When `/deep-plan` is invoked in this phase, it manages its own subagents internally (Explore for codebase research, web-search-researcher for web research, opus-plan-reviewer or external LLMs for review). These do not need to be spawned separately — `/deep-plan` handles the orchestration. The agents listed above (`architect`, domain agents, `security-reviewer`) operate alongside `/deep-plan` for SDLC-native work like ADR generation and security review.

---

## Phase 3: Foundation

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| Section plan generation | `deep-plan:section-writer` | 3+ sections to plan | plan-A | No |
| Implementation planning | `Plan` | Complex feature decomposition | — | No |
| Codebase exploration | `Explore` | Need to understand existing code structure | — | No |

**Parallel group `plan-A`:** When multiple section plans have no dependency on each other, spawn one `deep-plan:section-writer` per independent section in a single message.

**`/deep-plan` orchestration (steps 16–22):** `/deep-plan` resumes from the Phase 2 checkpoint and manages `deep-plan:section-writer` subagents internally (batch size up to 7 concurrent). After generation, run `scripts/map_deep_plan_artifacts.py --phase 3` to transform `/deep-plan`'s `sections/section-NN-*.md` files into SDLC's `section-plans/SECTION-NNN.md` format (under `03-foundation/`) using the converged template. The `Plan` and `Explore` agents listed above are for supplementary work alongside `/deep-plan`.

---

## Build Loop (`build`)

The Build loop replaces the former batch Implementation/Quality/Testing phases (4/5/6). It is **continuous**: every change runs the same three beats — Intent (decide + write a spec), Delegate (bound + build from an approved plan), Discern (prove against the spec by someone other than the author, then merge). There is **no batch artifact exit gate** — checking happens per change, not as a later batch phase. The agents below are spawned per change as the beat requires, not once per phase.

| Role | Agent | Condition | Parallel Group | Background |
|------|-------|-----------|----------------|------------|
| TDD enforcement | `tdd-guide` | Profile requires TDD | — | No (sequential before build) |
| Backend implementation | `backend-architect` | Change is Python/C#/server-side | impl-A | No |
| Frontend implementation | `frontend-developer` | Change is HTML/CSS/Angular/React | impl-A | No |
| Rapid prototyping | `rapid-prototyper` | Change is a spike or proof-of-concept | — | No |
| Spec/section evaluation | `section-evaluator` | Discern beat — after each change | — | No (foreground, blocking) |
| Code review (rolling) | `code-reviewer` | Discern beat — after each change | review-A | Yes |
| Security review (rolling) | `security-reviewer` | Change touches auth/payments/secrets/PII | review-A | No (foreground) |
| Adversarial + edge-case review | `multi-reviewer` | Suggested; use `--adversarial` and `--edge-cases` | — | No |
| Dead code cleanup | `refactor-cleaner` | During hardening passes | — | Yes |
| Unit/integration tests | `test-writer-fixer` | Always (per change) | test-A | No |
| E2E tests | `e2e-runner` | Project has user-facing flows | test-A | No |
| API contract tests | `api-tester` | Project has API endpoints | test-A | No |
| Performance benchmarks | `performance-benchmarker` | NFRs include performance targets | — | No |
| Build error resolution | `build-error-resolver` | Build, compile, or test compilation fails | — | No (immediate) |
| Doc updates | `doc-updater` | Change touches public interfaces | — | Yes |
| Diff review | `deep-implement:code-reviewer` | Discern beat — review vs the spec/plan | — | Yes |
| Root cause investigation | `Explore` | A check fails unexpectedly | — | No |

**Parallel group `impl-A`:** When independent changes target different domains, spawn domain-specific agents in the same message. Never build independent changes sequentially.

**Parallel group `review-A`:** When both apply, spawn `code-reviewer` and `security-reviewer` in a single message. Never run them sequentially.

**Parallel group `test-A`:** Spawn all applicable test agents in a single message. They operate on different test domains and do not conflict.

**Mandatory spawns:**
- `build-error-resolver` on ANY build failure — do not attempt manual fixes first.
- `security-reviewer` on ANY change that handles auth, payments, secrets, or PII. STOP all other work on CRITICAL/HIGH findings; fix before merging.
- `tdd-guide` BEFORE each change when the profile enables TDD.
- `section-evaluator` in the Discern beat after EACH change — foreground, blocking. The change is not merged until the evaluator produces a PASS or CONDITIONAL PASS verdict. On FAIL, the build agent must address blocking issues and the evaluator re-runs.

**Remediation:** For CRITICAL/HIGH findings requiring code fixes, spawn the appropriate domain agent (`backend-architect` or `frontend-developer`). Security fixes are done inline, then re-run `security-reviewer` to confirm.

**Session handoff:** At the end of each session (or when the context window is nearing limits), the orchestrator MUST update `session-handoff.json` in `.sdlc/artifacts/build/`. At session start, it MUST read this file before beginning work. See `phases/build-loop.md`.

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
- `doc-updater` — documentation updates during the Build loop
- `refactor-cleaner` — dead code cleanup during Build-loop hardening passes
- `code-reviewer` — rolling per-change reviews in the Build loop
- `deep-implement:code-reviewer` — diff review against the spec/section plan

Never background:
- Security reviews (always foreground, always blocking)
- Build error resolution (always foreground, always blocking)
- Any work producing artifacts required by the current phase gate
