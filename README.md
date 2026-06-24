# claude-code-sdlc

SDLC orchestration plugin for Claude Code. Drives projects through a structured software development lifecycle — gated opening and closing phases around a continuous Build loop — with company-configurable profiles, compliance gates, and quality enforcement.

## Why This Exists

No existing tool combines specification-driven development + quality enforcement + compliance gates + company configurability into one executable workflow. This plugin makes the AI-SDLC methodology executable inside Claude Code.

## Features

- **9 SDLC phases** — Discovery, Requirements, Design, Foundation, the continuous **Build loop**, Documentation, Deployment, Monitoring, Close & Transfer. The gap where batch Implementation/Quality/Testing used to be is intentional — checking happens per change inside the Build loop, never as a later batch phase.
- **Project type routing** — testing, deployment, and monitoring adapt automatically based on `project_type` (service, app, library, skill, cli)
- **Company profiles** — YAML configs for stack, quality thresholds, compliance, conventions
- **6-gate validation** — Integrity, completeness, metrics, compliance, consistency, quality checks at every transition
- **Frozen layers** — Token-efficient phase summaries enabling cross-phase context continuity
- **3-tier context architecture** — Foundation (always), frozen layers (per-phase), references (on-demand)
- **Narrative enhancement** — Optional stakeholder-friendly `.narrative.md` companions for technical artifacts
- **Conversational coaching** — Adaptive dialogue mode for guided phase completion
- **NFR measurement basis enforcement** — Every numeric threshold must declare its measurement source; aspirational thresholds require an agreed validation plan in the Build loop
- **Test traceability** — the Build loop requires scenario-to-requirement mapping and redundancy audit before test execution
- **Compliance enforcement** — SOC 2, HIPAA, GDPR, PCI-DSS gate definitions
- **Skill orchestration** — Maps phases to existing skills (`/deep-plan`, `/deep-implement`, `/tdd`, `/code-review`, `/security-review`, `/e2e`)
- **State machine** — Tracks progress in `.sdlc/state.yaml` with full audit trail
- **Artifact checksums + dirty tracking** — SHA-256 hashes detect changed artifacts; gate checks skip unchanged files for faster validation
- **Smart repair** — Gate failures on structural issues (missing templates, placeholders) are auto-fixed before escalating to human
- **Dependency graph enforcement** — Section dependency DAG validated in the Build loop; circular dependencies detected; implementation order enforced
- **Multi-perspective review** — `/sdlc-review` with adversarial, edge-case, and council modes for thorough artifact review
- **Brainstorming techniques** — SCAMPER, reverse brainstorming, constraint removal, and 3 more structured ideation methods with anti-bias protocol
- **Brownfield detection** — Auto-detects existing codebases and generates workspace analysis before Discovery begins
- **Structured error specs** — P0/P1 requirements must define Accepts/Returns/Errors explicitly
- **Cross-artifact validation** — File-level reference checking between artifacts (SHOULD severity)
- **Question-to-file audit trail** — Open questions written to persistent markdown files for team collaboration
- **Test expansion protocol** — Healer (diagnose failures), Expander (add edge cases), bug-to-test pipeline (RED first)
- **Parallel review resolution** — Batch review findings by file, resolve in parallel, re-verify after fix
- **Advanced elicitation** — Constraint analysis, inverse thinking, pre-mortem, 5 whys, and more for coaching mode
- **Phase-aware context** — Hooks inject current phase reminders and conventions
- **Session health check** — Opt-in pre-flight build verification at session start (Build loop) catches broken builds before the agent compounds them with new work
- **Visual regression testing** — Optional screenshot capture during Build-loop E2E testing with baseline comparison (manual or pixel-diff)
- **Single-change guardrail** — Explicit constraint preventing simultaneous work on multiple specs in the Build loop unless explicitly parallelizable
- **Phase-scoped evaluation criteria** — Quality rubrics that apply to non-code artifacts (requirements, design, foundation) in addition to code
- **Empirical metrics logging** — JSONL instrumentation in gates, frozen layer validation, and section evaluation for evidence-based harness optimization
- **Document intake** — Opt-in Phase 0 corpus analysis for external reference materials (RFPs, API specs, vendor docs, compliance handbooks) with per-document summaries, DOC-NNN traceability IDs, token-budgeted session-start index (Tier 1.5), and Phase 1 requirement-to-source linking

## Installation

### As a Claude Code Skill

