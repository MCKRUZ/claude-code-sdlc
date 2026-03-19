# Phase 2: Design

## Purpose
Create a software architecture that satisfies the requirements, with explicit decisions recorded as ADRs, API contracts defined, and enough detail that implementation can proceed without architectural ambiguity. Stakeholders should be able to read the design and verify it solves the right problem the right way.

## Entry Criteria
- Phase 1 exit gate passed and `phase2-handoff.md` reviewed
- Architectural implications from NFRs understood

## Workflow

### Step 0: HITL Gate — Resolve Architectural Questions

> **HITL GATE:** Read `phase2-handoff.md`. Extract every AQ-NN (Architectural Question) listed in "What Design Must Address". For each AQ, present 2–3 concrete options with trade-offs to the human using `AskUserQuestion`. Collect human decisions for ALL AQs **before writing any artifact**. These human decisions become the ADRs — Claude encodes them, not invents them.

Do not proceed to Step 1 until all AQs are resolved.

### Step 1: Architecture Overview
Define the high-level system structure:
- Component diagram (ASCII or described)
- Responsibility of each component
- How components communicate
- Data flow for key scenarios

### Step 2: Architecture Decision Records
For every significant architectural choice made in this phase, write an ADR:
- Use the template at `templates/phases/02-design/adrs/ADR-template.md`
- Number sequentially: ADR-001, ADR-002, etc.
- Store in `adrs/ADR-NNN.md`
- Register each ADR in `adr-registry.md`

**What warrants an ADR:** Technology selection, structural patterns, integration approach, data storage decisions, security model, API design choices. If the decision would cause significant rework if reversed, it needs an ADR.

### Step 3: API Contracts
Define all interfaces between components and with external consumers:
- Endpoints: method, path, request schema, response schema, error codes
- Authentication model
- Rate limiting, versioning strategy

### Step 4: Data Model
Define the data structures:
- Entities and their relationships
- Key fields and types
- Persistence strategy

### Step 5: Cross-Cutting Concerns
Address concerns that span all components:
- Error handling strategy
- Logging and observability approach
- Security: auth/authz flow, data handling
- Configuration and secrets management

### Step 6: Phase Handoff
Translate design into implementation guidance: section breakdown, order of implementation, dependencies between sections.

### Step 7: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase02-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `design-doc.md` (REQUIRED)
Must contain ALL of:
- **Architecture overview** — component diagram and responsibilities
- **Component descriptions** — what each does and what it owns
- **Key data flows** — how data moves through the system for primary use cases
- **Cross-cutting concerns** — error handling, logging, security, configuration
- **Technology choices** — with rationale (reference the ADRs)

### `api-contracts.md` (REQUIRED)
Must contain ALL of:
- All endpoints / interfaces
- Request and response schemas (table or code block)
- Authentication requirements per endpoint
- Error response format and error codes
- Versioning strategy

### `adrs/` directory (REQUIRED — minimum one ADR)
Each ADR must contain:
- **Context** — the situation that forced a decision
- **Decision** — what was chosen
- **Alternatives considered** — what was rejected and why
- **Consequences** — positive and negative outcomes of the decision

Use the template at `templates/phases/02-design/adrs/ADR-template.md`. Name files `ADR-NNN.md` with sequential three-digit numbering.

### `adr-registry.md` (REQUIRED)
Must contain ALL of:
- **Active ADRs table** — ADR number, title, status, date, and what it decides
- **Superseded ADRs table** — historical record of replaced decisions
- **Proposed ADRs table** — decisions under review

Use the template at `templates/phases/02-design/adr-registry.md`. Every ADR in the `adrs/` directory must have a corresponding entry in this registry.

### `phase3-handoff.md` (REQUIRED)
Must contain ALL of:
- Design summary and key decisions
- Section breakdown for implementation (logical units of work)
- Recommended implementation order with dependency rationale
- Interface contracts between sections (what each section needs from others)
- Open technical questions for implementation phase
- Risks identified during design

## Exit Criteria
- [ ] `design-doc.md` covers all major components and cross-cutting concerns
- [ ] At least one ADR exists for each significant technology/pattern decision
- [ ] `adr-registry.md` lists all ADRs with correct statuses
- [ ] `api-contracts.md` covers all system interfaces
- [ ] Design reviewed and approved by stakeholder (manual gate)
- [ ] Implementation sections are clearly defined in the handoff

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase02-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- A good design doc lets a new developer understand the system without asking questions.
- ADRs are most valuable for decisions that seem obvious — document WHY, not just WHAT.
- API contracts should be defined before implementation begins, not inferred from it.
- Over-specified design is better than under-specified — wrong designs get caught in review.
