# Project Constitution

## Project Identity
- **Name:** [Project Name]
- **Profile:** [Profile ID]
- **Created:** [Date]

## Mission Statement
[One-paragraph description of what this project aims to achieve and why it matters.]

## Governing Principles

### 1. Quality First
Code quality, test coverage, and security are non-negotiable. Every phase has explicit exit criteria that MUST be met before advancing.

### 2. Specification-Driven
Requirements and design documents are the source of truth. Implementation follows specifications, not the other way around.

### 3. Compliance-Aware
All work respects the compliance frameworks defined in the project profile. Gates enforce regulatory requirements at every phase transition.

### 4. Transparent Progress
The SDLC state machine provides a single source of truth for project progress. Every phase transition is recorded with gate check results.

### 5. Convention Over Configuration
The project profile defines conventions (commit format, naming, coding style). Follow conventions unless there's a documented reason to deviate.

## Decision Authority
- **Phase transitions:** Require gate checks to pass (automated + manual review)
- **Architecture decisions:** Documented via ADRs in Phase 2
- **Scope changes:** Require re-evaluation starting from affected phase
- **Compliance overrides:** MUST be documented with justification and approver

## Amendment Process
This constitution MAY be amended during any phase. Changes MUST be:
1. Documented with rationale
2. Reviewed by project stakeholders
3. Recorded in the SDLC state history
