# Slash Commands Reference

Comprehensive documentation for all slash commands provided by the claude-code-sdlc plugin. These commands orchestrate the full Software Development Lifecycle within Claude Code, managing phase transitions, gate validation, reporting, and process auditing.

---

## Table of Contents

- [Command Overview Table](#command-overview-table)
- [/sdlc-setup -- Interactive Setup Wizard](#sdlc-setup----interactive-setup-wizard)
- [/sdlc -- Phase Guidance](#sdlc----phase-guidance)
- [/sdlc-status -- Progress Dashboard](#sdlc-status----progress-dashboard)
- [/sdlc-gate -- Exit Criteria Check](#sdlc-gate----exit-criteria-check)
- [/sdlc-next -- Advance to Next Phase](#sdlc-next----advance-to-next-phase)
- [/sdlc-phase-report -- Generate Phase HTML Report](#sdlc-phase-report----generate-phase-html-report)
- [/sdlc-audit -- Gate Effectiveness Analysis](#sdlc-audit----gate-effectiveness-analysis)
- [Command Interaction Flow](#command-interaction-flow)
- [Python Script Invocation](#python-script-invocation)
- [Cross-References](#cross-references)

---

## Command Overview Table

| Command | Purpose | Modifies State | Typical Usage |
|---------|---------|:--------------:|---------------|
| `/sdlc-setup` | Initialize SDLC for a project | Yes -- creates `.sdlc/` | Once per project, at the very start |
| `/sdlc` | Show current phase guidance | No | Start of each work session |
| `/sdlc-status` | Display progress dashboard | No | Anytime -- quick status check |
| `/sdlc-gate` | Run 5-gate exit criteria check | Yes -- records `gate_results` | Before attempting to advance phases |
| `/sdlc-next` | Run gates + advance phase | Yes -- advances `current_phase` | When ready to move to the next phase |
| `/sdlc-phase-report` | Generate HTML report | No | Stakeholder reviews, documentation |
| `/sdlc-audit` | Analyze gate effectiveness | No | After 3-4+ completed phases |

---

## /sdlc-setup -- Interactive Setup Wizard

### What It Does

Initializes the SDLC lifecycle management structure for a target project. This is the first command to run and is required before any other `/sdlc-*` command will function. It creates the `.sdlc/` directory, selects and validates a profile, and configures the project's `CLAUDE.md` with SDLC context.

### Arguments

None. The command is fully interactive.

### Internal Flow

**Step 1: Check Existing Setup**
The command looks for `.sdlc/state.yaml` in the current directory. If it already exists, the user is warned that SDLC is already initialized and presented with two options: view status via `/sdlc-status`, or re-initialize (destructive, requires explicit confirmation).

**Step 2: Profile Selection**
Available profiles are listed from the plugin's `profiles/` directory (excluding `_schema.yaml`). Current built-in profiles:

- **microsoft-enterprise** -- C#/.NET 8 + Angular 17 + Azure, SOC 2 compliance, 80% coverage minimum, TDD required.
- **starter** -- Minimal profile with no compliance gates; a quick start suitable for any stack.

**Step 3: Project Configuration**
The user is prompted for:
- **Project name** (defaults to the current directory name).
- Confirmation that the selected profile settings are appropriate.

**Step 4: Initialize .sdlc/ Directory**
The init script is invoked:
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/init_project.py \
  --profile <plugin-root>/profiles/<selected-profile>/profile.yaml \
  --target . \
  --name "<project-name>"
```

This creates the following structure:
```
.sdlc/
  state.yaml          # Phase tracking (Phase 0: Discovery active)
  profile.yaml        # Frozen copy of the selected profile
  constitution.md     # Project constitution
  artifacts/          # Per-phase artifact directories (00 through 09)
```

**Step 5: Update CLAUDE.md**
The profile's `claude-md-template.md` contents are appended to the project's `CLAUDE.md`. If `CLAUDE.md` does not exist, it is created.

**Step 6: Confirmation Display**
A summary is shown:
```
SDLC initialized successfully!

Profile: <profile-id>
Phase: 0 -- Discovery (active)
Artifacts: .sdlc/artifacts/00-discovery/

Next steps:
1. Run /sdlc to see Phase 0 guidance
2. Create your problem statement in .sdlc/artifacts/00-discovery/problem-statement.md
3. Run /sdlc-gate when ready to check exit criteria
4. Run /sdlc-next to advance to Phase 1
```

**Step 7: Post-Init Validation**
The profile validator runs against the frozen copy to confirm setup health:
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/validate_profile.py .sdlc/profile.yaml
```

### State Changes

- Creates `.sdlc/state.yaml` with `current_phase: 0` and Phase 0 status set to `active`.
- Creates `.sdlc/profile.yaml` (frozen profile copy).
- Creates `.sdlc/constitution.md`.
- Creates `.sdlc/artifacts/` with subdirectories `00-discovery/` through `09-monitoring/`.
- Appends SDLC context to the target project's `CLAUDE.md`.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `init_project.py` | Creates the `.sdlc/` directory structure and initial `state.yaml` |
| `validate_profile.py` | Validates the frozen profile against `_schema.yaml` |

### Error Scenarios

| Scenario | Behavior |
|----------|----------|
| `uv` not installed | Instructs user to install via `pip install uv` or `brew install uv` |
| Profile validation fails | Displays specific validation errors and suggests fixes |
| Directory permissions error | Reports the OS-level error clearly |
| Already initialized | Warns user; offers view-status or destructive re-init with confirmation |

---

## /sdlc -- Phase Guidance

### What It Does

Displays actionable guidance for the current (or specified) SDLC phase. This is the primary orientation command -- it tells you what to do, which skills to use, which artifacts to produce, and what the exit criteria are. It is read-only and never modifies state.

### Arguments

| Argument | Description |
|----------|-------------|
| *(none)* | Show guidance for the current phase |
| `<phase-number>` | Show guidance for a specific phase (e.g., `/sdlc 3`) |

### Internal Flow

1. **Locate state:** Read `.sdlc/state.yaml`. If missing, instruct user to run `/sdlc-setup`.
2. **Read state:** Extract `current_phase` (or use the argument-specified phase).
3. **Load phase definition:** Read the corresponding `phases/XX-phasename.md` file from the plugin.
4. **Load profile:** Read `.sdlc/profile.yaml` for stack and quality configuration.
5. **Display phase context** with the following sections:

### Output Sections

**Header** -- Phase number, name, and active profile ID.

**Purpose** -- One-line description of the phase's goal.

**Resolved Questions from Previous Phase** -- Checks the previous phase's handoff document for a "Resolved Questions" section. If present, lists them as confirmed inputs that MUST inform the current phase's artifacts. If absent, notes that and continues.

**What to Do Next** -- Actionable next steps based on the phase workflow, current artifact state, and resolved questions. References specific skills and commands. Example: *"Write `requirements.md` using resolved questions RQ-1 through RQ-3 as inputs."*

**Required Artifacts** -- A checklist with existence and size status:
```
[x] artifact.md (exists, 1.2KB)
[ ] other-artifact.md (missing)
```

**Skills to Use** -- Primary and secondary skills relevant to the phase.

**Exit Criteria** -- Summary of conditions required to advance, sourced from the phase definition.

**Quick Commands** -- Reminder block:
```
/sdlc-gate    -- Check if exit criteria are met
/sdlc-next    -- Advance to next phase (runs gate check)
/sdlc-status  -- View full progress dashboard
```

**Compliance Callout** -- If the active profile includes compliance frameworks (e.g., SOC 2), any compliance-specific requirements for the phase are highlighted.

### State Changes

None. This command is purely informational.

### When to Use

- At the start of any work session to orient yourself.
- When you need to know what artifact to produce next.
- When reviewing requirements for a phase you haven't started yet (using the phase-number argument).

---

## /sdlc-status -- Progress Dashboard

### What It Does

Generates and displays a progress dashboard showing overall SDLC status: current phase, completion percentages, artifact counts, and transition history. This is the quick-glance command for understanding where the project stands.

### Arguments

None.

### Internal Flow

1. **Locate state:** Read `.sdlc/state.yaml`. If missing, instruct user to run `/sdlc-setup`.
2. **Read state:** Load current phase, all phase statuses, and transition history.
3. **Generate dashboard:** Execute:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_status.py \
     --state .sdlc/state.yaml
   ```
4. **Display dashboard** with:
   - Current phase name and number.
   - Progress bar (completed phases / total phases).
   - Phase table with status indicators, artifact counts, and timestamps.
   - Recent transition history (if any phase transitions have occurred).
5. **Suggest next action** based on current status:
   - Phase is `active`: suggest `/sdlc` for guidance.
   - All gates would pass: suggest `/sdlc-next` to advance.
   - Artifacts are missing: list what is needed.

### Output Format

A concise markdown table designed to fit on one screen. Generated by `generate_status.py`.

### State Changes

None. This command is purely informational.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `generate_status.py` | Reads `state.yaml` and produces the formatted dashboard |

---

## /sdlc-gate -- Exit Criteria Check

### What It Does

Runs the 5-gate validation system against the current (or specified) phase to determine readiness for advancement. Generates an HTML report and opens it in the default browser. Records gate results in state but does NOT advance the phase -- that is exclusively `/sdlc-next`'s responsibility.

### The 5-Gate System

| Gate | Name | What It Validates |
|------|------|-------------------|
| G1 | Integrity | Artifact structure and format correctness |
| G2 | Completeness | All required artifacts exist with sufficient content |
| G3 | Metrics | Quantitative thresholds (coverage, size, counts) |
| G4 | Compliance | Regulatory and framework-specific requirements |
| G5 | Quality | Content quality, consistency, and cross-references |

Each gate reports one of three statuses:
- **PASS** -- Criteria fully satisfied.
- **FAIL** -- Criteria not met; includes details on what failed.
- **MANUAL** -- Requires human review and sign-off.

Each gate also has a severity level:
- **MUST** -- Blocking. Phase cannot advance if this gate fails.
- **SHOULD** -- Warning. Phase can advance but issues are flagged.
- **MAY** -- Advisory. Informational only.

### Arguments

| Argument | Description |
|----------|-------------|
| *(none)* | Check the current phase |
| `<phase-number>` | Check a specific phase (e.g., `/sdlc-gate 2`) |

### Internal Flow

1. **Locate state:** Read `.sdlc/state.yaml`. If missing, instruct user to run `/sdlc-setup`.
2. **Read state:** Determine the current phase (or use the argument-specified phase).
3. **Run gate checks:**
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/check_gates.py \
     --state .sdlc/state.yaml
   ```
   Optionally with `--phase <N>` for a specific phase.
4. **Display results:** For each of the 5 gates, show: gate name, PASS/FAIL/MANUAL status, severity (MUST/SHOULD/MAY), and specific details.
5. **Generate HTML report:**
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml --phase <phase-number>
   ```
6. **Open report** in the default browser (`start` on Windows, `open` on macOS, `xdg-open` on Linux).
7. **Summarize** with counts of passed/failed/manual checks and an overall verdict:
   - **BLOCKED** -- Any MUST gate failed. Lists specific blockers with remediation suggestions.
   - **REVIEW NEEDED** -- Only manual checks remain. Reminds user to share the HTML report for stakeholder sign-off.
   - **READY** -- All gates pass. Suggests running `/sdlc-next` to advance.
8. **Update state:** Record gate results in `.sdlc/state.yaml` under the current phase's `gate_results` field.

### State Changes

- Writes `gate_results` to the current phase entry in `state.yaml`.
- Generates `.sdlc/reports/phaseNN-report.html`.
- Does NOT modify `current_phase`.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `check_gates.py` | Runs all 5 gates and returns structured results |
| `generate_phase_report.py` | Renders artifacts and gate results into a self-contained HTML report |

### Important Distinction

This command is **read-only with respect to phase transitions**. It records gate results but never changes `current_phase`. To actually advance, use `/sdlc-next`.

---

## /sdlc-next -- Advance to Next Phase

### What It Does

The most consequential command in the SDLC plugin. It runs gate checks, enforces a blocking Human-in-the-Loop (HITL) gate for open questions, advances the phase if all MUST gates pass and the user confirms, and then displays guidance for the new phase.

### Arguments

None. Always operates on the current phase.

### Internal Flow

**Step 1-2: Locate and Read State**
Standard state file lookup from `.sdlc/state.yaml`.

**Step 3: Run Gate Checks**
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/check_gates.py \
  --state .sdlc/state.yaml
```

**Step 4: Evaluate Gate Results**

*If ANY MUST gate fails:*
- Display the failure report with specific blockers and remediation suggestions.
- Generate and open the HTML phase report (to show what is missing).
- Do NOT advance the phase.

*If all MUST gates pass (SHOULD/MAY may still have warnings):*
- Display success message and any remaining warnings.
- Generate and open the HTML phase report.
- Proceed to the HITL gate (Step 5).

**Step 5: HITL Gate -- Explicit Sign-Off**
Present a phase summary (what was produced, key decisions made) and ask: *"Does this look correct? Shall I advance to Phase N?"* The `advance_phase.py` script is NOT called until the human explicitly confirms.

**Step 6: Advance Phase**
Update `.sdlc/state.yaml`:
- Set current phase status to `completed` with `completed_at` timestamp.
- Set next phase status to `active` with `entered_at` timestamp.
- Increment `current_phase` and update `phase_name`.
- Append transition to the `history` array:
  ```yaml
  - from: <current_phase_id>
    to: <next_phase_id>
    at: "<ISO 8601 timestamp>"
    gate_results: { <summary of pass/fail> }
  ```

**Step 7: BLOCKING HITL Gate -- Resolve Open Questions**

This gate is **MANDATORY** and **BLOCKING**. It MUST be completed before any new-phase work begins. There are no exceptions.

Procedure:
1. Read the handoff document produced by the phase just completed (e.g., `phase2-handoff.md`).
2. Extract ALL Q-NN or AQ-NN items listed under "Open Questions", "What X Must Address", or similar headings.
3. Display them in a prominent block:

   ```
   ---------------------------------------------------------------
   BLOCKING: OPEN QUESTIONS MUST BE RESOLVED BEFORE PHASE N BEGINS

   The following questions were raised during the previous phase.
   You MUST answer or confirm defaults for every item below.
   No artifacts will be written until all are resolved.

   | ID    | Question       | Needed by        | Proposed default    |
   |-------|----------------|------------------|---------------------|
   | AQ-01 | [question]     | [who/what]       | [proposed default]  |
   | AQ-02 | [question]     | [who/what]       | [proposed default]  |

   For each question: confirm the default, adjust it, or provide
   your own answer.
   ---------------------------------------------------------------
   ```

4. A reasonable default is proposed for every question based on project context (state, previous handoffs, artifacts, profile). Questions are never left without a proposed default.
5. **Execution halts.** No artifacts are written, no summaries of next steps are provided. The command waits for the user to respond.
6. Once the user confirms or provides answers, resolutions are recorded in the handoff document under a "Resolved Questions" section with timestamps.
7. Only after every open question is resolved does the command proceed.

If there are no open questions in the handoff document, the command explicitly states: *"No open questions found in the handoff. Proceeding to phase guidance."*

**Step 8: Show Next Phase Guidance**
After advancement and HITL resolution, display:
- New phase name and description.
- Primary skills to use.
- Required artifacts to produce.
- Entry criteria (already met by advancing).
- Reference to the phase definition file for full details.

**Step 9: Edge Case -- Phase 9 Completion**
If already at Phase 9 (Monitoring) and all gates pass, the project is marked as complete. The user is congratulated and informed about post-SDLC re-entry points for future work.

### State Changes

- Updates `gate_results` for the current phase.
- Sets current phase status to `completed` with timestamp.
- Sets next phase status to `active` with timestamp.
- Increments `current_phase` and updates `phase_name`.
- Appends to the `history` array.
- Updates handoff documents with resolved questions.
- Generates `.sdlc/reports/phaseNN-report.html`.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `check_gates.py` | Runs the 5-gate validation system |
| `advance_phase.py` | Updates `state.yaml` with phase transition (called with `--confirmed`) |
| `generate_phase_report.py` | Generates the HTML report before advancement |

### Critical Notes

- Gate checks are mandatory. There is no `--force` flag. For exceptional cases, use the override protocol documented in `references/validation-rules.md`.
- The HITL gate in Step 7 is **non-negotiable**. Open questions MUST be surfaced with proposed defaults and resolved with user confirmation before any new-phase artifact work begins. Skipping this gate undermines the entire HITL workflow.

---

## /sdlc-phase-report -- Generate Phase HTML Report

### What It Does

Renders all artifacts for a specified phase (or all phases) into a self-contained HTML report suitable for stakeholder review. Reports include dark-theme styling, Mermaid.js diagram rendering, and gate status indicators. No web server is required -- reports open directly in a browser.

### Arguments

| Argument | Description |
|----------|-------------|
| *(none)* | Generate report for the current phase |
| `<phase-number>` | Generate report for a specific phase (0-9) |
| `--all` | Generate individual reports for all phases (0-9) plus an `index.html` |

### Internal Flow

1. **Locate state:** Read `.sdlc/state.yaml`. If missing, instruct user to run `/sdlc-setup`.
2. **Determine target phase:** Use `current_phase` from state if no argument provided; validate that the phase number is 0-9.
3. **Run report generator:**

   For a single phase:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml \
     --phase <phase-number> \
     --output .sdlc/reports/phase<NN>-report.html
   ```

   For all phases:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml \
     --all
   ```

4. **Open in browser** automatically (`start` on Windows, `open` on macOS, `xdg-open` on Linux).
5. **Show artifact inventory:** After generating, list:
   - Which required artifacts were found and rendered.
   - Which required artifacts were missing (shown as placeholder sections in the report).
   - Exit gate status (pass/fail/incomplete).

### Output Location

Reports are written to `.sdlc/reports/` in the target project:
- `phaseNN-report.html` -- Individual phase report.
- `index.html` -- Full project report (generated with `--all`).

### Report Characteristics

- **Self-contained:** All CSS and JavaScript are inlined. A single HTML file with no external dependencies.
- **Dark theme:** Styled for comfortable reading.
- **Mermaid.js diagrams:** Any Mermaid diagram blocks in artifacts are rendered as interactive SVGs.
- **Missing artifacts:** Displayed as labeled placeholder sections, not errors.
- **Gate status:** Included to show phase readiness at the time of report generation.

### State Changes

None. This command generates files but does not modify `state.yaml`.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `generate_phase_report.py` | Converts artifacts and gate data into self-contained HTML |

---

## /sdlc-audit -- Gate Effectiveness Analysis

### What It Does

Analyzes gate pass/fail patterns across all completed phases to identify which gates are useful and which are candidates for calibration. This is a process improvement tool -- it helps you tune the SDLC to your actual project needs rather than relying on defaults.

### Arguments

| Argument | Description |
|----------|-------------|
| *(none)* | Audit the current project |
| `--compare <path>` | Compare gate effectiveness with another project's `state.yaml` |

### Internal Flow

1. **Locate state:** Read `.sdlc/state.yaml`. If missing, instruct user to run `/sdlc-setup`.
2. **Read state:** Extract `gate_results` from every completed phase.
3. **Run audit analysis:**
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/audit_gates.py \
     --state .sdlc/state.yaml
   ```
4. **Display results** with the following sections:

**Gate Effectiveness Summary** -- Table of every gate checked, how many times it ran, and how many times it failed.

**Always-Pass Gates** -- Gates that never failed across all phases. These are candidates for removal (if they never catch anything, they may not be adding value) or tightening (thresholds may be too lenient).

**High-Fail Gates** -- Gates that failed frequently. These may indicate systemic process issues (the team consistently struggles with certain criteria) or overly strict thresholds that need adjustment.

**Override History** -- Any gates that were overridden using the override protocol, including the justification text provided at override time.

**Recommendations** -- Suggested actions based on the analysis patterns.

5. **Cross-project comparison:** If `--compare <other-state.yaml>` is provided, the audit compares gate effectiveness between two projects, highlighting where profiles differ in strictness.

### Prerequisites

Useful auditing requires at least 3-4 completed phases to produce meaningful data. If fewer phases are complete, the command warns that results may not be representative.

### State Changes

None. This command is purely analytical and never modifies state.

### Python Scripts Called

| Script | Purpose |
|--------|---------|
| `audit_gates.py` | Reads gate history from `state.yaml` and produces the effectiveness report |

---

## Command Interaction Flow

The typical SDLC lifecycle follows this pattern:

```
/sdlc-setup
    |
    v
/sdlc          <-- Orient: what phase am I in, what do I do?
    |
    v
  [work]       <-- Produce artifacts, use skills, write code
    |
    v
/sdlc-gate     <-- Check: am I ready to advance?
    |
    +-- FAIL --> fix issues --> /sdlc-gate (repeat)
    |
    +-- PASS
         |
         v
/sdlc-next     <-- Advance: run gates, HITL sign-off, resolve questions
    |
    v
/sdlc          <-- Orient to the new phase
    |
    v
  [repeat until Phase 9 complete]
```

Supporting commands used at any time:
- `/sdlc-status` -- Quick progress check (no prerequisites beyond setup).
- `/sdlc-phase-report` -- Generate shareable HTML report for any phase.
- `/sdlc-audit` -- Analyze gate effectiveness after several phases complete.

### Session Start Pattern

A typical work session begins with:
1. `/sdlc-status` -- See where the project stands.
2. `/sdlc` -- Get actionable guidance for the current phase.
3. Work on artifacts.
4. `/sdlc-gate` -- Verify progress before ending the session or advancing.

---

## Python Script Invocation

### The uv Runtime

All commands invoke Python scripts through `uv`, a fast Python package manager and runner. The invocation pattern is:

```bash
uv run --project <plugin-root>/scripts <script-path> [arguments]
```

The `--project <plugin-root>/scripts` flag tells `uv` to use the `pyproject.toml` in the plugin's `scripts/` directory for dependency resolution. This ensures scripts have access to their required packages (PyYAML, Jinja2, etc.) without polluting the target project's environment.

### How Scripts Find state.yaml

Scripts receive the path to `state.yaml` via the `--state` argument. This is always relative to or within the target project's `.sdlc/` directory. The calling command is responsible for resolving the correct path before invocation.

### How Scripts Output Results

Scripts write structured output to stdout, which the calling command parses and displays. HTML reports are written directly to `.sdlc/reports/`. Exit codes indicate success (0) or failure (non-zero), with error details on stderr.

### Script Inventory

| Script | Called By | Purpose |
|--------|-----------|---------|
| `init_project.py` | `/sdlc-setup` | Creates `.sdlc/` directory structure |
| `validate_profile.py` | `/sdlc-setup` | Validates profile YAML against schema |
| `generate_status.py` | `/sdlc-status` | Generates progress dashboard |
| `check_gates.py` | `/sdlc-gate`, `/sdlc-next` | Runs the 5-gate validation system |
| `generate_phase_report.py` | `/sdlc-gate`, `/sdlc-next`, `/sdlc-phase-report` | Renders HTML reports |
| `advance_phase.py` | `/sdlc-next` | Updates `state.yaml` with phase transition |
| `audit_gates.py` | `/sdlc-audit` | Analyzes gate effectiveness across phases |

---

## Cross-References

- **Gate system details:** See [gate-system.md](gate-system.md) for the full 5-gate specification, severity levels, and override protocol.
- **State machine:** See [state-machine.md](state-machine.md) for the `state.yaml` schema and valid phase transitions.
- **Phase lifecycle:** See [phase-lifecycle.md](phase-lifecycle.md) for phase definitions, artifact requirements, and entry/exit criteria.
- **Script internals:** See [scripts.md](scripts.md) for Python script implementation details, dependencies, and extension points.
- **Validation rules:** See [references/validation-rules.md](../references/validation-rules.md) for gate override protocol and validation rule definitions.
