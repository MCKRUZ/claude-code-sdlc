# /deep-plan Integration Reference

How the `/deep-plan` skill integrates with SDLC Phases 2–3. This is the authoritative reference for artifact mapping, HITL gate alignment, checkpoint mechanism, and troubleshooting.

## Architecture: Split Invocation

`/deep-plan` runs twice — once per phase — to respect the SDLC gate boundary:

| Phase | /deep-plan Steps | What It Produces |
|-------|-----------------|-----------------|
| Phase 2 (Design) | 1–15: Setup → Research → Interview → Spec → Plan → External Review | `claude-plan.md`, `claude-research.md`, `claude-interview.md`, `reviews/` |
| Phase 3 (Planning) | 16–22: TDD Planning → Section Index → Section Generation | `claude-plan-tdd.md`, `sections/index.md`, `sections/section-NN-*.md` |

A checkpoint file bridges the two phases: `.sdlc/artifacts/02-design/deep-plan-checkpoint.yaml`.

## Artifact Mapping

### Phase 2: /deep-plan → SDLC Design Artifacts

| /deep-plan Output | SDLC Artifact | Mapping |
|---|---|---|
| `planning/claude-plan.md` | `02-design/design-doc.md` | Transform: extract architecture sections into skeleton |
| `planning/claude-plan.md` | `02-design/api-contracts.md` | Transform: extract API/interface content |
| `planning/claude-plan.md` | `02-design/phase3-handoff.md` | Transform: extract section boundaries |
| `planning/claude-research.md` | `02-design/research-notes.md` | Copy (optional) |
| `planning/claude-integration-notes.md` | `02-design/integration-notes.md` | Copy (optional) |
| `planning/reviews/` | `02-design/external-reviews/` | Copy (optional) |
| (generated) | `02-design/deep-plan-checkpoint.yaml` | New: session state for Phase 3 |

### Phase 3: /deep-plan → SDLC Planning Artifacts

| /deep-plan Output | SDLC Artifact | Mapping |
|---|---|---|
| `planning/sections/section-NN-*.md` | `03-planning/section-plans/SECTION-NNN.md` | Transform: converge into SDLC template |
| `planning/claude-plan-tdd.md` | `03-planning/tdd-plan.md` | Copy (optional) |
| `planning/sections/index.md` | `03-planning/dependency-map.md` | Copy (optional) |

### Transformation Scripts

```bash
# Phase 2: after /deep-plan steps 1-15 complete
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 2 --planning-dir planning/

# Phase 3: after /deep-plan steps 16-22 complete
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 3 --planning-dir planning/
```

Both scripts are idempotent — safe to re-run if /deep-plan outputs are updated.

## Spec Synthesis

Phase 1 produces three artifacts that must be combined into a single spec for `/deep-plan`:

```bash
uv run scripts/synthesize_spec.py --state .sdlc/state.yaml --output planning/spec.md
```

**Sources:** `requirements.md`, `non-functional-requirements.md`, `epics.md`, `constraints.md`, `phase2-handoff.md`

## HITL Gate Alignment

| /deep-plan Checkpoint | SDLC HITL Gate | Resolution |
|---|---|---|
| Steps 8–9: Interview | Phase 2 Step 0: Resolve AQ-NNs | SDLC gate runs first; answers feed into /deep-plan interview |
| Step 15: Human review of plan | Phase 2 exit gate (manual) | /deep-plan plan review satisfies the SDLC manual gate |
| Step 13: External multi-LLM review | No SDLC equivalent | Preserved; outputs stored as optional artifacts |
| Step 18: Section boundary config | Phase 3 Step 0: Approve boundaries | Same checkpoint — SDLC gate feeds approved boundaries to /deep-plan |

## Checkpoint Mechanism

The checkpoint file (`deep-plan-checkpoint.yaml`) contains:

```yaml
version: "1.0"
created_at: "2026-03-23T10:00:00+00:00"
planning_dir: "/absolute/path/to/planning"
completed_through_step: 15
session_id: "deep-session-id-or-null"
files:
  spec: "planning/spec.md"
  research: "planning/claude-research.md"
  interview: "planning/claude-interview.md"
  plan: "planning/claude-plan.md"
  integration_notes: "planning/claude-integration-notes.md"
```

Phase 3 reads this to locate the planning directory and resume context.

## Section Format Convergence

SDLC sections use structured fields (Goal, Epics, Dependencies, Interfaces). /deep-plan sections use self-contained prose. The converged template (`SECTION-template-deep-plan.md`) is a superset:

- **SDLC structured fields** wrap the section for gate validation and traceability
- **Implementation Guidance** section carries the full /deep-plan prose verbatim
- **TDD Test Stubs** section carries the relevant slice of `claude-plan-tdd.md`
- `/deep-implement` reads the Implementation Guidance section as its primary input

## Troubleshooting

**"claude-plan.md not found" during Phase 2 mapping:**
Ensure `/deep-plan` completed through step 15. Check `planning/` directory for the file.

**"No SECTION_MANIFEST found" during Phase 3 mapping:**
Ensure `/deep-plan` completed step 18 (section index creation). Check `planning/sections/index.md` for the `<!-- SECTION_MANIFEST ... -->` block.

**Gate check fails on design-doc.md with "contains placeholder content":**
The mapping script generates skeletons with `<!-- FILL: -->` markers. Complete these sections before running the gate check.

**Phase 3 can't find checkpoint:**
Ensure Phase 2 mapping completed. Check `.sdlc/artifacts/02-design/deep-plan-checkpoint.yaml` exists.

**Section count mismatch:**
The mapping script transforms every `section-NN-*.md` file found in `planning/sections/`. If the human approved a different boundary set in Phase 3 Step 0, the /deep-plan section generation should match. If not, re-run /deep-plan's section splitting with the correct boundaries.
