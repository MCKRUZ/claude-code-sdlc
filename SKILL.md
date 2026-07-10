---
name: claude-code-sdlc
description: |
  SDLC orchestration plugin for Claude Code. Drives projects through a
  9-phase software development lifecycle with company-configurable profiles,
  compliance gates, and quality enforcement.
  Triggers: "start sdlc", "sdlc setup", "initialize project lifecycle",
  "run phase gate", "advance phase", "sdlc status", "compliance check",
  "project setup wizard", "lifecycle management".
---

# claude-code-sdlc

SDLC orchestration plugin for Claude Code. Drives projects through a 9-phase software development lifecycle with company-configurable profiles, compliance gates, and quality enforcement.

## What This Does

This plugin makes structured SDLC methodology executable in Claude Code. It provides:
- **9 phases** — gated open (Discovery, Requirements, Design, Foundation) and gated close (Documentation, Deployment, Monitoring, Close & Transfer) bracketing a continuous **Build loop** (Intent→Delegate→Discern per change, no batch exit gate)
- **Company profiles** (YAML) defining stack, quality thresholds, compliance frameworks, and conventions
- **7-gate validation** at every phase transition (integrity, completeness, metrics, compliance, consistency, quality, exit criteria)
- **Compliance enforcement** for SOC 2, HIPAA, GDPR, PCI-DSS
- **Skill orchestration** — maps each phase to existing Claude Code skills (`/deep-plan`, `/deep-implement`, `/tdd`, `/code-review`, `/security-review`, `/e2e`, etc.)

## Commands

| Command | Purpose |
|---------|---------|
| `/sdlc-setup` | Interactive setup wizard — select profile, initialize `.sdlc/` in your project |
| `/sdlc` | Show current phase guidance, next action, required artifacts |
| `/sdlc-status` | Progress dashboard with phase table and completion percentage |
| `/sdlc-gate` | Run exit criteria checks for current phase (does not advance) |
| `/sdlc-next` | Advance to next phase if all MUST gates pass |
| `/sdlc-enhance` | Generate narrative companions for stakeholder review (optional) |
| `/sdlc-coach` | Interactive coaching mode — adaptive dialogue for current phase |
| `/sdlc-intake` | Catalog and summarize an external document corpus (Phase 0, opt-in) |
| `/sdlc-brief` | Prep a stakeholder workshop brief from the document corpus |
| `/sdlc-spec` | Author a ready Build-loop spec (`specs/NNNN-name.md`) and enforce the Definition of Ready |
| `/sdlc-review` | Multi-perspective artifact review (council, adversarial, or edge-case modes) |
| `/sdlc-phase-report` | Generate phase HTML report with artifact inventory and gate results |
| `/sdlc-audit` | Analyze gate effectiveness across completed phases — identify always-pass and high-fail gates |

## Quick Start

1. Run `/sdlc-setup` in your project directory
2. Select a profile (e.g., `microsoft-enterprise` or `starter`)
3. Run `/sdlc` to see Phase 0 guidance
4. Work through each phase, creating required artifacts
5. Run `/sdlc-next` when ready to advance

## How It Works

The plugin maintains state in `.sdlc/state.yaml` in your project directory. Each phase has:
- **Entry criteria** — what must be true to start the phase
- **Workflow** — steps to follow, skills to use
- **Required artifacts** — files you must produce (stored in `.sdlc/artifacts/XX-phase/`)
- **Exit gates** — 7-gate validation that must pass before advancing (gated phases only; the Build loop checks per change instead)

Phase transitions are atomic — either all MUST gates pass and you advance, or none do and you get a blockers report.

For long-running phases (especially the Build loop), session continuity is maintained through `session-handoff.json` — a structured JSON file that tracks section progress, blockers, and next actions across sessions. The session start hook reads this file and displays a continuity summary.

## Profiles

