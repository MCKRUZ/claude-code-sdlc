# Scripts Reference

Detailed documentation for all Python automation scripts in the `scripts/` directory.

---

## Table of Contents

- [1. Script System Overview](#1-script-system-overview)
- [2. uv Runtime](#2-uv-runtime)
- [3. Script Reference](#3-script-reference)
  - [validate_profile.py](#validate_profilepy)
  - [init_project.py](#init_projectpy)
  - [check_gates.py](#check_gatespy)
  - [advance_phase.py](#advance_phasepy)
  - [generate_phase_report.py](#generate_phase_reportpy)
  - [generate_status.py](#generate_statuspy)
  - [audit_gates.py](#audit_gatespy)
  - [synthesize_spec.py](#synthesize_specpy)
  - [map_deep_plan_artifacts.py](#map_deep_plan_artifactspy)
- [4. Dependencies](#4-dependencies)
- [5. Error Handling](#5-error-handling)
- [6. Cross-References](#6-cross-references)

---

## 1. Script System Overview

All scripts in this project share a common design philosophy:

- **Python 3.12+** required (uses `Path | None` union syntax, modern type hints)
- **Run via uv** -- the universal Python package manager acts as the runtime
- **Stateless execution** -- each script reads input files, processes them, and writes output; no persistent in-memory state between invocations
- **Exit codes** -- `0` = success, `1` = failure (with structured error details on stderr), `2` = configuration/usage error (some scripts)
- **Plugin-root aware** -- scripts resolve the plugin root via `Path(__file__).resolve().parent.parent`, enabling them to locate schemas, templates, and phase definitions regardless of the caller's working directory
- **YAML-centric** -- `state.yaml`, `profile.yaml`, and `phase-registry.yaml` are the core data files; all scripts use PyYAML for reading and writing

Commands invoke scripts using:

```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/<script>.py [args]
```

---

## 2. uv Runtime

### What uv Is

[uv](https://github.com/astral-sh/uv) is a fast Python package manager and project tool written in Rust. It replaces pip, pip-tools, virtualenv, and pyenv in a single binary. The SDLC plugin uses uv because:

- It resolves and installs dependencies 10-100x faster than pip
- It creates isolated virtual environments automatically per project
- It ensures reproducible script execution across machines
- Commands can invoke scripts without manually activating a virtualenv

### Installation

```bash
# Using pip (any platform)
pip install uv

# macOS via Homebrew
brew install uv

# Windows via winget
winget install astral-sh.uv

# Standalone installer (Linux/macOS)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Syncing Dependencies

Before first use (or after updating `pyproject.toml`):

```bash
cd <plugin-root>/scripts
uv sync
```

This creates a `.venv/` inside `scripts/` and installs all dependencies declared in `pyproject.toml`.

### How Commands Invoke Scripts

Slash commands (e.g., `/sdlc-gate`, `/sdlc-next`) invoke scripts with the `--project` flag pointing to the scripts directory. This tells uv which `pyproject.toml` governs the environment:

```bash
uv run --project /path/to/claude-code-sdlc/scripts /path/to/claude-code-sdlc/scripts/check_gates.py --state .sdlc/state.yaml --phase 0
```

The `--project` flag is critical -- without it, uv would look for a `pyproject.toml` in the caller's working directory instead of the plugin's scripts directory.

---

## 3. Script Reference

---

### validate_profile.py

**Purpose:** Validate a company profile YAML file against the canonical schema (`profiles/_schema.yaml`). This is the first script run during project initialization and acts as a gatekeeper ensuring profile correctness before any SDLC state is created.

**CLI:**

```bash
uv run scripts/validate_profile.py <profile.yaml>
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `<profile.yaml>` | Yes | Path to the profile YAML file to validate (positional) |

**Input:** A single profile YAML file path. The schema is loaded automatically from `profiles/_schema.yaml` relative to the plugin root.

**Validation Process:**

1. **Load schema** from `profiles/_schema.yaml` (resolved via `SCHEMA_PATH = Path(__file__).resolve().parent.parent / "profiles" / "_schema.yaml"`)
2. **Load profile** YAML from the provided path
3. **Run validation checks** in sequence:

| Check | What It Validates |
|-------|-------------------|
| Required fields | Top-level fields declared in schema `required` array |
| `version` | Must be a string |
| `company.name` | Required string |
| `company.profile_id` | Required string |
| `stack.backend_language` | Required; enum validation against allowed languages |
| `stack.backend_framework` | Required string |
| `stack.frontend_framework` | Optional; enum if present |
| `stack.cloud_provider` | Required; enum (`azure`, `aws`, `gcp`, `on-prem`, `hybrid`) |
| `stack.ci_cd` | Required string |
| `quality.coverage_minimum` | Numeric range 0-100 |
| `quality.max_file_lines` | Numeric, minimum 1 |
| `quality.max_function_lines` | Numeric, minimum 1 |
| `compliance.frameworks` | List; each item validated against enum (`soc2`, `hipaa`, `gdpr`, `pci-dss`, `iso27001`, `fedramp`, `none`) |
| `compliance.change_approval` | Enum (`peer-review`, `manager-approval`, `change-board`, `none`) |
| `conventions` | Type-checked as dict if present |

**Helper Functions:**

- `load_yaml(path)` -- Safe YAML loading via `yaml.safe_load`
- `validate_required(data, required, context)` -- Checks required field presence, returns error list with field paths
- `validate_type(value, expected_type, context)` -- Type checking (`string`, `int`, `float`, `list`, `dict`)
- `validate_enum(value, allowed, context)` -- Enum membership validation
- `validate_range(value, minimum, maximum, context)` -- Numeric range validation

**Output on success:**

```
PASS -- microsoft-enterprise.yaml is valid
```

**Output on failure:**

```
FAIL -- 3 validation error(s):
  x company: missing required field 'profile_id'
  x stack.cloud_provider: 'digital-ocean' not in allowed values: azure, aws, gcp, on-prem, hybrid
  x quality.coverage_minimum: 150 > maximum 100
```

**Exit codes:** `0` (valid), `1` (invalid or file not found)

---

### init_project.py

**Purpose:** Initialize the `.sdlc/` directory structure in a target project. This is the bootstrapping script that creates the entire SDLC workspace, including artifact directories for all 10 phases, the initial state file, and a frozen copy of the selected profile.

**CLI:**

```bash
uv run scripts/init_project.py --profile <profile.yaml> --target <project-dir> [--name <project-name>]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--profile` | Yes | Path to the company profile YAML |
| `--target` | Yes | Path to the target project directory |
| `--name` | No | Project name (defaults to target directory name) |

**Process:**

1. **Load and validate profile** -- Reads the profile YAML (does not re-run full schema validation; assumes prior `validate_profile.py` pass)
2. **Check for existing `.sdlc/`** -- If `.sdlc/` already exists, prints a warning and exits without modifying anything (safe re-run behavior)
3. **Create directory structure:**
   ```
   .sdlc/
     artifacts/
       00-discovery/
       01-requirements/
       02-design/
       03-planning/
       04-implementation/
       05-quality/
       06-testing/
       07-documentation/
       08-deployment/
       09-monitoring/
     state.yaml
     profile.yaml
   ```
4. **Generate `state.yaml`** from `templates/state-init.yaml` with variable substitution:
   - `${PROFILE_ID}` -- replaced with `profile.company.profile_id`
   - `${PROJECT_NAME}` -- replaced with `--name` argument or target directory name
   - `${CREATED_AT}` -- replaced with current UTC timestamp in ISO 8601 format
5. **Copy frozen profile** -- Writes a copy of the profile to `.sdlc/profile.yaml` so the project retains its configuration even if the source profile changes
6. **Copy phase templates** -- For each phase directory under `templates/phases/`, copies template files into the corresponding `.sdlc/artifacts/` subdirectory (only if the template directory exists for that phase)

**Key Constants:**

- `PLUGIN_ROOT` -- Resolved plugin directory (`Path(__file__).resolve().parent.parent`)
- `TEMPLATES_DIR` -- `<plugin-root>/templates`
- `PHASE_DIRS` -- Ordered list of 10 phase directory names (`00-discovery` through `09-monitoring`)

**Output on success:**

```
Initialized .sdlc/ in /path/to/project
  Profile: microsoft-enterprise
  Project: my-app
  Phases: 10 directories created
```

**Exit codes:** `0` (success), `1` (profile not found or load error)

---

### check_gates.py

**Purpose:** Run the 5-gate validation system against a specific SDLC phase. This is the most complex script (~11KB) and serves as the quality enforcement engine. It reads the phase registry to determine which artifacts are required, then runs each gate check against the artifacts directory.

**CLI:**

```bash
uv run scripts/check_gates.py --state <state.yaml> --phase <N>
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--phase` | Yes | Phase number (0-9) to check |

**Key Functions:**

- `get_phase_registry()` -- Loads `phases/phase-registry.yaml` from the plugin root
- `get_compliance_gates(profile)` -- Loads framework-specific gates from `profiles/<profile_id>/compliance/<framework>-gates.yaml`
- `check_artifact_exists(artifacts_dir, artifact)` -- Gate 1: Verifies file/directory existence and non-emptiness
- `check_artifact_not_empty(artifacts_dir, artifact)` -- Gate 1: Ensures files have content (>0 bytes)
- `check_artifact_complete(artifacts_dir, artifact)` -- Gate 2: Scans for placeholder patterns
- `check_phase_gates(phase_id, state, profile, artifacts_base)` -- Main orchestrator; runs all gates and returns results list
- `format_results(results)` -- Formats gate results for human-readable output

**Gate Details:**

#### Gate 1: Integrity (G1-integrity)

Checks that all required artifacts for the phase exist and are well-formed.

- **File existence:** Verifies each required artifact file is present in `.sdlc/artifacts/<phase-dir>/`
- **Non-empty check:** Files must have content (>0 bytes)
- **Directory children:** If the artifact is a directory (e.g., `section-plans/`), verifies it contains at least one child item
- **Severity:** MUST

#### Gate 2: Completeness (G2-completeness)

Scans artifact content for placeholder patterns that indicate incomplete work.

**Detected patterns:**
- `TODO` -- Unfinished work markers
- `TBD` -- "To be determined" placeholders
- `${...}` -- Unresolved template variables
- `PLACEHOLDER` -- Explicit placeholder text
- `[INSERT` -- Template insertion points (e.g., `[INSERT DESCRIPTION HERE]`)
- `<!-- REQUIRED:` -- HTML comment markers for required sections

For each artifact, the script reads the file content and checks against these patterns. If any match is found, the artifact fails the completeness gate.

**Phase 4 special handling:** If `sections-progress.json` exists, the script performs a consistency check:
- Reads `total_sections`, `completed_sections`, and the `sections` array
- Counts sections with `status == "complete"` in the array
- Compares the actual count against the declared `completed_sections` counter
- If they disagree, reports a `SHOULD`-severity failure (not blocking, but flagged)

**Severity:** MUST

#### Gate 3: Metrics (G3-metrics)

Applies to phases 5 (Quality) and 6 (Testing). Checks quantitative thresholds from the profile.

- **Coverage minimum:** `quality.coverage_minimum` from profile (0-100 range)
- **File line limits:** `quality.max_file_lines` from profile
- **Function line limits:** `quality.max_function_lines` from profile

**Severity:** MUST for phases 5-6, SHOULD for phase 4

#### Gate 4: Compliance (G4-classification)

Loads compliance-specific gates from the profile's compliance directory.

- Reads `compliance.frameworks` from the profile (e.g., `["soc2", "hipaa"]`)
- For each framework, loads `profiles/<profile_id>/compliance/<framework>-gates.yaml`
- Runs each compliance gate check against the phase artifacts
- Examples: requirements must have priority labels (P0-P3), design decisions need ADR status, test cases must map to requirements

**Severity:** MUST for compliance-enabled profiles, SHOULD for others

#### Gate 5: Quality (G5-quality)

Checks review status and traceability.

- Verifies artifacts have been reviewed (review status markers)
- Checks traceability links between artifacts (requirements to tests, designs to implementations)

**Severity:** MUST for phases 2, 5; SHOULD for others

**Output Format:**

Results are returned as a list of dictionaries:

```json
[
  {
    "gate": "G1-integrity",
    "artifact": "problem-statement.md",
    "passed": true,
    "message": "File 'problem-statement.md' exists",
    "severity": "MUST"
  },
  {
    "gate": "G2-completeness",
    "artifact": "requirements.md",
    "passed": false,
    "message": "Placeholder pattern found: TODO (line 42)",
    "severity": "MUST"
  }
]
```

**Gate Application by Phase:**

| Phase | G1 | G2 | G3 | G4 | G5 |
|-------|:--:|:--:|:--:|:--:|:--:|
| 0 Discovery | MUST | MUST | -- | -- | SHOULD |
| 1 Requirements | MUST | MUST | -- | MUST | SHOULD |
| 2 Design | MUST | MUST | -- | MUST | MUST |
| 3 Planning | MUST | MUST | -- | -- | SHOULD |
| 4 Implementation | MUST | MUST | SHOULD | -- | SHOULD |
| 5 Quality | MUST | MUST | MUST | MUST | MUST |
| 6 Testing | MUST | MUST | MUST | MUST | SHOULD |
| 7 Documentation | MUST | MUST | -- | -- | SHOULD |
| 8 Deployment | MUST | MUST | -- | MUST | SHOULD |
| 9 Monitoring | MUST | MUST | -- | -- | SHOULD |

**Exit codes:** `0` (all MUST gates pass), `1` (any MUST gate fails)

---

### advance_phase.py

**Purpose:** Advance the SDLC project to the next phase. Supports a dry-run mode for gate preview and a confirmed mode for actual state transition. This script imports `check_phase_gates` and `format_results` directly from `check_gates.py` to reuse the gate logic.

**CLI:**

```bash
# Dry-run: show gate results without advancing
uv run scripts/advance_phase.py --state .sdlc/state.yaml

# Confirmed: advance after gate checks pass
uv run scripts/advance_phase.py --state .sdlc/state.yaml --confirmed
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--confirmed` | No | Human sign-off flag; without it, the script only checks gates (dry-run) |

**Process:**

1. **Load state and profile** from `.sdlc/state.yaml` and `.sdlc/profile.yaml`
2. **Check phase boundary** -- if already at Phase 9 (Monitoring), reports completion and exits
3. **Run all gate checks** for the current phase via `check_phase_gates()`
4. **Print gate results** using `format_results()` (always shown, even in confirmed mode)
5. **If any MUST gate fails:** exit with code `1`, print blockers
6. **If dry-run (no `--confirmed`):** exit with code `0`, print message that `--confirmed` is needed
7. **If confirmed and all gates pass:** update `state.yaml` atomically:
   - Set current phase status to `completed` with `completed_at` timestamp
   - Set next phase status to `active` with `entered_at` timestamp
   - Increment `current_phase` counter
   - Update `phase_name` string
   - Append transition record to `history` array:
     ```yaml
     - from: <current_phase_id>
       to: <next_phase_id>
       at: "2026-03-26T12:00:00+00:00"
       gate_results: { passed: N, failed: 0, total: N }
     ```
8. **Print next phase guidance:**
   - Phase display name and description
   - Primary and secondary skills
   - Required and optional artifacts
   - Artifact directory path
   - Phase definition file path

**Key Functions:**

- `get_phase_registry()` / `get_phase_def(phase_id)` -- Load and look up phase definitions
- `now_iso()` -- Generate UTC ISO 8601 timestamp
- `advance(state_path, confirmed)` -- Main logic; returns `0` (success), `1` (gate failure), `2` (config error)
- `save_yaml(path, data)` -- Atomic YAML write with `default_flow_style=False`

**Output (confirmed, success):**

```
Gate Results for Phase 0 (Discovery):
  [PASS] G1-integrity: problem-statement.md -- File exists
  [PASS] G2-completeness: problem-statement.md -- No placeholders found
  ...

[OK] Advanced: Phase 0 (discovery) -> Phase 1 (requirements)

==================================================
Now entering: Phase 1 -- Requirements
==================================================
Elicit, analyze, and document functional and non-functional requirements.

Primary skills:   requirements-analysis, stakeholder-interview
Secondary skills: domain-modeling

Required artifacts:
  - requirements.md
  - non-functional-requirements.md
  - epics.md
Optional artifacts:
  - stakeholder-analysis.md
  - phase2-handoff.md

Artifact directory: .sdlc/artifacts/phase01/
Phase definition:   phases/01-requirements.md

Run /sdlc to see full phase guidance.
```

**Exit codes:** `0` (success or dry-run pass), `1` (gate failure), `2` (configuration error)

---

### generate_phase_report.py

**Purpose:** Render SDLC phase artifacts as self-contained HTML reports. This is the largest script (~40KB) and produces polished, stakeholder-ready reports that can be opened directly in any browser without a server.

**CLI:**

```bash
# Single phase
uv run scripts/generate_phase_report.py --state .sdlc/state.yaml --phase 0

# Single phase with custom output path
uv run scripts/generate_phase_report.py --state .sdlc/state.yaml --phase 0 --output .sdlc/reports/phase00-report.html

# All phases (generates individual reports + index.html)
uv run scripts/generate_phase_report.py --state .sdlc/state.yaml --all
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--phase` | No | Phase number to render (0-9); mutually exclusive with `--all` |
| `--all` | No | Generate reports for all phases plus an index page |
| `--output` | No | Custom output path (defaults to `.sdlc/reports/phaseNN-report.html`) |

**Process:**

1. **Load state** to determine project metadata and phase statuses
2. **Resolve artifact directory** using multiple naming conventions (`phaseNN/`, `NN-phasename/`, `phase-NN/`)
3. **For each phase:**
   - Look up required and optional artifacts from `PHASE_INFO` metadata
   - Find each artifact file via `find_artifact()` (searches `.sdlc/artifacts/`, project root, `docs/`)
   - Convert Markdown content to HTML via `md_to_html()`
   - Embed into the HTML template with navigation and styling
4. **For `--all` mode:** additionally generates `index.html` with a timeline view of all phases

**Key Components:**

- **`PHASE_INFO` dict** -- Maps each phase number to its display name and list of `(filename, label)` artifact tuples
- **`md_to_html(text)`** -- Minimal GitHub-flavored Markdown to HTML converter handling:
  - Headings (h1-h6)
  - Code blocks with language class
  - Tables with thead/tbody
  - Unordered lists
  - Bold, italic, inline code, links
  - HTML escaping for security
- **`find_artifact(project_root, phase_num, filename)`** -- Searches multiple locations for an artifact file
- **`build_nav_items()` / `build_gate_items()`** -- Generate sidebar navigation and gate status indicators

**Visual Features:**

- Dark theme default (`#0f1117` background, `#6c8ef7` accent, `#4ade80` green)
- Phase timeline navigation bar across the top
- Sidebar table of contents with found/missing status indicators
- Gate status summary showing artifact presence
- Responsive layout (sidebar collapses on mobile)
- All CSS and JS inlined -- no external dependencies
- Missing artifacts appear as labeled placeholder sections (not errors)

**Output:** Self-contained HTML files in `.sdlc/reports/`:

```
.sdlc/reports/
  phase00-report.html
  phase01-report.html
  ...
  index.html            (only with --all)
```

**Exit codes:** `0` (success), `1` (state file not found or phase invalid)

---

### generate_status.py

**Purpose:** Generate a text-based status dashboard summarizing SDLC progress. Provides a quick overview of all phases, their completion status, and artifact counts.

**CLI:**

```bash
# Print to stdout
uv run scripts/generate_status.py --state .sdlc/state.yaml

# Write to file
uv run scripts/generate_status.py --state .sdlc/state.yaml --output status.md
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--output` | No | Write dashboard to file instead of stdout |

**Process:**

1. **Load state** and extract project metadata (`project_name`, `profile_id`, `current_phase`)
2. **Calculate progress** -- count completed phases, compute percentage
3. **Generate ASCII progress bar** -- 20-character bar with `#` (filled) and `-` (empty)
4. **Build phase table** -- iterate all 10 phases, show status icon, name, artifact count, and timestamps
5. **Count artifacts** per phase by scanning `.sdlc/artifacts/<phase-dir>/`

**Status Icons:**

| Status | Icon |
|--------|------|
| `completed` | `[x]` |
| `active` | `[>]` |
| `pending` | `[ ]` |
| `skipped` | `[-]` |

**Output Example:**

```markdown
# SDLC Status Dashboard
**Project:** my-app
**Profile:** microsoft-enterprise
**Current Phase:** 2 -- Design

**Progress:** [####------------] 20% (2/10 phases)

## Phases
| # | Phase          | Status | Artifacts | Entered    | Completed  |
|---|----------------|--------|-----------|------------|------------|
| 0 | Discovery      | [x]    | 3         | 2026-03-01 | 2026-03-05 |
| 1 | Requirements   | [x]    | 5         | 2026-03-05 | 2026-03-15 |
| 2 | Design         | [>]    | 2         | 2026-03-15 | --         |
| 3 | Planning       | [ ]    | 0         | --         | --         |
...
```

**Exit codes:** `0` (success), `1` (state file not found)

---

### audit_gates.py

**Purpose:** Analyze gate effectiveness across completed SDLC phases. Identifies gates that are too lenient (always pass), too strict (consistently fail), or frequently overridden. Useful for tuning gate configuration over time and across projects.

**CLI:**

```bash
# Single project audit
uv run scripts/audit_gates.py --state .sdlc/state.yaml

# Compare two projects side-by-side
uv run scripts/audit_gates.py --state .sdlc/state.yaml --compare /other-project/.sdlc/state.yaml
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--compare` | No | Path to another `state.yaml` for cross-project comparison |

**Process:**

1. **Extract gate history** via `extract_gate_history(state)`:
   - Iterates all phases in `state.phases`
   - Collects `gate_results` from each completed phase
   - Handles both list and dict formats for gate results
   - Returns flat list of gate result records with phase attribution
2. **Analyze gates** via `analyze_gates(results)`:
   - Aggregates per-gate statistics using `defaultdict`:
     - `total` -- total number of checks
     - `passed` -- count of passed checks
     - `failed` -- count of failed checks
     - `manual` -- count of manual/overridden checks
     - `phases_seen` -- set of phases where the gate was evaluated
     - `overrides` -- list of override records with justifications
3. **Format report** via `format_report(gate_stats, state)`:
   - **Summary section:** project name, total gates evaluated, overall pass rate
   - **Always-Pass Gates:** gates with 0 failures and >0 evaluations (candidates for tightening or removal)
   - **High-Fail Gates:** gates with >50% failure rate (possible process issues or overly strict thresholds)
   - **Override History:** table of all manual overrides with gate name, phase, and justification
   - **Recommendations:** actionable suggestions based on the analysis

**Output Sections:**

```
# Gate Effectiveness Audit
Project: my-app | Phases analyzed: 5

## Summary
Total gate evaluations: 42
Overall pass rate: 85.7%

## Always-Pass Gates (candidates for tightening or removal)
  - G1-integrity: passed 15x across phases [0, 1, 2, 3, 4]

## High-Fail Gates (>50% failure rate -- possible process issues)
  - G3-metrics: failed 4/6 (67%)

## Override History
| Gate | Phase | Justification |
|------|-------|---------------|
| G2-completeness | 3 | TDD stubs intentionally contain TODO markers |

## Recommendations
- 1 always-pass gate(s) detected. Consider tightening or removing.
- 1 override(s) recorded. Review whether overridden gates should be relaxed.
```

**Cross-Project Comparison:** When `--compare` is provided, the script runs the full analysis pipeline on both state files and prints both reports separated by a divider. This enables manual comparison of gate configurations across projects.

**Exit codes:** `0` (success), `1` (state file not found)

---

### synthesize_spec.py

**Purpose:** Synthesize Phase 0 (Discovery) and Phase 1 (Requirements) artifacts into a single consolidated specification file. This spec serves as the primary input for `/deep-plan` integration, providing a self-contained project description.

**CLI:**

```bash
uv run scripts/synthesize_spec.py --state .sdlc/state.yaml [--output <path>]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--output` | No | Output file path (defaults to `.sdlc/artifacts/spec.md`) |

**Process:**

1. **Resolve artifacts base** from `state.yaml` parent directory
2. **Read Phase 0 artifacts** (optional enrichment):
   - `00-discovery/problem-statement.md`
   - `00-discovery/constraints.md`
   - `00-discovery/success-criteria.md`
3. **Read Phase 1 artifacts** (primary content):
   - `01-requirements/requirements.md` (REQUIRED -- script exits with error if missing/empty)
   - `01-requirements/non-functional-requirements.md`
   - `01-requirements/epics.md`
   - `01-requirements/phase2-handoff.md`
4. **Assemble specification** by concatenating sections with headers:
   - `# Project Specification` (with synthesis timestamp and source path)
   - `## Problem Statement` (from Phase 0, if available)
   - `## Requirements` (from Phase 1, always present)
   - `## Non-Functional Requirements` (if available)
   - `## Epics & User Stories` (if available)
   - `## Constraints` (from Phase 0, if available)
   - `## Success Criteria` (from Phase 0, if available)
   - `## Phase 2 Handoff Notes` (if available)
5. **Write output** to the specified path

**Key Function:**

- `read_artifact(path)` -- Returns file content as stripped string, or empty string if file does not exist. Uses `encoding="utf-8"` with `errors="replace"` for robustness.

**Output:** A single Markdown file combining all early-phase artifacts into a format consumable by `/deep-plan`.

**Exit codes:** `0` (success), `1` (`requirements.md` missing or empty, state file not found)

---

### map_deep_plan_artifacts.py

**Purpose:** Transform `/deep-plan` section outputs into SDLC-formatted phase artifacts. This is the bridge between the `/deep-plan` planning system and the SDLC artifact structure. Supports both Phase 2 (Design) and Phase 3 (Planning) mapping modes. The script is idempotent and safe to re-run.

**CLI:**

```bash
# Phase 2 mapping (after /deep-plan steps 1-15)
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 2 --planning-dir planning/

# Phase 3 mapping (after /deep-plan steps 16-22)
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 3 --planning-dir planning/
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `--state` | Yes | Path to `.sdlc/state.yaml` |
| `--phase` | Yes | Target phase (2 or 3) |
| `--planning-dir` | Yes | Path to the `/deep-plan` planning directory |

**Key Functions:**

- `copy_if_exists(src, dest)` -- Copies a file or directory if source exists; creates parent directories as needed; handles both files (`shutil.copy2`) and directories (`shutil.copytree` with overwrite)
- `extract_sections_by_heading(content, level)` -- Parses Markdown into a dict of `{heading: content}` by heading level
- `parse_section_manifest(index_content)` -- Extracts the `SECTION_MANIFEST` from `sections/index.md` using a regex match on `<!-- SECTION_MANIFEST ... END_MANIFEST -->` comment blocks
- `parse_project_config(index_content)` -- Extracts project configuration values from the index
- `transform_section_to_sdlc(section_name, number, content, tdd_content, manifest)` -- Converts a `/deep-plan` section file into the SDLC converged template format
- `map_phase_2(planning_dir, artifacts_dir)` -- Phase 2 specific mapping (design artifacts)
- `map_phase_3(planning_dir, artifacts_dir)` -- Phase 3 specific mapping (section plans)

**Phase 3 Mapping Process (primary use case):**

1. **Read section manifest** from `planning/sections/index.md`
2. **Fallback discovery** -- if no manifest found, glob for `section-*.md` files directly
3. **Read TDD plan** from `planning/claude-plan-tdd.md`
4. **For each section in manifest:**
   - Locate the corresponding `/deep-plan` file at `planning/sections/<section-name>.md`
   - Transform to SDLC format via `transform_section_to_sdlc()`
   - Write to `.sdlc/artifacts/03-planning/section-plans/SECTION-NNN.md` (zero-padded 3-digit number)
5. **Copy supplementary files:**
   - `claude-plan-tdd.md` -> `.sdlc/artifacts/03-planning/tdd-plan.md`
   - `sections/index.md` -> `.sdlc/artifacts/03-planning/dependency-map.md`

**Converged Template Format:**

The output uses `SECTION-template-deep-plan.md` which preserves both systems' requirements:

- **SDLC structured fields:** Goal, Epics/Stories, Entry/Exit Criteria, Dependencies, Interfaces, Test Strategy, Risk
- **`/deep-plan` prose:** Full implementation guidance in a dedicated "Implementation Guidance" section, self-contained enough for `/deep-implement` to consume

**Output Structure:**

```
.sdlc/artifacts/03-planning/
  section-plans/
    SECTION-001.md
    SECTION-002.md
    ...
    SECTION-NNN.md
  tdd-plan.md
  dependency-map.md
```

**Exit codes:** `0` (success), `1` (state file or planning directory not found)

---

## 4. Dependencies

Defined in `scripts/pyproject.toml`:

```toml
[project]
name = "claude-code-sdlc-scripts"
version = "0.1.0"
description = "Automation scripts for claude-code-sdlc plugin"
requires-python = ">=3.12"
dependencies = [
    "pyyaml>=6.0",
    "jsonschema>=4.20",
]

[project.optional-dependencies]
test = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
]
```

| Dependency | Version | Purpose |
|------------|---------|---------|
| **PyYAML** | >=6.0 | YAML parsing and serialization for `state.yaml`, `profile.yaml`, `phase-registry.yaml`, and compliance gate files |
| **jsonschema** | >=4.20 | JSON Schema validation (available for structured validation beyond YAML) |
| **pytest** | >=7.0 (dev) | Test runner for script unit tests |
| **pytest-cov** | >=4.0 (dev) | Coverage reporting for pytest |
| **Python** | >=3.12 | Required for modern type hint syntax (`Path \| None`, `list[str]`) |

**Build system:** Hatchling (`hatchling.build`)

**Test configuration:** Tests live in `scripts/tests/`, run with `uv run pytest` or `uv run pytest --cov`.

---

## 5. Error Handling

All scripts follow consistent error handling conventions:

- **Errors to stderr:** Critical errors are written to `sys.stderr` (some scripts use `print(..., file=sys.stderr)`)
- **Structured messages:** Error messages include file paths and field names for easy debugging:
  ```
  Error: State file not found: /path/to/.sdlc/state.yaml
  Error: requirements.md not found or empty in 01-requirements/
  company: missing required field 'profile_id'
  ```
- **Non-zero exit codes:** All failures produce exit code `1` (or `2` for configuration errors in `advance_phase.py`), propagated to the calling command
- **Graceful degradation:** Where possible, scripts continue with warnings rather than hard failures:
  - `init_project.py` warns and skips if `.sdlc/` exists
  - `synthesize_spec.py` treats Phase 0 artifacts as optional
  - `map_deep_plan_artifacts.py` warns on missing section files and skips them
  - `generate_phase_report.py` shows placeholder sections for missing artifacts
- **YAML round-trip safety:** State updates use `yaml.dump()` with `default_flow_style=False` and `allow_unicode=True` to preserve human readability

---

## 6. Cross-References

| Document | Relationship |
|----------|-------------|
| [commands.md](commands.md) | Documents which slash commands invoke which scripts |
| [gate-system.md](gate-system.md) | Detailed gate semantics and severity rules |
| [architecture.md](architecture.md) | Overall plugin architecture and data flow |
| [profiles.md](profiles.md) | Profile YAML structure and schema reference |
| `phases/phase-registry.yaml` | Phase definitions consumed by `check_gates.py` and `advance_phase.py` |
| `profiles/_schema.yaml` | Schema consumed by `validate_profile.py` |
| `templates/state-init.yaml` | State template consumed by `init_project.py` |
| `templates/phases/03-planning/section-plans/SECTION-template-deep-plan.md` | Converged template consumed by `map_deep_plan_artifacts.py` |
