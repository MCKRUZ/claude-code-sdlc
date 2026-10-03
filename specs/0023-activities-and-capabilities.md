---
spec: "0023"
name: "activities-and-capabilities"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md sections 2.2 and 6 (activities declared by the plugin; capabilities for older-plugin gating)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "scripts/stage_readiness.py and scripts/generate_status.py: both already emit a JSON document Studio reads, are read-only, and gain new information only as additive keys an older reader ignores. Activities and capabilities are two more additive keys on those same two documents."
created: "2026-10-02"
---

# Spec 0023 — activities-and-capabilities

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
The plugin declares, for each phase, the activities a person can do there (create a document, run a check, talk it through) and reports which are done, available or blocked and why, and it declares which capabilities it has, so Studio can draw the stage's guided steps and hide what an older plugin cannot do without hard-coding either list.

## Why
The approved Studio plan (`docs/proposals/studio-command-coverage-plan-v2.md`) turns the Workflow tab into the stage's declared activities instead of just its required documents and sign-off. If Studio held that list itself it would be a second hand-written copy of what each phase offers, drifting from the plugin the first time a command changes — the failure mode the Studio design rule exists to prevent. If the plugin owns the list, adding a command later is one entry and no Studio change. The same reasoning applies to what an installed plugin can do: Studio is released separately, so it will meet plugins that predate the scripts it wants to call, and today the only signal is a failed call that dumps an argument-parsing error at a project manager. A declared capability list lets Studio hide a button and say why, instead.

## Scope

### In scope
- New `phases/activities.yaml` — the declaration, keyed by phase id.
- New `scripts/activities_model.py` — loads and validates the declaration and evaluates each activity's status against a project; pure and read-only.
- `scripts/stage_readiness.py` — adds two keys to its JSON: `activities` (evaluated) and `definition` (the phase file path). Its text report and every existing key stay as they are.
- New `scripts/capabilities.py` and `scripts/generate_status.py` — `--json` gains a `capabilities` list; the markdown dashboard is unchanged.
- Tests under `scripts/tests/` (new files, plus additions to none of the existing ones), and `CLAUDE.md`.

### Out of scope
- `phases/phase-registry.yaml` and `scripts/phase_model.py`: named in `CLAUDE.md` as protected core, byte-for-byte unchanged — which is why the declaration is a separate file, not a block in the registry. **Stop and ask** if either needs to change.
- The other protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `advance_phase.py`) and every existing template, shape and fixture.
- Any Studio (`studio/`) change: this spec produces the data; the next spec draws it.
- Build-loop (per-spec) actions such as bind a channel or open a spike: those are actions on a spec row of the Build board, not stage activities.
- Running anything: evaluating an activity reads files and the profile; it never runs a script or a model.

## Acceptance Checks
- [ ] `phases/activities.yaml` validates: every key is a phase id in the registry; every activity has a unique `id` within its phase, a `label`, a `kind` of `run`, `create`, `check`, `draft` or `talk`, and a `command` that is either null or names an existing `commands/<command>.md`; every `after` entry names another activity in the same phase; every `creates` path maps to an existing template (`.sdlc/artifacts/<phase>/<name>.md` to `templates/phases/<phase>/<name>.md`, and `review-report.md` to `templates/review-report.md`); a violation of any of these fails a test that names the activity and the rule.
- [ ] `activities_model.evaluate(repo_root, phase_id)` returns, in declared order, one entry per activity with `id`, `label`, `command`, `kind`, `optional`, `creates`, `after`, `status` (`done`, `available` or `blocked`) and `reason` (a plain sentence when blocked, otherwise null); an unknown phase id returns an empty list.
- [ ] A `requires` of `{profile: <dotted.key>}` blocks the activity with a reason naming that key when it is missing or empty in `.sdlc/profile.yaml` (or the file is absent); `{activity: <id>}` blocks it until that activity is `done`, naming it; `{file: <path>}` blocks it until the file exists.
- [ ] A `done_when` of `{exists: <path>}` marks the activity `done` once that file exists; `{json: {file, key, equals}}` marks it done when that JSON file holds the key with that value; an activity with no `done_when` is never `done`. Precedence is fixed: an activity whose `done_when` holds is `done` (even if a requirement has become unmet since), otherwise an unmet `requires` makes it `blocked`, otherwise it is `available`.
- [ ] `stage_readiness.py --json` adds `activities` (the evaluation for the phase it reports on) and `definition` (the registry's `definition` path for that phase) and changes no existing key; its text report is byte-identical to before; and a run still writes nothing to the project (the existing "writes nothing" test passes unmodified).
- [ ] An unreadable or invalid `activities.yaml` makes `stage_readiness.py --json` return `activities: []` and a `warnings` entry naming the problem rather than failing the run or the rest of the report.
- [ ] `generate_status.py --json` adds `capabilities`, a sorted list of strings, and changes no existing key; the markdown dashboard is byte-identical to before.
- [ ] A test pins every declared capability against reality: for each entry in `capabilities.CAPABILITIES`, the script exists and its real `--help` output (for the verb or subcommand the entry names) contains every flag the entry lists, so a capability cannot be declared that the script does not have; and a capability whose script is absent from the plugin is omitted from the list, never reported.
- [ ] The declared capabilities include `activities`, `add-row`, `doctor-json`, `gate-audit-json`, `upgrade-report-json`, `check-channel-json`, `interaction-spec-check`, `bind-channel`, `decision-open`, `decision-decide`, `intake-modes`, `new-spec-json`, `new-spike-json` and `pipeline-proof`.
- [ ] `activities.yaml` declares at least these activities, each mapped to its command and kind: Discovery — intake (`run`, requires profile `documentation.intake_path`, done when the catalog is locked), brief (`create`, requires intake done), review and enhance (`draft`), phase-report (`run`); Requirements — feature-brief (`create`), rules (`create`), rules-check (`check`, requires the rules document); Design — data (`create`), data-check (`check`), experience (`create`); Foundation — pipeline-proof (`run`); and `talk` (coach) on every pre-Build phase.
- [ ] The full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** it adds a declaration that the Studio workflow screen will be driven by, and a capability list that decides which buttons exist, so a wrong entry shows a person a button that fails or hides one that works. It stays MEDIUM because both outputs are additive keys older readers ignore, evaluation is read-only, the protected registry is untouched, every declared command, template and capability is pinned by a test against the real files, and nothing consumes the new keys until the next spec. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `phases/activities.yaml`, `scripts/{activities_model,capabilities,stage_readiness,generate_status}.py`, `scripts/tests/test_*.py` (new files only) and `scripts/tests/fixtures/**`, `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `scripts/stage_readiness.py` and `scripts/generate_status.py` adding additive JSON keys; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the scripts under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker reads `activities.yaml` against the phase files for plain-language labels a project manager would understand; CI runs the existing suite unmodified, which proves the additive keys moved nothing.

## Decision List
- **Activities live in `phases/activities.yaml`, not in the registry.** The registry and `phase_model.py` are protected core; a separate file keeps that promise and makes the declaration additive. Owner: @MCKRUZ. Answer: separate file.
- **Capabilities are a declared list, pinned by a test, not probed at run time.** Probing means running `--help` on a dozen scripts every time the dashboard loads; a static list plus a test that proves each entry is true costs nothing at run time and still cannot drift. Owner: @MCKRUZ. Answer: declared and pinned.
- **The four scripts from spec 0022 are added to the capability list once that spec merges**, not before: a capability whose script is absent is omitted, so declaring them early would be harmless but unpinned. Owner: @MCKRUZ. Answer: follow-up entries.
