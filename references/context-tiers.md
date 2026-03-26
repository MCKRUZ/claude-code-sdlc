# Context Tiers Reference

The SDLC plugin uses a 3-tier context architecture to manage token budget across phases. Each tier has a different loading strategy and token budget.

## Architecture

| Tier | Name | When Loaded | Token Budget | Source |
|------|------|-------------|-------------|--------|
| 1 | Foundation | Always (session start) | ~500 tokens | state.yaml + profile.yaml + constitution.md |
| 2 | Frozen Layers | Session start (recent 3) | ~2K per layer | `.sdlc/context/layers/` |
| 3 | Reference | On-demand | Unbounded | `references/` directory in plugin |

## Tier 1: Foundation (Always Loaded)

Loaded automatically by the session-start hook. Contains:

- **Project identity:** name, profile ID, current phase
- **Phase status:** artifact count, completion state
- **Constitution extract:** first ~375 words of `.sdlc/constitution.md` (mission, principles, constraints)

The foundation provides enough context for Claude to orient itself in the project without loading any phase-specific detail.

**Source files:**
- `.sdlc/state.yaml`
- `.sdlc/profile.yaml`
- `.sdlc/constitution.md`

## Tier 2: Frozen Layers (Per-Phase)

Loaded automatically by the session-start hook for the **most recent 3 completed phases**. Contains condensed phase summaries with locked metrics, constraints, and key decisions.

**Why only 3?** With 10 phases and ~2K tokens per layer, loading all completed layers could consume 20K tokens. Capping at 3 keeps Tier 2 under ~6K tokens while providing the most relevant context.

**Loading order:** Most recent 3 completed phases, loaded in chronological order (oldest first).

**To access older layers:** Read them on-demand from `.sdlc/context/layers/` — they exist on disk, just aren't auto-loaded.

**Source files:**
- `.sdlc/context/layers/phase{N}-{name}.md`

## Tier 3: Reference (On-Demand)

Not loaded at session start. Claude reads reference docs from the plugin's `references/` directory when specific guidance is needed (e.g., validation rules, compliance frameworks, agent roster).

This is the existing behavior — no change needed. The tier designation formalizes what was already implicit.

**Source files:**
- `references/*.md` in the plugin directory

## Loading Precedence

```
Session Start:
  1. Foundation (always)        → ~500 tokens
  2. Frozen Layers (recent 3)   → ~6K tokens max
                                   ─────────────
                                   ~6.5K total auto-loaded

During Work:
  3. References (on-demand)     → loaded as needed
```

## Hook Implementation

The session-start hook (`hooks/sdlc-session-start.ps1`) implements Tier 1+2 loading. Output is tagged:

- `[SDLC-CONTEXT:FOUNDATION]` — Tier 1 content
- `[SDLC-CONTEXT:LAYERS]` — Tier 2 summary
- `[SDLC-CONTEXT:LAYER:{name}]` — Individual layer content

These tags allow Claude to identify the source tier of any context in its prompt.
