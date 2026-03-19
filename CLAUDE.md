# claude-code-sdlc — Development Instructions

## What This Is
A Claude Code plugin that orchestrates the full SDLC lifecycle using company-configurable profiles. It makes the AI-SDLC methodology executable within Claude Code.

## Architecture
- `plugin.json` — Plugin manifest (entry point for Claude Code)
- `SKILL.md` — Main skill definition (loaded when plugin activates)
- `commands/` — Slash commands (`/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`)
- `agents/` — Custom agents (orchestrator, requirements-analyst, compliance-checker)
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

## Testing
```bash
uv run scripts/validate_profile.py profiles/microsoft-enterprise/profile.yaml
uv run scripts/init_project.py --profile profiles/microsoft-enterprise/profile.yaml --target /tmp/test
uv run scripts/check_gates.py --state /tmp/test/.sdlc/state.yaml --phase 0
```
