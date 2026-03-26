# State Machine Documentation

Comprehensive reference for the SDLC plugin's state management system. All project lifecycle state is tracked in a single YAML file that serves as the source of truth for phase progress, gate results, artifact tracking, and transition history.

---

## Table of Contents

1. [State Management Overview](#1-state-management-overview)
2. [state.yaml Format](#2-stateyaml-format)
3. [State Initialization](#3-state-initialization)
4. [Phase Statuses](#4-phase-statuses)
5. [Transition Rules](#5-transition-rules)
6. [Transition Flow (advance_phase.py)](#6-transition-flow-advance_phasepy)
7. [Gate System Integration](#7-gate-system-integration)
8. [History Tracking](#8-history-tracking)
9. [session-handoff.json (Phase 4 Continuity)](#9-session-handoffjson-phase-4-continuity)
10. [sections-progress.json (Phase 4 Tracking)](#10-sections-progressjson-phase-4-tracking)
11. [State Diagram](#11-state-diagram)
12. [Cross-References](#12-cross-references)

---

## 1. State Management Overview

The SDLC plugin uses a file-based state machine to track a project's progress through 10 sequential phases (0-9). Key principles:

- **Single file**: All state lives in `.sdlc/state.yaml` inside the target project. This is the only mutable state file for phase progression.
- **Single source of truth**: Phase progress, gate results, artifact lists, and transition history are all co-located. No external database or service is involved.
- **Atomic writes**: Scripts read the entire file, modify in memory, and write back atomically using `yaml.dump()`. There are no partial updates -- either the full state is written or the file is unchanged.
- **Profile separation**: The selected company profile is frozen at initialization time into `.sdlc/profile.yaml` and is never modified after creation. State and profile are read independently by scripts.
- **Artifact isolation**: Phase artifacts are stored in `.sdlc/artifacts/<NN>-<phase-name>/` directories, separate from state. The state file tracks artifact paths but does not contain artifact content.

### File Layout in Target Project

```
.sdlc/
  state.yaml          # Mutable -- phase progress and history
  profile.yaml         # Immutable -- frozen copy of selected profile
  constitution.md      # Project constitution (from template)
  artifacts/
    00-discovery/      # Phase 0 artifacts
    01-requirements/   # Phase 1 artifacts
    02-design/         # Phase 2 artifacts
    03-planning/       # Phase 3 artifacts
    04-implementation/ # Phase 4 artifacts (includes session-handoff.json, sections-progress.json)
    05-quality/        # Phase 5 artifacts
    06-testing/        # Phase 6 artifacts
    07-documentation/  # Phase 7 artifacts
    08-deployment/     # Phase 8 artifacts
    09-monitoring/     # Phase 9 artifacts
```

---

## 2. state.yaml Format

Below is the complete structure with every field documented. Fields use ISO 8601 timestamps in UTC.

```yaml
version: "1.0"                      # Schema version for forward compatibility
profile_id: "microsoft-enterprise"   # ID of the profile selected during /sdlc-setup
project_name: "My Project"           # Human-readable project name, set during /sdlc-setup
created_at: "2026-03-20T10:00:00Z"   # ISO 8601 timestamp when state was initialized
project_type: "service"              # Set during Phase 0 discovery; one of: service | app | library | skill | cli
                                     # Starts as null, populated when project type is determined

current_phase: 4                     # Integer (0-9) indicating the currently active phase
phase_name: "implementation"         # Human-readable name of the current phase (mirrors registry)

phases:                              # Map of phase_id (int) to phase tracking data
  0:
    name: discovery                  # Phase name from registry
    status: completed                # One of: pending | active | completed | skipped
    entered_at: "2026-03-20T10:00:00Z"   # When this phase became active
    completed_at: "2026-03-21T14:30:00Z" # When this phase was completed (null while active/pending)
    gate_results:                    # Results from the last gate check run (map or list)
      - gate: "G1-integrity"        #   Gate identifier
        artifact: "constitution.md"  #   Artifact being checked
        passed: true                 #   true = passed, false = failed, null = manual review needed
        message: "Artifact exists and is non-empty" # Human-readable explanation
        severity: "MUST"             #   MUST = blocking, SHOULD = advisory, MAY = informational
      - gate: "G2-completeness"
        artifact: "problem-statement.md"
        passed: true
        message: "Artifact exists and has content"
        severity: "MUST"
    artifacts:                       # List of artifact filenames produced in this phase
      - "constitution.md"
      - "problem-statement.md"
      - "stakeholder-map.md"
      - "phase1-handoff.md"
  1:
    name: requirements
    status: completed
    entered_at: "2026-03-21T15:00:00Z"
    completed_at: "2026-03-22T11:00:00Z"
    gate_results: [...]              # Same structure as above
    artifacts:
      - "requirements-spec.md"
      - "acceptance-criteria.md"
      - "phase2-handoff.md"
  # ... phases 2, 3 follow the same pattern
  4:
    name: implementation
    status: active                   # Currently active phase
    entered_at: "2026-03-25T10:00:00Z"
    completed_at: null               # null because phase is not yet complete
    gate_results: {}                 # Empty until /sdlc-gate is run
    artifacts: []                    # Populated as artifacts are created
  5:
    name: quality
    status: pending                  # Not yet reached
    entered_at: null
    completed_at: null
    gate_results: {}
    artifacts: []
  # ... phases 6-9 follow with status: pending

history:                             # Append-only transition log (see Section 8)
  - from: 0
    to: 1
    at: "2026-03-21T14:30:00Z"
    gate_results:
      passed: 6
      failed: 0
      manual: 1
    justification: "All gates passed, user confirmed"
  - from: 1
    to: 2
    at: "2026-03-22T11:00:00Z"
    gate_results:
      passed: 8
      failed: 0
      manual: 0
  # ... one entry per transition
```

### Field-by-Field Reference

| Field | Type | Set By | Mutability | Description |
|-------|------|--------|------------|-------------|
| `version` | string | init_project.py | Immutable | Schema version, currently "1.0" |
| `profile_id` | string | init_project.py | Immutable | Profile selected at setup |
| `project_name` | string | init_project.py | Immutable | Project name from user input or directory name |
| `created_at` | string | init_project.py | Immutable | ISO 8601 creation timestamp |
| `project_type` | string/null | Phase 0 work | Set once | Determined during discovery; null until set |
| `current_phase` | int | advance_phase.py | Updated on transition | Active phase index (0-9) |
| `phase_name` | string | advance_phase.py | Updated on transition | Human-readable name of current phase |
| `phases[N].name` | string | init_project.py | Immutable | Phase name from registry |
| `phases[N].status` | string | advance_phase.py | Updated on transition | pending, active, completed, or skipped |
| `phases[N].entered_at` | string/null | advance_phase.py | Set once per entry | Timestamp when phase became active |
| `phases[N].completed_at` | string/null | advance_phase.py | Set once per completion | Timestamp when phase was completed |
| `phases[N].gate_results` | list/map | check_gates.py | Overwritten each gate run | Results from most recent gate evaluation |
| `phases[N].artifacts` | list | Commands/agents | Appended | Filenames of artifacts produced |
| `history[]` | list | advance_phase.py | Append-only | Transition log entries |

---

## 3. State Initialization

State initialization occurs when a user runs `/sdlc-setup`, which calls `init_project.py`.

### Process

1. **Read profile**: `init_project.py` loads the selected profile YAML (e.g., `profiles/microsoft-enterprise/profile.yaml`).
2. **Read template**: The template at `templates/state-init.yaml` is read as raw text.
3. **Variable substitution**: Three placeholders are replaced:
   - `${PROFILE_ID}` -- from `profile.company.profile_id`
   - `${PROJECT_NAME}` -- from `--name` argument or target directory name
   - `${CREATED_AT}` -- current UTC timestamp in ISO 8601 format
4. **Write state file**: The substituted content is written to `.sdlc/state.yaml`.
5. **Freeze profile**: The full profile YAML is copied to `.sdlc/profile.yaml` (never modified after this point).
6. **Create directories**: All 10 artifact directories (`00-discovery` through `09-monitoring`) are created under `.sdlc/artifacts/`.

### Initial State

After initialization, the state has these properties:

- `current_phase`: 0
- `phase_name`: "discovery"
- `project_type`: null (set during Phase 0 when the project type is determined)
- Phase 0 status: `active` with `entered_at` set to creation timestamp
- Phases 1-9 status: `pending` with `entered_at` and `completed_at` both null
- All `gate_results`: empty map `{}`
- All `artifacts`: empty list `[]`
- `history`: empty list `[]`

---

## 4. Phase Statuses

Each phase has one of four statuses:

| Status | Meaning | entered_at | completed_at |
|--------|---------|------------|--------------|
| `pending` | Phase has not been reached yet | null | null |
| `active` | Phase is currently in progress | Set | null |
| `completed` | Phase finished, all gates passed | Set | Set |
| `skipped` | Phase was explicitly skipped with justification | Set | Set |

Only one phase can be `active` at any time. Skipping requires explicit justification recorded in the transition history.

---

## 5. Transition Rules

Four invariants govern all phase transitions:

### Rule 1: Forward Only
Phases advance sequentially: 0 -> 1 -> 2 -> ... -> 9. The system does not support backward transitions through the normal advance flow. Skipping a phase requires explicit justification recorded in history.

### Rule 2: Gate Required
Every transition from phase N to phase N+1 requires ALL exit gates with `severity: MUST` to pass. Gates with `severity: SHOULD` or `severity: MAY` produce warnings but do not block advancement.

### Rule 3: Atomic Transitions
State updates are all-or-nothing. The `advance_phase.py` script performs all state mutations in memory and writes the entire file in a single `yaml.dump()` call. If gate checking fails or any error occurs before the write, the state file remains unchanged.

### Rule 4: Re-entry Allowed
If issues are discovered in a later phase that require revisiting an earlier phase, re-entry is permitted. This creates a new history entry with `reentry: true`, distinguishing it from the original forward progression. The re-entered phase's status returns to `active`.

### Rule 5: Manual Approval
Some phases require explicit human sign-off before transition. The `phase-registry.yaml` specifies `approval: manual` or `approval: automatic` for each phase's exit gate. Manual approval is enforced by requiring the `--confirmed` flag in `advance_phase.py`.

Phases requiring manual approval (per the default registry):
- Phase 0 (Discovery): manual
- Phase 1 (Requirements): manual
- Phase 2 (Design): manual
- Phase 3 (Planning): manual
- Phase 9 (Monitoring): manual

---

## 6. Transition Flow (advance_phase.py)

The `advance_phase.py` script implements the complete transition logic. It accepts two arguments: `--state` (path to state.yaml) and optionally `--confirmed` (human sign-off flag).

### Step-by-Step Execution

```
1. LOAD STATE
   - Read .sdlc/state.yaml
   - Read .sdlc/profile.yaml
   - Extract current_phase from state

2. BOUNDARY CHECK
   - If current_phase >= 9: print "already complete", exit 0

3. RUN GATE CHECKS
   - Call check_phase_gates(current_phase, state, profile, artifacts_base)
   - Print formatted gate results

4. EVALUATE MUST GATES
   - Collect all results where passed == false AND severity == "MUST"
   - If any MUST failures exist:
     Print "BLOCKED" with failure count
     Exit with code 1 (gate failure)

5. EVALUATE MANUAL GATES
   - Collect all results where passed == null (manual review needed)
   - If manual gates exist AND --confirmed is NOT set:
     Print "REVIEW REQUIRED" with list of manual gates
     Print instructions for stakeholder review
     Exit with code 1

6. DRY RUN CHECK
   - If --confirmed is NOT set (and no blockers):
     Print "Dry run complete -- all automated gates passed"
     Print instructions to re-run with --confirmed
     Exit with code 0

7. ADVANCE STATE (only reached with --confirmed and all MUST gates passing)
   a. Set phases[current_phase].status = "completed"
   b. Set phases[current_phase].completed_at = current UTC timestamp
   c. Store gate result summary in phases[current_phase].gate_results
   d. Set phases[next_phase].status = "active"
   e. Set phases[next_phase].entered_at = current UTC timestamp
   f. Increment current_phase by 1
   g. Update phase_name to next phase's name
   h. Append transition entry to history[] array

8. WRITE STATE
   - Write entire state dict to state.yaml via yaml.dump()

9. OUTPUT GUIDANCE
   - Print confirmation of transition
   - Display next phase: name, description, skills, required artifacts
   - Print artifact directory path and phase definition file reference
```

### Return Codes

| Code | Meaning |
|------|---------|
| 0 | Success (advanced) or dry run passed |
| 1 | Gate failure (MUST gates failed or manual approval needed) |
| 2 | System error (missing profile, missing phase definition, file not found) |

---

## 7. Gate System Integration

Gate checks are performed by `check_gates.py` and are invoked both by `/sdlc-gate` (standalone check) and by `advance_phase.py` (as part of transition).

### Gate Types

| Gate ID | Name | What It Checks | Severity |
|---------|------|----------------|----------|
| G1-integrity | Artifact Integrity | Required artifacts exist on disk | MUST |
| G2-completeness | Artifact Completeness | Required artifacts are non-empty and have expected content | MUST |
| G3-metrics | Quality Metrics | Code coverage, test pass rates (Phases 5-6 only) | MUST |
| G4-compliance | Compliance | Framework-specific requirements from profile (e.g., SOC2, HIPAA) | Varies |
| G5-quality | Quality Standards | Profile-defined quality thresholds | SHOULD |

### Gate Result Structure

Each gate check produces a result object:

```yaml
gate: "G1-integrity"          # Gate identifier
artifact: "requirements.md"   # What was checked (artifact name or check description)
passed: true                  # true | false | null (null = manual review required)
message: "Artifact exists"    # Human-readable explanation
severity: "MUST"              # MUST | SHOULD | MAY
```

### Severity Levels (RFC 2119)

- **MUST**: Blocking. Transition is prevented if any MUST gate fails.
- **SHOULD**: Advisory. Produces a warning but does not block transition.
- **MAY**: Informational. Logged for completeness, never blocks.

### Phase-Specific Gate Behavior

- **Phase 4 (Implementation)**: Additional SHOULD-level check validates `sections-progress.json` consistency -- verifying that `completed_sections` count matches the actual number of sections with `status: "complete"`.
- **Phases 5-6 (Quality/Testing)**: G3-metrics checks profile quality thresholds such as `coverage_minimum`.
- **Compliance phases**: G4-compliance loads framework-specific gates from `profiles/<id>/compliance/<framework>-gates.yaml`.

---

## 8. History Tracking

The `history` array in state.yaml is an append-only audit trail of every phase transition. Entries are never modified or deleted after writing.

### History Entry Structure

```yaml
- from: 3                              # Source phase ID
  to: 4                                # Destination phase ID
  at: "2026-03-25T10:00:00Z"           # ISO 8601 transition timestamp
  gate_results:                         # Summary counts (not full results)
    passed: 12                          #   Number of gates that passed
    failed: 0                           #   Number of gates that failed
    manual: 1                           #   Number of manual-review gates
  justification: "All gates passed"     # Human-readable reason for transition
```

### Re-entry Entries

When a completed phase is re-entered, the history entry includes `reentry: true`:

```yaml
- from: 5
  to: 3
  at: "2026-03-28T09:00:00Z"
  reentry: true
  justification: "Design issue discovered during quality review, re-entering planning"
```

### Audit Analysis

The `audit_gates.py` script reads the complete history and gate results to produce an effectiveness report. It analyzes:

- Gate pass/fail rates across all completed phases
- Override history (gates that were overridden with justification)
- Patterns suggesting gates that are always passing (may be too lenient) or frequently failing (may need adjustment)

The audit report is used for process improvement and is typically run after several phases are complete or at project retrospective (Phase 9).

---

## 9. session-handoff.json (Phase 4 Continuity)

Located at: `.sdlc/artifacts/04-implementation/session-handoff.json`

Implementation (Phase 4) often spans multiple Claude Code sessions. The session handoff file provides cross-session continuity so that each new session can pick up where the last one left off.

### Complete Schema

```json
{
  "$schema": "session-handoff-v1",
  "phase": 4,
  "last_updated": "2026-03-26T15:00:00Z",
  "session_number": 3,
  "overall_status": "in_progress",
  "current_sprint": 2,
  "sections": [
    {
      "id": "SECTION-001",
      "name": "Authentication Service",
      "status": "complete",
      "agent": "deep-implement",
      "started_at": "2026-03-25T10:00:00Z",
      "completed_at": "2026-03-25T14:30:00Z",
      "evaluator_result": "passed",
      "notes": "TDD approach, 94% coverage"
    },
    {
      "id": "SECTION-004",
      "name": "API Gateway",
      "status": "in_progress",
      "agent": "deep-implement",
      "started_at": "2026-03-26T09:00:00Z",
      "completed_at": null,
      "evaluator_result": null,
      "notes": "Data layer complete, routing in progress"
    }
  ],
  "completed_this_session": ["SECTION-003"],
  "in_progress": ["SECTION-004"],
  "blocked": [],
  "next_actions": [
    {
      "action": "Complete API Gateway routing layer",
      "section": "SECTION-004",
      "priority": "P0",
      "context": "Data layer done, need route definitions and middleware"
    },
    {
      "action": "Write integration tests for SECTION-003",
      "section": "SECTION-003",
      "priority": "P1",
      "context": "Unit tests complete, integration tests deferred"
    }
  ],
  "blockers": [
    {
      "description": "Waiting for API schema from backend team",
      "section": "SECTION-005",
      "resolved": false
    }
  ],
  "decisions_this_session": [
    "Chose WebSocket over SSE for real-time updates"
  ],
  "deviations_this_session": [],
  "context_for_next_session": "SECTION-004 routing layer is 60% done. Start with route registration in gateway.ts."
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `$schema` | string | Schema identifier, always "session-handoff-v1" |
| `phase` | int | Always 4 (implementation) |
| `last_updated` | string/null | ISO 8601 timestamp of last update |
| `session_number` | int | Incremented each session |
| `overall_status` | string | "in_progress", "blocked", or "complete" |
| `current_sprint` | int | Active sprint number from the sprint plan |
| `sections[]` | array | Per-section tracking with status, agent, timestamps |
| `completed_this_session` | array | Section IDs finished in the current/last session |
| `in_progress` | array | Section IDs actively being worked |
| `blocked` | array | Section IDs that cannot proceed |
| `next_actions[]` | array | Prioritized action items for the next session |
| `blockers[]` | array | Active blockers with resolution status |
| `decisions_this_session` | array | Technical decisions made during the session |
| `deviations_this_session` | array | Deviations from the original plan |
| `context_for_next_session` | string | Free-text context for session continuity |

### Hook Integration

The `sdlc-session-start.ps1` hook reads this file at the start of every Claude Code session. When Phase 4 is active, the hook:

1. Parses `session-handoff.json` from `.sdlc/artifacts/04-implementation/`
2. Counts completed, in-progress, and blocked sections
3. Outputs a summary line: `[SDLC] Session Handoff: 3/8 sections complete, 1 in progress, 0 blocked (session #3)`
4. Displays `context_for_next_session` if present
5. Shows the first `next_actions` entry as the recommended starting point
6. Warns if there are unresolved blockers

This gives the agent immediate context without needing to read the full handoff file.

---

## 10. sections-progress.json (Phase 4 Tracking)

Located at: `.sdlc/artifacts/04-implementation/sections-progress.json`

Machine-readable implementation progress tracker. While `session-handoff.json` is optimized for session continuity, `sections-progress.json` is optimized for gate validation and progress reporting.

### Complete Schema

```json
{
  "$schema": "sections-progress-v1",
  "phase": 4,
  "total_sections": 8,
  "completed_sections": 3,
  "last_updated": "2026-03-26T15:00:00Z",
  "sections": [
    {
      "id": "SECTION-001",
      "name": "Authentication Service",
      "sprint": 1,
      "status": "complete",
      "agent_assigned": "deep-implement",
      "tdd_enforced": true,
      "tests_passing": true,
      "evaluator_passed": true,
      "started_at": "2026-03-25T10:00:00Z",
      "completed_at": "2026-03-25T14:30:00Z",
      "deviations": 0,
      "decisions": 2
    },
    {
      "id": "SECTION-004",
      "name": "API Gateway",
      "sprint": 2,
      "status": "in_progress",
      "agent_assigned": "deep-implement",
      "tdd_enforced": true,
      "tests_passing": null,
      "evaluator_passed": null,
      "started_at": "2026-03-26T09:00:00Z",
      "completed_at": null,
      "deviations": 1,
      "decisions": 0
    }
  ],
  "sprints": [
    {
      "number": 1,
      "goal": "Core infrastructure and auth",
      "sections": ["SECTION-001", "SECTION-002"],
      "status": "complete"
    },
    {
      "number": 2,
      "goal": "API layer and data access",
      "sections": ["SECTION-003", "SECTION-004", "SECTION-005"],
      "status": "in_progress"
    }
  ]
}
```

### Section Status Values

| Status | Meaning |
|--------|---------|
| `not_started` | Section has not been begun |
| `in_progress` | Section is actively being implemented |
| `complete` | Section implementation and evaluation finished |
| `blocked` | Section cannot proceed due to a dependency or blocker |

### Gate Validation

At Phase 4 exit, `check_gates.py` performs a consistency check on this file:

1. Reads `total_sections` and `completed_sections` from the top-level fields.
2. Counts sections where `status == "complete"` in the `sections` array.
3. If the count does not match `completed_sections`, a **SHOULD**-severity gate failure is reported.
4. If any sections have `status != "complete"`, a **SHOULD**-severity warning lists the incomplete section IDs.

These are SHOULD-level (not MUST) because there may be valid reasons to advance with incomplete sections (e.g., deferred to a future iteration).

---

## 11. State Diagram

### Individual Phase Lifecycle

```
                     +---------------------------+
                     |                           |
                     v                           |
  +---------+    +--------+    +-----------+     |
  | pending | -> | active | -> | completed |     |
  +---------+    +--------+    +-----------+     |
                     |                           |
                     |    (re-entry from         |
                     |     later phase)          |
                     |                           |
                     +------ reentry: true ------+
```

A phase starts as `pending`. When the previous phase completes and transitions forward, the next phase becomes `active`. When all exit gates pass and the user confirms, the active phase becomes `completed`. If issues are discovered later, a completed phase may be re-entered (returning to `active`).

### Complete Project Lifecycle

```
  Phase 0       Phase 1          Phase 2        Phase 3
  Discovery --> Requirements --> Design ------> Planning -->
  [active]      [pending]        [pending]       [pending]
    |              |                |               |
    | gates pass   | gates pass    | gates pass    | gates pass
    | + confirm    | + confirm     | + confirm     | + confirm
    v              v                v               v

  Phase 4          Phase 5       Phase 6        Phase 7
  Implementation -> Quality ----> Testing -----> Documentation ->
  [pending]         [pending]     [pending]      [pending]
    |                  |             |               |
    | gates pass       | gates pass  | gates pass   | gates pass
    v                  v             v               v

  Phase 8          Phase 9
  Deployment -----> Monitoring
  [pending]         [pending]
    |                  |
    | gates pass       | gates pass + confirm
    v                  v
                    [PROJECT COMPLETE]
```

### Transition Decision Tree

```
/sdlc-next invoked
  |
  +-> Read state.yaml (current_phase)
  |
  +-> current_phase >= 9?
  |     YES -> "Already complete" (exit 0)
  |     NO  -> Continue
  |
  +-> Run check_phase_gates()
  |
  +-> Any MUST gates failed?
  |     YES -> "BLOCKED" (exit 1)
  |     NO  -> Continue
  |
  +-> Any manual gates (passed == null)?
  |     YES -> --confirmed flag set?
  |     |        NO  -> "REVIEW REQUIRED" (exit 1)
  |     |        YES -> Continue
  |     NO  -> Continue
  |
  +-> --confirmed flag set?
  |     NO  -> "Dry run complete" (exit 0)
  |     YES -> Continue
  |
  +-> ADVANCE STATE
  |     - Complete current phase
  |     - Activate next phase
  |     - Append to history
  |     - Write state.yaml
  |
  +-> Print next phase guidance (exit 0)
```

---

## 12. Cross-References

| Topic | File | Description |
|-------|------|-------------|
| Advance logic | `scripts/advance_phase.py` | Full transition implementation |
| Gate checking | `scripts/check_gates.py` | Gate evaluation for all 5 gate types |
| State init | `scripts/init_project.py` | Creates .sdlc/ directory and state.yaml |
| Gate audit | `scripts/audit_gates.py` | Analyzes gate effectiveness across history |
| Status dashboard | `scripts/generate_status.py` | Generates status report from state |
| Phase report | `scripts/generate_phase_report.py` | Generates HTML gate report for stakeholders |
| Profile validation | `scripts/validate_profile.py` | Validates profile YAML against schema |
| State template | `templates/state-init.yaml` | Template with placeholders for initialization |
| Phase registry | `phases/phase-registry.yaml` | Phase definitions, gates, artifacts, skills |
| /sdlc-next command | `commands/sdlc-next.md` | User-facing command that invokes advance_phase.py |
| /sdlc-gate command | `commands/sdlc-gate.md` | User-facing command that runs gate checks |
| Session hook | `hooks/sdlc-session-start.ps1` | Reads state + handoff at session start |
| State machine ref | `references/state-machine.md` | Concise reference (progressive disclosure) |
