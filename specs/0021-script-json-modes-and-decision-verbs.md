---
spec: "0021"
name: "script-json-modes-and-decision-verbs"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md section 6 (plugin additions the deterministic buttons need)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "scripts/track_decisions.py and scripts/spec_transition.py: both already give a person-facing action a --json mode and a dual --state/--repo mode, exit 0 on advisory paths, and keep the human-readable output unchanged. Every script touched here follows that same contract."
created: "2026-10-02"
---

# Spec 0021 — script-json-modes-and-decision-verbs

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
Nine plugin scripts that Studio's buttons will call can be run without a model and read by a program: seven gain a `--json` mode (or a dual `--repo`/`--state` mode), `track_decisions.py` gains `open` and `decide` verbs that own the decision clock, and a new `bind_channel.py` performs the mechanical half of `/sdlc-channel`.

## Why
The approved Studio plan (`docs/proposals/studio-command-coverage-plan-v2.md`) turns most remaining commands into buttons that run a script and show a plain-language result. A button can only do that if the script says what it found in a form a program can read, and several scripts today print prose only (`doctor.py`, `audit_gates.py`, `upgrade_harness.py`, `check_channel.py`, `new_spec.py`, `new_spike.py`) or cannot be run outside a workflow (`intake_documents.py` needs `--state`; `audit_gates.py` needs `--state`). Two things the commands describe as mechanical have no script at all: opening a decision with its two-business-day clock, and binding a spec to a delivery channel by merging that channel's acceptance dimensions into the spec. Putting those in the plugin keeps Studio from re-deriving rules the plugin already owns, and makes each deterministic: the same inputs always produce the same file.

## Scope

### In scope
- `--json` on `scripts/doctor.py`, `scripts/audit_gates.py`, `scripts/upgrade_harness.py` (dry run only), `scripts/check_channel.py`, `scripts/new_spec.py`, `scripts/new_spike.py`; plus `--repo` (dual mode) on `scripts/audit_gates.py`. Output without `--json` stays byte-identical.
- `scripts/check_channel.py --interaction-spec PATH` — check that an experience interaction spec covers the channel's dimensions.
- `scripts/track_decisions.py` — new `open` and `decide` verbs; the existing no-verb report and its `--json` are unchanged.
- `scripts/intake_documents.py` — `--repo`, `--docs`, `--json`, `--skip`, `--priority`, `--lock`.
- New `scripts/bind_channel.py`.
- Tests for all of the above under `scripts/tests/`, golden text captures for the unchanged-output checks, and `CLAUDE.md` documentation.

### Out of scope
- The protected core: `check_spec.py`, `check_gates.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**`, `advance_phase.py` stay byte-for-byte unchanged. **Stop and ask** if one needs to change.
- `intake_documents.py --registry` (writing the document registry and the session-start index): it depends on the summary format and token-budget trimming, which belong with the intake spec that consumes them.
- The new read-only scripts `workshop_brief.py`, `rules_check.py`, `data_contract.py`, `narrative_status.py`, `seed_golden_set.py` (next spec) and the activities declaration plus `capabilities` (the spec after).
- Any Studio (`studio/`) change.
- `upgrade_harness.py --apply` behaviour, and any way to apply an upgrade with `--json`.
- Changing what any script decides (a gate's verdict, a check's pass/fail): these modes only change how results are reported.

