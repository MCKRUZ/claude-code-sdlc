# claude-code-sdlc

SDLC orchestration plugin for Claude Code. Drives projects through a structured 10-phase software development lifecycle with company-configurable profiles, compliance gates, and quality enforcement.

## Why This Exists

No existing tool combines specification-driven development + quality enforcement + compliance gates + company configurability into one executable workflow. This plugin makes the AI-SDLC methodology executable inside Claude Code.

## Features

- **10 SDLC phases** — Discovery through Monitoring, each with entry/exit gates
- **Project type routing** — Phases 6–9 adapt automatically based on `project_type` (service, app, library, skill, cli)
- **Company profiles** — YAML configs for stack, quality thresholds, compliance, conventions
- **5-gate validation** — Integrity, completeness, metrics, classification, quality checks at every transition
- **NFR measurement basis enforcement** — Every numeric threshold must declare its measurement source; aspirational thresholds require an agreed Phase 6 validation plan
- **Test traceability** — Phase 6 requires scenario-to-requirement mapping and redundancy audit before test execution
- **Compliance enforcement** — SOC 2, HIPAA, GDPR, PCI-DSS gate definitions
- **Skill orchestration** — Maps phases to existing skills (`/deep-plan`, `/deep-implement`, `/tdd`, `/code-review`, `/security-review`, `/e2e`)
- **State machine** — Tracks progress in `.sdlc/state.yaml` with full audit trail
- **Phase-aware context** — Hooks inject current phase reminders and conventions

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

## Commands

| Command | Purpose |
|---------|---------|
| `/sdlc-setup` | Interactive setup wizard — select profile, initialize project |
| `/sdlc` | Show current phase guidance, next action, required artifacts |
| `/sdlc-status` | Progress dashboard with phase table and completion % |
| `/sdlc-gate` | Run 5-gate exit criteria check (does not advance) |
| `/sdlc-next` | Advance to next phase if all MUST gates pass |

## Profiles

### microsoft-enterprise
Full enterprise stack with compliance:
- **Stack:** C#/.NET 8, Angular 17, SQL Server, Azure
- **Quality:** 80% coverage minimum, 100% critical paths, TDD required
- **Compliance:** SOC 2 gates at every phase transition
- **Conventions:** Conventional commits, immutable patterns, no console.log

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

Phase 0 captures `project_type`, which is stored in `state.yaml` and controls how Phases 6–9 execute:

| Type | Description | Phase 6 | Phase 8 | Phase 9 |
|------|-------------|---------|---------|---------|
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
| 3 | Planning | `/deep-plan` | section plans |
| 4 | Implementation | `/deep-implement`, `/tdd` | source code, tests |
| 5 | Quality | `/code-review`, `/security-review` | review reports |
| 6 | Testing | `/e2e`, `/test-coverage` | test plan (with traceability map), coverage report |
| 7 | Documentation | `/update-docs` | README, RUNBOOK |
| 8 | Deployment | CI/CD | release notes (approach varies by project_type) |
| 9 | Monitoring | Manual | monitoring config (approach varies by project_type) |

## 5-Gate Validation System

Every phase transition runs through five gates:

1. **Integrity** — Required artifacts exist and are well-formed
2. **Completeness** — Artifacts contain all required sections, no placeholders
3. **Metrics** — Quantitative thresholds met (coverage, file size)
4. **Classification** — Correct labeling (priorities, ADR status, compliance mapping)
5. **Quality** — Holistic assessment (clarity, accuracy, consistency)

Gates have severity levels:
- **MUST** — Blocks transition if failed
- **SHOULD** — Generates warning
- **MAY** — Informational

## Project Structure

```
claude-code-sdlc/
├── plugin.json              # Plugin manifest
├── SKILL.md                 # Main skill entry point
├── commands/                # /sdlc, /sdlc-setup, /sdlc-status, /sdlc-next, /sdlc-gate
├── agents/                  # orchestrator, requirements-analyst, compliance-checker
├── profiles/                # Company/stack YAML profiles
├── phases/                  # Phase definitions (00–09)
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
