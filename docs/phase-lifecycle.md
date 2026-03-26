# SDLC Phase Lifecycle Reference

Comprehensive reference for all 10 phases of the claude-code-sdlc plugin lifecycle. This document covers phase definitions, entry/exit gates, workflow steps, artifacts, agent orchestration, HITL gates, handoff protocols, project type adaptations, and visual report generation.

---

## Table of Contents

1. [Overview](#overview)
2. [Phase Model](#phase-model)
3. [Phase Registry](#phase-registry)
4. [Entry and Exit Gate Concepts](#entry-and-exit-gate-concepts)
5. [Phase 0: Discovery](#phase-0-discovery)
6. [Phase 1: Requirements](#phase-1-requirements)
7. [Phase 2: Design](#phase-2-design)
8. [Phase 3: Planning](#phase-3-planning)
9. [Phase 4: Implementation](#phase-4-implementation)
10. [Phase 5: Quality](#phase-5-quality)
11. [Phase 6: Testing](#phase-6-testing)
12. [Phase 7: Documentation](#phase-7-documentation)
13. [Phase 8: Deployment](#phase-8-deployment)
14. [Phase 9: Monitoring](#phase-9-monitoring)
15. [Phase Transition Protocol](#phase-transition-protocol)
16. [Visual Phase Report Protocol](#visual-phase-report-protocol)
17. [Handoff Chain](#handoff-chain)

---

## Overview

The claude-code-sdlc plugin orchestrates a full Software Development Lifecycle across 10 sequential phases (numbered 0 through 9). Each phase has a clearly defined purpose, required artifacts, entry/exit gates, and a handoff document that feeds the next phase.

The lifecycle enforces discipline through:

- **Sequential forward-only progression** -- phases advance from 0 to 9 and never skip backward (though re-entry is allowed if issues are discovered).
- **Gate-based transitions** -- every phase has entry gates (prerequisites) and exit gates (deliverable validation). MUST-level gates block advancement; SHOULD-level gates produce warnings; MAY-level gates are informational.
- **Human-in-the-loop (HITL) gates** -- mandatory stopping points where Claude must pause and interact with the human before proceeding. These are marked with `> HITL GATE:` blockquotes in phase definitions.
- **Handoff documents** -- each phase produces a `phaseN+1-handoff.md` that the next phase reads as its starting context. Open questions (Q-NN / AQ-NN) in handoffs must be resolved before any new-phase work begins.

---

## Phase Model

```
Phase 0: Discovery
    |
    v
Phase 1: Requirements
    |
    v
Phase 2: Design
    |
    v
Phase 3: Planning
    |
    v
Phase 4: Implementation
    |
    v
Phase 5: Quality
    |
    v
Phase 6: Testing
    |
    v
Phase 7: Documentation
    |
    v
Phase 8: Deployment
    |
    v
Phase 9: Monitoring
    |
    v
  [Complete]
```

Phases advance forward only: `0 -> 1 -> 2 -> ... -> 9`. Skipping a phase requires explicit justification recorded in the history. A completed phase MAY be re-entered if issues are discovered downstream; this creates a new history entry with `reentry: true`.

---

## Phase Registry

The file `phases/phase-registry.yaml` is the single source of truth for the phase model. It defines every phase with:

- **id** -- numeric phase identifier (0-9)
- **name** -- machine-readable phase name
- **display** -- human-readable label
- **description** -- one-sentence summary of the phase purpose
- **definition** -- path to the full phase markdown file
- **skills.primary** -- slash commands primarily used during the phase
- **skills.secondary** -- optional supplementary skills
- **entry_gate.conditions** -- list of preconditions that must be true before entering
- **exit_gate.conditions** -- list of artifact checks and runtime checks required to leave
- **exit_gate.approval** -- `manual` (requires human sign-off) or `automatic` (advances if checks pass)
- **artifacts.required** -- list of artifacts that MUST be produced
- **artifacts.optional** -- nice-to-have outputs

The `check_gates.py` script reads this registry and validates exit conditions against the actual `.sdlc/` directory contents.

---

## Entry and Exit Gate Concepts

**Entry gates** verify that the prerequisites for starting a phase are met. Typically this means:
- The previous phase's exit gate passed.
- The handoff document from the previous phase has been reviewed.
- Open questions from the handoff have been resolved.

**Exit gates** validate that the phase produced all required deliverables. Each exit condition is one of:
- **Artifact check** (`exists_and_complete`) -- the file exists in `.sdlc/artifacts/phaseN/` and is not empty or a stub.
- **Runtime check** -- a condition that must be verified programmatically (e.g., "All unit tests passing", "Code coverage >= coverage_minimum").

**Gate severity levels:**
- **MUST** -- blocks phase advancement. The phase cannot advance until this gate passes.
- **SHOULD** -- produces a warning but does not block advancement. The warning is surfaced to the human.
- **MAY** -- informational only. Logged but does not affect advancement.

**Approval types:**
- **manual** -- even if all checks pass, the human must explicitly confirm advancement. The `/sdlc-next` command presents a summary and asks "Shall I advance to Phase N?"
- **automatic** -- if all MUST checks pass, the phase advances without requiring explicit human confirmation (though the HITL gate for open questions in the next phase still applies).

---

## Phase 0: Discovery

### Purpose

Understand the problem space, quantify impact, map stakeholders, and define scope before writing any requirements. Discovery prevents the common failure mode of jumping into solutions without understanding the problem. It produces a project constitution that anchors all future decisions.

### Entry Gate

| Condition | Type |
|-----------|------|
| Project initiated via `/sdlc-setup` | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Frame the Problem | Conduct a scoping conversation with the human. Ask: (1) What is the problem in one sentence? (2) Who is most affected? (3) What does success look like? (4) What constraints are non-negotiable? (5) What type of system is this (service/app/library/skill/cli)? Record `project_type` in `state.yaml`. |
| 1 | Problem Identification | Analyze and document the core problem, its root causes, and quantified impact. |
| 2 | Current State Analysis | Map the existing landscape -- what exists today, what has been tried, what failed. |
| 3 | Define Success | Establish measurable success criteria with baselines, targets, stretch targets, and measurement methods. |
| 4 | Scope Boundaries | Draw explicit lines around what is in scope and what is out of scope. Document non-negotiable constraints. |
| 5 | Write Project Constitution | Produce the constitution -- the single document that anchors all future decisions. |
| 6 | Phase Handoff | Package findings into `phase1-handoff.md` with summary, decisions, open questions, risks, and recommended starting point. |
| 7 | Generate Visual Report | Generate self-contained HTML report at `.sdlc/reports/phase00-visual.html`. |
| 8 | Generate Phase Report | Run `generate_phase_report.py` to produce `.sdlc/reports/phase00-report.html`. |

### HITL Gates

**Step 0 -- Frame the Problem with the Human:** Before writing any artifact, Claude must conduct a brief scoping conversation. The human provides the problem framing, affected users, success definition, non-negotiable constraints, and project type. Claude does not invent the problem framing.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `constitution.md` | Project constitution anchoring all decisions. Contains the one-sentence problem, affected stakeholders, success definition, scope boundaries, and guiding principles. |
| `problem-statement.md` | Detailed problem analysis with root causes, quantified impact, and current state assessment. |
| `success-criteria.md` | Measurable success dimensions grouped by theme. Each criterion has baseline, target, stretch target, measurement method, timeline, and acceptance thresholds. |
| `constraints.md` | Technical, business, regulatory, and resource constraints. Each constraint has a rationale and impact assessment. |
| `phase1-handoff.md` | Handoff document containing discovery summary (5-10 bullets), decisions made with rationale, recommended scope, open questions (Q-NN format), risks to monitor, and suggested starting point for Phase 1. |

### Optional Artifacts

- `stakeholder-notes.md` -- raw notes from stakeholder conversations
- `market-research.md` -- competitive analysis or market context
- `phase0-report.html` -- self-contained HTML phase report

### Primary Skills

- `/plan` -- used to structure the discovery exploration

### Agents

No custom agents are spawned during Discovery. The orchestrator manages the workflow directly.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `constitution.md` | exists_and_complete | MUST |
| `problem-statement.md` | exists_and_complete | MUST |
| `success-criteria.md` | exists_and_complete | MUST |
| `constraints.md` | exists_and_complete | MUST |
| `phase1-handoff.md` | exists_and_complete | MUST |

**Approval:** manual -- requires human sign-off before advancing.

### Handoff Document

`phase1-handoff.md` contains:
- **Discovery Summary** -- what was learned, in 5-10 bullets
- **Decisions Made** -- what was decided during discovery and the rationale
- **Recommended Scope** -- what Phase 1 should include based on discovery findings
- **Open Questions** -- specific questions Phase 1 must answer before design can start (Q-NN format)
- **Risks to Monitor** -- risks surfaced during discovery with probability/impact rating
- **Suggested Starting Point** -- where Phase 1 should begin and what to tackle first

### Project Type Adaptations

Phase 0 is where `project_type` is established (service/app/library/skill/cli). The project type is recorded in `state.yaml` and determines adaptations in Phases 5-9. Phase 0 itself does not vary by project type.

---

## Phase 1: Requirements

### Purpose

Decompose the problem into functional and non-functional requirements with user stories and acceptance criteria. Requirements translate the "what" from Discovery into structured, traceable specifications that Design can act on.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 0 exit gate passed | MUST |
| `phase1-handoff.md` reviewed | MUST |
| Open questions from Phase 0 answered or formally escalated | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Confirm Scope | Read `phase1-handoff.md`. Confirm with the human: Are open questions (Q-NN) answered? Is prioritization (P0/P1/P2) clear? Are there missing requirements? |
| 1 | Functional Requirements | Document functional requirements with user stories, acceptance criteria, and priority levels. |
| 2 | Non-Functional Requirements | Define NFRs across performance, security, scalability, availability, observability, and maintainability dimensions. |
| 3 | Epics | Group requirements into epics with clear boundaries and dependencies. |
| 4 | Stakeholder Review | Present requirements to the human for validation and gap analysis. |
| 5 | Phase Handoff | Package into `phase2-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase01-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Confirm Scope Before Writing Requirements:** Claude reads the Phase 0 handoff and confirms with the human that all open questions are answered, prioritization is clear, and no expected requirements were missed. Work does not begin until human confirms scope.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `requirements.md` | Functional requirements with user stories, acceptance criteria, and P0/P1/P2 priority. |
| `non-functional-requirements.md` | NFR specifications across all quality dimensions: performance targets, security requirements, scalability limits, availability SLAs, observability needs, maintainability standards. |
| `epics.md` | Requirements grouped into epics with boundaries, dependencies, and estimated effort. |
| `phase2-handoff.md` | Requirements summary (counts by priority, key themes), architectural implications from NFRs, key decisions and rationale, open questions for Phase 2, risks, and recommended design starting point. |

### Optional Artifacts

- `glossary.md` -- domain terminology definitions
- `phase1-report.html` -- self-contained HTML phase report

### Primary Skills

- `/deep-project` -- primary skill for deep requirements analysis
- `/plan` -- secondary skill for structuring the requirements work

### Agents

No custom agents beyond the orchestrator. Requirements are authored directly by Claude with human review at Step 4.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `requirements.md` | exists_and_complete | MUST |
| `non-functional-requirements.md` | exists_and_complete | MUST |
| `epics.md` | exists_and_complete | MUST |
| `phase2-handoff.md` | exists_and_complete | MUST |

**Approval:** manual

### Handoff Document

`phase2-handoff.md` contains:
- **Requirements summary** -- counts by priority, key themes
- **Architectural implications from NFRs** -- what design options this opens/closes
- **Key decisions made and rationale**
- **Open questions Phase 2 must resolve** (AQ-NN format -- Architectural Questions)
- **Risks and ambiguities to watch**
- **Recommended design starting point**

### Project Type Adaptations

Phase 1 does not vary by project type. All project types produce the same requirements artifacts.

---

## Phase 2: Design

### Purpose

Create software architecture, API contracts, data models, and Architecture Decision Records (ADRs). Design translates requirements into a technical blueprint that Planning can decompose into implementable sections. This phase integrates with the `/deep-plan` skill (Steps 1-15) for thorough architectural analysis.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 1 exit gate passed | MUST |
| `phase2-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Resolve Architectural Questions | Extract every AQ-NN from the handoff. Present 2-3 concrete options with trade-offs for each. Collect human decisions for ALL AQs before writing any artifact. These become ADRs. |
| 1 | Spec Synthesis | Synthesize requirements, NFRs, and human decisions into a coherent technical specification. |
| 2 | Launch /deep-plan (Steps 1-15) | Run the /deep-plan skill through its first 15 steps: research, architecture analysis, component design, interface definitions, and risk assessment. |
| 3 | Map /deep-plan Outputs to SDLC Artifacts | Transform /deep-plan outputs into SDLC-standard artifacts (design-doc.md, api-contracts.md, etc.). |
| 4 | Architecture Decision Records | Write ADRs encoding the human's architectural decisions from Step 0. Each ADR documents context, decision, alternatives considered, and consequences. |
| 5 | Complete Design Artifacts | Fill in any remaining design artifact sections not covered by /deep-plan output. |
| 6 | Data Model | Define data models, schema, and entity relationships. |
| 7 | Generate Architecture Diagrams | Produce `architecture-diagrams.html` with 5 required diagram types using Mermaid.js. |
| 8 | Phase Handoff | Package into `phase3-handoff.md`. |
| 9 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Resolve Architectural Questions:** Claude extracts every AQ-NN (Architectural Question) from the Phase 2 handoff. For each question, Claude presents 2-3 concrete options with trade-offs and asks the human to decide. ALL AQs must be resolved before any artifact is written. The human's decisions become the basis for ADRs -- Claude encodes them, not invents them.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `design-doc.md` | Complete technical design document: architecture overview, component design, interfaces, data flow, security model. |
| `api-contracts.md` | API contract definitions: endpoints, request/response schemas, authentication, error codes. |
| `adrs/` | Directory of Architecture Decision Records. Minimum one ADR. Each has context, decision, alternatives, and consequences. |
| `adr-registry.md` | Index of all ADRs with ID, title, status, and date. |
| `phase3-handoff.md` | Design summary, implementation implications, section breakdown suggestions, open questions, risks, and recommended planning approach. |

### Optional Artifacts

- `data-model.md` -- entity-relationship diagrams and schema definitions
- `sequence-diagrams.md` -- interaction sequences for key flows
- `phase2-report.html` -- self-contained HTML phase report
- `research-notes.md` -- codebase and web research findings from /deep-plan
- `integration-notes.md` -- cross-system integration concerns
- `external-reviews/` -- multi-LLM review outputs
- `deep-plan-checkpoint.yaml` -- session state for Phase 3 resumption
- `architecture-diagrams.html` -- interactive Mermaid diagrams (recommended)

### Primary Skills

- `/deep-plan` -- primary skill; runs Steps 1-15 for thorough architecture analysis
- `/plan` -- secondary skill for structuring design work

### Agents

No custom SDLC agents are spawned. The orchestrator drives the /deep-plan skill integration directly.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `design-doc.md` | exists_and_complete | MUST |
| `api-contracts.md` | exists_and_complete | MUST |
| `adrs/` | exists_and_complete | MUST |
| `adr-registry.md` | exists_and_complete | MUST |
| `phase3-handoff.md` | exists_and_complete | MUST |

**Approval:** manual

### Handoff Document

`phase3-handoff.md` contains:
- Design summary and key architectural choices
- Implementation implications (what the design means for how code is structured)
- Suggested section breakdown for Planning
- Open questions for Phase 3
- Technical risks identified during design
- Recommended planning approach

### Project Type Adaptations

Phase 2 does not vary by project type. All project types produce the same design artifacts, though the content differs (e.g., a `skill` project has no server architecture but still documents its instruction flow and integration points).

---

## Phase 3: Planning

### Purpose

Break the design into implementable sections with a sprint plan, risk register, and implementation order. Planning bridges design and implementation by producing self-contained section plans that developers (or agents) can pick up independently. This phase integrates with `/deep-plan` Steps 16-22.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 2 exit gate passed | MUST |
| `phase3-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Approve Section Boundaries | Present the proposed section decomposition to the human. Confirm boundaries, ordering, and parallelization opportunities before writing detailed plans. |
| 1 | Resume /deep-plan (Steps 16-22) | Continue the /deep-plan skill from where Phase 2 left off. Steps 16-22 produce detailed implementation plans, test stubs, and dependency graphs. |
| 1b | Map /deep-plan Outputs to SDLC Artifacts | Transform /deep-plan step outputs into section plan files and sprint structure. |
| 2 | Dependency Mapping | Map dependencies between sections, external systems, and shared infrastructure. Identify parallelization opportunities. |
| 3 | Sprint Planning | Organize sections into sprints based on dependencies and risk. |
| 4 | Risk Register | Document technical and project risks with probability, impact, mitigation, and contingency for each. |
| 5 | Phase Handoff | Package into `phase4-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase03-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Approve Section Boundaries Before Writing Plans:** Claude presents the proposed section decomposition from /deep-plan analysis. The human approves or adjusts section boundaries, ordering, and parallelization before detailed section plans are written.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `section-plans/` | Directory of `SECTION-NNN.md` files. Each is a self-contained implementation guide containing: goal, epics/stories covered, entry/exit criteria, dependencies, implementation guidance, interfaces, test strategy, risk, verification criteria, and evaluator contract. |
| `sprint-plan.md` | Sections organized into sprints with ordering, estimated effort, and parallelization notes. |
| `risk-register.md` | All identified risks with probability, impact, mitigation strategy, and contingency plan. |
| `phase4-handoff.md` | Planning summary, implementation order recommendation, known risks, open questions, and suggested section to start with. |

### Optional Artifacts

- `dependency-map.md` -- section dependency DAG and parallelization graph
- `tdd-plan.md` -- prose test stubs mirroring plan structure
- `phase3-report.html` -- self-contained HTML phase report

### Primary Skills

- `/deep-plan` -- primary skill; runs Steps 16-22 for implementation planning

### Agents

No custom SDLC agents are spawned during Planning.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `section-plans/` | exists_and_complete | MUST |
| `sprint-plan.md` | exists_and_complete | MUST |
| `risk-register.md` | exists_and_complete | MUST |
| `phase4-handoff.md` | exists_and_complete | MUST |

**Approval:** manual

### Handoff Document

`phase4-handoff.md` contains:
- Planning summary with section count and sprint structure
- Recommended implementation order
- Critical path sections (must be done first)
- Open questions for Phase 4
- Risks to carry into implementation
- Suggested starting section

### Project Type Adaptations

Phase 3 does not vary by project type. Section plan structure is consistent across all types, though section content reflects the project type (e.g., `skill` sections focus on instruction files rather than compiled code).

---

## Phase 4: Implementation

### Purpose

Write code following section plans using TDD methodology. Log all technical decisions and deviations from the plan. Implementation is the longest phase and uses the most agents. It operates section-by-section with mandatory evaluation checkpoints.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 3 exit gate passed | MUST |
| `phase4-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | Agent Orchestration Setup | Read all section plans, identify dependencies, determine parallelization. Set up agent launch strategy -- parallel agents for independent sections, sequential for dependent ones. |
| 1 | Per-Section Execution | For each section: (1a) spawn `tdd-guide` if TDD required, (1b) spawn domain-specific agent to implement, (1c) verify exit criteria, update notes, spawn `section-evaluator` (blocking -- FAIL means fix before proceeding), commit code, update progress tracking. Post-section: spawn `code-reviewer` in background; spawn `security-reviewer` (foreground, blocking) if security-sensitive. |
| 2 | Integration Points | Verify cross-section interfaces work correctly. |
| 3 | Deviation Tracking | Document any deviations from the plan with rationale. |
| 3b | Session Boundary Protocol | Update `session-handoff.json` with completed sections, current state, and next steps for context reconstruction across session boundaries. |
| 4 | Phase Handoff | Package into `phase5-handoff.md`. |
| 5 | Generate Visual Report | Generate `.sdlc/reports/phase04-visual.html`. |
| 6 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

Phase 4 does not have a Step 0 HITL gate. Instead, it has **mandatory CHECKPOINT gates** at the end of each section. The section-evaluator verdict is binding: a FAIL verdict means the section must be fixed and re-evaluated before the next section can begin.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `implementation-notes.md` | Technical decision log for reviewers. Documents every significant decision, deviation from plan, and rationale. Written for someone who was not present during implementation. |
| `phase5-handoff.md` | Implementation summary, areas of concern, known technical debt, test coverage status, open questions, and recommended review focus areas for Quality. |

### Optional Artifacts

- `technical-decisions.md` -- detailed technical decision records
- `session-handoff.json` -- session boundary state for multi-session implementations (tracks completed/in-progress sections, agent history, next steps)
- `sections-progress.json` -- per-section completion tracking (status, timestamps, test results, evaluator verdicts)
- `phase4-report.html` -- self-contained HTML phase report

### Primary Skills

- `/deep-implement` -- primary skill for code implementation
- `/tdd` -- primary skill for test-driven development workflow
- `/code-review` -- secondary skill for rolling reviews

### Agents

Phase 4 spawns the most agents of any phase:

| Agent | When | Behavior |
|-------|------|----------|
| `tdd-guide` | Before each section (if TDD required by profile) | Writes failing tests (red phase) before implementation begins. |
| Domain-specific agents (`backend-architect`, `frontend-developer`, etc.) | During section implementation | Implements code to pass tests (green), then refactors. |
| `section-evaluator` | After each section completes | Foreground, blocking. Reads section plan verification criteria and evaluator contract. Produces evaluation report. FAIL = fix before proceeding. |
| `code-reviewer` | After each section (background) | Rolling review. Non-blocking. Feedback accumulated for next sprint. |
| `security-reviewer` | After security-sensitive sections (foreground) | Blocking. STOP on CRITICAL/HIGH findings. |
| `build-error-resolver` | On any build failure | Spawned immediately. Do not attempt manual fixes first. |

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `implementation-notes.md` | exists_and_complete | MUST |
| `phase5-handoff.md` | exists_and_complete | MUST |
| All unit tests passing | runtime check | MUST |
| No compilation errors | runtime check | MUST |

**Approval:** automatic -- if all checks pass, Phase 4 advances without manual sign-off.

### Handoff Document

`phase5-handoff.md` contains:
- Implementation summary (what was built, section completion status)
- Areas of concern for reviewers
- Known technical debt
- Test coverage status
- Deviations from plan and their rationale
- Open questions for Quality phase
- Recommended review focus areas

### Project Type Adaptations

Phase 4 does not have formal project type adaptations. However, the section plans (produced in Phase 3) already reflect the project type, so implementation naturally varies -- `skill` projects implement instruction files rather than compiled code, `library` projects focus on public API implementation, etc.

---

## Phase 5: Quality

### Purpose

Perform code review, security review, and quality metrics validation against profile thresholds. Quality is the gate between implementation and testing -- it catches structural and security issues before test effort is invested.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 4 exit gate passed | MUST |
| `phase5-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Scope the Review | Read `phase5-handoff.md`. Present to the human: (1) areas with most plan deviation, (2) known risk areas, (3) compliance-specific checks needed, (4) for `skill` projects, confirm focus on instruction quality. Get confirmation of review scope. |
| 1 | Parallel Review Launch | Spawn `code-reviewer` and `security-reviewer` in parallel (foreground). Both produce structured reports. |
| 2 | Review Triage | Categorize findings by severity (CRITICAL/HIGH/MEDIUM/LOW). CRITICAL and HIGH findings block advancement. |
| 3 | Quality Metrics | Calculate quality metrics: file/function size limits, code coverage instrumentation, complexity metrics. |
| 4 | Remediation | Fix CRITICAL and HIGH issues. Document MEDIUM/LOW as accepted risk or deferred work. |
| 5 | Phase Handoff | Package into `phase6-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase05-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Scope the Review:** Claude reads the implementation handoff and presents the review scope to the human. The human confirms which areas deserve deeper review, identifies known risk areas, and specifies any compliance-specific checks. For `skill` projects, the human confirms that review focuses on instruction quality and prompt safety rather than traditional code metrics.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `code-review-report.md` | Structured code review findings with severity, location, description, and recommended fix for each issue. |
| `security-review-report.md` | Security review findings covering OWASP categories, authentication/authorization, data handling, and injection vectors. |
| `quality-metrics.md` | Quantified quality metrics: file sizes, function lengths, complexity scores, coverage percentages, and comparison against profile thresholds. |
| `phase6-handoff.md` | Quality summary, unresolved findings, test focus recommendations, coverage gaps, and open questions for Testing. |

### Optional Artifacts

- `phase5-report.html` -- self-contained HTML phase report

### Primary Skills

- `/code-review` -- primary skill for structured code review
- `/security-review` -- primary skill for security analysis

### Agents

| Agent | When | Behavior |
|-------|------|----------|
| `code-reviewer` | Step 1 | Foreground, parallel with security-reviewer. Produces structured findings report. |
| `security-reviewer` | Step 1 | Foreground, parallel with code-reviewer. Produces security findings report. |

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `code-review-report.md` | exists_and_complete | MUST |
| `security-review-report.md` | exists_and_complete | MUST |
| `quality-metrics.md` | exists_and_complete | MUST |
| `phase6-handoff.md` | exists_and_complete | MUST |
| No CRITICAL issues in code review | runtime check | MUST |
| No HIGH issues in security review | runtime check | MUST |

**Approval:** manual

### Handoff Document

`phase6-handoff.md` contains:
- Quality review summary
- Unresolved findings (MEDIUM/LOW accepted or deferred)
- Recommended test focus areas based on review findings
- Coverage gaps identified
- Open questions for Testing phase

### Project Type Adaptations

| project_type | Quality Focus |
|--------------|--------------|
| `service` / `app` | Full OWASP scan, coverage instrumentation, file/function size metrics. All security categories apply. |
| `library` / `cli` | Focus on public API surface, backwards compatibility, and dependency audit. Skip infrastructure security checks (CSRF, server config, etc.). |
| `skill` | No compiled code to instrument for coverage. Quality = instruction clarity, edge case handling, prompt injection resistance. Replace code coverage metrics with requirement coverage review. Security review focuses on prompt safety (injection, jailbreak, data leakage), not OWASP infrastructure categories. |

---

## Phase 6: Testing

### Purpose

Comprehensive testing -- unit, integration, E2E -- with coverage analysis and test plan execution. Testing validates that the implementation meets the requirements and the quality review findings have been addressed.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 5 exit gate passed | MUST |
| `phase6-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Confirm Test Scope | Read `phase6-handoff.md`. Present testing strategy to the human: coverage targets, E2E scope, and any areas to skip or emphasize. |
| 1 | Test Plan | Write comprehensive test plan covering unit, integration, and E2E test strategies with specific test cases. |
| 2 | Test Execution | Execute tests according to plan. For `service`/`app`: parallel agent launch with unit, integration, and E2E runners. For `skill`: scenario-based manual execution against the requirement list. |
| 3 | Test Results Consolidation | Aggregate results across all test types. Calculate coverage metrics. |
| 4 | Defect Management | Triage failures. Fix blocking defects. Document known issues. |
| 5 | Phase Handoff | Package into `phase7-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase06-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Confirm Test Scope:** Claude presents the testing strategy (derived from the quality review handoff) and asks the human to confirm coverage targets, E2E scope, and any areas to skip or emphasize.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `test-plan.md` | Comprehensive test plan: test types, test cases, coverage targets, environment requirements, and execution order. |
| `test-results.md` | Consolidated test results: pass/fail counts by type, failure details, and flaky test identification. |
| `coverage-report.md` | Coverage analysis: line/branch/function coverage percentages, uncovered areas, and comparison against profile minimum. |
| `phase7-handoff.md` | Test summary, coverage status, known defects, documentation needs identified during testing, and open questions. |

### Optional Artifacts

- `e2e-artifacts/` -- E2E test screenshots, videos, and logs
- `phase6-report.html` -- self-contained HTML phase report

### Primary Skills

- `/e2e` -- primary skill for end-to-end test execution
- `/test-coverage` -- primary skill for coverage analysis
- `/tdd` -- secondary skill for test refinement

### Agents

| Agent | When | Behavior |
|-------|------|----------|
| `e2e-runner` | Step 2 (service/app) | Runs E2E tests against the deployed or locally running application. |
| `test-writer-fixer` | Step 2 (library/cli) | Writes and fixes tests for public API surface. |
| `api-tester` | Step 2 (library/cli) | Tests API contract compliance. |

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `test-plan.md` | exists_and_complete | MUST |
| `test-results.md` | exists_and_complete | MUST |
| `coverage-report.md` | exists_and_complete | MUST |
| `phase7-handoff.md` | exists_and_complete | MUST |
| Code coverage >= coverage_minimum | runtime check | MUST |
| All E2E tests passing | runtime check | MUST |

**Approval:** automatic

### Handoff Document

`phase7-handoff.md` contains:
- Test execution summary
- Final coverage numbers
- Known defects and their status
- Documentation needs identified during testing
- Open questions for Documentation phase

### Project Type Adaptations

| project_type | Testing Approach |
|--------------|-----------------|
| `service` / `app` | Standard: unit tests, integration tests, E2E with Playwright, API contract tests. Parallel agent launch in Step 2. |
| `library` / `cli` | Focused: unit tests for public API surface, integration tests for key workflows. E2E = invocation tests. Skip `e2e-runner`; use `test-writer-fixer` + `api-tester`. |
| `skill` | Scenario-based: no compiled code to instrument. Replace parallel agent launch with manual scenario execution against the requirement list. Coverage = % of requirements exercised by a passing scenario, not line coverage. |

---

## Phase 7: Documentation

### Purpose

Update README, API docs, runbook, and finalize ADRs. All documentation must be current before deployment. Documentation is written for specific audiences: developers (README, API docs), operators (RUNBOOK), and decision-makers (ADRs).

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 6 exit gate passed | MUST |
| `phase7-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Scope the Documentation | Read `phase7-handoff.md`. Present to the human: (1) primary audience for each document, (2) which docs exist vs. need creation, (3) company-specific documentation standards, (4) for `library`/`skill` projects, confirm which artifacts apply. |
| 1 | Parallel Documentation Launch | Write README, API docs, and RUNBOOK in parallel. Each targets its specific audience. |
| 2 | API Documentation -- Diff-Based Approach | Compare implemented API against `api-contracts.md` from Phase 2. Document differences and update contracts. |
| 3 | Runbook -- Write for 3am | Write the runbook assuming the reader is an on-call engineer at 3am. Include troubleshooting trees, rollback procedures, and escalation paths. |
| 4 | ADR Finalization | Review all ADRs from Phase 2. Update status (accepted/superseded/deprecated). Add any new ADRs for decisions made during implementation. |
| 5 | Phase Handoff | Package into `phase8-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase07-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Scope the Documentation:** Claude reviews the testing handoff and existing documentation state. The human confirms primary audiences, creation vs. update scope, company documentation standards, and which artifacts apply for the project type.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `README.md` | Project README with installation, usage, configuration, architecture overview, and contribution guidelines. |
| `api-docs.md` | API reference documentation: endpoints, parameters, responses, authentication, and examples. Required for `service`/`app`/`library`/`cli`. |
| `RUNBOOK.md` | Operational runbook: health checks, common failure modes, troubleshooting trees, rollback procedures, escalation contacts. Required for `service`/`app` only. |
| `phase8-handoff.md` | Documentation summary, deployment prerequisites identified during doc writing, release notes draft, and open questions. |

### Optional Artifacts

- `CHANGELOG.md` -- version history
- `CONTRIBUTING.md` -- contribution guidelines
- `phase7-report.html` -- self-contained HTML phase report

### Primary Skills

- `/update-docs` -- primary skill for documentation generation

### Agents

No custom SDLC agents are spawned during Documentation. The orchestrator manages parallel documentation writing directly.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `README.md` | exists_and_complete | MUST |
| `api-docs.md` | exists_and_complete | MUST |
| `RUNBOOK.md` | exists_and_complete | MUST |
| `phase8-handoff.md` | exists_and_complete | MUST |

**Approval:** manual

### Handoff Document

`phase8-handoff.md` contains:
- Documentation completion summary
- Deployment prerequisites identified during doc writing
- Release notes draft
- Known documentation gaps (deferred)
- Open questions for Deployment phase

### Project Type Adaptations

| project_type | Documentation Scope |
|--------------|-------------------|
| `service` / `app` | Full suite: README, API docs, RUNBOOK, ADR finalization. All artifacts required. |
| `library` / `cli` | README, API reference (generated from code), CHANGELOG, migration guide if applicable. Skip RUNBOOK. Replace `RUNBOOK.md` exit criterion with CHANGELOG + migration guide. |
| `skill` | README (install + usage), SKILL.md refinement, example gallery. Skip API docs and RUNBOOK. Replace `api-docs.md` and `RUNBOOK.md` exit criteria with SKILL.md + examples. |

For `library`/`cli`/`skill` projects, skipped artifacts are marked as `N/A -- {project_type}` in the gate check.

---

## Phase 8: Deployment

### Purpose

Deploy to staging, execute the deployment checklist, run smoke tests, and promote to production. Deployment is the operational phase that moves tested code into a running environment.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 7 exit gate passed | MUST |
| `phase8-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Deployment Go/No-Go | Present deployment readiness summary to the human: documentation status, test results, known issues, and deployment plan. The human makes the go/no-go decision. |
| 1 | Pre-Deployment Checklist | Verify all deployment prerequisites: environment configuration, secrets management, database migrations, dependency versions. |
| 2 | Staging Deployment | Deploy to staging environment. Verify the deployment succeeds and the application starts. |
| 3 | Smoke Test Execution | Run smoke tests against the staging environment. Verify critical paths work end-to-end. |
| 4 | Production Deployment | After staging smoke tests pass, deploy to production. Verify production health. |
| 5 | Phase Handoff | Package into `phase9-handoff.md`. |
| 6 | Generate Visual Report | Generate `.sdlc/reports/phase08-visual.html`. |
| 7 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Deployment Go/No-Go:** Claude presents the complete deployment readiness summary including documentation status, test results, known issues, and the deployment plan. The human makes the explicit go/no-go decision. No deployment proceeds without human approval.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `release-notes.md` | Version release notes: new features, bug fixes, breaking changes, migration instructions, and known issues. |
| `deployment-checklist.md` | Step-by-step deployment checklist: pre-deployment verification, deployment steps, post-deployment validation, and rollback procedure. |
| `smoke-test-results.md` | Smoke test execution results: which tests ran, pass/fail status, environment details, and any issues encountered. |
| `phase9-handoff.md` | Deployment summary (what, when, where), current system state, monitoring requirements, known issues in production, and escalation contacts. |

### Optional Artifacts

- `phase8-report.html` -- self-contained HTML phase report

### Primary Skills

- `/e2e` -- primary skill for smoke test execution

### Agents

No custom SDLC agents are spawned during Deployment. The orchestrator manages the deployment workflow directly.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `release-notes.md` | exists_and_complete | MUST |
| `deployment-checklist.md` | exists_and_complete | MUST |
| `smoke-test-results.md` | exists_and_complete | MUST |
| `phase9-handoff.md` | exists_and_complete | MUST |
| Smoke tests passing | runtime check | MUST |

**Approval:** manual

### Handoff Document

`phase9-handoff.md` contains:
- **Deployment summary** -- what was deployed, when, where
- **Current system state** -- what is running and how to verify it
- **Monitoring requirements** -- what alerts and dashboards need to be set up
- **Known issues in production** -- anything to watch post-deployment
- **Escalation contacts** -- who to call if something goes wrong

### Project Type Adaptations

| project_type | Deployment Model | Staging | Rollback |
|--------------|-----------------|---------|---------|
| `service` / `app` | Container or cloud deploy. Full staging environment. Smoke tests against live endpoints. | Required running environment | Redeploy previous image/version; reverse DB migrations |
| `library` / `cli` | Package registry publish (npm, PyPI, NuGet). Staging = local install test in a fresh environment. | Install in isolated environment, run public API smoke tests | Yank the package version; pin consumers to previous version |
| `skill` | File distribution (copy to `.claude/commands/`). No server, no process. Staging = fresh install on a clean project. | Install skill files in new project; run minimum smoke test set | Delete skill files; re-copy previous version |

For `skill`/`library` projects, skip steps referencing staging servers, database migrations, health checks, and monitoring dashboards. Focus on: (1) install verification, (2) smoke test execution, (3) rollback documentation, (4) release artifact creation.

---

## Phase 9: Monitoring

### Purpose

Configure production monitoring, define alerts, write an incident response playbook, and capture the project retrospective. Monitoring is the final phase that ensures the deployed system is observable, alertable, and maintainable. It also closes the loop with a structured retrospective.

### Entry Gate

| Condition | Type |
|-----------|------|
| Phase 8 exit gate passed | MUST |
| `phase9-handoff.md` reviewed | MUST |

### Workflow Steps

| Step | Name | Description |
|------|------|-------------|
| 0 | HITL Gate -- Monitoring Scope | Present monitoring plan to the human: which metrics to track, alert thresholds, on-call routing, and dashboard requirements. Get human confirmation of scope. |
| 1 | Monitoring Configuration | Configure health checks, metric collection, log aggregation, and dashboard setup. |
| 2 | Alert Definitions | Define alert rules: conditions, thresholds, severity levels, routing, and escalation policies. |
| 3 | Incident Response Playbook | Write incident response procedures: detection, triage, mitigation, resolution, and post-incident review steps. |
| 4 | Project Retrospective | Structured retrospective covering: what went well, what did not go well, what to improve, key learnings, and recommendations for future projects. |
| 5 | Generate Visual Report | Generate `.sdlc/reports/phase09-visual.html`. |
| 6 | Generate Phase Report | Run `generate_phase_report.py`. |

### HITL Gates

**Step 0 -- Monitoring Scope:** Claude presents the monitoring plan derived from the deployment handoff. The human confirms which metrics to track, alert thresholds, on-call routing, and dashboard requirements.

### Required Artifacts

| Artifact | Description |
|----------|-------------|
| `monitoring-config.md` | Monitoring configuration: health check endpoints, metric collection setup, log aggregation rules, and dashboard definitions. |
| `alert-definitions.md` | Alert rule definitions: metric conditions, thresholds, severity classification, notification routing, and escalation timelines. |
| `incident-response.md` | Incident response playbook: detection procedures, triage criteria, mitigation steps, resolution procedures, and post-incident review template. |
| `project-retrospective.md` | Structured retrospective: what went well, what did not go well, improvement areas, key learnings, metrics (planned vs. actual timeline, coverage achieved, defect counts), and recommendations. |

### Optional Artifacts

- `phase9-report.html` -- self-contained HTML phase report

### Primary Skills

- `/session-insights` -- secondary skill for retrospective analysis

### Agents

No custom SDLC agents are spawned during Monitoring.

### Exit Gate

| Condition | Check | Type |
|-----------|-------|------|
| `monitoring-config.md` | exists_and_complete | MUST |
| `alert-definitions.md` | exists_and_complete | MUST |
| `incident-response.md` | exists_and_complete | MUST |
| `project-retrospective.md` | exists_and_complete | MUST |

**Approval:** manual

### Handoff Document

Phase 9 is the final phase. There is no `phase10-handoff.md`. Instead, the `project-retrospective.md` serves as the closing document. When Phase 9 gates pass and the human approves, the project is marked as **complete** in `state.yaml`.

### Project Type Adaptations

| project_type | Monitoring Scope |
|--------------|-----------------|
| `service` / `app` | Full monitoring: health checks, APM, log aggregation, error tracking, uptime monitoring, and alerting dashboards. |
| `library` / `cli` | Download/install metrics, issue tracker monitoring, dependency vulnerability alerts, breaking change detection. No server health checks or APM. |
| `skill` | Usage tracking (if available), user feedback collection, prompt failure monitoring, version adoption tracking. No infrastructure monitoring. |

---

## Phase Transition Protocol

Phase transitions are managed by the `/sdlc-next` command, which orchestrates the following sequence:

### 1. Gate Check Execution

The command runs `check_gates.py` against the current phase's exit conditions:

```bash
uv run scripts/check_gates.py --state .sdlc/state.yaml
```

This validates all artifact existence checks and runtime conditions defined in the phase registry.

### 2. Gate Result Evaluation

**If ANY MUST gate fails:**
- Display the failure report with specific blockers
- List remediation suggestions
- Generate the phase HTML report (shows what is missing)
- Do NOT advance the phase

**If all MUST gates pass:**
- Display success message
- Show any SHOULD/MAY warnings
- Generate the final phase HTML report
- Proceed to human sign-off

### 3. HITL Gate -- Human Sign-Off

For phases with `approval: manual`, Claude presents the phase summary (what was produced, key decisions made) and asks: "Does this look correct? Shall I advance to Phase N?" The `advance_phase.py` script is NOT called until the human explicitly confirms.

For phases with `approval: automatic`, this step is skipped -- advancement happens if all MUST checks pass.

### 4. State Update

The `advance_phase.py` script updates `state.yaml`:
- Sets current phase status to `completed` with `completed_at` timestamp
- Sets next phase status to `active` with `entered_at` timestamp
- Increments `current_phase`
- Updates `phase_name`
- Appends transition to the `history` array with gate results

### 5. Open Questions Protocol (BLOCKING)

This is the most critical step. After advancing, `/sdlc-next` executes a **mandatory, blocking HITL gate**:

1. Read the handoff document that was just produced (e.g., `phase2-handoff.md` when entering Phase 2).
2. Extract ALL Q-NN or AQ-NN items listed under "Open Questions", "What X Must Address", or any similar heading.
3. Display them in a prominent block:

```
BLOCKING: OPEN QUESTIONS MUST BE RESOLVED BEFORE PHASE N BEGINS

| ID    | Question          | Needed by        | Proposed default           |
|-------|-------------------|------------------|----------------------------|
| AQ-01 | [question text]   | [who/what needs] | [proposed default]         |
| AQ-02 | [question text]   | [who/what needs] | [proposed default]         |
```

4. For each open question, Claude proposes a reasonable default answer based on all available project context.
5. **WAIT for the user to respond.** Do NOT continue. Do NOT begin writing artifacts.
6. Record resolutions in the handoff document under a "Resolved Questions" section with timestamps.
7. Only after EVERY open question has a confirmed resolution may phase work begin.

If there are no open questions, Claude explicitly states: "No open questions found in the handoff. Proceeding to phase guidance."

### 6. Next Phase Guidance

After the open questions gate is fully resolved, display:
- New phase name and description
- Primary skills to use
- Required artifacts to produce
- Entry criteria (already met by advancing)
- Reference to phase definition file for full details

### Forward-Only Progression

Phases advance sequentially: `0 -> 1 -> 2 -> ... -> 9`. Skipping phases requires explicit justification recorded in history. Re-entry to a completed phase is allowed if issues are discovered -- this creates a new history entry with `reentry: true`. There is no `--force` flag for gate checks; exceptional cases use the override protocol documented in `references/validation-rules.md`.

### Gate Severity Summary

| Severity | Effect on Advancement |
|----------|----------------------|
| MUST | Blocks advancement. Phase cannot advance until this passes. |
| SHOULD | Warning. Surfaced to human but does not block. |
| MAY | Informational. Logged only. |

---

## Visual Phase Report Protocol

Every phase generates a self-contained HTML report as one of its final steps. There are two types of visual output:

### Phase Reports (generate_phase_report.py)

Generated by running:
```bash
uv run scripts/generate_phase_report.py --state .sdlc/state.yaml --phase <N>
```

These reports:
- Are self-contained single-file HTML (CSS and JS inlined)
- Can be opened directly in a browser with no server required
- Display all phase artifacts with their content
- Include exit gate status showing phase readiness
- Show missing artifacts as labeled placeholder sections (not errors)

### Visual Reports (/visual-explainer)

Generated using the `/visual-explainer` skill (or equivalent HTML generation). These are interactive stakeholder review artifacts stored at `.sdlc/reports/phaseNN-visual.html`.

**Visual standards:**
- Self-contained HTML (no external assets except CDN fonts and Mermaid)
- Dark theme default: `#0f1117` background, `#6c8ef7` accent blue, `#4ade80` green
- Sticky sidebar TOC for navigation between sections
- Zoom controls on all Mermaid diagrams
- Staggered fade-in animations (respecting `prefers-reduced-motion`)
- Light and dark theme support via `prefers-color-scheme`
- Responsive layout (sidebar collapses to horizontal bar on mobile)

**Phase-specific visual report content:**

| Phase | Key Visualizations |
|-------|-------------------|
| Phase 0: Discovery | Personas, scope boundaries, problem-impact mapping |
| Phase 1: Requirements | Requirements by priority, epic breakdown, NFR radar chart |
| Phase 2: Design | Architecture layer diagram, core loop flowchart, data flow, section dependencies DAG, trust boundary diagram |
| Phase 3: Planning | Section dependency graph, sprint timeline, risk heat map |
| Phase 4: Implementation | Coverage dashboard, section completion status, deviation tracker |
| Phase 5: Quality | Review findings by severity, quality metrics gauges, security posture summary |
| Phase 6: Testing | Test results by type, coverage bar charts, defect trend |
| Phase 7: Documentation | Documentation completeness audit, API coverage, README checklist, runbook completeness |
| Phase 8: Deployment | Deployment pipeline status, smoke test results, environment comparison |
| Phase 9: Monitoring | Monitoring configuration status, baseline metrics, alert routing overview, post-launch checklist |

---

## Handoff Chain

The handoff chain is the connective tissue of the SDLC. Each phase reads the previous phase's handoff document as its starting context and produces a handoff for the next phase.

```
Phase 0: Discovery
  produces -> phase1-handoff.md
                |
Phase 1: Requirements
  reads    <- phase1-handoff.md
  produces -> phase2-handoff.md
                |
Phase 2: Design
  reads    <- phase2-handoff.md
  produces -> phase3-handoff.md
                |
Phase 3: Planning
  reads    <- phase3-handoff.md
  produces -> phase4-handoff.md
                |
Phase 4: Implementation
  reads    <- phase4-handoff.md
  produces -> phase5-handoff.md
                |
Phase 5: Quality
  reads    <- phase5-handoff.md
  produces -> phase6-handoff.md
                |
Phase 6: Testing
  reads    <- phase6-handoff.md
  produces -> phase7-handoff.md
                |
Phase 7: Documentation
  reads    <- phase7-handoff.md
  produces -> phase8-handoff.md
                |
Phase 8: Deployment
  reads    <- phase8-handoff.md
  produces -> phase9-handoff.md
                |
Phase 9: Monitoring
  reads    <- phase9-handoff.md
  produces -> project-retrospective.md (terminal)
```

### Handoff Document Structure

Every handoff document follows a consistent structure:

1. **Summary** -- key findings or outputs from the phase (5-10 bullets)
2. **Decisions Made** -- what was decided and the rationale
3. **Implications for Next Phase** -- what the next phase needs to know about what was produced
4. **Open Questions** -- specific questions the next phase must resolve (Q-NN or AQ-NN format). These are BLOCKING -- the open questions protocol in `/sdlc-next` forces resolution before any new-phase work begins.
5. **Risks** -- risks to carry forward with probability/impact ratings
6. **Recommended Starting Point** -- where the next phase should begin and what to tackle first

### Open Question Identifiers

- **Q-NN** -- general open questions (used in Discovery and later phases)
- **AQ-NN** -- architectural questions (introduced in the Phase 2 handoff, resolved at the start of Phase 2)

Every open question must include: the question text, who or what needs the answer, and a proposed default based on project context. The human confirms, adjusts, or replaces each default before phase work begins.

---

*This document reflects the claude-code-sdlc plugin phase-registry.yaml v1.0 and the phase definition files in `phases/00-discovery.md` through `phases/09-monitoring.md`.*