## Acceptance Checks
- [ ] For `doctor.py`, `audit_gates.py`, `upgrade_harness.py`, `check_channel.py`, `new_spec.py` and `new_spike.py`, a test pins that a run **without** `--json` produces the same stdout and the same exit code as before this change, using a golden text capture taken from the unmodified script on a fixed fixture project.
- [ ] With `--json`, each of those six scripts prints exactly one JSON document on stdout and nothing else (`json.loads(stdout)` succeeds with no leading or trailing text), and returns the same exit code it returns today for the same situation.
- [ ] `doctor.py --json` returns `checks` as a list of `{name, status, detail, fix}` where `status` is one of `PASS`, `FAIL`, `WARN` and `fix` is the exact line the text mode prints; a project with no harness installed returns `harness_installed: false` and the pointer to `/sdlc-setup` in `message`; `--offline` is honoured; the exit code is 1 when any check is `FAIL`.
- [ ] `audit_gates.py --repo R` produces the same report as `--state R/.sdlc/state.yaml`; giving both, or neither, exits 2 with a usage error; `--json` returns `phases_completed`, `enough_data` (false below the script's own minimum-phases threshold), and per gate `{name, runs, fails, fail_rate, always_passes, high_fail, overrides}` — and with no gate results at all returns `enough_data: false` and an empty `gates` list, never zeros.
- [ ] `upgrade_harness.py --json` (dry run) returns `{mode: "dry-run", legacy, files: [{path, classification, detail}], counts}` with `classification` taken from the script's own labels (`UPDATE`, `NEW`, `CONFLICT`, and the rest it already prints); `--json` together with `--apply` exits 2 and changes nothing.
- [ ] `check_channel.py --json` returns `{spec, channel, bound, dimensions: [{id, covered}], uncovered: [ids], advisory: true}` and exits 0 whether or not anything is uncovered; `--interaction-spec PATH` reports, per descriptor dimension, whether the interaction spec has a row for it, and an interaction spec that lacks one reports that dimension in `uncovered`.
- [ ] `new_spec.py --json` and `new_spike.py --json` return `{path, id, name}` (plus `risk` for a spec and `box`, `opened_by`, `unblocks` for a spike); `new_spike.py` still refuses an empty `--box` or `--opened-by`, with exit code and message unchanged.
- [ ] `track_decisions.py open --decision TEXT --owner NAME` allocates the next `DL-NN` by scanning the whole log including prose, writes one row with `opened` = today, `due` = two business days later computed by the script's own `add_business_days` (a Friday opening is due the following Tuesday), and `status` = `open`; creates `.sdlc/decision-log.md` from `templates/phases/01-requirements/decision-log.md` when absent; and prints the id and due date.
- [ ] `track_decisions.py decide --id DL-NN --by NAME --resolution TEXT` sets that row's status to `decided` and records the resolution and the decider in the row, leaving every other byte of the file unchanged; an unknown id, an already-decided id, or an empty resolution exits 1 with the file unchanged.
- [ ] Running `track_decisions.py` with no verb (and with `--json`) behaves exactly as before: the existing `test_track_decisions.py` passes unmodified.
- [ ] `intake_documents.py --repo R` and `--state R/.sdlc/state.yaml` catalog the same documents; `--docs PATH` catalogs a folder with no `.sdlc/` present, marks every id `provisional`, and writes nothing to disk; `--json` prints the catalog as one JSON document; without any new flag the output is unchanged.
- [ ] `intake_documents.py --skip DOC-003` and `--priority DOC-001,DOC-004` are stored in `catalog.json` and reported by `--json`; an unknown id exits 1; `--lock` sets `"locked": true` once (a second `--lock` changes nothing); and once locked, `--rescan`, `--skip` and `--priority` each exit 1 with the catalog unchanged, so `DOC-NNN` ids stay stable.
- [ ] `bind_channel.py --spec S --channel C` sets the spec's `channel:` to `C`, seeds `harness_context` from the descriptor's `harness_context_seed` only when it is empty, and appends to `## Acceptance Checks` one line per **uncovered** descriptor dimension, tagged `(channel: C)`, taking the text from the interaction spec's matching row when `--interaction-spec` is given and otherwise from the descriptor's `example_check`.
- [ ] `bind_channel.py` run a second time with the same arguments changes no byte of the spec; run with a different channel while one is bound it exits 1 with the spec unchanged; and it edits nothing outside the `channel:` and `harness_context` frontmatter fields and the `## Acceptance Checks` section.
- [ ] `bind_channel.py --json` reports `{spec, channel, injected: [dimension ids], already_covered: [ids], harness_context_seeded: bool, risk_floor, current_risk, raise_needed: bool}`; it never changes `risk:` itself (a raise stays with `spec_transition.py risk`); and a spec that already passes `check_spec.py` still passes it after binding.
- [ ] Every new or changed script accepts `--state` and/or `--repo` as the existing scripts do, exits 0 on advisory paths, and the full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** two of the scripts write into project files a person has edited (`track_decisions.py`, `bind_channel.py`) and one writes the catalog that fixes document ids for the whole engagement (`intake_documents.py --lock`), so a bug costs someone real work; each write is a targeted edit covered by an every-other-byte test, and every refusal is covered by an unchanged-file test. It is not HIGH: nothing here touches auth, data handling, migrations, pipelines or the protected core, no existing behaviour changes without a flag or verb, and nothing calls these modes until later specs. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/{doctor,audit_gates,upgrade_harness,check_channel,new_spec,new_spike,track_decisions,intake_documents,bind_channel}.py`, `scripts/tests/test_*.py` and `scripts/tests/fixtures/**` for them (new files and additions only), `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `track_decisions.py` and `spec_transition.py` — dual `--state`/`--repo`, a `--json` flag that swaps the report for one JSON document, human output untouched; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the scripts under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker reads the two writers (`track_decisions.py open/decide`, `bind_channel.py`) for the every-other-byte property and the lock refusals in `intake_documents.py`; CI runs the existing suite unmodified, which is the proof that unflagged behaviour did not move.

## Decision List
- **`upgrade_harness.py --json` is dry-run only.** Applying an upgrade rewrites CI workflows and hooks that Studio can neither commit nor review, so the machine-readable mode refuses `--apply`. Owner: @MCKRUZ. Answer: refuse.
- **`intake_documents.py --registry` is deferred** to the intake spec, because writing the registry and the token-budgeted index depends on the summary format. Owner: @MCKRUZ. Answer: deferred.
- **A locked catalog refuses `--rescan`, `--skip` and `--priority`.** Locking exists so `DOC-NNN` ids stay stable; allowing a rescan would renumber them. Owner: @MCKRUZ. Answer: refuse; unlocking is a deliberate manual edit of `catalog.json`.
- **`bind_channel.py` never changes `risk:`.** It reports whether the channel's floor is above the current tier; raising it is the existing `spec_transition.py risk`, after a person confirms. Owner: @MCKRUZ. Answer: report only.
