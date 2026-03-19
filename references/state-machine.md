# State Machine Reference

## Overview

The SDLC state machine tracks project progress through 10 phases (0–9). State is persisted in `.sdlc/state.yaml` in the target project directory.

## State File Format

```yaml
version: "1.0"
profile_id: "microsoft-enterprise"
project_name: "my-project"
created_at: "2026-03-17T10:00:00Z"

current_phase: 0          # Active phase index
phase_name: "discovery"   # Human-readable phase name

phases:
  0:
    name: discovery
    status: active         # pending | active | completed | skipped
    entered_at: "..."      # ISO 8601 timestamp
    completed_at: null      # null until phase exits
    gate_results:           # Map of gate_id → pass/fail + details
      artifact-check:
        passed: true
        checked_at: "..."
    artifacts:              # Files produced during this phase
      - path: ".sdlc/artifacts/00-discovery/problem-statement.md"
        created_at: "..."

history:                    # Append-only transition log
  - from: 0
    to: 1
    at: "..."
    gate_results: { ... }
```

## Phase Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Phase has not been entered yet |
| `active` | Currently working in this phase |
| `completed` | All exit gates passed, phase done |
| `skipped` | Phase intentionally skipped (requires justification) |

## Transition Rules

1. **Forward only** — phases advance sequentially (0→1→2→...→9). Skipping requires explicit justification recorded in history.
2. **Gate required** — transition from phase N to N+1 requires ALL exit gates for phase N to pass.
3. **Re-entry allowed** — a completed phase MAY be re-entered if issues are discovered. This creates a new history entry with `reentry: true`.
4. **Atomic transitions** — state.yaml is updated atomically. If gate checking fails mid-way, no transition occurs.

## Gate Check Flow

```
/sdlc-next invoked
  → Read state.yaml → get current_phase
  → Load phase-registry.yaml → get exit_gates for current phase
  → Run check_gates.py with phase + profile context
  → For each gate:
      Check artifact existence
      Check artifact completeness (non-empty, required sections)
      Check quality thresholds (coverage, review status)
      Record result in gate_results
  → If ALL gates pass:
      Set current phase status = completed
      Set next phase status = active
      Update current_phase index
      Append to history
  → If ANY gate fails:
      Return failure report with specific blockers
      Suggest remediation actions
```

## Artifact Directories

Each phase stores artifacts in `.sdlc/artifacts/XX-phasename/`:

```
.sdlc/artifacts/
├── 00-discovery/
│   ├── problem-statement.md
│   └── stakeholder-notes.md
├── 01-requirements/
│   ├── requirements.md
│   └── acceptance-criteria.md
├── 02-design/
│   ├── design-doc.md
│   ├── api-contracts.md
│   └── adrs/
├── 03-planning/
│   └── section-plans/
├── 04-implementation/
│   └── (source code — tracked via git)
├── 05-quality/
│   └── review-reports/
├── 06-testing/
│   ├── test-results/
│   └── coverage-report/
├── 07-documentation/
├── 08-deployment/
│   └── release-notes.md
└── 09-monitoring/
    └── monitoring-config.md
```

## Commands That Modify State

| Command | Effect on State |
|---------|----------------|
| `/sdlc-setup` | Creates initial state.yaml |
| `/sdlc-next` | Advances current_phase if gates pass |
| `/sdlc-gate` | Records gate_results but does NOT advance |
| `/sdlc-status` | Read-only — no state changes |
| `/sdlc` | Read-only — no state changes |
