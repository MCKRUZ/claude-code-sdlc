# Phase 4: Implementation

## Purpose
Write production-quality code following section plans, using TDD methodology. Document every significant technical decision and deviation from the plan so Phase 5 reviewers have the context they need without reading the implementation twice.

## Entry Criteria
- Phase 3 exit gate passed and `phase4-handoff.md` reviewed
- Development environment set up (from handoff checklist)
- Sprint 1 starting section identified

## Workflow

### Step 0: Agent Orchestration Setup

Before writing any code, analyze the sprint plan to determine the agent execution strategy.

**0a. Read the sprint plan and section plans.**
Identify which sections are in the current sprint and map their dependency graph.

**0b. Identify parallel execution groups.**
Sections with no dependency on each other MUST be implemented in parallel. For each section, determine the primary domain: backend, frontend, infrastructure, or general.

**0c. Check TDD requirements.**
Read `.sdlc/profile.yaml`. If TDD is required, every section begins with a `tdd-guide` agent spawn BEFORE the implementation agent. This is sequential — `tdd-guide` completes first, then the implementation agent uses the generated tests as its starting point.

**0d. Plan the execution sequence.**
For each dependency level, prepare a single message with one Agent tool call per independent section:

```
# Example: SECTION-001 (backend) and SECTION-002 (frontend) are independent — spawn in parallel:
Agent(backend-architect, "Implement SECTION-001 per .sdlc/artifacts/phase03/section-plans/SECTION-001.md. Run tests and confirm all exit criteria pass.")
Agent(frontend-developer, "Implement SECTION-002 per .sdlc/artifacts/phase03/section-plans/SECTION-002.md. Run tests and confirm all exit criteria pass.")

# SECTION-003 depends on SECTION-001 — spawn after SECTION-001 completes:
Agent(backend-architect, "Implement SECTION-003 per .sdlc/artifacts/phase03/section-plans/SECTION-003.md.")
```

**0e. Security-sensitive sections.**
Any section touching auth, payments, secrets, or PII: spawn `security-reviewer` (foreground) after implementation completes — not as a background agent.

**0f. Rolling review.**
After each section completes, spawn `code-reviewer` in background (`run_in_background: true`) and `deep-implement:code-reviewer` in background to verify the diff against the section plan.

> **HITL GATE:** Present the proposed agent execution plan (which agents, which sections, parallel groups, TDD enforcement) to the human. Get explicit approval before beginning implementation.

### Step 1: Per-Section Execution (repeat for each section)

1. If TDD required: spawn `tdd-guide` agent — writes failing tests (red)
2. Spawn domain-specific implementation agent (`backend-architect`, `frontend-developer`, etc.)
3. Agent implements minimal code to pass tests (green), then refactors
4. Verify section exit criteria are met
5. Update `implementation-notes.md` with decisions and deviations
6. Spawn `code-reviewer` in background for rolling review
7. If section is security-sensitive: spawn `security-reviewer` (foreground, blocking)

**On build failure at any point:** Immediately spawn `build-error-resolver`. Do not attempt manual fixes first.

### Step 2: Integration Points
At each integration between sections:
- Verify the interface contract matches the design
- Test the integration explicitly — don't assume unit tests cover it
- Document any contract changes in `implementation-notes.md`

### Step 3: Deviation Tracking
When implementation diverges from the plan:
- Record it immediately in `implementation-notes.md`
- Note why the plan changed (discovery, constraint, better approach)
- Flag if the deviation has design or requirements implications

### Step 4: Phase Handoff
Summarize what was built, what changed from the plan, and what needs the most scrutiny in review.

Spawn `doc-updater` in background to update documentation affected by implementation changes.

### Step 5: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase04-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `implementation-notes.md` (REQUIRED)
Running log maintained throughout implementation. Must contain:
- **Section completion log** — each section, when completed, agent used, any deviations
- **Technical decisions** — micro-decisions made during coding not covered by ADRs
- **Plan deviations** — what changed from section plans and why
- **Known issues** — bugs or limitations discovered during implementation that were deferred
- **Integration notes** — anything unexpected at component boundaries
- **Rolling review summary** — findings from background `code-reviewer` agents

This file grows throughout the phase. Do not write it at the end — update it as you go.

### `phase5-handoff.md` (REQUIRED)
Must contain ALL of:
- **What was built** — section-by-section completion status with agent assignments
- **Deviations from plan** — summary of what changed and why
- **Areas needing scrutiny** — where reviewers should focus (complex logic, security-sensitive code, novel patterns)
- **Known defects** — anything deferred from this phase
- **Test coverage** — current coverage by module
- **Environment notes** — anything reviewers need to run the code

## Exit Criteria
- [ ] All planned sections implemented
- [ ] All unit tests passing
- [ ] No compilation or lint errors
- [ ] `implementation-notes.md` reflects actual implementation (not the plan)
- [ ] `phase5-handoff.md` identifies areas needing review focus
- [ ] Automated gate: test suite passes

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase04-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- `implementation-notes.md` is for reviewers, not for you. Write it for someone who wasn't in the room.
- TDD is not optional when the profile requires it — tests first, always.
- A deviation from plan is not a failure — undocumented deviations are.
- If implementation reveals a design flaw, surface it immediately rather than working around it.
- Never implement independent sections sequentially — parallel agents save time and context window.
- Rolling background reviews catch issues early. Review accumulated feedback before the next sprint.
