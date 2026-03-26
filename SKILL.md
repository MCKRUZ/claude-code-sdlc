---
name: claude-code-sdlc
description: |
  SDLC orchestration plugin for Claude Code. Drives projects through a
  10-phase software development lifecycle with company-configurable profiles,
  compliance gates, and quality enforcement.
  Triggers: "start sdlc", "sdlc setup", "initialize project lifecycle",
  "run phase gate", "advance phase", "sdlc status", "compliance check",
  "project setup wizard", "lifecycle management".
---

# claude-code-sdlc

SDLC orchestration plugin for Claude Code. Drives projects through a 10-phase software development lifecycle with company-configurable profiles, compliance gates, and quality enforcement.

## What This Does

This plugin makes structured SDLC methodology executable in Claude Code. It provides:
- **10 phases** from Discovery through Monitoring, each with entry/exit gates
- **Company profiles** (YAML) defining stack, quality thresholds, compliance frameworks, and conventions
- **5-gate validation** at every phase transition (integrity, completeness, metrics, classification, quality)
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
- **Exit gates** — 5-level validation that must pass before advancing

Phase transitions are atomic — either all MUST gates pass and you advance, or none do and you get a blockers report.

For long-running phases (especially Phase 4: Implementation), session continuity is maintained through `session-handoff.json` — a structured JSON file that tracks section progress, blockers, and next actions across sessions. The session start hook reads this file and displays a continuity summary.

## Profiles

Profiles configure the plugin for your company/team:
- `microsoft-enterprise` — C#/.NET 8 + Angular 17 + Azure + SOC 2 compliance
- `starter` — Minimal profile, no compliance, quick start

Profiles define: technology stack, quality thresholds (coverage, file size limits), compliance frameworks, coding conventions (commit format, naming, immutability).

## Phases

| # | Phase | Key Skills |
|---|-------|------------|
| 0 | Discovery | `/plan` |
| 1 | Requirements | `/deep-project` |
| 2 | Design | `/deep-plan`, `/visual-explainer` |
| 3 | Planning | `/deep-plan` |
| 4 | Implementation | `/deep-implement`, `/tdd` |
| 5 | Quality | `/code-review`, `/security-review` |
| 6 | Testing | `/e2e`, `/test-coverage` |
| 7 | Documentation | `/update-docs` |
| 8 | Deployment | CI/CD |
| 9 | Monitoring | Manual |

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

**4. Before writing section plans (Phase 3)**
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
| 3 Planning | Section review & sprint plan | Section breakdown table, sprint timeline, dependency DAG, risk cards |
| 4 Implementation | Implementation progress | Section completion status, test coverage dashboard, code metrics |
| 5 Quality | Review findings | Code review summary, security findings, severity distribution |
| 6 Testing | Test results dashboard | Coverage heatmap, test pass/fail by category, scenario traceability |
| 7 Documentation | Documentation audit | Docs completeness matrix, API coverage, README status |
| 8 Deployment | Release checklist | Deployment readiness, environment status, rollback plan |
| 9 Monitoring | Monitoring dashboard | Health checks, alert configuration, baseline metrics |

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

### Output Location

All visual reports are written to `.sdlc/reports/`:
- `phase00-visual.html`, `phase01-visual.html`, ..., `phase09-visual.html`
- Additional named reports (e.g., `architecture-diagrams.html`, `phase03-section-review.html`) are encouraged alongside the numbered report

## Agent Orchestration Protocol

Claude MUST use the Agent tool to spawn specialized subagents rather than doing all work inline. The Agent tool produces better results for non-trivial tasks: subagents have focused context, specialized instructions, and independent execution. This is not optional.

See `references/agent-roster.md` for the full phase-by-phase mapping with conditions, parallel groups, and background policy.

### Mandatory Spawns (No Exceptions)

