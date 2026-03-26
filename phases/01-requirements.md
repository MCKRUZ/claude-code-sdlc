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

**Error Specification (REQUIRED for every P0/P1 requirement):** Each requirement must explicitly define:
- **Accepts:** What valid inputs/preconditions does this requirement expect?
- **Returns:** What is the expected output/postcondition on success?
- **Errors:** What happens when inputs are invalid, services are unavailable, or preconditions aren't met? List each error case with the expected behavior.

Vague error handling like "handle invalid input gracefully" is not acceptable. Specify: "If email format is invalid, return 400 with field-level error message identifying the invalid field."

### Step 2: Non-Functional Requirements
Define measurable quality attributes — quantify every single one:
- Performance: response time, throughput, load conditions
- Security: auth model, data classification, compliance
- Scalability: growth projections, headroom needed
- Reliability: uptime SLA, RTO, RPO
- Maintainability: observability, code standards, deployment model

"Fast" is not an NFR. "P95 < 200ms under 1000 concurrent users" is.

**Measurement Basis (REQUIRED for every numeric threshold):** For each quantitative NFR, record WHERE the threshold number came from. Every threshold must be one of:
- **Measured** — derived from profiling, benchmarks, or monitoring data. Cite the source.
- **Industry standard** — a widely-accepted norm for this type of system. Cite the reference.
- **Contractual** — required by a SLA, regulation, or stakeholder agreement. Cite the document.
- **Aspirational** — a best-guess target with no data. Tag it `[aspirational — validate in Phase 6]`.

A threshold tagged `[aspirational]` is not a failure — it is honest. What is not acceptable: a numeric threshold with no stated basis that gets treated as a validated requirement. Aspirational thresholds must be measured in Phase 6 and revised if the measurement shows they are unachievable.

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
- **NFR threshold validation:** For each numeric NFR, confirm the measurement basis is recorded. For any threshold tagged `[aspirational]`, agree on the Phase 6 measurement method *now* — who will measure it, how, and what happens if the measured value exceeds the target. Do not leave this for Phase 6 to figure out.

### Step 5: Phase Handoff
Document the architectural implications of NFRs — these drive Phase 2 design decisions.

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase01-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 1 (Requirements):**
- Requirements summary by domain and priority (stacked bar or table with badges)
- Traceability matrix (requirements → Phase 0 personas)
- Epic overview cards with acceptance criteria count
- NFR measurement basis breakdown (measured vs aspirational)

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
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
- Each NFR as a table row: ID | Requirement | Metric | Test Method | Priority | Measurement Basis
- No vague NFRs — every metric must be measurable and testable
- **Measurement Basis column is mandatory for every numeric threshold.** Valid values: `Measured: [source]`, `Industry standard: [reference]`, `Contractual: [document]`, `[aspirational — validate Phase 6]`

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
- [ ] Every numeric NFR threshold has a Measurement Basis entry (measured / industry standard / contractual / aspirational)
- [ ] Every `[aspirational]` NFR has an agreed Phase 6 measurement method documented
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

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no artifacts yet)
- "Who are the end users? Walk me through a typical day in their life."
- "What are the absolute must-have features vs. nice-to-haves?"
- "What are the non-functional requirements — performance, security, compliance?"
- "How will we know this project succeeded? What's the measurable outcome?"

### Progress Check (some artifacts exist)
- "Your requirements cover functional needs well. Have you considered [gap from NFR checklist]?"
- "These acceptance criteria need to be measurable. How would you test [criterion]?"

### Ready Check (all artifacts present)
- "Requirements are looking complete. Any features you're unsure about including?"
- "Are the priority labels (P0-P3) accurate? Would stakeholders agree with the ranking?"
