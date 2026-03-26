# Phase 3: Planning

## Purpose
Translate the design into a sequenced, estimated, dependency-mapped implementation plan. When Phase 4 begins, developers should have no ambiguity about what to build first, what depends on what, and what risks to watch.

## Entry Criteria
- Phase 2 exit gate passed and `phase3-handoff.md` reviewed
- Section breakdown from design handoff as starting point
- `deep-plan-checkpoint.yaml` exists in `.sdlc/artifacts/02-design/` (for /deep-plan resumption)

## Workflow

### Step 0: HITL Gate — Approve Section Boundaries Before Writing Plans

> **HITL GATE:** Read `phase3-handoff.md`. Draft the proposed section breakdown (names, scope, rough order) as a short list. Present it to the human for approval **before** creating any SECTION-NNN.md files. The human may split sections, merge them, reorder them, or flag scope concerns. Section boundaries are hard to change once sprint plans are written around them.

### Step 1: Resume /deep-plan (Steps 16–22)

Read `deep-plan-checkpoint.yaml` from `.sdlc/artifacts/02-design/` to locate the planning directory and session context. Resume `/deep-plan` from where Phase 2 left off:

**What /deep-plan does in this phase:**
1. **TDD planning (step 16):** Creates `planning/claude-plan-tdd.md` — prose test stubs mirroring the plan structure. These describe what to test first for each section, not full test implementations.
2. **Section index (step 18):** Creates `planning/sections/index.md` with a `PROJECT_CONFIG` block (runtime, test command) and `SECTION_MANIFEST` block (ordered list of section names with dependency graph).
3. **Section generation (steps 19–20):** Uses parallel `deep-plan:section-writer` subagents to write self-contained section files to `planning/sections/section-NN-*.md`. Each section contains implementation instructions detailed enough for a developer to start coding.
4. **Verification (step 21):** Confirms all sections are generated.

Feed the human-approved section boundaries from Step 0 into /deep-plan's section splitting configuration so the generated sections match the approved breakdown.

### Step 1b: Map /deep-plan Outputs to SDLC Artifacts

Run the artifact mapping script to transform /deep-plan section files into SDLC format:

```bash
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 3 --planning-dir planning/
```

This produces:
- `.sdlc/artifacts/03-planning/section-plans/SECTION-001.md` through `SECTION-NNN.md` — converged format with SDLC structured fields and /deep-plan implementation prose in the "Implementation Guidance" section
- `.sdlc/artifacts/03-planning/tdd-plan.md` — copy of `claude-plan-tdd.md`
- `.sdlc/artifacts/03-planning/dependency-map.md` — copy of `sections/index.md` with SECTION_MANIFEST and dependency graph

The converged section template (`SECTION-template-deep-plan.md`) preserves both systems' requirements:
- **SDLC fields:** Goal, Epics/Stories, Entry/Exit Criteria, Dependencies, Interfaces, Test Strategy, Risk
- **`/deep-plan` prose:** Full implementation guidance in a dedicated section, self-contained enough for `/deep-implement` to consume

### Step 2: Dependency Mapping
For each section, verify and refine:
- What must be built before this section can start (from SECTION_MANIFEST blockedBy)
- What this section unblocks
- External dependencies (APIs, infrastructure, credentials)

Source dependency data from `/deep-plan`'s `sections/index.md` dependency graph. Reconcile with the human-approved section boundaries from Step 0.

### Step 3: Sprint Planning
Group sections into sprints:
- Each sprint delivers demonstrable value
- Respect dependency order from the SECTION_MANIFEST
- Include buffer for integration and testing
- Sprint 1 should build the foundation that all other work depends on

### Step 4: Risk Register
Document all identified risks. Source from:
- `planning/claude-plan.md` — risks identified during design
- `planning/reviews/` — risks flagged by external reviewers
- Section-level risks from the generated section plans

For each risk: probability (H/M/L) x impact (H/M/L) = priority.

### Step 5: Phase Handoff
Produce a ready-to-implement checklist — everything a developer needs to start Sprint 1 immediately.

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase03-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 3 (Planning):**
- Section breakdown table with complexity badges and dependency chips
- Sprint timeline (vertical timeline with color-coded phases)
- Dependency DAG (Mermaid flowchart with color-coded section nodes)
- Risk cards (top 5 with probability/impact ratings)

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase03-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `section-plans/` directory (REQUIRED)
One file per section: `SECTION-NNN.md`. Uses the converged template at `templates/phases/03-planning/section-plans/SECTION-template-deep-plan.md`.

Each section plan must be independently completable — a developer should be able to pick it up and finish it without needing to consult other section plans.

Each must contain:
- **Goal** — one sentence: what capability exists when this section is complete
- **Epics / Stories Covered** — traceability to requirements
- **Entry criteria** — what must be true before work can begin
- **Exit criteria** — specific, verifiable conditions that mark this section complete
- **Dependencies** — what other sections or external systems this depends on
- **Implementation guidance** — self-contained instructions from /deep-plan (architecture decisions, code patterns, function signatures, step-by-step guidance)
- **Interfaces** — what this section exposes to other sections
- **Test strategy** — coverage targets by test type, plus TDD test stubs from `claude-plan-tdd.md`
- **Risk** — section-specific risks and mitigations
- **Verification criteria** — how each exit criterion will be tested, with specific pass conditions
- **Evaluator contract** — grading rubric the section evaluator agent uses after implementation (scope, rubric, fail/warn conditions)

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

### Optional Artifacts (from /deep-plan)
- `tdd-plan.md` — prose test stubs mirroring plan structure
- `dependency-map.md` — SECTION_MANIFEST and dependency graph from sections/index.md

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
- The `planning/` directory is preserved alongside `.sdlc/artifacts/` for /deep-plan's internal session continuity. `/deep-implement` in Phase 4 reads from `.sdlc/artifacts/03-planning/section-plans/`.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no artifacts yet)
- "Looking at the design, how would you break this into implementable sections?"
- "Which sections have dependencies on each other?"
- "Where do you see the most complexity or risk?"
- "What's your implementation order preference — core-out or edge-in?"

### Progress Check (some artifacts exist)
- "Your section breakdown covers [N] sections. Do the complexity estimates feel right?"
- "I see section [X] depends on [Y]. Is that dependency strict or could they parallelize?"

### Ready Check (all artifacts present)
- "Plans are in place. Are the sprint allocations realistic given your team capacity?"
- "Any sections that feel under-scoped or likely to expand?"
