# System Architecture

Comprehensive architectural documentation for `claude-code-sdlc` -- a Claude Code plugin that orchestrates a full 10-phase Software Development Lifecycle with company-configurable profiles, compliance gates, and quality enforcement.

---

## Table of Contents

1. [Plugin Anatomy](#1-plugin-anatomy)
2. [Component Relationships](#2-component-relationships)
3. [Data Flow](#3-data-flow)
4. [Directory Structure](#4-directory-structure)
5. [Progressive Disclosure Strategy](#5-progressive-disclosure-strategy)
6. [Two-Directory Model](#6-two-directory-model)
7. [Cross-References](#7-cross-references)

---

## 1. Plugin Anatomy

### 1.1 Plugin Manifest (`plugin.json`)

The plugin manifest is the discovery entry point for Claude Code. It declares every component the plugin provides:

```json
{
  "name": "claude-code-sdlc",
  "version": "0.1.0",
  "description": "SDLC orchestration plugin for Claude Code -- configurable, company-profile-driven lifecycle management from discovery through monitoring.",
  "author": {
    "name": "Matt Kruczek",
    "url": "https://github.com/MCKRUZ"
  },
  "category": "sdlc",
  "skills": "SKILL.md",
  "commands": "commands/",
  "agents": "agents/",
  "profiles": {
    "microsoft-enterprise": {
      "description": "C#/.NET 8 + Angular 17 + Azure + SOC 2 compliance",
      "source": "profiles/microsoft-enterprise",
      "skills": ["azure-entra-auth", "azure-app-service", "azure-sql",
                 "azure-key-vault", "azure-app-insights"]
    },
    "starter": {
      "description": "Minimal profile, no compliance, quick start for any stack",
      "source": "profiles/starter"
    }
  },
  "hooks": [
    "hooks/sdlc-session-start.ps1",
    "hooks/sdlc-phase-inject.ps1"
  ],
  "scripts": {
    "runtime": "uv",
    "root": "scripts/"
  }
}
```

### 1.2 Field-by-Field Breakdown

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Unique plugin identifier. Used in Claude Code's plugin registry. |
| `version` | semver | Plugin version. Follows semantic versioning. |
| `description` | string | Human-readable summary shown in plugin listings. |
| `author` | object | Author metadata with `name` and `url` fields. |
| `category` | string | Plugin category for discovery (`"sdlc"`). |
| `skills` | path | Path to `SKILL.md` -- the primary entry point loaded when the plugin activates. |
| `commands` | path | Directory containing slash command definitions (`.md` files). |
| `agents` | path | Directory containing custom agent definitions (`.md` files). |
| `profiles` | object | Map of company/stack profiles. Each entry has a `description`, `source` directory, and optional `skills` array for domain-specific Claude Code skills. |
| `hooks` | array | PowerShell scripts triggered on session lifecycle events. |
| `scripts` | object | Automation scripts config: `runtime` specifies the runner (`uv` for Python), `root` is the scripts directory. |

### 1.3 Component Loading Sequence

When Claude Code activates the plugin, it loads components in this order:

1. **`SKILL.md`** -- The skill definition is loaded first. It contains the plugin's purpose, trigger phrases (e.g., "start sdlc", "sdlc setup", "run phase gate"), the command table, phase overview, human-in-the-loop protocol, visual report protocol, and agent orchestration protocol. This is the primary context document that Claude reads to understand what the plugin does and how to use it.

2. **`commands/`** -- Seven slash command definitions are registered. Each is a markdown file that tells Claude how to handle that command:

   | Command File | Slash Command | Purpose |
   |-------------|---------------|---------|
   | `sdlc-setup.md` | `/sdlc-setup` | Interactive setup wizard -- select profile, initialize `.sdlc/` |
   | `sdlc.md` | `/sdlc` | Show current phase guidance, next action, required artifacts |
   | `sdlc-status.md` | `/sdlc-status` | Progress dashboard with phase table and completion % |
   | `sdlc-gate.md` | `/sdlc-gate` | Run exit criteria checks for current phase (does not advance) |
   | `sdlc-next.md` | `/sdlc-next` | Advance to next phase if all MUST gates pass |
   | `sdlc-phase-report.md` | `/sdlc-phase-report` | Generate visual HTML report for current phase |
   | `sdlc-audit.md` | `/sdlc-audit` | Analyze gate effectiveness across completed phases |

3. **`agents/`** -- Four custom agent definitions are loaded. These are specialized Claude sub-agents spawned during specific phases:

   | Agent File | Agent Name | Role |
   |-----------|------------|------|
   | `sdlc-orchestrator.md` | SDLC Orchestrator | Master coordinator -- routes skills, enforces gates, manages state |
   | `requirements-analyst.md` | Requirements Analyst | Decomposes problems into requirements, user stories, acceptance criteria |
   | `compliance-checker.md` | Compliance Checker | Validates artifacts against SOC 2, HIPAA, GDPR, PCI-DSS frameworks |
   | `section-evaluator.md` | Section Evaluator | Discriminator in generator-evaluator loop -- assesses section implementations against plan criteria |

4. **`hooks/`** -- Two PowerShell hooks are registered for session lifecycle events:

   | Hook File | Trigger | Behavior |
   |----------|---------|----------|
   | `sdlc-session-start.ps1` | Session start | Reads `.sdlc/state.yaml`, outputs current phase context banner, displays session handoff summary for long-running phases |
   | `sdlc-phase-inject.ps1` | PreToolUse (file edits) | Injects phase-aware reminders when Claude edits files (e.g., "Phase 4: Follow section plans. Write tests first.") |

---

## 2. Component Relationships

### 2.1 Architecture Diagram

```
+------------------------------------------------------------------+
|                     PLUGIN DIRECTORY (immutable)                   |
|                                                                    |
|  +------------+     loads      +---------------------------+       |
|  | plugin.json| ------------> |         SKILL.md          |       |
|  +------------+               | (entry point, triggers,   |       |
|                               |  protocols, phase table)  |       |
|                               +---------------------------+       |
|                                 |           |           |          |
|                       references|   defines |  defines  |          |
|                                 v           v           v          |
|  +------------------+  +-------------+  +-----------+              |
|  |   references/    |  |  commands/  |  |  agents/  |              |
|  | (on-demand docs) |  |  (7 slash   |  | (4 custom |              |
|  |                  |  |   commands) |  |  agents)  |              |
|  +------------------+  +------+------+  +-----------+              |
|                               |                                    |
|                     invoke via uv run                              |
|                               |                                    |
|  +----------------------------v-----------+   +----------------+   |
|  |            scripts/                    |   |    hooks/       |   |
|  | validate_profile.py  init_project.py   |   | session-start  |   |
|  | check_gates.py       advance_phase.py  |   | phase-inject   |   |
|  | generate_status.py   audit_gates.py    |   +-------+--------+   |
|  | generate_phase_report.py               |           |            |
|  | synthesize_spec.py                     |           |            |
|  | map_deep_plan_artifacts.py             |           |            |
|  +-----+-----------+---------------------+           |            |
|        |           |                                  |            |
|  +-----v----+ +----v-----------+                      |            |
|  | phases/   | | profiles/     |                      |            |
|  | (10 phase | | (_schema.yaml |                      |            |
|  |  defs +   | | + company     |                      |            |
|  |  registry)| |   configs)    |                      |            |
|  +----------+  +------+--------+                      |            |
|                       |                               |            |
|  +--------------------+----+                          |            |
|  |     templates/          |                          |            |
|  | state-init.yaml         |                          |            |
|  | phases/00-09 templates  |                          |            |
|  | constitution.md         |                          |            |
|  | design-doc.md           |                          |            |
|  +-------------------------+                          |            |
+-----|------------------------------|------------------+            |
      |  copied at init             |  read/write at runtime        |
      v                             v                               |
+------------------------------------------------------------------+|
|                  TARGET PROJECT DIRECTORY (mutable)               ||
|                                                                   |
|  +---.sdlc/-----------------------------------------------+      |
|  |                                                         |      |
|  |  state.yaml  <-- scripts read/write, hooks read --------+------+
|  |  profile.yaml  (frozen copy of selected profile)        |
|  |  constitution.md                                        |
|  |  reports/  (generated HTML reports)                     |
|  |                                                         |
|  |  artifacts/                                             |
|  |  +-- 00-discovery/    (problem-statement.md, etc.)      |
|  |  +-- 01-requirements/ (requirements.md, epics.md, etc.) |
|  |  +-- 02-design/       (design-doc.md, adrs/, etc.)      |
|  |  +-- 03-planning/     (section-plans/, sprint-plan.md)  |
|  |  +-- 04-implementation/ (implementation-notes.md, etc.) |
|  |  +-- 05-quality/      (code-review-report.md, etc.)     |
|  |  +-- 06-testing/      (test-plan.md, coverage, etc.)    |
|  |  +-- 07-documentation/ (README.md, api-docs.md, etc.)   |
|  |  +-- 08-deployment/   (release-notes.md, etc.)          |
|  |  +-- 09-monitoring/   (monitoring-config.md, etc.)      |
|  +--------------------------------------------------------+      |
+-------------------------------------------------------------------+
```

### 2.2 Interaction Patterns

**SKILL.md references commands and agents.** The skill definition contains the command table and agent orchestration protocol. When a user says "start sdlc" or types `/sdlc-setup`, Claude reads the SKILL.md context to determine which command handles the request and which agents to spawn.

**Commands call Python scripts via `uv run`.** Slash commands instruct Claude to execute Python automation. The invocation pattern is:

```bash
uv run --project <plugin-root>/scripts <script-name>.py --arg value
```

The `--project` flag ensures `uv` resolves dependencies from the scripts' `pyproject.toml` regardless of the current working directory.

**Scripts read/write `.sdlc/state.yaml` in the target project.** All Python scripts receive the path to the target project's `.sdlc/` directory via CLI arguments (`--state`, `--target`). Scripts never modify plugin source files.

**Hooks read `state.yaml` to inject context.** The session-start hook reads `state.yaml` to determine the current phase and display a context banner. The phase-inject hook reads it on every file edit to provide phase-appropriate reminders.

**Profiles are frozen at init time.** During `/sdlc-setup`, the selected profile is copied from the plugin's `profiles/` directory into `.sdlc/profile.yaml` in the target project. This frozen copy is what scripts and hooks read at runtime -- the plugin's source profiles are never referenced after initialization.

**Phase definitions are referenced by `phase-registry.yaml`.** The registry maps phase IDs to definition files (`phases/00-discovery.md` through `phases/09-monitoring.md`), along with entry/exit gate conditions, skill mappings, and required artifacts.

**Templates are copied to `.sdlc/artifacts/` during init.** The `init_project.py` script creates the full artifact directory structure and copies the constitution template. Phase-specific templates serve as scaffolds for artifact creation.

**References are loaded on demand.** Documents in `references/` are never loaded into context automatically. They are pulled in only when Claude needs specific details about validation rules, agent assignments, skill mappings, or compliance frameworks.

---

## 3. Data Flow

### 3.1 Complete Lifecycle Data Flow

```
  User                 Claude Code              Plugin Scripts           Target .sdlc/
   |                       |                          |                       |
   |  "start sdlc"         |                          |                       |
   |---------------------->|                          |                       |
   |                       |  load SKILL.md           |                       |
   |                       |  (triggers matched)      |                       |
   |                       |                          |                       |
   |  /sdlc-setup          |                          |                       |
   |---------------------->|                          |                       |
   |                       |  validate_profile.py --->|                       |
   |                       |  init_project.py ------->|-----> state.yaml      |
   |                       |                          |-----> profile.yaml    |
   |                       |                          |-----> artifacts/00-09 |
   |                       |                          |-----> constitution.md |
   |                       |                          |                       |
   |  (phase work)         |                          |                       |
   |---------------------->|                          |                       |
   |                       |  write artifacts ------->|-----> artifacts/NN/   |
   |                       |                          |                       |
   |  /sdlc-gate           |                          |                       |
   |---------------------->|                          |                       |
   |                       |  check_gates.py -------->|<----- state.yaml     |
   |                       |                          |<----- artifacts/NN/  |
   |                       |<-- gate results ---------|                       |
   |<-- pass/fail report --|                          |                       |
   |                       |                          |                       |
   |  /sdlc-next           |                          |                       |
   |---------------------->|                          |                       |
   |                       |  advance_phase.py ------>|<----- state.yaml     |
   |                       |                          |-----> state.yaml     |
   |                       |                          |       (atomic update)|
   |<-- next phase info ---|                          |                       |
   |                       |                          |                       |
   |  (new session)        |                          |                       |
   |---------------------->|                          |                       |
   |                       |  session-start hook ---->|<----- state.yaml     |
   |                       |<-- phase context --------|                       |
   |                       |                          |                       |
   |  (edit file)          |                          |                       |
   |---------------------->|                          |                       |
   |                       |  phase-inject hook ----->|<----- state.yaml     |
   |                       |<-- phase reminder -------|<----- profile.yaml   |
```

### 3.2 Detailed Step Descriptions

**Step 1: Plugin Activation.** When a user opens a project that has this plugin installed, Claude Code reads `plugin.json` and loads `SKILL.md` into context. This gives Claude full awareness of the SDLC methodology, available commands, agent orchestration rules, and human-in-the-loop protocol. No target project state exists yet.

**Step 2: Project Setup (`/sdlc-setup`).** The user invokes the setup wizard. Claude runs two scripts in sequence:

1. `validate_profile.py` -- Validates the selected profile YAML against `profiles/_schema.yaml`. Checks required fields (`company`, `stack`, `quality`), type constraints, value ranges (e.g., `coverage_minimum` between 0-100), and optional compliance/conventions blocks. Returns a list of errors or confirms validity.

2. `init_project.py` -- Creates the `.sdlc/` directory structure in the target project:
   - Reads `templates/state-init.yaml` and substitutes `${PROFILE_ID}`, `${PROJECT_NAME}`, and `${CREATED_AT}` with actual values
   - Writes `state.yaml` with Phase 0 (Discovery) set as active
   - Copies the profile as a frozen `profile.yaml`
   - Creates 10 artifact subdirectories (`00-discovery` through `09-monitoring`)
   - Copies the constitution template

**Step 3: Phase Work.** During each phase, Claude guides the user through the phase definition's workflow. Artifacts are written to `.sdlc/artifacts/NN-phasename/`. Each phase has required and optional artifacts defined in `phase-registry.yaml`. For Phase 4 (Implementation), session continuity is maintained through `session-handoff.json` -- a structured JSON file tracking section progress, blockers, and next actions across sessions.

**Step 4: Gate Checking (`/sdlc-gate`).** The `check_gates.py` script reads `state.yaml` to determine the current phase, then validates artifacts against the 5-gate system:

| Gate | What It Checks | Severity |
|------|---------------|----------|
| G1: Integrity | Required artifacts exist, are non-empty, parse correctly, no placeholder content (`TODO`, `TBD`, `${VAR}`) | MUST |
| G2: Completeness | All required sections present, cross-references valid, no missing content areas | MUST |
| G3: Metrics | Quantitative thresholds from profile (coverage >= `coverage_minimum`, file size <= `max_file_lines`, function length <= `max_function_lines`) | MUST or SHOULD (varies by phase) |
| G4: Classification | Correct labeling -- requirement priorities, ADR statuses, compliance framework mappings, risk severities | MUST or SHOULD (varies by phase) |
| G5: Quality | Holistic assessment -- clarity, accuracy, internal consistency, alignment with prior phase artifacts | MUST or SHOULD (varies by phase) |

Gate severity varies by phase. For example, Phase 5 (Quality) requires all five gates at MUST level, while Phase 0 (Discovery) only requires G1 and G2 as MUST.

**Step 5: Phase Advancement (`/sdlc-next`).** The `advance_phase.py` script:
1. Runs `check_gates.py` internally to verify all MUST gates pass
2. If gates fail, returns a blockers report without modifying state
3. If gates pass, atomically updates `state.yaml`:
   - Sets current phase status to `completed` with `completed_at` timestamp
   - Records gate results in the phase's `gate_results` field
   - Appends a transition record to `history`
   - Sets the next phase to `active` with `entered_at` timestamp
   - Updates `current_phase` and `phase_name` at the top level
4. Outputs guidance for the next phase (skills, required artifacts, phase definition path)

Phase transitions require human confirmation for phases where `approval: manual` is set in the registry. Only Phase 4 (Implementation) and Phase 6 (Testing) use `approval: automatic`.

**Step 6: Session Start Hook.** On every new Claude Code session, `sdlc-session-start.ps1`:
1. Checks if `.sdlc/state.yaml` exists in the current directory
2. Parses the current phase number and name
3. Outputs a context banner: `[SDLC] Phase N: PhaseName -- description`
4. For Phase 4, reads `session-handoff.json` and displays a continuity summary with active section, blockers, and next steps

**Step 7: Phase-Inject Hook.** On every file edit operation, `sdlc-phase-inject.ps1`:
1. Reads current phase from `state.yaml`
2. Outputs a phase-specific reminder:
   - Phase 0: "Focus on understanding the problem, not writing code."
   - Phase 4: "Follow section plans. Write tests first (TDD)."
   - Phase 5: "Focus on review findings. No new features."
3. Reads `profile.yaml` for convention reminders (commit format, naming, immutability rules)

---

## 4. Directory Structure

### 4.1 Plugin Directory (Source)

```
claude-code-sdlc/                          Plugin root (installed or symlinked)
|
|-- plugin.json                            Plugin manifest -- discovery entry point
|-- SKILL.md                               Skill definition -- loaded on activation
|-- CLAUDE.md                              Development instructions for contributors
|
|-- commands/                              7 slash command definitions
|   |-- sdlc.md                            /sdlc -- current phase guidance
|   |-- sdlc-setup.md                      /sdlc-setup -- project initialization wizard
|   |-- sdlc-status.md                     /sdlc-status -- progress dashboard
|   |-- sdlc-gate.md                       /sdlc-gate -- run exit criteria checks
|   |-- sdlc-next.md                       /sdlc-next -- advance to next phase
|   |-- sdlc-phase-report.md               /sdlc-phase-report -- generate HTML report
|   +-- sdlc-audit.md                      /sdlc-audit -- gate effectiveness analysis
|
|-- agents/                                4 custom agent definitions
|   |-- sdlc-orchestrator.md               Master coordinator agent
|   |-- requirements-analyst.md            Requirements decomposition agent
|   |-- compliance-checker.md              Compliance validation agent
|   +-- section-evaluator.md               Implementation quality evaluator agent
|
|-- phases/                                10 phase definitions + registry
|   |-- phase-registry.yaml                Master registry -- all phases, gates, artifacts
|   |-- 00-discovery.md                    Phase 0 definition
|   |-- 01-requirements.md                 Phase 1 definition
|   |-- 02-design.md                       Phase 2 definition
|   |-- 03-planning.md                     Phase 3 definition
|   |-- 04-implementation.md               Phase 4 definition
|   |-- 05-quality.md                      Phase 5 definition
|   |-- 06-testing.md                      Phase 6 definition
|   |-- 07-documentation.md                Phase 7 definition
|   |-- 08-deployment.md                   Phase 8 definition
|   +-- 09-monitoring.md                   Phase 9 definition
|
|-- profiles/                              Company/stack configurations
|   |-- _schema.yaml                       Profile validation schema (RFC 2119)
|   |-- microsoft-enterprise/
|   |   |-- profile.yaml                   C#/.NET 8 + Angular 17 + Azure + SOC 2
|   |   |-- claude-md-template.md          CLAUDE.md template for target projects
|   |   +-- switchboard-rules.json         Agent routing rules for this profile
|   |-- starter/
|   |   +-- profile.yaml                   Minimal profile, no compliance
|   +-- creative-tooling/
|       +-- profile.yaml                   Python/uv plugin development profile
|
|-- references/                            Progressive disclosure documents
|   |-- state-machine.md                   State format and transition rules
|   |-- validation-rules.md                5-gate validation system details
|   |-- skill-mapping.md                   Phase-to-skill mapping
|   |-- agent-roster.md                    Phase-to-agent mapping with parallel groups
|   |-- compliance-frameworks.md           SOC 2, HIPAA, GDPR, PCI-DSS gates
|   |-- acceptance-criteria.md             Acceptance criteria guidelines
|   |-- deep-plan-integration.md           /deep-plan skill integration guide
|   |-- knowledge-base.md                  Domain knowledge reference
|   +-- scenarios.yaml                     Test scenarios for validation
|
|-- templates/                             Artifact scaffolds
|   |-- state-init.yaml                    Initial state.yaml template (variable placeholders)
|   |-- constitution.md                    Project constitution template
|   |-- design-doc.md                      Design document template
|   |-- requirements.md                    Requirements document template
|   |-- test-plan.md                       Test plan template
|   |-- release-checklist.md               Release checklist template
|   +-- phases/                            Per-phase artifact templates
|       |-- 00-discovery/                  constitution.md, problem-statement.md, ...
|       |-- 01-requirements/               requirements.md, epics.md, user-stories.md, ...
|       |-- 02-design/                     design-doc.md, api-contracts.md, adrs/, ...
|       |-- 03-planning/                   sprint-plan.md, risk-register.md, section-plans/
|       |-- 04-implementation/             implementation-notes.md, session-handoff.json, ...
|       |-- 05-quality/                    code-review-report.md, ...
|       |-- 06-testing/                    test-plan.md, ...
|       |-- 07-documentation/              (uses target project docs)
|       |-- 08-deployment/                 deployment-checklist.md, ...
|       +-- 09-monitoring/                 monitoring-config.md, ...
|
|-- scripts/                               Python automation (uv runtime)
|   |-- pyproject.toml                     Python project config (dependencies: pyyaml)
|   |-- uv.lock                            Locked dependency versions
|   |-- validate_profile.py                Validate profile YAML against schema
|   |-- init_project.py                    Initialize .sdlc/ in target project
|   |-- check_gates.py                     Run 5-gate validation for current phase
|   |-- advance_phase.py                   Advance to next phase (atomic state update)
|   |-- generate_status.py                 Generate progress dashboard data
|   |-- generate_phase_report.py           Generate self-contained HTML report
|   |-- audit_gates.py                     Analyze gate effectiveness across phases
|   |-- synthesize_spec.py                 Synthesize spec from Phase 0-1 artifacts
|   |-- map_deep_plan_artifacts.py         Map /deep-plan output to SDLC artifacts
|   +-- tests/                             Script test suite
|       |-- conftest.py                    Shared fixtures
|       +-- test_check_gates.py            Gate validation tests
|
+-- hooks/                                 PowerShell context injection
    |-- sdlc-session-start.ps1             Session start -- phase context banner
    +-- sdlc-phase-inject.ps1              PreToolUse -- phase-aware edit reminders
```

### 4.2 Target Project Directory (Runtime)

```
target-project/                            User's project (where code lives)
+-- .sdlc/                                 Created by /sdlc-setup
    |-- state.yaml                         Phase tracking, history, gate results
    |-- profile.yaml                       Immutable copy of selected profile
    |-- constitution.md                    Project constitution (scope, constraints)
    |-- reports/                           Generated HTML reports
    |   |-- phase0-report.html
    |   |-- phase1-report.html
    |   +-- ...
    +-- artifacts/                          Phase work products
        |-- 00-discovery/
        |   |-- constitution.md
        |   |-- problem-statement.md
        |   |-- success-criteria.md
        |   |-- constraints.md
        |   +-- phase1-handoff.md
        |-- 01-requirements/
        |   |-- requirements.md
        |   |-- non-functional-requirements.md
        |   |-- epics.md
        |   +-- phase2-handoff.md
        |-- 02-design/
        |   |-- design-doc.md
        |   |-- api-contracts.md
        |   |-- adr-registry.md
        |   |-- adrs/
        |   +-- phase3-handoff.md
        |-- 03-planning/
        |   |-- section-plans/
        |   |-- sprint-plan.md
        |   |-- risk-register.md
        |   +-- phase4-handoff.md
        |-- 04-implementation/
        |   |-- implementation-notes.md
        |   |-- session-handoff.json
        |   |-- sections-progress.json
        |   +-- phase5-handoff.md
        |-- 05-quality/
        |   |-- code-review-report.md
        |   |-- security-review-report.md
        |   |-- quality-metrics.md
        |   +-- phase6-handoff.md
        |-- 06-testing/
        |   |-- test-plan.md
        |   |-- test-results.md
        |   |-- coverage-report.md
        |   +-- phase7-handoff.md
        |-- 07-documentation/
        |   |-- README.md
        |   |-- api-docs.md
        |   |-- RUNBOOK.md
        |   +-- phase8-handoff.md
        |-- 08-deployment/
        |   |-- release-notes.md
        |   |-- deployment-checklist.md
        |   |-- smoke-test-results.md
        |   +-- phase9-handoff.md
        +-- 09-monitoring/
            |-- monitoring-config.md
            |-- alert-definitions.md
            |-- incident-response.md
            +-- project-retrospective.md
```

### 4.3 State Machine (`state.yaml`)

The state file is initialized from `templates/state-init.yaml` with variable substitution:

```yaml
version: "1.0"
profile_id: "microsoft-enterprise"       # From ${PROFILE_ID}
project_name: "my-project"               # From ${PROJECT_NAME}
created_at: "2026-03-26T12:00:00+00:00"  # From ${CREATED_AT}
project_type: null                        # Set during Phase 0: service | app | library | skill | cli

current_phase: 0
phase_name: "discovery"

phases:
  0:
    name: discovery
    status: active          # active | completed | pending | skipped
    entered_at: "2026-03-26T12:00:00+00:00"
    completed_at: null
    gate_results: {}        # Populated by check_gates.py
    artifacts: []           # Populated as artifacts are created
  1:
    name: requirements
    status: pending
    entered_at: null
    completed_at: null
    gate_results: {}
    artifacts: []
  # ... phases 2-9 follow the same structure

history: []                 # Append-only log of phase transitions
```

Each phase tracks its own status lifecycle: `pending` -> `active` -> `completed` (or `skipped`). Gate results are stored per-phase so historical audit is possible.

---

## 5. Progressive Disclosure Strategy

The plugin is designed to minimize context window consumption. Claude's context is a finite resource, and loading everything at once would waste capacity needed for actual project work. The disclosure hierarchy is:

### 5.1 Layer 1: Always Loaded (Activation)

**`SKILL.md`** (~4KB) is the only document loaded automatically when the plugin activates. It contains:
- Plugin purpose and trigger phrases
- Command table (7 commands, one-line descriptions each)
- Phase overview table (10 phases with key skills)
- Human-in-the-loop protocol (when to stop and ask)
- Visual report protocol (when and how to generate reports)
- Agent orchestration protocol (mandatory spawns, parallel rules)
- Pointer to `references/` for deeper details

This single document gives Claude enough context to handle any SDLC-related request and know where to look for more detail.

### 5.2 Layer 2: Loaded on Phase Entry

**Phase definitions** (`phases/NN-phasename.md`) are loaded only when the user enters that phase. Each definition contains:
- Purpose statement
- Entry criteria
- Detailed workflow with numbered steps
- HITL GATE markers (mandatory human interaction points)
- CHECKPOINT markers (agent-enforced stopping points)
- Required and optional artifacts
- Exit criteria

Only the current phase's definition is in context at any time. Previous phase definitions are not retained.

### 5.3 Layer 3: Loaded on Explicit Request

**Reference documents** (`references/`) are loaded only when Claude needs specific details:

| Document | When Loaded | Size |
|----------|------------|------|
| `validation-rules.md` | When running gate checks or explaining gate failures | ~3KB |
| `agent-roster.md` | When spawning agents or planning parallel execution | ~2KB |
| `skill-mapping.md` | When determining which Claude Code skills to invoke | ~2KB |
| `state-machine.md` | When explaining state transitions or debugging state | ~2KB |
| `compliance-frameworks.md` | When checking compliance gates (SOC 2, HIPAA, etc.) | ~4KB |
| `deep-plan-integration.md` | When integrating with /deep-plan skill in Phases 2-3 | ~2KB |
| `acceptance-criteria.md` | When writing or evaluating acceptance criteria | ~1KB |
| `knowledge-base.md` | When domain-specific knowledge is needed | ~2KB |

### 5.4 Layer 4: Never Loaded Into Context

**Templates** are copied to the target project's `.sdlc/artifacts/` directory at initialization time by `init_project.py`. They are never loaded into Claude's context window -- Claude writes artifacts directly based on phase workflow guidance.

**HTML Reports** generated by `generate_phase_report.py` are self-contained HTML files written to `.sdlc/reports/`. They are designed to be opened in a browser, not consumed by Claude. Reports include visual elements (tables, charts, status badges) that would be wasted in a text-only context.

**Profile schema** (`profiles/_schema.yaml`) is only consumed by `validate_profile.py` during setup. Claude does not need the raw schema in context.

### 5.5 Disclosure Triggers

| Trigger | What Gets Loaded |
|---------|-----------------|
| Plugin activation | `SKILL.md` only |
| `/sdlc-setup` | Profile selection UI (no extra docs) |
| `/sdlc` or `/sdlc-status` | Current phase definition |
| `/sdlc-gate` | Current phase definition + `validation-rules.md` |
| Agent spawn | `agent-roster.md` (if routing needed) |
| Compliance check | `compliance-frameworks.md` |
| Phase 2-3 with /deep-plan | `deep-plan-integration.md` |

---

## 6. Two-Directory Model

### 6.1 The Separation Principle

The plugin operates across two distinct directory trees that serve fundamentally different purposes:

**Plugin Directory** -- Contains the plugin's source code, definitions, and templates. This directory is **immutable during use**. It may be installed globally, symlinked, or cloned as a Git repository. No script, hook, or command ever writes to this directory during normal operation. It is the "program" that runs the SDLC.

**Target Project Directory** -- Contains the user's actual project code and the `.sdlc/` subdirectory where all runtime state lives. This directory is **mutable**. Every artifact, state change, report, and configuration update happens here. It is the "data" the program operates on.

### 6.2 Why This Matters

This separation provides several critical guarantees:

1. **Multi-project support.** A single plugin installation can manage multiple projects simultaneously. Each project has its own `.sdlc/` directory with independent state.

2. **Plugin updates are safe.** Updating the plugin (new phase definitions, improved scripts, additional templates) does not affect any project's state. Projects keep their frozen `profile.yaml` and `state.yaml` intact.

3. **Clean version control.** The `.sdlc/` directory can be committed to the project's Git repository, giving the team full visibility into SDLC progress. The plugin source is tracked separately (or not at all, if installed as a dependency).

4. **No cross-contamination.** A bug in one project's state cannot corrupt the plugin or affect other projects.

### 6.3 Path Resolution in Scripts

All Python scripts receive explicit paths to both directories:

```bash
# Plugin root is resolved from the script's own location:
PLUGIN_ROOT = Path(__file__).resolve().parent.parent

# Target project paths come from CLI arguments:
uv run --project <plugin-root>/scripts check_gates.py \
    --state /path/to/target/.sdlc/state.yaml \
    --phase 0
```

The `--project <plugin-root>/scripts` flag tells `uv` where `pyproject.toml` lives, ensuring correct dependency resolution regardless of the shell's current working directory.

### 6.4 Path Resolution in Hooks

PowerShell hooks resolve the target project from the current working directory:

```powershell
$sdlcDir = Join-Path $PWD ".sdlc"
$stateFile = Join-Path $sdlcDir "state.yaml"

if (-not (Test-Path $stateFile)) {
    exit 0  # Not an SDLC-managed project; do nothing
}
```

Hooks gracefully exit when the current directory has no `.sdlc/` folder, allowing the plugin to be installed globally without interfering with non-SDLC projects.

### 6.5 Initialization Creates the Bridge

The `/sdlc-setup` command is the only operation that spans both directories:

1. Reads profile from **plugin directory**: `profiles/<name>/profile.yaml`
2. Validates against schema in **plugin directory**: `profiles/_schema.yaml`
3. Reads state template from **plugin directory**: `templates/state-init.yaml`
4. Writes everything to **target directory**: `.sdlc/state.yaml`, `.sdlc/profile.yaml`, `.sdlc/artifacts/`, `.sdlc/constitution.md`

After initialization, all subsequent operations read from and write to the target directory only (scripts reference the plugin directory only for phase definitions and the phase registry, which are read-only).

---

## 7. Cross-References

This document covers the system architecture at a high level. For detailed documentation on specific subsystems, see:

| Document | Contents |
|----------|----------|
| `references/state-machine.md` | State format, field definitions, transition rules, history schema |
| `references/validation-rules.md` | 5-gate validation system, per-gate checks, severity matrix by phase |
| `references/skill-mapping.md` | Phase-to-skill mapping, when to invoke each Claude Code skill |
| `references/agent-roster.md` | Phase-to-agent mapping, parallel execution groups, spawn conditions |
| `references/compliance-frameworks.md` | SOC 2, HIPAA, GDPR, PCI-DSS gate definitions and artifact requirements |
| `references/deep-plan-integration.md` | How `/deep-plan` integrates with Phases 2-3, checkpoint/resume flow |
| `phases/phase-registry.yaml` | Master registry of all 10 phases with entry/exit gates and artifact lists |
| `profiles/_schema.yaml` | Profile validation schema with required fields and value constraints |
