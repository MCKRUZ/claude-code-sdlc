# Phase 1: Requirements

## Purpose
Decompose the problem statement into a complete, prioritized, and verifiable set of requirements. Every requirement must trace back to a stakeholder need from Phase 0. At phase end, a designer should be able to start architecture without ambiguity about what to build.

## Entry Criteria
- Phase 0 exit gate passed and `phase1-handoff.md` reviewed
- Open questions from Phase 0 answered or formally escalated

## Workflow

### Step 0: HITL Gate — Confirm Scope Before Writing Requirements

> **HITL GATE:** Read `phase1-handoff.md`. Confirm with the human: (1) Are the open questions (Q-NN) from Discovery answered? (2) Is the prioritization (P0/P1/P2) clear? (3) Are there any requirements the human expects that weren't captured in Discovery? Do not begin writing requirements until the human confirms scope.

### Step 1: Functional Requirements
For each stakeholder pain from the problem statement, define what the system must DO:
- Write in "The system SHALL..." form
- Assign priority: P0 (launch blocker) / P1 (core value) / P2 (enhances) / P3 (future)
- Group by functional domain
- Every P0 must trace to a Phase 0 pain point

### Step 2: Non-Functional Requirements
Define measurable quality attributes — quantify every single one:
- Performance: response time, throughput, load conditions
- Security: auth model, data classification, compliance
- Scalability: growth projections, headroom needed
- Reliability: uptime SLA, RTO, RPO
- Maintainability: observability, code standards, deployment model

"Fast" is not an NFR. "P95 < 200ms under 1000 concurrent users" is.

### Step 3: Epics
For each P0 and P1 requirement:
- Format: "As a [persona], I want [capability] so that [benefit]"
- Acceptance criteria in Given/When/Then (minimum: happy path + one error scenario)
- Link each epic to its source requirement ID

### Step 4: Stakeholder Review
Walk through with stakeholder before advancing:
- Verify P0 completeness — nothing missing that blocks core value
- Confirm P3 items are genuinely deferred
- Resolve contradictions explicitly
- Approve NFRs as achievable given constraints

### Step 5: Phase Handoff
Document the architectural implications of NFRs — these drive Phase 2 design decisions.

### Step 6: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase01-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `requirements.md` (REQUIRED)
Must contain ALL of:
- **Summary table** — requirement count by priority and domain
- **Functional requirements** — table format: ID | Requirement | Priority | Domain | Source
- **Business rules** — behavioral constraints separate from functional requirements
- **Traceability matrix** — every P0/P1 linked to a Phase 0 stakeholder pain

### `non-functional-requirements.md` (REQUIRED)
Must contain ALL of:
- Performance, security, scalability, reliability, maintainability sections
- Each NFR as a table row: ID | Requirement | Metric | Test Method | Priority
- No vague NFRs — every metric must be measurable and testable

### `epics.md` (REQUIRED)
Must contain ALL of:
- Epics for every P0 and P1 requirement
- As a / I want / So that format
- Given/When/Then acceptance criteria (2+ scenarios per epic)
- Epic ID linked to requirement ID

### `phase2-handoff.md` (REQUIRED)
Must contain ALL of:
- Requirements summary (counts by priority, key themes)
- Architectural implications from NFRs (what design options this opens/closes)
- Key decisions made and rationale
- Open questions Phase 2 must resolve
- Risks and ambiguities to watch
- Recommended design starting point

## Exit Criteria
- [ ] All P0 requirements documented with source traceability
- [ ] Every NFR quantified with a measurable metric
- [ ] Epics exist for all P0 and P1 requirements
- [ ] Each epic has happy path AND at least one error scenario
- [ ] Stakeholder reviewed and approved (manual gate)
- [ ] No unresolved P0 conflicts or ambiguities

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase01-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Requirements describe WHAT, not HOW. "The system SHALL use PostgreSQL" is a design decision, not a requirement.
- If you can't write an acceptance test for a requirement, it isn't specific enough.
- Contradictions between stakeholders are normal — surface them explicitly, don't silently pick one.
- P3 items should be documented, not ignored — they become Phase 2 scope inputs.
