---
spec: "0025"
name: "phase-report-json"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: LOW
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-phase-report: Export this stage's report); found while scoping it: --all crashed"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "scripts/generate_phase_report.py gaining --json the way spec 0021 gave doctor.py, audit_gates.py and new_spec.py theirs: one JSON document, text output pinned byte-identical by golden captures taken from the unmodified script. Same pattern, same helper (scripts/tests/golden_support.py)."
created: "2026-10-03"
---

# Spec 0025 — phase-report-json

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
`generate_phase_report.py` can print its result as one JSON document, so SDLC Studio's "Export this stage's report" button can say which file was written and how many of the stage's documents were found, and `--all` stops crashing on the Documentation phase.

## Why
Studio's button runs a script and shows its result; today the result is a block of text meant for a terminal, and the only way for Studio to read it is to parse prose that changes whenever its wording does. Every other script behind a Studio button gained a `--json` mode for exactly this reason (spec 0021). While scoping it I ran `--all` against a fresh project and it crashes with a traceback at phase 7: the registry declares some of that phase's artifacts as mappings (`path`, `root`, `required_for`) and the report treated every entry as a bare filename. So "Export all" would have been a button that fails, and the plugin's own `/sdlc-phase-report --all` has been failing for anyone who reached that phase.

## Scope

### In scope
- `scripts/generate_phase_report.py`: a `--json` flag. A single phase prints the report's result (`phase`, `phase_name`, `output`, `found`, `missing`, `total`, `exit_criteria`, `artifacts` as filename to found) as one document; `--all` prints an object with a `reports` list and an `index` path. Paths are printed with forward slashes on every platform.
- The same file: `phase_artifacts` reads the registry through `phase_model.required_artifacts`, which understands both entry shapes, so a mapping-declared artifact is reported by its `path` and `--all` completes.
- `scripts/capabilities.py`: a `phase-report-json` capability, pinned by the existing capability test.
- New `scripts/tests/test_phase_report_json.py` with golden captures under `scripts/tests/fixtures/golden/`, and `CLAUDE.md`.

### Out of scope
- The report's HTML, its layout and its wording: unchanged.
- The protected core (`phase_model.py`, `phase-registry.yaml`, `check_spec.py`, `check_gates.py`, `harness/**`, `advance_phase.py`). **Stop and ask** if any needs to change.
- Deciding which type-specific artifacts a report lists: with no project type known here, an entry that applies only to some project types is listed, not dropped (the same fail-closed rule the gates use).
- Any Studio change: the button is the next spec.

## Acceptance Checks
- [ ] Without `--json`, the single-phase success output, the invalid-phase refusal (exit 1) and the missing-state refusal (exit 1) are byte-identical to golden captures taken from the script before this change.
- [ ] `--phase 0 --json` on a project with no phase documents prints exactly one JSON document (it parses with no leading or trailing text) with `phase` "0", `found` 0, `missing` 5, `total` 5, `output` `.sdlc/reports/00-discovery-report.html`, and that file exists.
- [ ] With one of phase 0's documents present, `--json` reports `found` 1, `missing` 4, and that document's entry in `artifacts` as true.
- [ ] `--output out/r.html --json` reports `output` as `out/r.html` on every platform (forward slashes) and writes the file there.
- [ ] The HTML written with `--json` is identical to the HTML written without it, apart from the generated-at timestamp line.
- [ ] `--all --json` prints one document whose `reports` lists the nine phases `0, 1, 2, 3, build, 7, 8, 9, close` in order, with `index` `.sdlc/reports/index.html`, and every listed file exists.
- [ ] `--all` without `--json` exits 0 and prints "9 reports generated." (it exited 1 with `AttributeError: 'dict' object has no attribute 'endswith'` before this change).
- [ ] The phase 7 report lists `readme-verification.md`, `runbook-walkthrough.md` (declared as a mapping with `required_for`) and `README.md` (declared as a mapping with `root: repo`).
- [ ] An invalid phase or a missing state file with `--json` still exits 1 with the same stderr message and nothing on stdout.
- [ ] `capabilities.list_capabilities()` includes `phase-report-json`, and the existing capability test, which runs the script's real `--help` and requires `--json` and `--all` to be present, passes.
- [ ] The full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** LOW
**Why this tier:** it adds an optional flag to a read-and-report script and repairs a crash. Text output is pinned by golden captures taken before the change, nothing consumes the new flag until the next spec, and the only behaviour that changes for an existing caller is that `--all` stops failing. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/generate_phase_report.py`, `scripts/capabilities.py`, `scripts/tests/test_phase_report_json.py`, `scripts/tests/fixtures/golden/generate_phase_report-*.txt`, `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** spec 0021's `--json` modes and `scripts/tests/golden_support.py`; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the script under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** LOW
**Specifics:** grader against these checks; CI runs the existing suite unmodified, which proves the text output and every other script are untouched.

## Decision List
- **The `--all` crash is fixed in this spec rather than split out.** It is the same function the new flag reports on, the button would be broken without it, and a separate bugfix PR would land the same one-line change a spec earlier for no reader's benefit. The repro tests are in this PR and fail against the old code. Owner: @MCKRUZ. Answer: fixed here.
- **No golden capture for `--all`.** The old output was a traceback with line numbers in it; pinning that would pin the bug. The repaired output is tested directly. Owner: @MCKRUZ. Answer: tested, not pinned.
- **JSON paths use forward slashes.** The text output prints whatever the platform produced; Studio needs one form to join and compare. Owner: @MCKRUZ. Answer: forward slashes in JSON only.
