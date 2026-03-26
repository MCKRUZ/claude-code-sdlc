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

**0g. Initialize session handoff.**
If `session-handoff.json` exists in `.sdlc/artifacts/04-implementation/`, read it to restore context: which sections are done, which are in progress, what the blockers are, and what the previous session's next actions were. Present a summary to the human. If the file does not exist (first session), create it from the template, populating the `sections` array from the section plans in `.sdlc/artifacts/03-planning/section-plans/`.

**0h. Initialize sections-progress.json.**
If `sections-progress.json` does not exist in `.sdlc/artifacts/04-implementation/`, create it from the template, populating the `sections` array from section plans and the `sprints` array from `sprint-plan.md`. Update the `total_sections` count. If it already exists, verify it matches the current section plan set.

> **HITL GATE:** Present the proposed agent execution plan (which agents, which sections, parallel groups, TDD enforcement) to the human. Get explicit approval before beginning implementation.

### Step 1: Per-Section Execution (repeat for each section)

**1a. Pre-implementation setup:**
1. If TDD required: spawn `tdd-guide` agent — writes failing tests (red)

**1b. Implementation:**
2. Spawn domain-specific implementation agent (`backend-architect`, `frontend-developer`, etc.)
3. Agent implements minimal code to pass tests (green), then refactors

**1c. Section verification checkpoint (MANDATORY before starting next section):**
4. Verify section exit criteria are met
5. Update `implementation-notes.md` with decisions and deviations
6. Spawn `section-evaluator` agent (foreground, blocking). The evaluator reads the section plan's Verification Criteria and Evaluator Contract, inspects the implementation, and produces an evaluation report.
   - **On PASS or CONDITIONAL PASS:** Proceed to the next step. Record `evaluator_passed: true` in `sections-progress.json`.
   - **On FAIL:** Address all blocking issues identified by the evaluator. Re-run the evaluator. Do not proceed until it passes. Record each evaluation attempt.
7. Commit all code changes for this section with a descriptive commit message referencing the section ID
8. Update `sections-progress.json`: set the section status to `complete`, record `completed_at`, update `completed_sections` count, and set `tests_passing` and `evaluator_passed` fields
9. Update `session-handoff.json`: move the section to `completed_this_session`, update its status to `complete`, record the agent used and completion timestamp

> **CHECKPOINT:** The section is NOT complete until steps 4–9 are all done. Do NOT begin the next section until this checkpoint passes. If the evaluator fails, fix blocking issues and re-run — do not start a new section with an open evaluator failure.

**1d. Post-section (non-blocking):**
10. Spawn `code-reviewer` in background for rolling review
11. If section is security-sensitive: spawn `security-reviewer` (foreground, blocking)

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

### Step 3b: Session Boundary Protocol

At the end of each working session (context window nearing limits, user pausing, or natural stopping point):

1. Update `session-handoff.json` with current state of all sections
2. Record `completed_this_session` and `in_progress` arrays
3. Write `next_actions` with specific, actionable items for the next session
4. Write `context_for_next_session` — a 2-3 sentence natural language summary of where things stand
5. Increment `session_number`
6. Commit `session-handoff.json` alongside any code changes

This step is MANDATORY before ending any session during Phase 4. The orchestrator MUST NOT end a session without updating the handoff file.

### Step 4: Phase Handoff
Summarize what was built, what changed from the plan, and what needs the most scrutiny in review.

Spawn `doc-updater` in background to update documentation affected by implementation changes.

### Step 5: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase04-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 4 (Implementation):**
- Section completion progress (progress bars per section)
- Test coverage dashboard (coverage % per section vs target)
- Code metrics summary (files created, lines of code, test count)
- Active blockers or issues

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 6: Generate Phase Report
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

### `session-handoff.json` (OPTIONAL but RECOMMENDED)
Machine-readable session continuity file. Maintained throughout Phase 4 when implementation spans multiple sessions. Contains:
- **Section status array** — authoritative status of every section (not_started / in_progress / complete / blocked)
- **Session log** — what was completed, started, or blocked in the current session
- **Next actions** — prioritized list of what to do when the next session starts
- **Context summary** — natural language handoff for session resumption
- **Blockers** — active blockers with affected sections

Updated at every section completion and at every session boundary. Read at session start.

### `sections-progress.json` (OPTIONAL but RECOMMENDED)
Machine-readable section progress tracker. Provides a structured alternative to the section completion log in `implementation-notes.md`. Contains:
- **Section array** — every planned section with status, agent, timestamps, and evaluation results
- **Sprint array** — sprint-level progress tracking
- **Counters** — total and completed section counts for quick status checks

Updated at every section completion. Read by `session-handoff.json` for session continuity and by `check_gates.py` for optional consistency validation.

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
- [ ] All sections passed `section-evaluator` (PASS or CONDITIONAL PASS)
- [ ] All unit tests passing
- [ ] No compilation or lint errors
- [ ] `implementation-notes.md` reflects actual implementation (not the plan)
- [ ] `phase5-handoff.md` identifies areas needing review focus
- [ ] `sections-progress.json` shows all sections complete (if used)
- [ ] `session-handoff.json` reflects final state (if multi-session)
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
- The section-evaluator is a quality gate, not a suggestion. A FAIL verdict means the section has real problems — fix them before moving on.
- Session handoff is insurance. The 60 seconds it takes to update saves 30 minutes of context reconstruction in the next session.
