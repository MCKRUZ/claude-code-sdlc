# Skill Integrations

How the SDLC plugin orchestrates Claude Code skills across the development lifecycle.

## Table of Contents

- [1. Skill Integration Overview](#1-skill-integration-overview)
- [2. Phase-to-Skill Mapping (Complete Reference)](#2-phase-to-skill-mapping-complete-reference)
- [3. /deep-plan Integration (Phases 2-3)](#3-deep-plan-integration-phases-2-3)
- [4. /deep-implement Integration (Build Loop)](#4-deep-implement-integration-build-loop)
- [5. /tdd Integration (Build Loop)](#5-tdd-integration-build-loop)
- [6. /code-review + /security-review Integration (Build Loop)](#6-code-review--security-review-integration-build-loop)
- [7. /e2e + /test-coverage Integration (Build Loop + hardening passes)](#7-e2e--test-coverage-integration-build-loop--hardening-passes)
- [8. synthesize_spec.py -- Requirements Synthesis](#8-synthesize_specpy--requirements-synthesis)
- [9. /deep-project Integration (Phase 1)](#9-deep-project-integration-phase-1)
- [10. Cross-References](#10-cross-references)

---

## 1. Skill Integration Overview

The SDLC plugin does not embed skill logic. It orchestrates existing Claude Code skills by calling them at the right phase with the right context. Each skill is invoked by its slash command (`/deep-plan`, `/deep-implement`, `/tdd`, etc.) and receives SDLC-managed artifacts as input.

The integration model works as follows:

- **Phase-registry.yaml** maps every SDLC phase to its primary and secondary skills. Primary skills perform the phase's core work; secondary skills provide supplementary capabilities.
- **The SDLC provides context.** Before invoking a skill, the orchestrator prepares artifacts, state files, and checkpoint data that the skill consumes. Skills produce output in their own format, and SDLC scripts transform that output into the canonical artifact structure under `.sdlc/artifacts/`.
- **Skills remain independent.** A skill like `/deep-plan` works identically whether invoked through the SDLC or standalone. The SDLC adds structure (where to store outputs, what gates to check, what comes next) but never modifies the skill's internal behavior.
- **Artifact transformation scripts** bridge the gap between skill output format and SDLC artifact format. The two key scripts are `map_deep_plan_artifacts.py` (for `/deep-plan` output) and `synthesize_spec.py` (for requirements synthesis).

---

## 2. Phase-to-Skill Mapping (Complete Reference)

This table is the authoritative mapping, sourced from `phases/phase-registry.yaml` and `references/skill-mapping.md`.

| Phase | Primary Skills | Secondary Skills | How They Are Used |
|-------|---------------|------------------|-------------------|
| 0 Discovery | `/plan` | -- | Structure discovery workshops, problem decomposition, stakeholder mapping |
| 1 Requirements | `/deep-project` | `/plan` | Decompose vague requirements into well-scoped planning units with acceptance criteria |
| 2 Design | `/deep-plan` (steps 1-15) | `/plan`, `/visual-explainer` | Architecture design, API contracts, ADRs; `/visual-explainer` generates interactive Mermaid diagrams |
| 3 Foundation | (no primary skill) | `/tdd`, `/e2e` | Stand up the harness + rails + dev infra; the section planning that finishes `/deep-plan` (steps 16-22) lands here, writing `section-plans/` under `03-foundation/`; run a walking skeleton through the Build loop |
| Build Loop | (no primary skill) | `/tdd`, `/code-review`, `/e2e` | Per-change Intent->Delegate->Discern: `/deep-implement`-style building, TDD when required, code+security review and E2E run per change, never as a batch |
| 7 Documentation | `/update-docs` | -- | Sync README, API docs, RUNBOOK with code changes |
| 8 Deployment | `/e2e` | -- | Smoke tests via `e2e-runner` agent; `devops-automator` agent for deployment execution |
| 9 Monitoring | -- | `/session-insights` | Retrospective analysis; `performance-benchmarker` agent for baseline metrics |
| close (Close & Transfer) | -- | -- | Shadow-flip, harness audit, close gate (client runs one real spec end-to-end unassisted) |

### Agent Mapping

In addition to skills, the SDLC deploys specialized agents at certain phases:

| Agent | Phase(s) | Purpose |
|-------|----------|---------|
| `sdlc-orchestrator` | All | Coordinates phase transitions and skill invocation |
| `requirements-analyst` | 0, 1 | Guides discovery interviews and requirement decomposition |
| `compliance-checker` | All (if compliance enabled) | Validates compliance gates at phase transitions |
| `section-evaluator` | Build Loop | Grades each completed spec/section against its plan's Evaluator Contract |

---

## 3. /deep-plan Integration (Phases 2-3)

This is the deepest and most complex skill integration in the SDLC. The `/deep-plan` skill spans two phases, with a checkpoint mechanism enabling session continuity across the phase boundary.

### Phase 2: Design (Steps 1-15)

In Phase 2, `/deep-plan` performs research, stakeholder interviews, specification synthesis, plan generation, and external review.

**Input:** `planning/spec.md` -- synthesized from Phase 0-1 artifacts by `scripts/synthesize_spec.py` (see [Section 8](#8-synthesize_specpy--requirements-synthesis)).

**Output produced by /deep-plan:**
- `planning/claude-plan.md` -- the main architecture plan
- `planning/claude-research.md` -- research notes gathered during step analysis
- `planning/claude-interview.md` -- synthesized stakeholder interview results
- `planning/claude-integration-notes.md` -- integration considerations
- `planning/reviews/` -- external review feedback directory

**Artifact mapping (via `map_deep_plan_artifacts.py --phase 2`):**

| /deep-plan Output | SDLC Artifact Location | Transformation |
|-------------------|----------------------|----------------|
| `planning/claude-plan.md` | `.sdlc/artifacts/02-design/design-doc.md` | Architecture sections extracted and reorganized into SDLC headings (Architecture Overview, Component Descriptions, Key Data Flows, Cross-Cutting Concerns, Technology Choices) |
| `planning/claude-plan.md` | `.sdlc/artifacts/02-design/api-contracts.md` | API/interface/endpoint sections extracted by keyword matching |
| `planning/claude-plan.md` | `.sdlc/artifacts/02-design/phase3-handoff.md` | Section boundaries and implementation order extracted for planning handoff |
| `planning/claude-research.md` | `.sdlc/artifacts/02-design/research-notes.md` | Direct copy |
| `planning/claude-integration-notes.md` | `.sdlc/artifacts/02-design/integration-notes.md` | Direct copy |
| `planning/reviews/` | `.sdlc/artifacts/02-design/external-reviews/` | Directory copy |

**Checkpoint creation:** After Phase 2 mapping completes, the script writes `deep-plan-checkpoint.yaml` to `.sdlc/artifacts/02-design/`. This checkpoint records:

```yaml
version: "1.0"
created_at: "2026-03-26T12:00:00+00:00"
planning_dir: "/absolute/path/to/planning"
completed_through_step: 15
session_id: null  # or the Claude session ID if available
files:
  spec: "planning/spec.md"
  research: "planning/claude-research.md"
  interview: "planning/claude-interview.md"
  plan: "planning/claude-plan.md"
  integration_notes: "planning/claude-integration-notes.md"
```

The checkpoint enables Phase 3 to resume `/deep-plan` from step 16 without repeating steps 1-15.

### Phase 3: Foundation (Steps 16-22)

In Phase 3 (Foundation), `/deep-plan` resumes from the checkpoint and performs TDD planning, section index creation, and parallel section generation. Section planning now happens *within* Foundation -- the factory-building phase that stands up the harness, rails, and dev infrastructure -- not as a standalone Planning phase. The section plans become the ordered spec backlog the Build loop consumes.

**Input:** `planning/claude-plan.md` from Phase 2, plus human-approved section boundaries.

**Output produced by /deep-plan:**
- `planning/claude-plan-tdd.md` -- TDD test plan with stubs per section
- `planning/sections/index.md` -- section manifest with dependency information
- `planning/sections/section-NN-*.md` -- one file per implementation section

**Artifact mapping (via `map_deep_plan_artifacts.py --phase 3`):**

| /deep-plan Output | SDLC Artifact Location | Transformation |
|-------------------|----------------------|----------------|
| `planning/sections/section-NN-*.md` | `.sdlc/artifacts/03-foundation/section-plans/SECTION-NNN.md` | Full structural transformation (see below) |
| `planning/claude-plan-tdd.md` | `.sdlc/artifacts/03-foundation/tdd-plan.md` | Direct copy |
| `planning/sections/index.md` | `.sdlc/artifacts/03-foundation/dependency-map.md` | Direct copy |

### Artifact Mapping: map_deep_plan_artifacts.py

This script (`scripts/map_deep_plan_artifacts.py`) is the core transformation engine. It is invoked with three required arguments:

```bash
uv run scripts/map_deep_plan_artifacts.py \
  --state .sdlc/state.yaml \
  --phase 2 \
  --planning-dir planning/
```

The script is idempotent -- safe to re-run without side effects.

**Section file transformation (Phase 3 mode):** Each `/deep-plan` section file goes through `transform_section_to_sdlc()`, which:

1. Extracts the section title from the first markdown heading
2. Strips the original heading (the SDLC template provides its own)
3. Parses the `SECTION_MANIFEST` from `sections/index.md` to build a dependency table
4. Extracts TDD test stubs from `claude-plan-tdd.md` matching the section number or name
5. Fills the hybrid template (`SECTION-template-deep-plan.md`) with extracted data
6. Writes `SECTION-NNN.md` (zero-padded three-digit numbering)

**Design document transformation (Phase 2 mode):** The `build_design_doc_skeleton()` function maps `/deep-plan` headings to SDLC design-doc sections using keyword matching:

| SDLC Heading | Matched /deep-plan Headings |
|--------------|---------------------------|
| Architecture Overview | Architecture, System Architecture, High-Level Architecture, Overview |
| Component Descriptions | Components, Component Design, Modules, System Components |
| Key Data Flows | Data Flow, Data Flows, Key Flows, Sequence |
| Cross-Cutting Concerns | Cross-Cutting, Observability, Error Handling, Logging, Security |
| Technology Choices | Technology, Tech Stack, Technology Selection, Stack |

Unmatched sections are collected under "Additional Design Notes." Missing sections receive `<!-- FILL -->` comments for manual completion.

### Section Template Comparison

The SDLC provides two section plan templates. The choice depends on whether `/deep-plan` was used.

**SECTION-template.md (Pure SDLC)** -- used when sections are authored manually without `/deep-plan`:

| Field | Description |
|-------|-------------|
| Goal | What capability this section delivers |
| Epics / Stories Covered | Traceability to requirements |
| Entry Criteria | Prerequisites checklist |
| Exit Criteria | Verifiable completion conditions |
| Dependencies | Cross-section dependency table |
| Implementation Guidance | Design decisions and patterns (manually authored) |
| Interfaces | What this section exposes to others |
| Test Strategy | Coverage targets by test type |
| Risk | Section-specific risks and mitigations |
| Verification Criteria | How each exit criterion will be verified |
| Evaluator Contract | Grading rubric for the section-evaluator agent |

**SECTION-template-deep-plan.md (Hybrid)** -- used when `/deep-plan` generates sections. Contains all the fields above, plus:

| Additional Field | Description |
|-----------------|-------------|
| Implementation Guidance (expanded) | Carries the full `/deep-plan` prose content -- architecture decisions, code patterns, directory structure, function signatures, and step-by-step implementation instructions |
| TDD Test Stubs | Extracted from `claude-plan-tdd.md`, scoped to this section -- prose test descriptions, expected behaviors, edge cases |

The hybrid template's Implementation Guidance section contains this comment: "This section carries the full /deep-plan prose content. It should be self-contained enough that a developer can read only this section and start implementing."

Both templates share identical Evaluator Contract sections with the same five-point grading rubric (functional completeness, test quality, interface compliance, code quality, deviation accountability) and the same fail/warn condition definitions.

---

## 4. /deep-implement Integration (Build Loop)

The `/deep-implement` skill reads section plans (specs) and builds code one change at a time inside the Build loop, following TDD methodology. There is no batch implementation phase: one spec = one branch = one PR, and checking happens per change, never as a later batch.

**Input:**
- Section plan files (specs) from `.sdlc/artifacts/03-foundation/section-plans/SECTION-NNN.md`
- The ordered build backlog -- the sequence of specs handed off from `.sdlc/artifacts/03-foundation/build-handoff.md` (there is no sprint plan; the spec backlog *is* the build order)
- Profile configuration from `.sdlc/profile.yaml`

**Workflow per change (one spec at a time):**
1. Read the SECTION-NNN.md spec, focusing on Implementation Guidance, Interfaces, and TDD Test Stubs
2. Write tests first (from TDD Test Stubs), then implement code to pass them
3. Verify exit criteria from the spec
4. Update `sections-progress.json` with completion status
5. Log any deviations from the spec in `implementation-notes.md`
6. The `section-evaluator` agent grades the completed spec against the Evaluator Contract -- per change in the loop's Discern beat, not as a batch phase

**Progress tracking via sections-progress.json:**

```json
{
  "phase": "build",
  "total_sections": 5,
  "completed_sections": 2,
  "sections": [
    {
      "id": "SECTION-001",
      "name": "Core data models",
      "sprint": 1,
      "status": "complete",
      "tdd_enforced": true,
      "tests_passing": true,
      "evaluator_passed": true,
      "deviations": 0,
      "decisions": 1
    }
  ]
}
```

**Session continuity via session-handoff.json:**

When a Claude Code session ends mid-implementation, `session-handoff.json` captures the state so the next session can resume without context loss. It records: completed sections, in-progress sections, blockers, decisions made this session, deviations logged, and a free-text field for context the next session needs.

**Section evaluator agent:** After each spec completes in the loop (per change, not as a batch phase), the `section-evaluator` agent (defined in `agents/section-evaluator.md`) runs an automated assessment:

1. Reads the section plan's Verification Criteria and Evaluator Contract
2. Checks every exit criterion for evidence of satisfaction
3. Grades against the five-point rubric
4. Checks interface compliance against the Interfaces table
5. Validates test coverage targets
6. Flags any undocumented deviations from Implementation Guidance

The evaluator produces a PASS, WARN, or FAIL result. FAIL conditions (blocking) include unmet exit criteria, coverage below target, or broken interface contracts without a documented ADR. WARN conditions (non-blocking) include code style deviations and missing edge case tests outside the critical path.

---

## 5. /tdd Integration (Build Loop)

The `/tdd` skill enforces test-driven development when the project profile requires it.

**Activation:** The profile's `require_tdd: true` setting makes TDD mandatory. When enabled, every section implementation must follow the RED-GREEN-REFACTOR cycle:

1. **RED** -- Write a failing test based on the section plan's TDD Test Stubs
2. **GREEN** -- Write the minimal code to make the test pass
3. **REFACTOR** -- Clean up the implementation while keeping tests green

**Integration points:**
- TDD test stubs originate in `/deep-plan`'s `claude-plan-tdd.md` and are embedded in each SECTION-NNN.md's Test Strategy section
- The `tdd_enforced` flag in `sections-progress.json` tracks whether TDD was applied per section
- Coverage is validated per change in the Build loop (G3 metrics) against the profile's `coverage_minimum` threshold
- The section evaluator checks that TDD stubs from the plan were actually implemented as tests

**Hardening usage:** `/tdd` is also a Build-loop secondary skill, and is used in scheduled hardening passes inside the loop for writing additional tests discovered after the initial per-change build.

---

## 6. /code-review + /security-review Integration (Build Loop)

Both review skills run **per change** in the Build loop (the Discern beat), spawned in a single Agent message for efficiency. They run on every PR before merge -- there is no batched Quality phase.

### /code-review

- **Scope:** Correctness, maintainability, naming conventions, code complexity, and adherence to profile-defined conventions
- **Input:** The PR's code diff for this change, profile quality settings
- **Output:** Code review findings produced per PR by the grader and the human Checker -- attached to the PR, not batched into a `05-quality` directory
- **Severity levels:** CRITICAL, HIGH, MEDIUM, LOW, INFO

### /security-review

- **Scope:** OWASP Top 10 vulnerabilities, authentication/authorization flaws, secret exposure, injection risks, XSS, CSRF
- **Input:** Code handling user input, auth flows, API endpoints, sensitive data paths
- **Output:** Security review findings produced per PR by the security gate -- attached to the PR, not batched into a `05-quality` directory
- **Severity levels:** CRITICAL, HIGH, MEDIUM, LOW

### Gate requirements

Every PR's merge bar enforces:
- No CRITICAL issues remaining in the code review (the grader plus the human Checker)
- No HIGH issues remaining in the security review (the security gate)
- Both run before merge

Checking is per change -- there is no Quality or Testing batch phase. CRITICAL and HIGH issues must be resolved before the change merges. MEDIUM and LOW issues may be deferred with documented rationale.

---

## 7. /e2e + /test-coverage Integration (Build Loop + hardening passes)

### /e2e

- **Purpose:** Generate and execute end-to-end tests for critical user flows
- **Input:** Critical user flows derived from Phase 1 requirements and the Foundation section plans (specs)
- **Output:** Playwright tests, screenshots, traces -- produced per change in the Build loop and during scheduled hardening passes, not in a batch Testing phase
- **Traceability:** Each E2E test scenario must map back to a requirement or epic from Phase 1. The test plan (`test-plan.md`) includes a scenario-to-requirement traceability matrix.

### /test-coverage

- **Purpose:** Analyze code coverage and identify testing gaps
- **Input:** Full test suite (unit + integration + E2E)
- **Output:** `coverage-report.md` with per-module breakdown
- **Threshold enforcement:** Coverage must meet or exceed the profile's `coverage_minimum` setting, checked per change at the merge bar.

### Gate requirements

Coverage and E2E pass are enforced per change at the merge bar (G3 metrics); integration-level E2E and load/pen testing run in scheduled hardening passes inside the loop. Note: `/e2e` is ALSO Phase 8's primary skill for deployment smoke tests.

---

## 8. synthesize_spec.py -- Requirements Synthesis

The `synthesize_spec.py` script bridges Phase 1 output and Phase 2 input. It combines human-authored artifacts from Phases 0-1 into a single, machine-readable specification file that `/deep-plan` consumes as its starting input.

**Invocation:**

```bash
uv run scripts/synthesize_spec.py \
  --state .sdlc/state.yaml \
  --output planning/spec.md
```

**Input artifacts (read from `.sdlc/artifacts/`):**

| Source | Artifact | Required |
|--------|----------|----------|
| Phase 0 | `00-discovery/problem-statement.md` | No (enrichment) |
| Phase 0 | `00-discovery/constraints.md` | No (enrichment) |
| Phase 0 | `00-discovery/success-criteria.md` | No (enrichment) |
| Phase 1 | `01-requirements/requirements.md` | **Yes** (script exits with error if missing) |
| Phase 1 | `01-requirements/non-functional-requirements.md` | No |
| Phase 1 | `01-requirements/epics.md` | No |
| Phase 1 | `01-requirements/phase2-handoff.md` | No |

**Output structure of `planning/spec.md`:**

```markdown
# Project Specification
<!-- Synthesized from SDLC Phase 0-1 artifacts on 2026-03-26 12:00 UTC -->

## Problem Statement
[From 00-discovery/problem-statement.md]

## Success Criteria
[From 00-discovery/success-criteria.md]

## Functional Requirements
[From 01-requirements/requirements.md -- REQUIRED]

## Non-Functional Requirements
[From 01-requirements/non-functional-requirements.md]

## Epics and User Stories
[From 01-requirements/epics.md]

## Constraints
[From 00-discovery/constraints.md]

## Open Design Questions
<!-- From Phase 1 handoff -- these should be resolved during /deep-plan's interview step -->
[From 01-requirements/phase2-handoff.md]
```

Only sections with non-empty source artifacts are included. The script reports how many artifacts it successfully synthesized.

---

## 9. /deep-project Integration (Phase 1)

The `/deep-project` skill decomposes vague, high-level project requirements into well-scoped planning units during Phase 1 (Requirements).

**Input:** Problem statement and stakeholder notes from Phase 0 artifacts.

**Output:**
- Structured requirements with acceptance criteria -> `requirements.md`
- Epic and user story breakdown -> `epics.md`
- Non-functional requirements identified during decomposition -> `non-functional-requirements.md`

**Role in the pipeline:** `/deep-project` output forms the primary input for `synthesize_spec.py`, which in turn feeds `/deep-plan` in Phase 2. The quality of `/deep-project` decomposition directly affects the quality of the architecture plan.

**Secondary skill:** `/plan` is available as a secondary skill in Phase 1 for structuring the decomposition process when requirements are especially complex or ambiguous.

---

## 10. Cross-References

| Document | What It Covers |
|----------|---------------|
| `docs/gate-system.md` | Phase entry/exit gate mechanics, approval modes, artifact checks |
| `docs/architecture.md` | Overall plugin architecture, state management, profile system |
| `docs/commands.md` | Slash command reference (`/sdlc`, `/sdlc-setup`, `/sdlc-next`, `/sdlc-gate`) |
| `references/skill-mapping.md` | Authoritative phase-to-skill matrix with skill details |
| `phases/phase-registry.yaml` | Machine-readable phase definitions, gate conditions, artifact lists |
| `scripts/map_deep_plan_artifacts.py` | Source code for /deep-plan artifact transformation |
| `scripts/synthesize_spec.py` | Source code for Phase 0-1 requirements synthesis |
| `templates/phases/03-foundation/section-plans/SECTION-template.md` | Pure SDLC section template |
| `templates/phases/03-foundation/section-plans/SECTION-template-deep-plan.md` | Hybrid SDLC + /deep-plan section template |
| `agents/section-evaluator.md` | Section evaluator agent definition and grading rubric |
