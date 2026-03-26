# Phase 0: Discovery

## Purpose
Understand the problem space deeply enough that a stakeholder who has never heard of the project can read the artifacts and make an informed decision about whether to proceed, what scope to approve, and what success looks like. This phase produces evidence, not assumptions.

## Entry Criteria
- Project initiated via `/sdlc-setup`
- State machine created with Phase 0 active

## Workflow

### Step 0: HITL Gate — Frame the Problem with the Human

> **HITL GATE:** Before writing any artifact, conduct a brief scoping conversation. Ask the human: (1) What is the problem in one sentence? (2) Who is most affected? (3) What does success look like? (4) What constraints are non-negotiable? (5) What type of system is this? Choose one: **service** (backend API / server process), **app** (user-facing application with UI), **library** (shared code package / SDK), **skill** (Claude Code skill / AI plugin / prompt-based tool), **cli** (command-line tool). Record the answer as `project_type` in `state.yaml` — it determines which Phase 6–9 templates apply. Use these answers to anchor the artifacts — do not invent the problem framing.

### Step 1: Problem Identification
Conduct stakeholder interviews or document the problem statement. Dig until you have:
- **Observable symptoms** — what people actually experience, not the inferred cause
- **Quantified impact** — time lost, cost, frequency, scale. "A lot" is not a metric.
- **Who is affected** — named personas with specific roles and specific pains
- **Why it matters now** — urgency, trigger, business context

Use Five Whys or equivalent root cause analysis. Don't stop at the first "why".

### Step 2: Current State Analysis
Document what exists today:
- How does the process/system work right now? (flow diagram)
- What metrics describe the current state? (with benchmarks for comparison)
- What tools, systems, or workarounds are in use?
- Where does the current state fail most painfully?

### Step 3: Define Success
For each stakeholder, define what "solved" looks like in measurable terms:
- What specific outcome changes?
- How will we measure it?
- What is the baseline today?
- What is the target? What is a stretch target?
- What counts as partial success vs. failure?

### Step 4: Scope Boundaries
Draw explicit lines:
- **In scope:** What this project MUST address in v1
- **Out of scope:** What it explicitly excludes (and why — prevents scope creep arguments later)
- **Assumptions:** Stated facts taken as given. Each assumption is a risk if wrong.
- **Constraints:** Non-negotiables that shape the solution space

### Step 5: Write Project Constitution
Establish the project's governing document:
- Fill in the Project Identity and Mission Statement
- Define 3–5 governing principles specific to this project (not generic)
- Document decision authority — who approves phase transitions, architecture decisions, scope changes
- This document is referenced by all subsequent phases and amended as the project evolves

### Step 6: Phase Handoff
Package everything Phase 1 needs:
- Summary of key findings (5–10 bullets)
- Decisions already made (and the rationale)
- Open questions Phase 1 must answer
- Risks to carry forward
- Recommended starting point for requirements

### Step 7: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase00-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 0 (Discovery):**
- Stakeholder persona cards with pain points
- Current state flow diagram (ASCII → Mermaid)
- Success criteria dashboard (baseline → target → stretch per dimension)
- Scope boundaries (in-scope vs out-of-scope)

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 8: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase00-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `constitution.md` (REQUIRED)
Must contain ALL of:
- **Project Identity** — name, profile, creation date
- **Project Type** — one of: `service`, `app`, `library`, `skill`, `cli`. This field drives template selection in Phases 6–9.
- **Mission Statement** — one paragraph, written for a non-technical audience
- **Governing Principles** — 3–5 specific principles for this project (not copy-paste boilerplate)
- **Decision Authority** — who approves what, at what level
- **Amendment Process** — how the document gets updated as the project evolves

### `problem-statement.md` (REQUIRED)
Must contain ALL of:
- **Executive Summary** — 2–3 sentences: problem, who has it, business impact
- **Problem Definition** — observable symptoms, specific and concrete
- **Stakeholder Personas** — table with: Persona, Role, Specific Pain Points, Goals
- **Current State Analysis** — process flow (ASCII diagram), current metrics vs benchmarks
- **Root Cause Analysis** — Five Whys or equivalent, ending at the actual root cause
- **What Solved Looks Like** — end state description per stakeholder

Use real numbers. Use a table for stakeholders. Use an ASCII flow diagram for current state.

### `success-criteria.md` (REQUIRED)
Must contain ALL of:
- **Overall success definition** — one sentence that captures the spirit
- **Measurable dimensions** — grouped by theme (efficiency, quality, adoption, etc.)
- **Per-criterion structure**: Baseline → Target → Stretch target → Measurement method → Timeline
- **Acceptance thresholds** per criterion: ✅ Success / ⚠️ Partial / ❌ Failure

Do not write vague criteria. "Faster" is not a success criterion. "Reduces X from Y to Z by date D" is.

### `constraints.md` (REQUIRED)
Must contain ALL of:
- **Technical constraints** — technology choices, compatibility requirements, infrastructure limits
- **Operational constraints** — team size, skills, support model, deployment environment
- **Timeline constraints** — hard deadlines and their source (contractual, business event, etc.)
- **Budget/resource constraints** — if applicable
- **Rationale column** — for each constraint, WHY it exists. Undocumented constraints get challenged.

Format as a table: Constraint | Type | Rationale | Impact if violated.

### `phase1-handoff.md` (REQUIRED)
Must contain ALL of:
- **Discovery Summary** — what was learned, in 5–10 bullets
- **Decisions Made** — what was decided during discovery and the rationale
- **Recommended Scope** — what Phase 1 should include based on discovery findings
- **Open Questions** — specific questions Phase 1 must answer before design can start
- **Risks to Monitor** — risks surfaced during discovery with probability/impact rating
- **Suggested Starting Point** — where Phase 1 should begin and what to tackle first

## Exit Criteria
- [ ] `constitution.md` contains: project identity, mission statement, governing principles, decision authority
- [ ] `problem-statement.md` contains: exec summary, persona table, current state metrics, root cause analysis
- [ ] `success-criteria.md` contains at least 3 measurable dimensions with pass/fail thresholds
- [ ] `constraints.md` documents all known constraints with rationale
- [ ] `phase1-handoff.md` contains open questions and risks
- [ ] All artifacts reviewed and approved by stakeholder (manual gate)
- [ ] Scope boundaries are unambiguous

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase00-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Resist the urge to jump to solutions. A proposed solution in a problem statement is a scope assumption.
- If you can't quantify the impact, dig harder — the number exists somewhere.
- Stakeholder personas should be named (real or representative) — "the developer" is not a persona.
- Every assumption in `constraints.md` is a risk. The riskiest ones belong in the handoff.
- The handoff package is a first-class artifact. A Phase 1 team should be able to start with only that file.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no artifacts yet)
- "What problem are you trying to solve? Tell me in plain language."
- "Who are the main stakeholders — the people who care about the outcome?"
- "What constraints are you working with? Budget, timeline, technology, team size?"
- "Has anyone validated that this problem is worth solving?"

### Progress Check (some artifacts exist)
- "I see your problem statement. Is this the root cause, or a symptom of something deeper?"
- "Your constraints mention [X]. How firm is that? Would it change if the scope changes?"

### Ready Check (all artifacts present)
- "Your discovery artifacts look solid. Are you confident about the scope boundaries before we lock them?"
- "Anything missing from the stakeholder map? Anyone we'd regret not consulting?"
