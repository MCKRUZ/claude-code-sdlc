# Phase 7: Documentation

## Purpose
Ensure all documentation reflects the system as built — not as planned. A new team member should be able to understand, run, and operate the system using only the documentation produced in this phase.

## Entry Criteria
- Phase 6 exit gate passed and `phase7-handoff.md` reviewed
- Test results confirm system behavior documented

## Workflow

### Step 1: README
Update or create the project README to reflect current state:
- What the project does (1–2 sentences)
- Prerequisites and local setup
- How to run (development, test, production)
- Key configuration

### Step 2: API Documentation
Update API docs to reflect current implementation:
- All endpoints, not just new ones
- Current request/response schemas (diff against `api-contracts.md` from Phase 2)
- Authentication requirements
- Error codes and their meaning

### Step 3: Runbook
Write the operational runbook:
- How to deploy (step by step)
- Configuration reference (all env vars, secrets, feature flags)
- Common operational tasks (restart, scale, rollback)
- How to diagnose common failure modes

### Step 4: ADR Finalization
Close any ADRs that were open during implementation:
- Update with implementation outcomes
- Add new ADRs for decisions made during Phases 4–6 that weren't recorded

### Step 5: Phase Handoff
Summarize what was documented, what's out of date, and what monitoring should cover.

### Step 6: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase07-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `README.md` (REQUIRED)
Must contain ALL of:
- **Project description** — what it does and why
- **Prerequisites** — tools, runtimes, accounts needed
- **Local setup** — step-by-step, someone new can follow it exactly
- **Running the project** — dev, test, and production modes
- **Configuration** — key settings and where they live
- **Contributing** — how to make changes (branch strategy, PR process)

### `api-docs.md` (REQUIRED)
Must contain ALL of:
- All current endpoints (not just changes)
- Request/response schemas with examples
- Authentication model
- Error catalog with HTTP status codes and resolution guidance
- Changelog — what changed from the Phase 2 API contracts

### `RUNBOOK.md` (REQUIRED)
Must contain ALL of:
- **Deployment procedure** — step by step, including pre/post checks
- **Configuration reference** — every env var, secret, and flag with description and valid values
- **Common operations** — restart, scale up/down, database migration, rollback
- **Failure scenarios** — top 5 failure modes with diagnosis steps and resolution

### `phase8-handoff.md` (REQUIRED)
Must contain ALL of:
- **Documentation inventory** — what was updated vs. created
- **Gaps** — anything that couldn't be documented (and why)
- **Deployment checklist** — all pre-deployment steps from this phase
- **Operations readiness** — is the runbook sufficient for an on-call engineer?

## Exit Criteria
- [ ] README allows a new developer to set up and run the project from scratch
- [ ] API docs are current with the implementation (not the plan)
- [ ] RUNBOOK covers deployment, configuration, and top failure scenarios
- [ ] Stakeholder reviewed and approved (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase07-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Test your README against someone who hasn't seen the project — every "it's obvious" is a documentation gap.
- The runbook is for 3am incidents. Write it for an exhausted engineer who is on call for the first time.
- API docs written after the fact should be verified against the actual running system, not the design.
- ADRs from implementation that were never recorded are debt — close them now.
