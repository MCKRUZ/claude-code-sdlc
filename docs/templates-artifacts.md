# Templates and Artifacts Reference

Comprehensive reference for the claude-code-sdlc template system -- the structured artifact
definitions that drive every phase of the SDLC lifecycle.

---

## Table of Contents

1. [Template System Overview](#1-template-system-overview)
2. [Directory Structure](#2-directory-structure)
3. [Phase 0: Discovery Artifacts](#3-phase-0-discovery-artifacts)
4. [Phase 1: Requirements Artifacts](#4-phase-1-requirements-artifacts)
5. [Phase 2: Design Artifacts](#5-phase-2-design-artifacts)
6. [Phase 3: Planning Artifacts](#6-phase-3-planning-artifacts)
7. [Phase 4: Implementation Artifacts](#7-phase-4-implementation-artifacts)
8. [Phases 5-9: Later Phase Artifacts](#8-phases-5-9-later-phase-artifacts)
9. [Handoff Document Protocol](#9-handoff-document-protocol)
10. [Artifact Lifecycle](#10-artifact-lifecycle)
11. [Cross-References](#11-cross-references)

---

## 1. Template System Overview

Templates define the required structure and sections for every SDLC artifact. They are the
contract between phase work and gate validation -- a template declares what must exist, and the
gate system checks that it does.

### Core Principles

- **Templates are blueprints, not content.** They contain placeholder markers (`[brackets]`,
  `TODO`, `TBD`) that must be replaced with real project-specific content during phase work.
- **Stored in the plugin directory.** Templates live under `templates/` inside the
  claude-code-sdlc plugin repository, not in target projects.
- **Copied at initialization.** When `/sdlc-setup` runs, templates are copied to the target
  project's `.sdlc/artifacts/` directory, organized by phase.
- **Gate validation depends on templates.** Gate 1 (Existence) checks that every required
  artifact file exists. Gate 2 (Completeness) scans for unfilled placeholders -- any remaining
  `[bracket text]`, `TODO`, or `TBD` markers cause the gate to fail.
- **Phase-specific organization.** Each phase (0-9) has its own template subdirectory containing
  the artifacts required for that phase.

### Template Types

| Type | Description | Example |
|------|-------------|---------|
| **Markdown artifacts** | Structured documents with sections, tables, and placeholder content | `constitution.md`, `requirements.md` |
| **JSON tracking files** | Machine-readable state for implementation progress | `sections-progress.json`, `session-handoff.json` |
| **YAML state** | Project state machine definition | `state-init.yaml` |
| **Handoff documents** | Phase transition records with open questions and risk summaries | `phase1-handoff.md` through `phase9-handoff.md` |

### Root-Level Quick-Start Templates

In addition to the phase-organized templates, six root-level files provide simplified versions
for rapid project bootstrapping:

| File | Purpose |
|------|---------|
| `state-init.yaml` | Initial state machine (used by all projects) |
| `constitution.md` | Simplified constitution template |
| `design-doc.md` | Simplified design document template |
| `requirements.md` | Simplified requirements template |
| `test-plan.md` | Simplified test plan template |
| `release-checklist.md` | Simplified release checklist template |

These root-level templates are shorter, less prescriptive versions of their phase-specific
counterparts. The phase-specific versions under `phases/` are the authoritative templates used
by the full SDLC workflow.

---

## 2. Directory Structure

```
templates/
├── state-init.yaml                          # State machine init (${PROFILE_ID}, ${PROJECT_NAME}, ${CREATED_AT})
├── constitution.md                          # Root-level simplified constitution
├── design-doc.md                            # Root-level simplified design document
├── requirements.md                          # Root-level simplified requirements
├── test-plan.md                             # Root-level simplified test plan
├── release-checklist.md                     # Root-level simplified release checklist
└── phases/
    ├── 00-discovery/
    │   ├── constitution.md                  # Project identity and governing principles
    │   ├── problem-statement.md             # Why this project exists
    │   ├── success-criteria.md              # Measurable outcomes with Pass/Partial/Fail
    │   ├── constraints.md                   # Non-negotiable boundaries (tech/business/legal)
    │   └── phase1-handoff.md                # Handoff to Requirements phase
    ├── 01-requirements/
    │   ├── requirements.md                  # Functional requirements (FR-NNN format)
    │   ├── non-functional-requirements.md   # NFRs: performance, security, scalability
    │   ├── epics.md                         # Epic breakdown (EP-NNN format)
    │   ├── user-stories.md                  # User stories (US-NNN format)
    │   └── phase2-handoff.md                # Handoff to Design phase
    ├── 02-design/
    │   ├── design-doc.md                    # Architecture, components, data model, sequences
    │   ├── api-contracts.md                 # Endpoints, schemas, events, error catalog
    │   ├── adrs/
    │   │   └── ADR-template.md              # Architecture Decision Record template
    │   ├── adr-registry.md                  # Index of all ADRs with status tracking
    │   └── phase3-handoff.md                # Handoff to Planning phase
    ├── 03-planning/
    │   ├── sprint-plan.md                   # Sprint schedule with section assignments
    │   ├── risk-register.md                 # Risk matrix with likelihood x impact scoring
    │   ├── section-plans/
    │   │   ├── SECTION-template.md          # Pure SDLC section plan format
    │   │   └── SECTION-template-deep-plan.md # Hybrid SDLC + /deep-plan format
    │   └── phase4-handoff.md                # Handoff to Implementation phase
    ├── 04-implementation/
    │   ├── implementation-notes.md          # Decision log, deviations, tech debt tracker
    │   ├── sections-progress.json           # Machine-readable section/sprint progress
    │   ├── session-handoff.json             # Session continuity state
    │   └── phase5-handoff.md                # Handoff to Quality phase
    ├── 05-quality/
    │   ├── code-review-report.md            # Code review findings
    │   ├── quality-metrics.md               # Quality measurement results
    │   ├── security-review-report.md        # Security analysis findings
    │   └── phase6-handoff.md                # Handoff to Testing phase
    ├── 06-testing/
    │   ├── test-plan.md                     # Test strategy and scope
    │   ├── test-results.md                  # Execution results by suite
    │   ├── coverage-report.md               # Coverage percentages by module
    │   └── phase7-handoff.md                # Handoff to Documentation phase
    ├── 07-documentation/
    │   ├── api-docs.md                      # API documentation
    │   ├── RUNBOOK.md                       # Operational runbook
    │   └── phase8-handoff.md                # Handoff to Deployment phase
    ├── 08-deployment/
    │   ├── deployment-checklist.md          # Pre-deployment verification
    │   ├── release-notes.md                 # Version changelog
    │   ├── smoke-test-results.md            # Post-deployment smoke tests
    │   └── phase9-handoff.md                # Handoff to Monitoring phase
    └── 09-monitoring/
        ├── alert-definitions.md             # Alert rules and thresholds
        ├── incident-response.md             # Incident classification and procedures
        ├── monitoring-config.md             # Dashboard and metrics configuration
        └── project-retrospective.md         # Final project retrospective
```

---

## 3. Phase 0: Discovery Artifacts

Discovery establishes project identity, defines the problem, and sets boundaries. All four
artifacts plus the handoff document are required to pass the Phase 0 exit gate.

### constitution.md -- Project Identity Document

The constitution is the foundational document that defines what the project is and how decisions
are made. It is referenced throughout every subsequent phase.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Project Identity** | Basic project metadata | Project name, profile ID, creation date |
| **Mission Statement** | Why this project exists in one paragraph | Problem being solved, who benefits, core value proposition |
| **Governing Principles** | Decision-making framework (minimum 3) | Each principle needs a name, statement, and "In Practice" example |
| **Decision Authority** | Who decides what | Authority matrix for architecture, scope, schedule, quality decisions |
| **Amendment Process** | How to change the constitution | Threshold for changes, approval process, version tracking |
| **Version History** | Change log | Version number, date, changes made, approver |

**Special field -- `project_type`:** During Phase 0, the constitution must declare a `project_type`
value of one of: `service`, `app`, `library`, `skill`, or `cli`. This value is written into
`state.yaml` and controls which profile-specific gates and artifact requirements apply in later
phases.

### problem-statement.md -- Why This Project Exists

Defines the problem in rigorous, measurable terms. This is not a solution proposal -- it
describes the current state and quantifies the pain.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Executive Summary** | One-paragraph problem description | Non-technical summary accessible to any stakeholder |
| **Stakeholder Personas** | Who is affected | Name/role, their pain, impact severity, current workaround |
| **Current State: Process Flow** | How things work today | Description of current workflow or system behavior |
| **Current State: Metrics** | Quantified baseline | Current performance numbers that will be compared against success criteria |
| **Root Cause Analysis (Five Whys)** | Why the problem persists | Chain of causation from symptom to root cause |
| **Problem Scope** | Boundaries of the problem | What is in scope, what is explicitly out of scope |
| **Opportunity Statement** | What solving this enables | Future state description, projected improvement |

### success-criteria.md -- How We Know It Worked

Defines measurable outcomes with explicit thresholds for Pass, Partial success, and Fail. This
document is the accountability contract -- it prevents scope creep and goal-post shifting.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Measurable Success Dimensions** (min. 3) | What we measure | Each dimension needs: what we measure, Pass/Partial/Fail thresholds with specific numbers, data collection method |
| **Non-Negotiable Requirements** | Hard fail conditions | Specific conditions that constitute absolute failure regardless of other metrics |
| **Time to Value** | When we expect results | Milestones with dates for when each dimension becomes measurable |
| **Success Owner** | Who is accountable | Named individual responsible for measuring and reporting results |

Each dimension uses a structured table:

```markdown
| Outcome | Threshold | How We'll Measure |
|---------|-----------|------------------|
| Pass    | [Specific number/condition] | [Measurement method] |
| Partial | [Specific number/condition] | [Measurement method] |
| Fail    | [Specific number/condition] | [Measurement method] |
```

"Better" is not a valid threshold. "20% faster" is.

### constraints.md -- Non-Negotiable Boundaries

Documents every constraint that limits the solution space, with rationale for each. An
undocumented constraint is a surprise waiting to happen.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Constraint Register** (min. 3 entries) | Master list | Each constraint (C-NN) with type, rationale, solution impact, owner |
| **Technical Constraints: Must Use / Cannot Use** | Technology boundaries | Required and prohibited technologies with justification |
| **Technical Constraints: Integration Requirements** | External system dependencies | Systems that must be integrated, their APIs, SLAs |
| **Technical Constraints: Performance / Scale Envelope** | Performance boundaries | Throughput, latency, concurrency, and data volume limits |
| **Business Constraints: Timeline** | Schedule boundaries | Hard deadlines, milestone dates, external dependencies |
| **Business Constraints: Budget** | Cost boundaries | Financial constraints affecting technology choices |
| **Business Constraints: Team / Resource** | People boundaries | Available roles, FTEs, skill levels, availability windows |
| **Legal and Compliance Constraints** | Regulatory boundaries | Applicable regulations, data residency, audit requirements |
| **Assumptions** | What we take for granted | Stated assumptions with validation method and owner |
| **Constraint Change Protocol** | How constraints change | Process for requesting and approving constraint modifications |

**Constraint types:** Technical, Business, Legal/Compliance, Resource, Time.

### phase1-handoff.md -- Handoff to Requirements

Bridges Discovery to Requirements. See [Section 9: Handoff Document Protocol](#9-handoff-document-protocol)
for the standard format.

**Phase-specific content:**

- **Discovery Summary:** Compressed version of all four discovery artifacts
- **Decisions Made in Discovery:** Decision table (D-NN format) with rationale and approver
- **Open Questions Requiring Resolution:** Q-NN numbered items that Requirements MUST address
- **Personas to Interview:** Stakeholders with specific information gaps to close
- **Constraints to Translate into Requirements:** Which constraints become formal requirements
- **Known Risks Entering Requirements:** Risk table with descriptions and suggested mitigation
- **Artifacts Produced:** Checklist of all Discovery artifacts and their completion status
- **Exit Gate Status:** Checklist of gate conditions with approval signature

---

## 4. Phase 1: Requirements Artifacts

Requirements translates discovery insights into formal, traceable requirements that drive design
decisions.

### requirements.md -- Functional Requirements

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Overview** | Requirements scope summary | Total count, priority distribution, coverage statement |
| **Functional Requirements** (FR-NNN) | Individual requirements | Each FR needs: description, priority (P0/P1/P2), acceptance criteria, source (traceability to discovery) |
| **Requirement Traceability** | Links to discovery | Matrix mapping FRs to problem-statement sections and success criteria |
| **Prioritization Rationale** | Why priorities were set | Explanation of P0/P1/P2 classification methodology |
| **Requirements Review Notes** | Stakeholder feedback | Review date, attendees, decisions, changes made |

Each functional requirement follows this structure:
- **ID:** `FR-NNN`
- **Description:** What the system must do (unambiguous, single-requirement-statement)
- **Priority:** P0 (must ship) / P1 (should ship) / P2 (nice to have)
- **Acceptance Criteria:** Verifiable conditions in Given/When/Then or checklist format
- **Source:** Which discovery artifact or stakeholder this traces to

### non-functional-requirements.md -- Quality Attributes

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Performance** | Speed and throughput | Response time targets, throughput minimums, resource limits |
| **Reliability and Availability** | Uptime guarantees | SLA targets, MTTR, failover requirements, backup strategy |
| **Scalability** | Growth handling | Horizontal/vertical scaling strategy, load projections |
| **Security** | Protection requirements | Authentication, authorization, encryption, audit logging |
| **Maintainability** | Long-term health | Code standards, documentation requirements, dependency policy |
| **Compliance** | Regulatory requirements | Specific regulations, audit requirements, data handling rules |
| **NFR Acceptance Test Plan** | How NFRs are verified | Test method, tools, target values, and pass criteria for each NFR |

### epics.md -- Epic Breakdown

Groups related functionality into epics, prioritized by P0/P1/P2.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Epic Map** | Visual overview | Table mapping epics to priorities, story counts, and sprint targets |
| **P0 Epics** (EP-NNN) | Must-ship functionality | Goal, user value, constituent stories (US-NNN refs), acceptance criteria, dependencies |
| **P1 Epics** | Should-ship functionality | Same structure as P0 |
| **P2 Epics** | Nice-to-have functionality | Same structure as P0 |
| **Epic Summary** | Aggregate statistics | Total epics, story counts per priority, estimated effort |

### user-stories.md -- User Stories

Individual user stories in standard format, linked to epics.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Story Map** | Visual overview | Table mapping stories to epics, priorities, and effort estimates |
| **P0 Stories** (US-NNN) | Must-ship stories | As a [persona], I want [goal], so that [benefit]; acceptance criteria; epic reference |
| **P1 Stories** | Should-ship stories | Same structure as P0 |
| **P2 Stories** | Nice-to-have stories | Same structure as P0 |
| **Story Summary** | Aggregate statistics | Total stories, counts per priority, estimated total effort |

### phase2-handoff.md -- Handoff to Design

**Phase-specific content:**

- **Requirements Summary:** Total FRs, NFRs, epics, and stories with priority breakdown
- **Decisions Made in Requirements:** D-NN decision table
- **Architectural Questions Raised by Requirements:** Questions that only design can answer
- **NFRs That Directly Shape Architecture:** Which quality attributes constrain design choices
- **P0 Flows That Need System Diagrams:** User stories requiring sequence diagram treatment
- **Open Items from Requirements:** Unresolved questions carried forward
- **Artifacts Produced in Requirements:** Completion checklist

---

## 5. Phase 2: Design Artifacts

Design translates requirements into technical architecture, component design, and API contracts.

### design-doc.md -- Architecture and Design

The central design document covering system architecture, component design, and data model.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Architecture Overview: System Context** | External view | How the system fits into its environment, external actors |
| **Architecture Overview: Architecture Diagram** | Visual structure | Mermaid diagram with components, boundaries, data flows |
| **Component Design** (per component) | Internal design | Purpose, responsibility, public API, dependencies, error handling |
| **Data Model: Core Entities** | Data structure | Entity definitions, relationships, cardinality |
| **Data Model: Data Flow** | Data movement | How data moves between components and storage |
| **Data Model: Storage Design** | Persistence strategy | Database choices, schema design, migration strategy |
| **Sequence Diagrams: P0 Flows** | Behavioral design | Mermaid sequence diagrams for every P0 user story |
| **Cross-Cutting Concerns** | Shared infrastructure | Authentication, authorization, error handling, observability |
| **Architecture Decision Records** | Decision index | Table linking to ADR files in `adrs/` directory |
| **Design Review Notes** | Stakeholder feedback | Review date, attendees, changes made |

### api-contracts.md -- API Contract Definitions

Formal API specifications including endpoints, schemas, events, and error handling.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Overview** | API summary | Base URL, versioning scheme, authentication method, rate limiting |
| **Endpoints** (`[METHOD] /[path]`) | Each API endpoint | Path, method, description, auth requirements, request/response schemas with examples, error responses, rate limits |
| **Data Schemas** (`[EntityName]`) | Shared data types | Field name, type, required flag, constraints, description |
| **Events** (if applicable) | Async contracts | Event name, trigger, payload schema, consumers |
| **Error Catalog** | Standardized errors | Error code, HTTP status, description, resolution, example response body |
| **External APIs Consumed** | Third-party dependencies | API name, purpose, auth method, rate limits, fallback strategy |
| **Contract Versioning** | Change management | Versioning strategy, deprecation policy, breaking change process |

### adrs/ + ADR-template.md -- Architecture Decision Records

Each significant architectural decision is recorded in its own file using the ADR template.
Files are named `ADR-NNN.md` and stored in the `adrs/` directory.

**ADR template structure:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Header** | Metadata | ADR number, title (imperative present tense), date, status (Proposed/Accepted/Deprecated/Superseded) |
| **Context** | Why a decision is needed | Situation description, forces at play, constraints (2-4 sentences minimum) |
| **Decision** | What was decided | Clear, unambiguous statement of the decision |
| **Rationale** | Why this option won | Reasoning that led to this choice over alternatives |
| **Alternatives Considered** | What else was evaluated | Each alternative with pros/cons |
| **Consequences** | Impact of the decision | Positive outcomes, negative trade-offs, and risks |
| **Implementation Notes** | How to apply the decision | Concrete guidance for implementers |
| **Review Trigger** | When to reconsider | Conditions that should prompt revisiting this decision |

**ADR statuses:** Proposed, Accepted, Deprecated, Superseded (by ADR-NNN).

### adr-registry.md -- ADR Index

Tracks all ADRs across the project in a single lookup table.

**Sections:** Active ADRs, Superseded ADRs, Proposed (Under Review). Each entry records the ADR
number, title, date, and current status.

### phase3-handoff.md -- Handoff to Planning

**Phase-specific content:**

- **Design Summary:** Architecture style, component count, key technology choices
- **Decisions Locked in Design:** D-NN table with ADR cross-references
- **Natural Section Boundaries:** How the design breaks into implementable sections
- **P0 Stories and Their Technical Requirements:** Story-to-component mapping with complexity
- **Integration Points Requiring Coordination:** Cross-section dependencies
- **Technical Risks for Planning:** Risk table with recommended spikes
- **Open Design Questions:** AQ-NN items that planning should be aware of

---

## 6. Phase 3: Planning Artifacts

Planning breaks the design into implementable sections, schedules sprints, and identifies risks.

### sprint-plan.md -- Sprint Schedule

Organizes sections into sprints with capacity planning and dependency mapping.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Overview** | Plan summary | Total sections, total sprints, methodology notes |
| **Section Plans** (per section) | Section assignments | Goal, owner, sprint assignment, effort estimate, P0 stories covered, entry/exit criteria, implementation notes |
| **Sprint Schedule** (per sprint) | Time-boxed work blocks | Sprint theme/goal, sections included, story point capacity, key milestones, demo scope |
| **Dependency Map** | Ordering constraints | Table showing section-to-section dependencies |
| **Velocity and Capacity Summary** | Resource planning | Available capacity per sprint, velocity assumptions |
| **P0 Story Coverage** | Traceability check | Matrix confirming every P0 story is assigned to a section and sprint |

### risk-register.md -- Risk Matrix

Formal risk management with likelihood-impact scoring.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Overview** | Risk management approach | Scoring methodology (Likelihood x Impact), review cadence |
| **Active Risks** (RISK-NNN) | Individual risk records | Category, description, trigger, likelihood (1-3), impact (1-3), risk score, owner, mitigation plan, contingency plan, status, last review date |
| **Risk Matrix** | Visual risk map | 3x3 grid plotting risks by likelihood vs. impact |
| **Assumptions Register** | Stated assumptions | Each assumption with validation method and owner |
| **Risk Review Log** | Audit trail | Dates when risks were reviewed and any status changes |

**Risk categories:** Technical, Schedule, Resource, External, Security.

**Scoring:** Likelihood (1=Low, 2=Medium, 3=High) multiplied by Impact (1=Low, 2=Medium,
3=High). Scores of 6-9 are high priority, 3-4 are medium, 1-2 are low.

### section-plans/ -- Implementation Section Plans

Section plans are the atomic unit of implementation work. Each section gets its own file
(`SECTION-NNN.md`) based on one of two templates.

#### SECTION-template.md -- Pure SDLC Format

The standard section plan template with structured fields for gate validation and traceability.

**Required fields:**

| Field | Purpose | What Must Be Filled In |
|-------|---------|----------------------|
| **Header metadata** | Section identity | Owner, sprint assignment, estimated effort (S/M/L/XL), status |
| **Goal** | What this section delivers | One sentence describing the capability that exists when complete |
| **Epics / Stories Covered** | Traceability | List of EP-NNN and US-NNN identifiers this section implements |
| **Entry Criteria** | Prerequisites | Conditions that must be true before work begins |
| **Exit Criteria** | Definition of done | Specific, verifiable conditions (minimum 2) that mark completion |
| **Dependencies** | Ordering constraints | Other sections or external systems required |
| **Implementation Guidance** | Developer instructions | Key algorithms, patterns, pitfalls, and approach guidance |
| **Interfaces** | What this section exposes | Table of functions/APIs/events with type (internal/external) and contract |
| **Test Strategy** | Quality requirements | Coverage target by test type (unit/integration/e2e), key scenarios |
| **Risk** | Section-specific risks | Risks and mitigations specific to this section |
| **Verification Criteria** | How to verify each exit criterion | Pass condition, verification method, who verifies |
| **Evaluator Contract** | Grading rubric for section evaluator agent | Evaluation scope, grading rubric (5 dimensions), fail conditions (blocking), warn conditions (non-blocking) |

#### SECTION-template-deep-plan.md -- Hybrid SDLC + /deep-plan Format

A converged template that combines SDLC structured fields with full /deep-plan implementation
prose. This is the recommended template when using the `/deep-plan` skill integration.

**Differences from the pure template:**

| Aspect | Pure SDLC | Hybrid SDLC + /deep-plan |
|--------|-----------|--------------------------|
| **Implementation Guidance** | Brief notes and pitfalls | Full /deep-plan prose: architecture decisions, code patterns, directory structure, function signatures, step-by-step instructions |
| **Test Strategy** | Coverage targets and key scenarios | Coverage targets plus a **TDD Test Stubs** subsection carrying the relevant slice of `claude-plan-tdd.md` |
| **Self-containment** | May reference external docs | Fully self-contained -- a developer can read only this section and start implementing |
| **deep-implement compatibility** | Standard implementation | `/deep-implement` reads the Implementation Guidance section as its primary input |

The Implementation Guidance section in the hybrid template is designed to carry the full
`/deep-plan` prose content verbatim. The structured SDLC fields (Goal, Epics, Entry/Exit
Criteria, Dependencies, Interfaces) wrap the section for gate validation and traceability,
while the prose carries the actual implementation instructions.

**Evaluator Contract (both templates):**

Both section plan templates include an Evaluator Contract that defines the grading rubric the
section evaluator agent uses after implementation completes:

1. **Functional completeness** -- all exit criteria pass conditions met
2. **Test quality** -- coverage target met, edge cases covered
3. **Interface compliance** -- exposed interfaces match the Interfaces table
4. **Code quality** -- functions within profile size limits, no deep nesting, immutability patterns
5. **Deviation accountability** -- any deviation from Implementation Guidance is documented with rationale

**Fail conditions (blocking):** exit criterion not met, coverage below target, interface contract
broken without documented ADR.

**Warn conditions (non-blocking):** code style deviations, missing edge case tests outside
critical path.

### phase4-handoff.md -- Handoff to Implementation

**Phase-specific content:**

- **Planning Summary:** Total sections, sprints, story points, P0 coverage confirmation
- **Implementation Start Conditions:** 5-item checklist (dev environment, repo structure, P0 story owners, section dependencies, risk mitigations active)
- **Section Execution Order:** Ordered list with dependencies and sprint assignments
- **Implementation Constraints:** Coding standards, branching strategy, review requirements
- **First Sprint Starting Point:** Which section to begin with and why
- **Unresolved Items (Non-blocking):** Items that can be resolved during implementation
- **Key Risks Entering Implementation:** Carried-forward risks with active mitigations

---

## 7. Phase 4: Implementation Artifacts

Implementation produces both the actual code and structured tracking artifacts that enable
session continuity and progress visibility.

### implementation-notes.md -- Implementation Journal

A running log of decisions, deviations, and observations made during implementation.

**Required sections:**

| Section | Purpose | What Must Be Filled In |
|---------|---------|----------------------|
| **Overview** | Implementation status | Start date, current sprint, overall completion percentage |
| **Section Progress** | Per-section status | Table tracking each section's status, completion date, notes |
| **Decision Log** (IMPL-DEC-NNN) | Runtime decisions | Decisions made during implementation with context, alternatives, and rationale |
| **Deviations from Design** | Where reality diverged | What changed, why, which ADR or justification documents it, who approved |
| **Technical Debt Incurred** | Debt tracking | Each debt item with description, location, priority, and payoff plan |
| **Blockers and Resolutions** | Issue tracking | What blocked progress, how it was resolved, time lost |
| **Observations for Quality Review** | Phase 5 preparation | Areas that need extra attention during quality review |
| **Sprint Summary** (per sprint) | Sprint retrospective | What was completed, what carried over, key learnings |

### sections-progress.json -- Machine-Readable Progress Tracker

JSON file tracking section and sprint progress for automated tooling and dashboards.

**Schema version:** `sections-progress-v1`

```json
{
  "$schema": "sections-progress-v1",
  "phase": 4,
  "total_sections": 0,
  "completed_sections": 0,
  "last_updated": null,
  "sections": [
    {
      "id": "SECTION-001",
      "name": "",
      "sprint": 1,
      "status": "not_started",
      "agent_assigned": null,
      "tdd_enforced": false,
      "tests_passing": null,
      "evaluator_passed": null,
      "started_at": null,
      "completed_at": null,
      "deviations": 0,
      "decisions": 0
    }
  ],
  "sprints": [
    {
      "number": 1,
      "goal": "",
      "sections": ["SECTION-001"],
      "status": "not_started"
    }
  ]
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `sections[].id` | string | Section identifier (SECTION-NNN) |
| `sections[].status` | string | `not_started`, `in_progress`, `complete`, `blocked` |
| `sections[].agent_assigned` | string/null | Which agent is working on this section |
| `sections[].tdd_enforced` | boolean | Whether TDD workflow is required |
| `sections[].tests_passing` | boolean/null | Current test status (null = not yet run) |
| `sections[].evaluator_passed` | boolean/null | Whether section evaluator approved (null = not yet evaluated) |
| `sections[].deviations` | integer | Count of deviations from design documented |
| `sections[].decisions` | integer | Count of implementation decisions made |
| `sprints[].status` | string | `not_started`, `in_progress`, `complete` |

### session-handoff.json -- Session Continuity State

JSON file enabling implementation continuity across Claude Code sessions. Updated at the end of
each session to provide context for the next session.

**Schema version:** `session-handoff-v1`

```json
{
  "$schema": "session-handoff-v1",
  "phase": 4,
  "last_updated": null,
  "session_number": 1,
  "overall_status": "in_progress",
  "current_sprint": 1,
  "sections": [
    {
      "id": "SECTION-001",
      "name": "",
      "status": "not_started",
      "agent": null,
      "started_at": null,
      "completed_at": null,
      "evaluator_result": null,
      "notes": ""
    }
  ],
  "completed_this_session": [],
  "in_progress": [],
  "blocked": [],
  "next_actions": [
    {
      "action": "",
      "section": "",
      "priority": "P0",
      "context": ""
    }
  ],
  "blockers": [],
  "decisions_this_session": [],
  "deviations_this_session": [],
  "context_for_next_session": ""
}
```

**Key arrays:**

| Array | Purpose |
|-------|---------|
| `completed_this_session` | Section IDs finished in the current session |
| `in_progress` | Section IDs actively being worked on |
| `blocked` | Section IDs that cannot proceed |
| `next_actions` | Prioritized action items for the next session (P0/P1/P2) |
| `blockers` | Description of what is blocking progress |
| `decisions_this_session` | Implementation decisions made this session |
| `deviations_this_session` | Deviations from design documented this session |

The `context_for_next_session` field is a free-text summary that provides the next session with
everything it needs to continue work without re-reading all artifacts.

### phase5-handoff.md -- Handoff to Quality

**Phase-specific content:**

- **Implementation Summary:** Section count, sprint count, completion dates
- **Completed Stories:** P0 story checklist with acceptance criteria self-assessment
- **Deferred Stories:** Stories not implemented with justification
- **Technical Debt Incurred:** Debt items carried into quality review
- **Deviations from Design:** Summary of all design divergences
- **Quality Review Focus Areas:** Specific areas needing extra scrutiny
- **Security Areas of Concern:** Security-relevant implementation details
- **Build Status:** CI/CD pipeline status, test results summary
- **Pre-Quality Checklist:** Verification items (no FIXMEs in production paths, no hardcoded secrets, migrations tested, branch merged)

---

## 8. Phases 5-9: Later Phase Artifacts

### Phase 5: Quality (3 artifacts + handoff)

| Artifact | Purpose |
|----------|---------|
| `code-review-report.md` | Structured code review findings with severity ratings |
| `quality-metrics.md` | Quantified quality measurements against NFR targets |
| `security-review-report.md` | Security-specific analysis findings and recommendations |
| `phase6-handoff.md` | Handoff to Testing with quality findings summary |

### Phase 6: Testing (3 artifacts + handoff)

| Artifact | Purpose |
|----------|---------|
| `test-plan.md` | Test strategy defining scope, approach, environments, and entry/exit criteria |
| `test-results.md` | Execution results organized by test suite with pass/fail/skip counts |
| `coverage-report.md` | Code coverage percentages by module with line/branch/function breakdown |
| `phase7-handoff.md` | Handoff to Documentation with test summary and deployment readiness |

### Phase 7: Documentation (2 artifacts + handoff)

| Artifact | Purpose |
|----------|---------|
| `api-docs.md` | API documentation for consumers |
| `RUNBOOK.md` | Operational runbook for deployment and maintenance |
| `phase8-handoff.md` | Handoff to Deployment with documentation summary |

### Phase 8: Deployment (3 artifacts + handoff)

| Artifact | Purpose |
|----------|---------|
| `deployment-checklist.md` | Pre-deployment verification steps |
| `release-notes.md` | Version changelog with features, fixes, and breaking changes |
| `smoke-test-results.md` | Post-deployment smoke test results per environment |
| `phase9-handoff.md` | Handoff to Monitoring with deployment summary |

### Phase 9: Monitoring (4 artifacts, no handoff)

| Artifact | Purpose |
|----------|---------|
| `alert-definitions.md` | Alert rules, thresholds, and notification routing |
| `incident-response.md` | Incident classification levels and response procedures |
| `monitoring-config.md` | Dashboard inventory and metrics configuration |
| `project-retrospective.md` | Final project retrospective covering the entire SDLC cycle |

Phase 9 is the terminal phase -- there is no phase 10 handoff. The `project-retrospective.md`
serves as the project's closing document.

---

## 9. Handoff Document Protocol

Every phase transition produces a handoff document. These documents follow a standard format
and serve as the primary communication channel between phases.

### Standard Handoff Structure

All handoff documents (phase1-handoff.md through phase9-handoff.md) follow this structure:

1. **Phase Summary** -- compressed summary of work done in the completing phase
2. **Decisions Made** -- D-NN formatted decision table with rationale and approver
3. **What Next Phase Must Address** -- specific items the receiving phase is responsible for
4. **Open Questions** -- Q-NN or AQ-NN numbered items requiring resolution
5. **Known Risks** -- Risk table with descriptions and suggested mitigations
6. **Artifacts Produced** -- Checklist of all artifacts from the completing phase
7. **Exit Gate Status** -- Checklist of gate conditions with approval signature

### Open Question Protocol (Q-NN Format)

Open questions use a numbered format (Q-01, Q-02, ... or AQ-01, AQ-02 for architectural
questions) and are tracked across phase boundaries.

**Critical behavior:** The `/sdlc-next` command checks handoff documents for unresolved Q-NN
items. When entering a new phase, the SDLC system:

1. Reads the handoff document that was just produced
2. Extracts ALL Q-NN and AQ-NN items from "Open Questions", "What X Must Address", or similar headings
3. Displays them in a prominent block that cannot be overlooked
4. Requires that the receiving phase address each item before its own exit gate

Unresolved Q-NN items from a previous phase are a gate failure condition. They must be either
answered, explicitly deferred with justification, or determined to be no longer applicable.

### Decision Format (D-NN)

Decisions are tracked in tables throughout handoff documents:

```markdown
| Decision | What Was Decided | Rationale | Who Approved |
|----------|-----------------|-----------|-------------|
| D-01     | [Decision text] | [Why]     | [Name]      |
```

Decisions made in earlier phases are binding on later phases unless formally overridden
through an ADR or constitution amendment.

---

## 10. Artifact Lifecycle

Every artifact follows a predictable lifecycle from template to validated deliverable.

### Lifecycle Stages

```
1. TEMPLATE          Templates exist in plugin's templates/ directory
       |
2. COPIED            /sdlc-setup copies templates to .sdlc/artifacts/{phase}/
       |
3. IN PROGRESS       Phase work replaces placeholders with real content
       |
4. GATE 1: EXISTS    Gate checks that the artifact file exists at expected path
       |
5. GATE 2: COMPLETE  Gate scans for unfilled placeholders ([brackets], TODO, TBD)
       |
6. GATE 5: QUALITY   Gate evaluates content quality (profile-specific criteria)
       |
7. RECORDED          Artifact path added to state.yaml phase artifacts list
```

### Gate Interaction Details

**Gate 1 -- Existence Check:** Verifies that every artifact required by the current phase's
profile configuration exists as a file at the expected path under `.sdlc/artifacts/`. A missing
file is a hard gate failure.

**Gate 2 -- Completeness Check:** Scans artifact content for placeholder patterns:
- `[bracket text]` -- unfilled template placeholders
- `TODO` -- explicit incomplete markers
- `TBD` -- to-be-determined markers

Any remaining placeholder causes a gate failure. The gate reports which specific placeholders
remain unfilled so the author knows exactly what to complete.

**Gate 5 -- Quality Check:** Profile-specific quality evaluation. Different profiles may set
different quality thresholds. For example, the `microsoft-enterprise` profile may require
security review sign-off, while the `starter` profile may skip it.

### State Tracking

When a phase completes (all gates pass), the artifact paths are recorded in `state.yaml`:

```yaml
phases:
  0:
    name: discovery
    status: complete
    completed_at: "2025-03-20T14:30:00Z"
    artifacts:
      - "artifacts/00-discovery/constitution.md"
      - "artifacts/00-discovery/problem-statement.md"
      - "artifacts/00-discovery/success-criteria.md"
      - "artifacts/00-discovery/constraints.md"
      - "artifacts/00-discovery/phase1-handoff.md"
```

### Placeholder Conventions

Templates use these placeholder patterns consistently:

| Pattern | Meaning | Example |
|---------|---------|---------|
| `[Text in brackets]` | Must be replaced with project-specific content | `[Project Name]`, `[Specific number/condition]` |
| `${VARIABLE}` | System-replaced during initialization | `${PROFILE_ID}`, `${PROJECT_NAME}`, `${CREATED_AT}` |
| `<!-- REQUIRED: ... -->` | HTML comment marking required sections (not a placeholder to fill, but a validation hint) | `<!-- REQUIRED: risk-entry -- all attributes filled in -->` |
| `NNN` in identifiers | Sequential numbering placeholder | `FR-NNN`, `RISK-NNN`, `ADR-NNN` |

---

## 11. Cross-References

| Document | Relationship to Templates |
|----------|--------------------------|
| [gate-system.md](gate-system.md) | Gates 1, 2, and 5 validate artifact existence, completeness, and quality |
| [state-machine.md](state-machine.md) | `state-init.yaml` template initializes the state machine; completed artifacts are recorded in state |
| [integrations.md](integrations.md) | `/deep-plan` integration maps to `SECTION-template-deep-plan.md`; `/deep-implement` reads the Implementation Guidance section |
| [phase-lifecycle.md](phase-lifecycle.md) | Phase definitions in `phases/` reference which templates are required for each phase |
| `profiles/_schema.yaml` | Profile configuration determines which artifacts are required vs. optional per phase |
| `scripts/check_gates.py` | Python script that implements Gate 1 and Gate 2 checks against artifact templates |
| `agents/section-evaluator.md` | Agent that evaluates completed sections against their Evaluator Contract |
