# Phase 7: Documentation

## Purpose
Ensure all documentation reflects the system as built — not as planned. A new team member should be able to understand, run, and operate the system using only the documentation produced in this phase.

## Project Type Adaptation

**Before starting Phase 7, read `project_type` from `state.yaml`.**

| project_type | Documentation Scope |
|--------------|-------------------|
| `service` / `app` | Full documentation suite: README, API docs, RUNBOOK, ADR finalization. All artifacts required. |
| `library` / `cli` | README, API reference (generated from code), CHANGELOG, migration guide if applicable. Skip RUNBOOK — there is no server to operate. Replace `RUNBOOK.md` exit criterion with CHANGELOG + migration guide. |
| `skill` | README (install + usage), SKILL.md refinement, example gallery. Skip API docs and RUNBOOK — there are no endpoints or servers. Replace `api-docs.md` and `RUNBOOK.md` exit criteria with SKILL.md + examples. |

**For `library` / `cli` / `skill` projects:** Mark skipped artifacts as `N/A — {project_type}` in the gate check. Do not spend time writing documentation for components that do not exist.

## Entry Criteria
- Phase 6 exit gate passed and `phase7-handoff.md` reviewed
- Test results confirm system behavior documented

## Workflow

### Step 0: HITL Gate — Scope the Documentation

> **HITL GATE:** Before writing any documentation, read `phase7-handoff.md` and review the current state of any existing docs. Present the following to the human: (1) Who is the primary audience for each document — developers, operators, end users? (2) Which docs already exist and need updating vs. which must be created from scratch? (3) Are there company-specific documentation standards or templates to follow? (4) For `library`/`skill` projects: confirm which artifacts are applicable and which should be skipped. Do not begin Step 1 until the human confirms the documentation scope.

### Step 1: Parallel Documentation Launch

Spawn `doc-updater` and `backend-architect` in a **single message** to work on different documentation domains simultaneously:

```
# Single message — both agents spawn simultaneously (parallel group doc-A):
Agent(doc-updater, "Update README and user-facing documentation based on the implementation. Use phase7-handoff.md for gaps discovered during testing. Ensure local setup instructions work against a fresh checkout. Produce updated README.md.")
Agent(backend-architect, "Generate API documentation by reading current endpoint implementations. Diff against api-contracts.md from Phase 2. Document any drift — what changed, why, and whether contracts need updating. Produce api-docs.md.")
```

**For `library` / `cli` projects:** Replace the `backend-architect` API docs task with:
```
Agent(backend-architect, "Generate public API reference from code. Document all exported functions, classes, and types. Write CHANGELOG entries for this release. Produce api-docs.md and CHANGELOG.md.")
```

**For `skill` projects:** Replace the `backend-architect` task with:
```
Agent(doc-updater, "Refine SKILL.md: verify all instructions are current, edge cases are handled, and examples demonstrate real usage. Create an example gallery showing 3–5 common invocations with expected output.")
```

### Step 2: API Documentation — Diff-Based Approach

When `backend-architect` completes, verify the API docs against the Phase 2 contracts:
- Load `api-contracts.md` from Phase 2 artifacts
- Diff every endpoint: URL, method, request schema, response schema, auth requirements
- For each drift: document **what** changed, **when** (which phase/section), and **why**
- If drift is unintentional, flag it as a defect for resolution before deployment

This ensures API documentation is verified against the design, not just transcribed from the code.

### Step 3: Runbook — Write for 3am

Write the operational runbook with this principle: **the reader is exhausted, stressed, and seeing this system for the first time during an incident.**

Every procedure must be:
- **Step-by-step** — numbered actions, not paragraphs
- **Copy-pasteable** — exact commands, not "run the deploy script"
- **Observable** — after each step, how do you verify it worked?
- **Recoverable** — if this step fails, what do you do?

Reference the Phase 9 monitoring setup — the runbook's failure scenarios should map to the alerts that will be configured.

**Skip this step for `library` / `cli` / `skill` projects.**

### Step 4: ADR Finalization

Close any ADRs that were open during implementation and surface undocumented decisions:

```
Agent(Explore, "Search the git history from Phase 4 onward for significant technical decisions that are not recorded in the adrs/ directory. Look for: architectural changes, dependency additions, pattern choices, and rejected alternatives mentioned in commit messages or implementation-notes.md. List each undocumented decision with context.")
```

For each undocumented decision found:
- Write a new ADR with: context, decision, consequences, and alternatives considered
- Update `adr-registry.md` with the new entries
- Mark all open ADRs as accepted or superseded based on implementation outcomes

### Step 5: Phase Handoff
Summarize what was documented, what's out of date, and what monitoring should cover.

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase07-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 7 (Documentation):**
- Documentation completeness audit table (doc → status)
- API documentation coverage
- README sections checklist
- Runbook completeness

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
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

### `api-docs.md` (REQUIRED — `service` / `app` / `library` / `cli`)
Must contain ALL of:
- All current endpoints or public API surface (not just changes)
- Request/response schemas with examples
- Authentication model
- Error catalog with HTTP status codes and resolution guidance
- Changelog — what changed from the Phase 2 API contracts, with rationale for each drift

### `RUNBOOK.md` (REQUIRED — `service` / `app` only)
Must contain ALL of:
- **Deployment procedure** — step by step, including pre/post checks
- **Configuration reference** — every env var, secret, and flag with description and valid values
- **Common operations** — restart, scale up/down, database migration, rollback
- **Failure scenarios** — top 5 failure modes with diagnosis steps and resolution
- **Monitoring cross-reference** — which Phase 9 alerts map to which failure scenarios

### `phase8-handoff.md` (REQUIRED)
Must contain ALL of:
- **Documentation inventory** — what was updated vs. created
- **Gaps** — anything that couldn't be documented (and why)
- **Deployment checklist** — all pre-deployment steps from this phase
- **Operations readiness** — is the runbook sufficient for an on-call engineer?
- **ADR status** — all ADRs finalized, or list of any remaining open decisions

## Exit Criteria
- [ ] README allows a new developer to set up and run the project from scratch
- [ ] API docs are current with the implementation (not the plan)
- [ ] RUNBOOK covers deployment, configuration, and top failure scenarios (service/app only)
- [ ] All ADRs finalized — no open decisions remaining
- [ ] Stakeholder reviewed and approved (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase07-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Test your README against a fresh checkout — clone the repo to a temp directory and follow the instructions verbatim. If any step requires knowledge not in the README, the README is incomplete.
- The runbook is for 3am incidents. Every time you write "see the wiki" or "ask the team", you've failed the person who will be alone at 3am.
- API docs written after the fact must be verified against the running system, not the design. Run actual requests and paste actual responses.
- ADRs from implementation that were never recorded are debt — close them now or they become tribal knowledge that walks out the door.
- Documentation is not a phase to rush through. The 30 minutes you save skipping docs costs the next developer 3 hours of reverse engineering.
