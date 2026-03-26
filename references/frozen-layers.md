# Frozen Layers Reference

Frozen layers are token-efficient condensed summaries of completed phase artifacts. They enable cross-phase context continuity without reloading full artifacts.

## When Generated

After all phase gates pass and the user gives HITL sign-off, but **before** `advance_phase.py` runs. The `/sdlc-next` command orchestrates this.

## Token Budget

| Constraint | Value |
|-----------|-------|
| Target | 1500–2000 tokens |
| Hard minimum | 1000 tokens |
| Hard maximum | 2500 tokens |
| Estimation | word_count × 1.3 (used by both Claude and the validator) |

## Output Location

```
.sdlc/context/layers/phase{N}-{name}.md
```

Examples: `phase0-discovery.md`, `phase1-requirements.md`, `phase4-implementation.md`

## Template

Use `templates/frozen-layer.md` from the plugin directory. The template provides YAML frontmatter and section structure. Claude fills in the content by reading all artifacts from the completed phase.

## Mandatory Sections

### 1. Decision
The gate decision (GO/CONDITIONAL_GO) with score and any conditions.

### 2. Key Outcomes
2-3 bullet points summarizing what this phase produced. Focus on decisions made and artifacts created, not process steps taken.

### 3. Locked Metrics
Explicit values for budget, timeline, scope, and stakeholders — ONLY if established in this phase. These values are checked by the G5-consistency gate in subsequent phases. Changes require a decision log entry.

### 4. Constraints Carried Forward
Non-negotiable constraints that affect downstream phases. Include technology constraints, compliance requirements, and organizational boundaries.

### 5. Risks & Mitigations
Active risks with severity, current mitigation status, and whether they're resolved or carried forward.

### 6. Artifact Summary
One-line summary per major artifact produced in the phase.

### 7. Traceability Footer
Maps each source artifact to the sections extracted from it. This enables verification — every claim in the frozen layer traces to a specific artifact.

## Condensation Strategy

Priority order when approaching the token budget:
1. **Locked Metrics** — always include, never cut
2. **Constraints** — include all non-negotiable constraints
3. **Risks** — include active/unresolved risks; omit fully mitigated ones
4. **Key Outcomes** — condense to shorter bullets if needed
5. **Artifact Summary** — omit optional artifacts first

### Good Condensation

- "Budget: $50K, approved by CTO, covers MVP only" (specific, traceable)
- "Must support 1000 concurrent users (NFR-003)" (ties to requirement ID)

### Bad Condensation

- "Budget was discussed and a number was agreed upon" (vague, no value)
- "Performance requirements exist" (no specifics, useless downstream)

## Validation

After generating, run:
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/validate_frozen_layer.py \
  --state .sdlc/state.yaml --phase <N>
```

The validator checks: file exists, YAML frontmatter is parseable, required fields present, token estimate within range, traceability references exist.

## Token Estimation

Claude cannot directly count tokens. Use **word count × 1.3** as the estimation formula. The validator (`validate_frozen_layer.py`) uses the same formula, ensuring consistency between what Claude declares in the `estimated_tokens` frontmatter field and what the validator checks.

## Immutability

Once created, frozen layers are **never modified**. If a phase needs to be revisited, a new frozen layer replaces the old one (see Phase Re-Entry below).

## Phase Re-Entry

If a phase is re-entered (e.g., returning to Phase 2 after Phase 4 reveals a design flaw):

1. The existing frozen layer for that phase is renamed with a `.superseded` suffix:
   `phase2-design.md` → `phase2-design.md.superseded`
2. When the re-entered phase completes and gates pass again, a new frozen layer is generated at the original filename
3. The `.superseded` file is kept for audit trail but is never loaded by the session-start hook (the glob `phase*.md` won't match `.md.superseded`)

The `/sdlc-next` command handles this automatically — if a frozen layer already exists for the completing phase, it renames the old one before writing the new one.

## Upgrading Existing Projects

If your project was initialized before frozen layer support, the `.sdlc/context/` directory won't exist. Create it manually:

```bash
mkdir -p .sdlc/context/layers
```

Frozen layers will be generated on the next `/sdlc-next` phase transition. The session-start hook gracefully handles the absence of frozen layers — it simply skips Tier 2 loading.
