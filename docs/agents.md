# Agent Orchestration

Authoritative reference for how the claude-code-sdlc plugin spawns, coordinates, and manages agents across the SDLC lifecycle.

---

## Table of Contents

1. [Agent Architecture Overview](#1-agent-architecture-overview)
2. [Custom Agents](#2-custom-agents)
3. [Built-in Subagents Used by SDLC](#3-built-in-subagents-used-by-sdlc)
4. [Phase-to-Agent Mapping](#4-phase-to-agent-mapping)
5. [Parallel Execution Rules](#5-parallel-execution-rules)
6. [Mandatory vs Optional Spawns](#6-mandatory-vs-optional-spawns)
7. [Background Agent Policy](#7-background-agent-policy)
8. [Automatic Escalation Rules](#8-automatic-escalation-rules)
9. [Cross-References](#9-cross-references)

---

## 1. Agent Architecture Overview

Agents in the claude-code-sdlc plugin are invoked through Claude Code's `Agent()` tool, not inline within the main conversation context. This is a deliberate architectural choice with several consequences:

- **Context isolation.** Each agent receives only the task-specific context it needs (state file, profile, phase artifacts) and returns a structured result. The main context window is protected from the full volume of agent reasoning and intermediate output.
- **Composability.** The sdlc-orchestrator agent can spawn other agents, creating multi-level orchestration without polluting the user-facing conversation.
- **Parallelism.** Independent agents can be spawned simultaneously in a single message via multiple `Agent()` tool calls, enabling concurrent work across domains.

There are two categories of agents:

| Category | Defined In | Count | Examples |
|----------|-----------|-------|---------|
| Custom SDLC agents | `agents/*.md` | 4 | sdlc-orchestrator, compliance-checker, requirements-analyst, section-evaluator |
| Built-in Claude Code subagents | Claude Code runtime | 13+ | code-reviewer, security-reviewer, backend-architect, Explore |

Custom agents carry SDLC-specific system prompts, tool permissions, and output format contracts. Built-in subagents are standard Claude Code agents referenced by name in phase workflows; they bring their own capabilities but are directed by the SDLC orchestration layer.

---

## 2. Custom Agents

### 2.1 sdlc-orchestrator

**File:** `agents/sdlc-orchestrator.md`
**Tools:** Read, Write, Edit, Bash, Grep, Glob

The orchestrator is the central coordination agent for the entire SDLC lifecycle. It is the only agent that both reads and writes `.sdlc/state.yaml`.

**Responsibilities:**

1. **Phase coordination** -- Reads the current phase from `state.yaml`, consults the phase definition in `phases/XX-phasename.md`, and guides the user through the correct sequence of activities.
2. **Gate enforcement** -- Before any phase transition, runs `scripts/check_gates.py` and blocks advancement if MUST-level gates fail.
3. **Skill routing** -- Maps the current phase to the appropriate Claude Code skills:
   - Phase 0-1: `/plan`, `/deep-project`
   - Phase 2: `/deep-plan` (steps 1-15), preceded by `synthesize_spec.py`, followed by `map_deep_plan_artifacts.py --phase 2`, then ADR generation
   - Phase 3: `/deep-plan` (steps 16-22, resume from checkpoint), followed by `map_deep_plan_artifacts.py --phase 3`, then sprint planning and risk register
   - Phase 4: `/deep-implement`, `/tdd`
   - Phase 5: `/code-review`, `/security-review`
   - Phase 6: `/e2e`, `/test-coverage`
   - Phase 7: `/update-docs`
4. **State management** -- Updates `state.yaml` with gate results, phase transitions, timestamps, and session metadata.
5. **Profile awareness** -- Reads `.sdlc/profile.yaml` to determine the project's stack, quality thresholds, compliance requirements, and conventions. All downstream decisions respect profile configuration.

**When spawned:** Complex phase transitions, multi-step workflows, `/sdlc-next` command execution, and any scenario requiring cross-phase state awareness.

**Key files accessed:**
- `.sdlc/state.yaml` (read/write)
- `.sdlc/profile.yaml` (read)
- `phases/phase-registry.yaml` (read)
- `scripts/check_gates.py` (execute)
- `scripts/synthesize_spec.py` (execute)
- `scripts/map_deep_plan_artifacts.py` (execute)

---

### 2.2 compliance-checker

**File:** `agents/compliance-checker.md`
**Tools:** Read, Grep, Glob, Bash

The compliance checker validates regulatory compliance gates at phase transitions. It is the enforcement mechanism for organizations that configure compliance frameworks in their profile.

**Supported frameworks:**

| Framework | Focus Areas |
|-----------|-------------|
| SOC 2 (Type II) | Access controls (CC6.1), system boundaries (CC6.6), change management (CC7.1), vulnerability management (CC7.2), code review (CC8.1), monitoring (CC7.2) |
| HIPAA | Access controls (164.312(a)), transmission security (164.312(e)), audit controls (164.312(b)), person authentication (164.312(d)), contingency plan (164.308(a)(7)) |
| GDPR | Data protection by design (Art. 25), lawful basis (Art. 6), right to erasure (Art. 17), data portability (Art. 20), security of processing (Art. 32), records of processing (Art. 30) |
| PCI-DSS | Network segmentation (Req 1), stored data protection (Req 3), secure coding (Req 6.5), code review (Req 6.6), testing controls (Req 11), change control (Req 6.4) |

**How it operates:**

1. Reads `.sdlc/profile.yaml` to determine which frameworks apply.
2. Loads compliance gate definitions from the profile's `compliance/` directory (e.g., `soc2-gates.yaml`).
3. Filters gates to only those relevant to the current phase transition.
4. Checks each gate using one of four verification methods:
   - `artifact_exists` -- Verifies the file or directory exists on disk.
   - `artifact_content` -- Verifies the artifact contains required keywords or sections.
   - `metric` -- Reports a metric requirement (may require external tool execution).
   - `manual` -- Flags for human review with specific instructions.
5. Reports each gate as PASS, FAIL, or MANUAL with severity level.
6. Provides specific remediation actions for every failure.

**Output format:** A structured compliance report listing every gate with its result, severity, and remediation guidance. Example:

```
Compliance Check: SOC 2 -- Phase 2 -> Phase 3
=====================================================
[PASS] [MUST] CC6.1: Access control requirements defined
[FAIL] [MUST] CC6.6: System boundaries not documented in design-doc.md
  -> Add a "Trust Boundaries" section to .sdlc/artifacts/02-design/design-doc.md
[MANUAL] [MUST] CC8.1: Peer review required -- verify review is documented
=====================================================
Result: BLOCKED -- 1 failure requires remediation
```

**Key principle:** Compliance gates at MUST severity are non-negotiable. The agent will never suggest workarounds that bypass compliance requirements. It helps the user satisfy the requirement properly.

**When spawned:** Phase transitions in projects with compliance profiles, explicit compliance audit requests via `/sdlc-audit`.

---

### 2.3 requirements-analyst

**File:** `agents/requirements-analyst.md`
**Tools:** Read, Write, Edit, Grep, Glob

The requirements analyst specializes in eliciting, structuring, and validating software requirements. It is the primary agent for Phases 0 and 1 and is heavily human-in-the-loop (HITL).

**Responsibilities:**

1. **Discovery interview (Phase 0):**
   - Asks probing questions about the problem space.
   - Identifies stakeholders and their concerns.
   - Helps craft a structured problem statement.
   - Documents assumptions and constraints.
   - Reads existing artifacts from `.sdlc/artifacts/00-discovery/`.

2. **Requirements decomposition (Phase 1):**
   - Breaks the approved problem statement into functional requirements.
   - Identifies non-functional requirements (performance, security, scalability).
   - Assigns priority labels (P0-P3) based on stakeholder input.
   - Writes measurable acceptance criteria in Given/When/Then format.

3. **Requirements validation:**
   - Checks for conflicting requirements.
   - Ensures completeness against the problem statement scope.
   - Verifies all P0/P1 requirements have acceptance criteria.
   - Flags gaps or ambiguities.
   - Checks compliance requirements: SOC 2 (auth/authz defined?), HIPAA (PHI access controls?), GDPR (privacy requirements specified?).

**Output format:** Structured requirements documents using templates from the plugin. Each requirement follows the pattern `REQ-XXX: [Description] [Priority: PX]`. Each acceptance criterion uses Given/When/Then format. Compliance gaps are flagged explicitly.

**Key principle:** "Ask, don't assume." When uncertain about a requirement's scope or priority, the analyst asks the user rather than making assumptions. Clarifying now prevents building the wrong thing.

**When spawned:** Phase 0 (discovery interviews), Phase 1 (requirements gathering and decomposition).

---

### 2.4 section-evaluator

**File:** `agents/section-evaluator.md`
**Tools:** Read, Grep, Glob, Bash

The section evaluator is the "discriminator" in a generator-evaluator loop. It assesses whether a completed section implementation satisfies its plan's verification criteria and quality standards. Its job is to be rigorous, not lenient.

**Responsibilities:**

1. **Verify exit criteria** -- Checks every exit criterion from the section plan. Each must have evidence of satisfaction (passing test, file exists, behavior confirmed).
2. **Grade against rubric** -- Applies the Evaluator Contract's grading rubric point by point.
3. **Check interface compliance** -- Verifies exposed interfaces match the Interfaces table in the section plan.
4. **Validate test quality** -- Confirms coverage targets are met and TDD test stubs from the plan are implemented.
5. **Flag deviations** -- Any deviation from Implementation Guidance must be documented in `implementation-notes.md`.

**How it operates:**

1. Reads the section plan from `.sdlc/artifacts/03-planning/section-plans/SECTION-NNN.md` and extracts: Exit Criteria, Verification Criteria (methodology table), Evaluator Contract (grading rubric, fail conditions, warn conditions), Interfaces table, Test Strategy, and TDD Test Stubs.
2. Reads the implementation: identifies created/modified files, reads `implementation-notes.md` for decisions and deviations, checks test files for coverage of TDD stubs.
3. Reads profile evaluation criteria from `.sdlc/profile.yaml` under `quality.evaluation_criteria` and applies any additional company-specific quality standards. If a criterion's `severity` field is missing, it defaults to `warn` (non-blocking).
4. Evaluates each criterion against its specified Verification Method and Pass Condition, recording PASS / FAIL / WARN with evidence.
5. Applies the five-category grading rubric: functional completeness, test quality, interface compliance, code quality, and deviation accountability.
6. Produces a structured evaluation report with a final verdict: PASS, FAIL, or CONDITIONAL PASS.

**Verdicts:**
- **PASS** -- All exit criteria met, all rubric categories pass, no blocking issues.
- **CONDITIONAL PASS** -- Exit criteria met with warnings. The section is complete but improvements are recommended.
- **FAIL** -- One or more fail conditions triggered. The implementation agent must address blocking issues and the evaluator re-runs.

**Key principles:**
- Be specific. "Tests look good" is not an evaluation. "12/14 TDD stubs implemented, missing edge case for null input on UserService.Create" is.
- Fail conditions from the Evaluator Contract are non-negotiable. If triggered, the verdict MUST be FAIL regardless of other results.
- Warn conditions are signal for improvement but do not block section completion.
- Deviations are acceptable when documented. The evaluator penalizes only undocumented deviations.
- Quality thresholds (coverage, file size, function size) come from `.sdlc/profile.yaml`, not from assumptions.

**When spawned:** Phase 4, after each section implementation completes. Foreground, blocking -- the section is not marked complete until the evaluator produces a PASS or CONDITIONAL PASS.

---

## 3. Built-in Subagents Used by SDLC

These are standard Claude Code agents that the SDLC plugin references by name in phase workflows. They are not defined in `agents/` but are invoked via the `Agent()` tool during orchestration.

| Agent | Primary Phases | Purpose |
|-------|---------------|---------|
| `code-reviewer` | 4 (bg), 5 (primary) | Code correctness, maintainability, convention adherence |
| `security-reviewer` | 2, 4, 5 (primary) | OWASP Top 10, auth, secrets, injection, PII handling |
| `build-error-resolver` | 4, 6, 8 (conditional) | Diagnose and fix build/compilation failures |
| `backend-architect` | 2, 4, 5, 6, 7 (conditional) | Architecture design, backend implementation, API docs |
| `frontend-developer` | 2, 4, 5, 6 (conditional) | UI implementation, frontend fixes |
| `test-writer-fixer` | 6 (primary) | Write and fix unit/integration tests |
| `e2e-runner` | 6 (primary), 8 (sequential) | End-to-end test execution, smoke tests |
| `api-tester` | 6 (primary) | API contract testing |
| `performance-benchmarker` | 6 (conditional), 9 (primary) | Performance NFR validation, baseline establishment |
| `doc-updater` | 4 (bg), 6 (bg), 7 (primary), 9 | Documentation generation and updates |
| `refactor-cleaner` | 5 (bg) | Dead code cleanup |
| `feedback-synthesizer` | 0, 1 (conditional), 9 (bg) | User feedback analysis for retrospectives |
| `Explore` | 0, 1, 2, 3, 5, 7 (conditional) | Codebase exploration, ADR gap analysis |
| `architect` | 2 (primary) | High-level system architecture design |
| `Plan` | 3 (conditional) | Complex feature decomposition |
| `tdd-guide` | 4 (conditional) | TDD enforcement when profile requires it |
| `rapid-prototyper` | 4 (conditional) | Spike and proof-of-concept implementations |
| `devops-automator` | 8 (primary) | Staging and production deployment automation |
| `deep-plan:section-writer` | 3 (parallel) | Section plan generation within `/deep-plan` |
| `deep-implement:code-reviewer` | 4 (bg) | Diff review of implementation against section plan |

---

## 4. Phase-to-Agent Mapping

### Phase 0: Discovery

| Agent | Mode | Condition |
|-------|------|-----------|
| `Explore` | Foreground | Existing codebase to analyze |
| `feedback-synthesizer` | Foreground | User feedback data available |

Phase 0 is primarily human-driven. Agent use is minimal, mostly exploratory reads and structured interviews. The requirements-analyst custom agent may also be invoked for discovery interviews.

---

### Phase 1: Requirements

| Agent | Mode | Condition |
|-------|------|-----------|
| `requirements-analyst` | Foreground | Always (HITL-driven) |
| `Explore` | Foreground | Existing codebase to understand |
| `feedback-synthesizer` | Foreground | User feedback/analytics available |

The requirements-analyst drives structured interviews, requirements decomposition, and acceptance criteria writing. This phase is heavily interactive with the user.

---

### Phase 2: Design

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `architect` | Foreground | Always | -- |
| `backend-architect` | Foreground | Project has backend/API layer | design-A |
| `frontend-developer` | Foreground | Project has frontend | design-A |
| `security-reviewer` | Foreground | Auth, payments, or sensitive data in scope | -- |
| `Explore` | Foreground | Existing codebase being extended | -- |

**Parallel group `design-A`:** When the project has both backend and frontend, spawn `backend-architect` and `frontend-developer` in the same message.

**`/deep-plan` integration (steps 1-15):** When `/deep-plan` is invoked in this phase, it manages its own internal subagents (Explore for codebase research, web-search-researcher for web research, opus-plan-reviewer for review). These do not need separate spawning. The agents listed above operate alongside `/deep-plan` for SDLC-native work like ADR generation and security review.

---

### Phase 3: Planning

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `deep-plan:section-writer` | Foreground | 3+ sections to plan | plan-A |
| `Plan` | Foreground | Complex feature decomposition | -- |
| `Explore` | Foreground | Need to understand existing code structure | -- |

**Parallel group `plan-A`:** When multiple section plans have no dependency on each other, spawn one `deep-plan:section-writer` per independent section in a single message.

**`/deep-plan` integration (steps 16-22):** `/deep-plan` resumes from the Phase 2 checkpoint and manages `deep-plan:section-writer` subagents internally (batch size up to 7 concurrent). After generation, run `scripts/map_deep_plan_artifacts.py --phase 3` to transform `/deep-plan`'s output into SDLC format.

---

### Phase 4: Implementation

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `tdd-guide` | Foreground (sequential before impl) | Profile requires TDD | -- |
| `backend-architect` | Foreground | Section is Python/C#/server-side | impl-A |
| `frontend-developer` | Foreground | Section is HTML/CSS/Angular/React | impl-A |
| `rapid-prototyper` | Foreground | Section is a spike or proof-of-concept | -- |
| `section-evaluator` | Foreground (blocking) | After each section completes | -- |
| `code-reviewer` | Background | After each section completes | -- |
| `security-reviewer` | Foreground | Section touches auth/payments/secrets/PII | -- |
| `build-error-resolver` | Foreground (immediate) | Build or compilation fails | -- |
| `doc-updater` | Background | Implementation changes public interfaces | -- |
| `deep-implement:code-reviewer` | Background | After each section, review vs plan | -- |

**Parallel group `impl-A`:** When the sprint plan contains independent sections targeting different domains, spawn domain-specific agents in the same message.

**Mandatory spawns in Phase 4:**
- `build-error-resolver` on ANY build failure -- do not attempt manual fixes first.
- `security-reviewer` on ANY section handling auth, payments, secrets, or PII.
- `tdd-guide` BEFORE each section when the profile enables TDD.
- `section-evaluator` after EACH completed section -- foreground, blocking. The section is not marked complete until the evaluator returns PASS or CONDITIONAL PASS. On FAIL, the implementation agent addresses blocking issues and the evaluator re-runs.

**Session handoff:** At the end of each session (or when context nears limits), the orchestrator MUST update `session-handoff.json` in `.sdlc/artifacts/04-implementation/`. At session start, it MUST read this file before beginning work.

---

### Phase 5: Quality

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `code-reviewer` | Foreground | Always | review-A |
| `security-reviewer` | Foreground | Always | review-A |
| `refactor-cleaner` | Background | Always | -- |
| `Explore` | Foreground | Gate check fails unexpectedly | -- |
| `backend-architect` | Foreground | CRITICAL/HIGH findings in backend code | -- |
| `frontend-developer` | Foreground | CRITICAL/HIGH findings in frontend code | -- |

**Parallel group `review-A`:** ALWAYS spawn `code-reviewer` and `security-reviewer` in a single message. Never run them sequentially.

**Mandatory:** If `security-reviewer` finds CRITICAL or HIGH issues, STOP all other work. Fix before advancing. For code fixes, spawn the appropriate domain agent (`backend-architect` or `frontend-developer`), then re-run `security-reviewer` to confirm resolution.

---

### Phase 6: Testing

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `test-writer-fixer` | Foreground | Always | test-A |
| `e2e-runner` | Foreground | Project has user-facing flows | test-A |
| `api-tester` | Foreground | Project has API endpoints | test-A |
| `performance-benchmarker` | Foreground | NFRs include performance targets | -- |
| `build-error-resolver` | Foreground | Test compilation fails | -- |
| `backend-architect` | Foreground | Defect in backend code | -- |
| `frontend-developer` | Foreground | Defect in frontend code | -- |
| `doc-updater` | Background | Test results change public docs | -- |

**Parallel group `test-A`:** Spawn all applicable test agents in a single message. They operate on different test domains and do not conflict.

---

### Phase 7: Documentation

| Agent | Mode | Condition | Parallel Group |
|-------|------|-----------|----------------|
| `doc-updater` | Foreground | Always | doc-A |
| `backend-architect` | Foreground | API docs need updating (service/app/library/cli projects) | doc-A |
| `Explore` | Foreground (sequential) | Always -- search git history for undocumented decisions | -- |

**Parallel group `doc-A`:** Spawn `doc-updater` and `backend-architect` in a single message. They write different documents and do not conflict.

**Conditional:** For `skill` projects, replace `backend-architect` with a second `doc-updater` spawn for SKILL.md refinement and example gallery.

**Sequential:** After `doc-A` completes, spawn `Explore` for ADR gap analysis -- it reads the outputs of the doc agents to avoid duplicate work.

---

### Phase 8: Deployment

| Agent | Mode | Condition |
|-------|------|-----------|
| `devops-automator` | Foreground | Always |
| `e2e-runner` | Foreground (sequential) | After staging deploy succeeds |
| `build-error-resolver` | Foreground (immediate) | Deployment build fails |

**Sequential flow:** `devops-automator` (staging) then `e2e-runner` (smoke tests) then production decision. For production, re-spawn `devops-automator` followed by `e2e-runner` for production smoke tests. This phase is mostly HITL with human approval gates.

---

### Phase 9: Monitoring

| Agent | Mode | Condition |
|-------|------|-----------|
| `performance-benchmarker` | Foreground | Always (service/app); NFR-dependent for others |
| `doc-updater` | Foreground | Always -- writes monitoring-config.md |
| `feedback-synthesizer` | Background | User feedback exists post-launch |

**Sequential:** `performance-benchmarker` runs first to establish baselines. `doc-updater` uses its output to write `monitoring-config.md`. `feedback-synthesizer` runs in background during the retrospective; its output is incorporated when available but does not block the phase.

---

## 5. Parallel Execution Rules

Parallel execution is a core optimization in the SDLC plugin. The rules are strict:

1. **Same-group agents MUST be spawned in a single message.** When multiple agents belong to the same parallel group (e.g., `review-A`, `test-A`, `impl-A`), they MUST be launched via multiple `Agent()` tool calls within a single response. Never spawn them in separate messages.

2. **Never run parallel agents sequentially.** If agents are marked as a parallel group, running them one-at-a-time defeats the purpose and wastes context window on intermediate results.

3. **Background agents are non-blocking.** Agents run with `run_in_background: true` return control immediately. Their results are consumed when available but do not gate the main workflow.

4. **Sequential agents have explicit ordering.** When one agent's output is an input to the next (e.g., `devops-automator` then `e2e-runner`), the first must complete before the second starts. This is indicated in the phase mapping tables.

5. **Foreground blocking agents must complete before the workflow advances.** The `section-evaluator` is the canonical example: the section is not done until the evaluator returns its verdict.

---

## 6. Mandatory vs Optional Spawns

### Mandatory (no user prompt needed)

These agents are spawned automatically when their trigger condition is met. The orchestrator does not ask the user for permission.

| Trigger | Agent | Behavior |
|---------|-------|----------|
| Build or compilation failure | `build-error-resolver` | Spawn immediately. Do not attempt manual fixes first. |
| Code touches auth, payments, secrets, or PII | `security-reviewer` | Foreground. STOP on CRITICAL/HIGH findings. |
| Profile requires TDD | `tdd-guide` | Spawn BEFORE each section implementation. |
| Phase 5 entry | `code-reviewer` + `security-reviewer` | Parallel group review-A. Always both. |
| Section implementation completes (Phase 4) | `section-evaluator` | Foreground, blocking. Section not done until PASS or CONDITIONAL PASS. |
| Gate check fails unexpectedly | `Explore` | Investigate root cause before attempting fixes. |
| Test suite failure after implementation | `test-writer-fixer` | Spawn to diagnose and fix. |

### Optional (suggest to user)

These agents are available when beneficial but require user agreement or context-dependent judgment.

| Scenario | Agent | Guidance |
|----------|-------|----------|
| Complex multi-file feature | `Plan` | Suggest when 5+ files are involved. |
| After implementation | `code-reviewer` | For PR preparation, not every edit. |
| TDD workflow | `tdd-guide` | When user explicitly wants TDD. |
| Performance concerns | `performance-benchmarker` | When NFRs exist or user raises concerns. |

---

## 7. Background Agent Policy

Agents that run with `run_in_background: true` are non-blocking. Their output is consumed when available but does not gate the current workflow.

**Always background:**
- `doc-updater` -- documentation updates during implementation phases
- `refactor-cleaner` -- dead code cleanup during quality review
- `code-reviewer` -- rolling per-section reviews in Phase 4
- `deep-implement:code-reviewer` -- diff review against section plans
- `feedback-synthesizer` -- feedback analysis during Phase 9 retrospective

**Never background:**
- `security-reviewer` -- always foreground, always blocking. Security findings may require immediate workflow changes.
- `build-error-resolver` -- always foreground, always blocking. Build failures halt progress.
- `section-evaluator` -- always foreground, always blocking. The section's completion status depends on the verdict.
- Any agent producing artifacts required by the current phase gate.

---

## 8. Automatic Escalation Rules

These rules apply across ALL phases. When a trigger condition is detected, the corresponding agent is spawned without user prompt.

| Trigger | Agent | Behavior |
|---------|-------|----------|
| Build or compilation failure | `build-error-resolver` | Spawn immediately. Do not attempt manual fixes first. |
| Code touches auth, payments, secrets, or PII | `security-reviewer` | Foreground. STOP on CRITICAL/HIGH findings. |
| Gate check fails unexpectedly | `Explore` | Investigate root cause before attempting fixes. |
| Test suite failure after implementation | `test-writer-fixer` | Spawn to diagnose and fix. |
| CRITICAL/HIGH security finding | Domain agent (`backend-architect` or `frontend-developer`) | Fix the finding, then re-run `security-reviewer`. |

---

## 9. Cross-References

- **Phase lifecycle and gate definitions:** See [phase-lifecycle.md](phase-lifecycle.md) for complete phase entry/exit criteria and gate mechanics.
- **Profile configuration and evaluation criteria:** See [profiles.md](profiles.md) for how `quality.evaluation_criteria` in profile YAML drives section-evaluator behavior.
- **Scripts and automation:** See [scripts.md](scripts.md) for `check_gates.py`, `synthesize_spec.py`, `map_deep_plan_artifacts.py`, and other automation used by agents.
- **Agent definition files:** `agents/sdlc-orchestrator.md`, `agents/compliance-checker.md`, `agents/requirements-analyst.md`, `agents/section-evaluator.md`.
- **Authoritative phase-to-agent mapping:** `references/agent-roster.md` is the source of truth. This document synthesizes and explains that mapping.