Profiles configure the plugin for your company/team:
- `microsoft-enterprise` — C#/.NET 8 + Angular 17 + Azure + SOC 2 compliance
- `starter` — Minimal profile, no compliance, quick start

Profiles define: technology stack, quality thresholds (coverage, file size limits), compliance frameworks, coding conventions (commit format, naming, immutability).

## Phases

Phase ids are strings (`build` and `close` are non-numeric); the 4/5/6 gap is intentional — batched check phases were replaced by per-change checking inside the Build loop. Advancement is always manual.

| id | Phase | Key Skills |
|----|-------|------------|
| 0 | Discovery | `/plan` |
| 1 | Requirements | `/deep-project` |
| 2 | Design | `/deep-plan`, `/visual-explainer` |
| 3 | Foundation | `/deep-plan` |
| build | Build Loop | `/tdd`, `/code-review`, `/security-review`, `/e2e`, `/test-coverage` |
| 7 | Documentation | `/update-docs` |
| 8 | Deployment | CI/CD |
| 9 | Monitoring | Manual |
| close | Close & Transfer | Manual |

## Frozen Layers

After each phase completes (gates pass + human sign-off), a **frozen layer** is generated — a token-efficient (1500-2000 token) summary of all phase artifacts. Frozen layers:

- Enable cross-phase context continuity without reloading full artifacts
- Contain **locked metrics** (budget, timeline, scope) checked for consistency in later phases
- Are written to `.sdlc/context/layers/phase{N}-{name}.md`
- Are generated by Claude reading all phase artifacts and condensing them into the template at `templates/frozen-layer.md`
- Are validated by `scripts/validate_frozen_layer.py`
- Are immutable once created

The `/sdlc-next` command handles frozen layer generation as step 5 (after HITL sign-off, before state advancement). See `references/frozen-layers.md` for format details.

## Context Architecture

The plugin uses a 3-tier context system for token-efficient cross-phase continuity:

| Tier | Content | When Loaded | Budget |
|------|---------|-------------|--------|
| 1 Foundation | Project identity, constitution extract | Always (session start) | ~500 tokens |
| 1.5 Intake Index | Document corpus index with DOC-NNN IDs | Session start (when available) | ~5K tokens (configurable) |
| 2 Frozen Layers | Phase summaries with locked metrics | Session start (recent 3) | ~2K per layer |
| 3 Reference | Validation rules, compliance, guides | On-demand | Unbounded |

The session-start hook automatically loads Tiers 1-2 (and 1.5 when document intake was performed). Tier 1.5 is opt-in — only loaded when `.sdlc/context/intake/index.md` exists. Tier 3 docs in `references/` are loaded when Claude needs specific guidance. See `references/context-tiers.md` for details.

## Narrative Enhancement

