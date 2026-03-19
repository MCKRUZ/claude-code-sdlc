# Phase 3: Planning

## Purpose
Translate the design into a sequenced, estimated, dependency-mapped implementation plan. When Phase 4 begins, developers should have no ambiguity about what to build first, what depends on what, and what risks to watch.

## Entry Criteria
- Phase 2 exit gate passed and `phase3-handoff.md` reviewed
- Section breakdown from design handoff as starting point

## Workflow

### Step 0: HITL Gate — Approve Section Boundaries Before Writing Plans

> **HITL GATE:** Read `phase3-handoff.md`. Draft the proposed section breakdown (names, scope, rough order) as a short list. Present it to the human for approval **before** creating any SECTION-NNN.md files. The human may split sections, merge them, reorder them, or flag scope concerns. Section boundaries are hard to change once sprint plans are written around them.

### Step 1: Section Decomposition
Break the design into implementable sections:
- Each section is a coherent unit of work (one concern, one component, or one feature slice)
- Sections should be independently testable and independently completable
- Typical size: 2–8 hours of focused work
- Create one `section-plans/SECTION-NNN.md` file per implementation section using the template at `templates/phases/03-planning/section-plans/SECTION-template.md`. Use `/deep-plan` to help decompose the design into sections.

### Step 2: Dependency Mapping
For each section, identify:
- What must be built before this section can start
- What this section unblocks
- External dependencies (APIs, infrastructure, credentials)

### Step 3: Sprint Planning
Group sections into sprints:
- Each sprint delivers demonstrable value
- Respect dependency order
- Include buffer for integration and testing
- Sprint 1 should build the foundation that all other work depends on

### Step 4: Risk Register
Document all identified risks:
- Technical risks (unknowns, novel integrations, performance concerns)
- Dependency risks (external systems, third-party APIs)
- Scope risks (ambiguous requirements, unstated assumptions)
- For each risk: probability (H/M/L) × impact (H/M/L) = priority

### Step 5: Phase Handoff
Produce a ready-to-implement checklist — everything a developer needs to start Sprint 1 immediately.

### Step 6: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase03-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `section-plans/` directory (REQUIRED)
One file per section: `SECTION-NNN.md`. Use the template at `templates/phases/03-planning/section-plans/SECTION-template.md`.

Each section plan must be independently completable — a developer should be able to pick it up and finish it without needing to consult other section plans.

Each must contain:
- **Goal** — one sentence: what capability exists when this section is complete
- **Entry criteria** — what must be true before work can begin
- **Exit criteria** — specific, verifiable conditions that mark this section complete
- **Dependencies** — what other sections or external systems this depends on
- **Implementation guidance** — key design decisions, patterns, pitfalls
- **Interfaces** — what this section exposes to other sections
- **Test strategy** — coverage targets by test type

### `sprint-plan.md` (REQUIRED)
Must contain ALL of:
- **Sprint breakdown** — table: Sprint | Sections | Goal | Dependencies | Est. effort
- **Sprint 1 detail** — fully expanded (this is where implementation begins)
- **Implementation order rationale** — why sections are sequenced this way
- **Milestones** — key delivery points with what becomes possible at each

### `risk-register.md` (REQUIRED)
Must contain ALL of:
- **Risk table** — ID | Risk | Category | Probability | Impact | Priority | Mitigation | Owner
- **Top 3 risks** — expanded with full mitigation strategy
- **Assumptions being made** — explicit statement of what we're betting on
- **Early warning indicators** — how to know a risk is materializing

### `phase4-handoff.md` (REQUIRED)
Must contain ALL of:
- **Ready-to-implement checklist** — everything needed before coding starts
- **Sprint 1 starting point** — first section to implement and why
- **Environment/tooling requirements** — what needs to be set up
- **Open questions** — anything implementation must resolve
- **Blockers** — anything that will stop Sprint 1 from starting

## Exit Criteria
- [ ] Every design section has a corresponding section plan
- [ ] Sprint plan respects all documented dependencies
- [ ] Risk register covers all H/H and H/M risks with mitigations
- [ ] `phase4-handoff.md` is executable — a developer can act on it immediately
- [ ] Stakeholder reviewed and approved (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase03-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Sections that are "too big" always cause surprises. When in doubt, split.
- The risk register is not a formality — the top risks should visibly drive sprint ordering.
- Sprint 1 should build the skeleton, not a feature — foundation first.
- A handoff that says "you know what to do" is not a handoff.