```bash
# Clone the repo
git clone https://github.com/MCKRUZ/claude-code-sdlc.git

# Symlink to your Claude Code skills directory
# Windows
mklink /D "%USERPROFILE%\.claude\skills\claude-code-sdlc" "path\to\claude-code-sdlc"

# macOS/Linux
ln -s /path/to/claude-code-sdlc ~/.claude/skills/claude-code-sdlc
```

### Dependencies

The plugin uses Python scripts via [uv](https://github.com/astral-sh/uv):

```bash
# Install uv (if not already installed)
pip install uv
# or
brew install uv

# Install script dependencies
cd claude-code-sdlc/scripts
uv sync
```

## Quick Start

```
1. /sdlc-setup          → Select profile, initialize .sdlc/ in your project
2. /sdlc                → See Phase 0: Discovery guidance
3. Create artifacts     → Write problem-statement.md in .sdlc/artifacts/00-discovery/
4. /sdlc-gate           → Check if exit criteria are met
5. /sdlc-next           → Advance to Phase 1: Requirements
6. /sdlc-status         → View progress dashboard
```

## Documentation

For in-depth technical documentation, see the guides in [`docs/`](docs/):

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | Plugin anatomy, component relationships, data flow diagrams, two-directory model, progressive disclosure strategy |
| [Phase Lifecycle](docs/phase-lifecycle.md) | All 9 phases in depth — workflows, artifacts, HITL gates, skills, agents, handoff protocol, project type adaptations |
| [Gate System](docs/gate-system.md) | 6-gate validation — integrity, completeness, metrics, compliance, consistency, quality — severity levels, override protocol |
| [Profiles](docs/profiles.md) | Schema reference (every field), built-in profiles, custom profile creation, compliance framework integration, evaluation criteria |
| [Commands](docs/commands.md) | All 11 slash commands — internal flow, state changes, Python scripts called, error scenarios, examples |
| [Agents](docs/agents.md) | 8 custom agents + built-in subagent orchestration, phase-to-agent mapping, parallel execution rules, mandatory spawns |
| [State Machine](docs/state-machine.md) | state.yaml format, transition rules, history tracking, session-handoff.json, sections-progress.json |
| [Templates & Artifacts](docs/templates-artifacts.md) | Template directory structure, per-phase artifact details, handoff document protocol, artifact lifecycle |
| [Scripts](docs/scripts.md) | All Python scripts (incl. `phase_model.py`, the phase-identity source of truth) — CLI args, inputs/outputs, exit codes, gate implementation details, uv runtime |
| [Integrations](docs/integrations.md) | How /deep-plan, /deep-implement, /tdd, /code-review map into SDLC phases, artifact transformation pipeline |
| [Hooks](docs/hooks.md) | Session-start and phase-inject hooks — what they read, what they inject, session continuity, convention reminders |

## Commands

| Command | Purpose |
|---------|---------|
| `/sdlc-setup` | Interactive setup wizard — select profile, initialize project |
| `/sdlc` | Show current phase guidance, next action, required artifacts |
| `/sdlc-status` | Progress dashboard with phase table and completion % |
| `/sdlc-gate` | Run 6-gate exit criteria check (does not advance) |
| `/sdlc-next` | Advance to next phase if all MUST gates pass |
| `/sdlc-enhance` | Generate narrative companions for stakeholder review (optional) |
| `/sdlc-coach` | Interactive coaching mode — adaptive dialogue for current phase |
| `/sdlc-phase-report` | Generate phase HTML report with artifact inventory |
| `/sdlc-review` | Multi-perspective artifact review (council, adversarial, or edge-case modes) |
| `/sdlc-audit` | Analyze gate effectiveness across completed phases |

## Profiles

### microsoft-enterprise
Full enterprise stack with compliance:
- **Stack:** C#/.NET 8, Angular 17, SQL Server, Azure
- **Quality:** 80% coverage minimum, 100% critical paths, TDD required
- **Compliance:** SOC 2 gates at every phase transition
- **Conventions:** Conventional commits, immutable patterns, no console.log
- **Health check:** `dotnet build --no-restore --verbosity quiet` at session start (Build loop)
- **Visual verification:** Screenshot capture with manual baseline comparison
- **Evaluation criteria:** Phase-scoped rubrics for requirements (testability, traceability), design (ADR completeness, interface specificity), foundation (section plan verifiability), and Build-loop code (Result pattern, immutable state, FluentValidation, API docs)

### starter
Minimal profile for quick start:
- **Stack:** Configurable (defaults to TypeScript/Node)
- **Quality:** 60% coverage minimum, no TDD requirement
- **Compliance:** None
- **Conventions:** Conventional commits

### Creating Custom Profiles
Copy `profiles/starter/profile.yaml` and modify for your stack. Validate with:
```bash
uv run scripts/validate_profile.py profiles/my-profile/profile.yaml
```
See `profiles/_schema.yaml` for the full schema.

## Project Types

Phase 0 captures `project_type`, which is stored in `state.yaml` and controls how testing (in the Build loop), Deployment, and Monitoring execute:

| Type | Description | Testing (Build loop) | Deployment (8) | Monitoring (9) |
|------|-------------|----------------------|----------------|----------------|
| `service` | Backend API / server process | Unit + integration + E2E + API contract tests | Staging server deploy + DB migrations | Full infrastructure monitoring + alerting |
| `app` | User-facing application with UI | Same as service | Same as service | Same as service |
| `library` | Shared code package / SDK | Unit tests for public API surface | Package registry publish | Download counts + issue triage |
| `skill` | Claude Code skill / AI plugin | Scenario-based testing against requirement list | File distribution + install verification | Qualitative feedback channels + issue triage |
| `cli` | Command-line tool | Unit + integration + invocation tests | Binary distribution | Same as library |

## SDLC Phases

| # | Phase | Primary Skills | Key Artifacts |
|---|-------|---------------|---------------|
| 0 | Discovery | `/plan` | problem-statement.md, constitution.md (incl. project_type) |
| 1 | Requirements | `/deep-project` | requirements.md, non-functional-requirements.md (with Measurement Basis) |
| 2 | Design | `/deep-plan` | design-doc.md, ADRs |
| 3 | Foundation | `/deep-plan` | foundation-report.md, risk-tier-map.md, cadence-plan.md, build-handoff.md |
| build | Build Loop | `/tdd`, `/code-review`, `/security-review`, `/e2e` | `specs/NNNN-*.md`, phase7-handoff.md (no batch gate — human declares feature-complete) |
| 7 | Documentation | `/update-docs` | README, RUNBOOK |
| 8 | Deployment | CI/CD | release notes (approach varies by project_type) |
| 9 | Monitoring | Manual | monitoring config (approach varies by project_type) |
| close | Close & Transfer | — | final-handoff-report.md, harness-audit.md, close-gate-evidence.md, access-revocation-checklist.md |

## 6-Gate Validation System

Every phase transition runs through six gates:

1. **Integrity** — Required artifacts exist and are well-formed
2. **Completeness** — Artifacts contain all required sections, no placeholders
3. **Metrics** — Quantitative thresholds met (coverage, file size)
4. **Compliance** — Correct labeling (priorities, ADR status, compliance mapping)
5. **Consistency** — Locked metrics checked against frozen layers from prior phases
6. **Quality** — Phase-scoped evaluation criteria from profile (e.g., requirement testability in Phase 1, ADR completeness in Phase 2, code patterns in the Build loop)

All gate results are logged to `.sdlc/metrics/gate-log.jsonl` for empirical tracking of gate effectiveness.

Gates have severity levels:
- **MUST** — Blocks transition if failed
- **SHOULD** — Generates warning
- **MAY** — Informational

## Project Structure

```
claude-code-sdlc/
├── plugin.json              # Plugin manifest
├── SKILL.md                 # Main skill entry point
├── commands/                # 11 slash commands (/sdlc, /sdlc-setup, /sdlc-status, /sdlc-next, /sdlc-gate, /sdlc-enhance, /sdlc-coach, /sdlc-review, /sdlc-phase-report, /sdlc-audit)
├── agents/                  # 8 agents (orchestrator, requirements-analyst, compliance-checker, section-evaluator, narrative-enhancer, gate-repair, multi-reviewer, discovery-analyst)
├── profiles/                # Company/stack YAML profiles
├── phases/                  # Phase definitions (0,1,2,3,build,7,8,9,close)
├── references/              # Progressive disclosure docs
├── templates/               # Artifact templates
├── scripts/                 # Python automation (uv)
└── hooks/                   # PowerShell hooks for context injection
```

## Architecture

This plugin follows **ADR-001: claude-code-sdlc is a Claude Code plugin that executes AI-SDLC methodology.**

- **AI-SDLC** = the methodology (phases, validation, templates)
- **claude-code-sdlc** = the execution engine (commands, hooks, profiles, scripts)
- The plugin references AI-SDLC patterns but adapts them for Claude Code's command/hook/agent system

## Contributing

1. Fork the repo
2. Create a feature branch: `feat/my-feature`
3. Follow the conventional commit format: `type: description`
4. Submit a PR with a clear description

## License

MIT
