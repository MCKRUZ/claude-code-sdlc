# claude-code-sdlc — Development Instructions

## What This Is
A Claude Code plugin that orchestrates the full SDLC lifecycle using company-configurable profiles. It makes the AI-SDLC methodology executable within Claude Code.

## Architecture
- `plugin.json` — Plugin manifest (entry point for Claude Code)
- `SKILL.md` — Main skill definition (loaded when plugin activates)
- `commands/` — 12 slash commands (`/sdlc`, `/sdlc-setup`, `/sdlc-status`, `/sdlc-next`, `/sdlc-gate`, `/sdlc-enhance`, `/sdlc-coach`, `/sdlc-review`, `/sdlc-intake`, `/sdlc-brief`, `/sdlc-phase-report`, `/sdlc-audit`)
- `agents/` — 8 agents (orchestrator, requirements-analyst, compliance-checker, section-evaluator, narrative-enhancer, gate-repair, multi-reviewer, discovery-analyst)
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

## Design Rule: Standalone or Workflow
Every agent and command is a library part, not just a pipeline stage. Each one MUST be runnable
two ways: (1) composed into the phase workflow (reading `.sdlc/state.yaml` and the intake
catalog), and (2) standalone, pointed at arbitrary inputs with no `.sdlc/` present (degrade
gracefully: provisional IDs, explicit output paths, note the missing context in output headers).
When adding a new agent or command, document both modes in its file. `discovery-analyst` /
`/sdlc-brief --docs <path>` is the reference implementation of this pattern.

## Key Features
- **Frozen layers** — Token-efficient phase summaries in `.sdlc/context/layers/` for cross-phase continuity
- **3-tier context** — Foundation (always loaded), frozen layers (per-phase), references (on-demand)
- **6-gate validation** — Integrity, completeness, metrics, compliance, consistency, quality
- **Narrative enhancement** — `/sdlc-enhance` generates stakeholder-friendly `.narrative.md` companions
- **Conversational coaching** — `/sdlc-coach` for adaptive guided dialogue through phases
- **Artifact checksums** — SHA-256 dirty tracking; gate checks skip unchanged artifacts
- **Smart repair** — `gate-repair` agent auto-fixes structural gate failures (missing templates, placeholders)
- **Dependency enforcement** — `check_dependencies.py` validates section DAG and implementation order
- **Multi-perspective review** — `/sdlc-review` with adversarial, edge-case, and council modes
- **Brownfield detection** — Auto workspace scan in Phase 0 for existing codebases
- **Structured error specs** — Accepts/Returns/Errors required for P0/P1 requirements
- **Cross-artifact validation** — File reference checking between markdown artifacts
- **Question-to-file** — HITL open questions persisted to `open-questions.md` for audit trail
- **Test expansion** — Healer/Expander/bug-to-test patterns in Phase 6
- **Parallel review resolution** — Batch review findings by file in Phase 5
- **Session health check** — Opt-in pre-flight build verification in Phase 4 Step 0 (agent-executed, cross-platform)
- **Visual regression testing** — Optional screenshot capture in Phase 6 with baseline comparison (requires orchestrator integration)
- **Single-section guardrail** — Intentionally redundant constraints preventing concurrent section work in Phase 4
- **Phase-scoped evaluation criteria** — `evaluation_criteria` with optional `phases` array for non-code artifact quality rubrics
- **Empirical metrics** — JSONL logging in `check_gates.py`, `validate_frozen_layer.py`, and `section-evaluator` agent to `.sdlc/metrics/`
- **Document intake** — Opt-in corpus analysis in Phase 0: scans external docs (RFPs, API specs, vendor docs), generates per-doc summaries with DOC-NNN IDs, creates token-budgeted intake index (Tier 1.5), enables Phase 1 requirement-to-source traceability

## Testing
```bash
uv run scripts/validate_profile.py profiles/microsoft-enterprise/profile.yaml
uv run scripts/init_project.py --profile profiles/microsoft-enterprise/profile.yaml --target /tmp/test
uv run scripts/check_gates.py --state /tmp/test/.sdlc/state.yaml --phase 0
uv run scripts/validate_frozen_layer.py --state /tmp/test/.sdlc/state.yaml --phase 0
uv run scripts/track_artifacts.py --state /tmp/test/.sdlc/state.yaml --snapshot
uv run scripts/check_dependencies.py --state /tmp/test/.sdlc/state.yaml
uv run scripts/intake_documents.py --state /tmp/test/.sdlc/state.yaml
```