Every SDLC artifact can have a `.narrative.md` companion — a prose-rich, stakeholder-friendly version that makes the same information accessible to non-technical audiences. Narratives are **optional** (gates don't require them) but recommended before stakeholder reviews.

- Run `/sdlc-enhance` to generate narratives for the current phase's artifacts
- The `narrative-enhancer` agent handles all generation
- See `references/narrative-patterns.md` for transformation rules

## Multi-Perspective Review

Run `/sdlc-review` to evaluate phase artifacts from multiple angles before advancing. Three modes:
- `--council` (default) — 4-viewpoint review: Architecture, Product, Quality, Security
- `--adversarial` — Cynical QA: challenge assumptions, find quality issues
- `--edge-cases` — Exhaustive path analysis: find unhandled conditions and boundaries

Recommended before `/sdlc-gate` on design-heavy phases (2, 3) and during the Build loop. See `references/agent-roster.md` for phase-specific suggestions.

## Smart Repair

When gate checks fail on structural issues (missing templates, empty sections, placeholder content), the `gate-repair` agent can attempt automatic fixes before escalating to the human. Repair is conservative — it scaffolds structure but never generates substantive content. The human always reviews what was repaired. See `references/smart-repair.md` for the full repair classification.

## Conversational Coaching

For users who prefer guided dialogue over step lists, `/sdlc-coach` provides an adaptive coaching mode. The coach assesses the current phase state (which artifacts exist, what's missing), asks diagnostic questions, and generates artifacts as the conversation progresses.

Coaching mode enforces the same gates and requirements as the structured approach — it just changes the interaction style. See `references/conversational-coaching.md` for the full pattern library and per-phase diagnostic questions.

## Human-in-the-Loop Protocol

**This protocol is mandatory.** Claude MUST NOT make significant project decisions autonomously. The SDLC is a collaboration — Claude drives the process, humans make the decisions.

### When Claude MUST Stop and Ask

**1. Before writing any artifact in a new phase**
Read the incoming handoff document. Check for Q-NN (Open Questions) or AQ-NN (Architectural Questions). If any exist, resolve them with the human — using `AskUserQuestion` with concrete options — BEFORE writing any artifacts.

**2. Before writing any ADR (Phase 2 and beyond)**
Never choose an architectural approach without presenting options. For each decision:
- State the problem in one sentence
- Offer 2–3 concrete options with trade-offs
- Get a human selection
- Then write the ADR encoding that decision

**3. Before finalizing scope or requirements (Phase 0–1)**
Draft the key framing (executive summary, root cause statement, requirements list) and present it to the human for correction before writing the full artifact.

**4. Before writing section plans (Phase 3: Foundation)**
Present the proposed section breakdown — boundaries, order, complexity estimates — and get human approval before writing individual SECTION-NNN.md files.

**5. Before advancing any phase**
Do not call `advance_phase.py` immediately after gates pass. Present the phase summary and explicitly ask for human sign-off.

### What Claude May Do Without Asking

- Read files, search the codebase, explore project structure
- Write artifact drafts for human review (but flag them as drafts)
- Run gate checks and report results
- Format, organize, and structure content within a human-approved direction

### Pause Markers in Phase Definitions

Phase definition files use `> HITL GATE:` blockquotes to mark mandatory pause points. When Claude encounters one, it MUST stop and interact with the human before proceeding.

Phase definitions also use `> CHECKPOINT:` blockquotes to mark mandatory agent-enforced stopping points. The agent MUST complete all listed conditions before proceeding. Unlike HITL GATE, checkpoints do not require human interaction — they enforce workflow discipline within the agent's execution.

## Visual Report Protocol

**This protocol is mandatory for every phase.** Before requesting human sign-off to advance, Claude MUST generate an interactive HTML visual report summarizing the phase's artifacts, decisions, and key data. These reports replace ASCII art and inline markdown tables for stakeholder review.

### When to Generate

Generate a visual report as the **second-to-last step** of every phase, immediately before the "Generate Phase Report" step (which runs the gate check). The visual report is the stakeholder review artifact; the gate report is the automated validation artifact. Both are required.

### What Each Phase Report Contains

| Phase | Visual Report | Key Visualizations |
|-------|--------------|-------------------|
| 0 Discovery | Problem space overview | Persona cards, current state flow diagram, scope boundaries |
| 1 Requirements | Requirements matrix | Requirements by domain/priority, traceability matrix, epic overview |
| 2 Design | Architecture diagrams | Layer diagram, core flow, data flow, section dependencies, trust boundaries |
| 3 Foundation | Section review & sprint plan | Section breakdown table, sprint timeline, dependency DAG, risk cards |
| build Build Loop | Build progress | Section completion status, test coverage dashboard, code metrics, review & security findings, test pass/fail by category |
| 7 Documentation | Documentation audit | Docs completeness matrix, API coverage, README status |
| 8 Deployment | Release checklist | Deployment readiness, environment status, rollback plan |
| 9 Monitoring | Monitoring dashboard | Health checks, alert configuration, baseline metrics |
| close Close & Transfer | Handoff & retrospective | Transfer checklist, lessons learned, final metrics, ownership map |

### How to Generate

1. **If `/visual-explainer` skill is available:** Invoke it with a detailed prompt describing the phase's data, the desired diagrams, and output path (`.sdlc/reports/phaseNN-visual.html`).
2. **If not available:** Generate equivalent self-contained HTML directly using Mermaid.js CDN for flowcharts/DAGs, HTML `<table>` for data tables, and CSS Grid for card layouts.
3. **Never fall back to ASCII art** in the final report. Inline text summaries are fine for chat, but the review artifact must be rendered HTML.

### Visual Standards

- Self-contained HTML (no external assets except CDN fonts and Mermaid)
- Dark theme default matching SDLC reports (`#0f1117` bg, `#6c8ef7` accent, `#4ade80` green)
- Sticky sidebar TOC for navigation between sections
- Zoom controls on all Mermaid diagrams
- Staggered fade-in animations (respect `prefers-reduced-motion`)
- Both light and dark theme support via `prefers-color-scheme`
- Responsive layout (sidebar collapses to horizontal bar on mobile)

### Artifact Sub-Pages (MANDATORY)

Every phase visual report MUST include linked sub-pages for each artifact. The main report is a summary; sub-pages contain full artifact detail.

- **Main report:** `.sdlc/reports/phaseNN-visual.html` (or `phaseNN-discovery.html`, etc.) -- summary with highlights from each artifact
- **Sub-pages:** `.sdlc/reports/phaseNN-<artifact-name>.html` -- full rendered content of each artifact (e.g., `phase00-problem-statement.html`, `phase00-constraints.html`)
- **Linking:** The main report's artifact inventory section MUST link to each sub-page. Each sub-page MUST link back to the main report.
- **Consistency:** Sub-pages use the same dark theme and styling as the main report.

This ensures the summary stays scannable while full detail is always one click away for stakeholder review.

### Project Index Page (MANDATORY)

An index page at `.sdlc/reports/index.html` MUST exist. It serves as the single entry point for all project documentation.

- **Auto-create:** Generate `index.html` when the first phase report is created (typically Phase 0).
- **Auto-update:** Update `index.html` every time a phase report is generated or a phase advances. Update phase status badges, dates, and report links.
- **Contents:** Project header (name, profile, type, start date, current phase), mission statement, link to constitution, and a timeline of all 9 phases showing status (active/completed/pending) with links to phase reports.
- **End state:** By project completion, `index.html` is a complete navigable dashboard of the entire SDLC history.

### Output Location

All reports are written to `.sdlc/reports/`:
- `index.html` -- project dashboard (single entry point)
- `phase00-visual.html`, `phase01-visual.html`, ..., `build-visual.html`, ..., `close-visual.html` -- phase summary reports (numeric phases use `phaseNN-`; the Build loop and Close use their `build` / `close` slug)
- `phase00-<artifact>.html`, `phase01-<artifact>.html`, ... -- artifact sub-pages
- Additional named reports (e.g., `architecture-diagrams.html`, `phase03-section-review.html`) are encouraged alongside the numbered report

## Agent Orchestration Protocol

Claude MUST use the Agent tool to spawn specialized subagents rather than doing all work inline. The Agent tool produces better results for non-trivial tasks: subagents have focused context, specialized instructions, and independent execution. This is not optional.

See `references/agent-roster.md` for the full phase-by-phase mapping with conditions, parallel groups, and background policy.

### Mandatory Spawns (No Exceptions)

| Trigger | Agent | Behavior |
|---------|-------|----------|
| Build or compilation fails | `build-error-resolver` | Spawn immediately. Do not attempt manual fixes first. |
| Code touches auth, payments, secrets, or PII | `security-reviewer` | Foreground. STOP on CRITICAL/HIGH findings. |
| Build loop + profile requires TDD | `tdd-guide` | Spawn BEFORE writing any code for the change. |
| Per-change check in the Build loop | `code-reviewer` + `security-reviewer` | Spawn both in a single message (parallel, foreground). |
| A change in the Build loop completes | `section-evaluator` | Foreground, blocking. FAIL verdict = fix before proceeding. |
| Build loop with independent changes | Domain-specific agents | Spawn in parallel (single message) for non-dependent changes. |
| Gate check fails unexpectedly | `Explore` | Investigate root cause before attempting fixes. |

### Phase-by-Phase Agent Roster (Summary)

| Phase | Primary Agents | Conditional Agents |
|-------|---------------|--------------------|
| 0 Discovery | — | `Explore` (existing codebase) |
| 1 Requirements | — | `Explore`, `feedback-synthesizer` |
| 2 Design | `architect` | `backend-architect`, `frontend-developer`, `security-reviewer` |
| 3 Foundation | `deep-plan:section-writer` | `Plan`, `Explore` |
| build Build Loop | Domain agents per change | `tdd-guide`, `section-evaluator`, `code-reviewer`, `security-reviewer`, `build-error-resolver`, `test-writer-fixer`, `e2e-runner`, `api-tester`, `performance-benchmarker`, `refactor-cleaner` (background) |
| 7 Documentation | `doc-updater` | `backend-architect` (API docs) |
| 8 Deployment | `devops-automator` | `e2e-runner` (smoke tests), `build-error-resolver` |
| 9 Monitoring | — | `performance-benchmarker`, `feedback-synthesizer` |
| close Close & Transfer | — | `doc-updater`, `feedback-synthesizer` |

### Parallel Execution Rules

**Use a single message with multiple Agent tool calls when:**
- Two or more Build loop changes have no dependency on each other (e.g., backend + frontend changes).
- A per-change check fires in the Build loop — always launch `code-reviewer` and `security-reviewer` simultaneously.
- Testing in the Build loop — launch `test-writer-fixer`, `e2e-runner`, and `api-tester` simultaneously when all apply.
- Phase 3 (Foundation) has multiple independent section plans to generate.

**Use sequential Agent calls when:**
- One agent's output is the input to the next (e.g., `tdd-guide` must complete before the implementation agent starts).
- A security CRITICAL/HIGH finding must be resolved before proceeding.
- A build failure must be fixed before continuing.

**Pattern for parallel change implementation:**
```
# Single message — two Agent tool calls fire simultaneously:
Agent(backend-architect, "Implement SECTION-002 per .sdlc/artifacts/03-foundation/section-plans/SECTION-002.md")
Agent(frontend-developer, "Implement SECTION-003 per .sdlc/artifacts/03-foundation/section-plans/SECTION-003.md")
```

### Background Agents

Run with `run_in_background: true` (non-blocking):
- `doc-updater` — documentation updates during the Build loop
- `refactor-cleaner` — dead code cleanup during the Build loop
- `code-reviewer` — rolling per-change review in the Build loop
- `deep-implement:code-reviewer` — diff review against section plans

Never background: security reviews, build error resolution, or any work producing phase gate artifacts.

### Domain Agent Selection (Build loop)

| Change domain | Primary agent |
|----------------|---------------|
| Python / C# / server-side logic | `backend-architect` |
| HTML / CSS / Angular / React | `frontend-developer` |
| CI/CD / cloud infrastructure | `devops-automator` |
| Spike / proof-of-concept | `rapid-prototyper` |
| Any change with auth / payments / secrets | + `security-reviewer` (foreground) |

---

## Reference Material

Detailed documentation is in the `references/` directory:
- `state-machine.md` — State format and transition rules
- `validation-rules.md` — 7-gate validation system details
- `skill-mapping.md` — Phase-to-skill mapping
- `agent-roster.md` — Phase-to-subagent mapping with parallel groups and conditions
- `compliance-frameworks.md` — SOC 2, HIPAA, GDPR, PCI-DSS gate definitions