| Trigger | Agent | Behavior |
|---------|-------|----------|
| Build or compilation fails | `build-error-resolver` | Spawn immediately. Do not attempt manual fixes first. |
| Code touches auth, payments, secrets, or PII | `security-reviewer` | Foreground. STOP on CRITICAL/HIGH findings. |
| Phase 4 + profile requires TDD | `tdd-guide` | Spawn BEFORE writing any code for the section. |
| Phase 5 entry | `code-reviewer` + `security-reviewer` | Spawn both in a single message (parallel, foreground). |
| Section implementation completes (Phase 4) | `section-evaluator` | Foreground, blocking. FAIL verdict = fix before proceeding. |
| Phase 4 with independent sections | Domain-specific agents | Spawn in parallel (single message) for non-dependent sections. |
| Gate check fails unexpectedly | `Explore` | Investigate root cause before attempting fixes. |

### Phase-by-Phase Agent Roster (Summary)

| Phase | Primary Agents | Conditional Agents |
|-------|---------------|--------------------|
| 0 Discovery | — | `Explore` (existing codebase) |
| 1 Requirements | — | `Explore`, `feedback-synthesizer` |
| 2 Design | `architect` | `backend-architect`, `frontend-developer`, `security-reviewer` |
| 3 Planning | `deep-plan:section-writer` | `Plan`, `Explore` |
| 4 Implementation | Domain agents per section | `tdd-guide`, `section-evaluator`, `build-error-resolver`, `security-reviewer` |
| 5 Quality | `code-reviewer` + `security-reviewer` | `refactor-cleaner` (background) |
| 6 Testing | `test-writer-fixer` | `e2e-runner`, `api-tester`, `performance-benchmarker` |
| 7 Documentation | `doc-updater` | `backend-architect` (API docs) |
| 8 Deployment | `devops-automator` | `e2e-runner` (smoke tests), `build-error-resolver` |
| 9 Monitoring | — | `performance-benchmarker`, `feedback-synthesizer` |

### Parallel Execution Rules

**Use a single message with multiple Agent tool calls when:**
- Two or more Phase 4 sections have no dependency on each other (e.g., backend + frontend sections).
- Phase 5 starts — always launch `code-reviewer` and `security-reviewer` simultaneously.
- Phase 6 testing — launch `test-writer-fixer`, `e2e-runner`, and `api-tester` simultaneously when all apply.
- Phase 3 has multiple independent section plans to generate.

**Use sequential Agent calls when:**
- One agent's output is the input to the next (e.g., `tdd-guide` must complete before the implementation agent starts).
- A security CRITICAL/HIGH finding must be resolved before proceeding.
- A build failure must be fixed before continuing.

**Pattern for parallel section implementation:**
```
# Single message — two Agent tool calls fire simultaneously:
Agent(backend-architect, "Implement SECTION-002 per .sdlc/artifacts/03-planning/section-plans/SECTION-002.md")
Agent(frontend-developer, "Implement SECTION-003 per .sdlc/artifacts/03-planning/section-plans/SECTION-003.md")
```

### Background Agents

Run with `run_in_background: true` (non-blocking):
- `doc-updater` — documentation updates during implementation
- `refactor-cleaner` — dead code cleanup during Phase 5
- `code-reviewer` — rolling per-section review in Phase 4
- `deep-implement:code-reviewer` — diff review against section plans

Never background: security reviews, build error resolution, or any work producing phase gate artifacts.

### Domain Agent Selection (Phase 4)

| Section domain | Primary agent |
|----------------|---------------|
| Python / C# / server-side logic | `backend-architect` |
| HTML / CSS / Angular / React | `frontend-developer` |
| CI/CD / cloud infrastructure | `devops-automator` |
| Spike / proof-of-concept | `rapid-prototyper` |
| Any section with auth / payments / secrets | + `security-reviewer` (foreground) |

---

## Reference Material

Detailed documentation is in the `references/` directory:
- `state-machine.md` — State format and transition rules
- `validation-rules.md` — 5-gate validation system details
- `skill-mapping.md` — Phase-to-skill mapping
- `agent-roster.md` — Phase-to-subagent mapping with parallel groups and conditions
- `compliance-frameworks.md` — SOC 2, HIPAA, GDPR, PCI-DSS gate definitions
