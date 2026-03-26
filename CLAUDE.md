# claude-code-sdlc — Development Instructions

## What This Is
A Claude Code plugin that orchestrates the full SDLC lifecycle using company-configurable profiles. It makes the AI-SDLC methodology executable within Claude Code.

## Architecture
- `plugin.json` — Plugin manifest (entry point for Claude Code)
- `SKILL.md` — Main skill definition (loaded when plugin activates)
- `commands/` — Slash commands (`/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`, `/sdlc-enhance`, `/sdlc-coach`, `/sdlc-phase-report`, `/sdlc-audit`)
- `agents/` — Custom agents (orchestrator, requirements-analyst, compliance-checker, section-evaluator, narrative-enhancer)
- `profiles/` — Company/stack YAML configs with compliance gates
- `phases/` — Phase definitions (10 phases, 0–9)
- `references/` — Progressive disclosure docs (loaded on-demand)
- `templates/` — Artifact templates copied to target projects
- `scripts/` — Python automation (uv runtime)
- `hooks/` — PowerShell hooks for session/phase context injection

## Conventions
- Profile YAML validated against `profiles/_schema.yaml`
- Phase definitions use RFC 2119 keywords (MUST/SHOULD/MAY)
- Scripts use Python 3.12+ via uv
- State tracked in target project's `.sdlc/state.yaml`

## Key Features
- **Frozen layers** — Token-efficient phase summaries in `.sdlc/context/layers/` for cross-phase continuity
- **3-tier context** — Foundation (always loaded), frozen layers (per-phase), references (on-demand)
- **6-gate validation** — Integrity, completeness, metrics, compliance, consistency, quality
- **Narrative enhancement** — `/sdlc-enhance` generates stakeholder-friendly `.narrative.md` companions
- **Conversational coaching** — `/sdlc-coach` for adaptive guided dialogue through phases

## Testing
```bash
uv run scripts/validate_profile.py profiles/microsoft-enterprise/profile.yaml
uv run scripts/init_project.py --profile profiles/microsoft-enterprise/profile.yaml --target /tmp/test
uv run scripts/check_gates.py --state /tmp/test/.sdlc/state.yaml --phase 0
uv run scripts/validate_frozen_layer.py --state /tmp/test/.sdlc/state.yaml --phase 0
```
