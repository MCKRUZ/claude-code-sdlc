---
spec: "0022"
name: "discipline-scripts-brief-rules-data-narrative"
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
harness_context: "scripts/track_decisions.py and scripts/check_channel.py: a dual --state/--repo script that reads project documents, exits 0 on advisory paths, reports missing data as 'no data' rather than a zero, and has a --json mode that prints exactly one document. Each new script here follows that contract."
created: "2026-10-02"
---

# Spec 0022 — discipline-scripts-brief-rules-data-narrative

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
Four commands that are mostly bookkeeping — assembling the workshop brief from a person's selections, checking business rules against golden scenarios, summarising a data contract's PII, and reporting which artifacts have narrative companions — each gain a script that does the mechanical part the same way every time, so a button can run it and the model is only used for the parts that need judgment.

## Why
The approved Studio plan (`docs/proposals/studio-command-coverage-plan-v2.md`) gives each of these commands a button: a person curates, a script assembles or checks, and the model is reserved for prose and analysis. Today each exists only as instructions a model follows, so the same selections can produce a differently-shaped brief, a rules check is a reading exercise, a PII count is whatever the model counts, and "which artifacts still lack a narrative" is a directory listing the model summarises. Putting the mechanical half in the plugin makes those answers repeatable and testable, and keeps Studio from re-deriving formats the plugin owns.

## Scope

### In scope
- New `scripts/workshop_brief.py` (`build`), `scripts/rules_check.py`, `scripts/data_contract.py` (`summary`), `scripts/narrative_status.py`.
- Tests for each under `scripts/tests/` with fixtures (new files only), reusing the existing document fixtures in `scripts/tests/fixtures/documents/` where they fit.
- `CLAUDE.md` — document the four scripts.

### Out of scope
- `seed_golden_set.py` (`/sdlc-evals`). That command states it "adds no new script" and that the `eval-builder` skill owns the output path and template; a seeding script would contradict it, and the plan sequences evals last. Deferred to the Studio spec that needs it, where that conflict is settled.
- Any model call: these scripts never invoke a model, and nothing here generates prose (the brief's "what the documents say" claims are supplied to the script, not written by it).
- The protected core (`check_spec.py`, `check_gates.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**`, `advance_phase.py`) and every existing template, shape and fixture. **Stop and ask** if one needs to change.
- Any Studio (`studio/`) change, and the activities declaration plus `capabilities` (the next spec).
- Writing or editing `contradiction-list.md`, `question-list.md`, `business-rules.md`, `golden-scenarios.md`, `data-contract.md` or any narrative: these scripts read them.

## Acceptance Checks
- [ ] Each of the four scripts accepts `--state <.sdlc/state.yaml>` or `--repo <root>` (not both; neither exits 2), runs in a project with no `.sdlc/` when the document paths are given explicitly, prints exactly one JSON document and nothing else with `--json`, and exits 0 on every advisory path including missing input documents.
- [ ] When an input document is missing or has no recognisable table, each script reports `has_data: false` with a one-line note and an empty result, never zero counts, and never an error exit.
- [ ] `rules_check.py` reports, for each `BR-NN` row of `business-rules.md`, whether its Source is empty or `—` and whether its Approver is empty; for each `SCEN-NN` row of `golden-scenarios.md` whether its text references at least one `BR-NN`; and every `BR-NN` that no scenario references; template placeholder rows (more than half of the non-empty cells bracketed) are ignored.
- [ ] `rules_check.py` lists each rule marked `*(pending DL-NN)*` with its decision id, and flags a pending marker whose `DL-NN` is absent from `decision-log.md` (or all of them as unverifiable when there is no decision log); every finding has severity `SHOULD`, and a run on documents where every rule has a source and an approver and every rule is referenced by a scenario returns `findings: []`.
- [ ] `data_contract.py summary` reads the Fields table of `data-contract.md` and returns `field_count`, `pii_fields` (the names whose PII column is yes or customer-linked, the template's indirectly-identifying value), `indirect_fields` (the customer-linked subset), `pii_count`, and `unclassified` (fields whose PII column is empty or a placeholder); with at least one PII field it returns `risk_implication` quoting the PII line of `risk_model.TAXONOMY` verbatim, and with none it returns `null`.
- [ ] `data_contract.py summary` reads the PII column by its header text rather than its position, so a contract with the columns in another order, or with extra columns, gives the same result.
- [ ] `narrative_status.py` lists each artifact `.md` directly inside the current phase's artifact folder (not `*.narrative.md`, not subfolders) with `status` `none` when no `<name>.narrative.md` exists beside it and `present` when one does; `--phase N` picks a phase and `--all-phases` covers every phase folder that exists.
- [ ] `narrative_status.py` reports `stale: true` for a `present` narrative whose source file was last committed after the narrative, `false` when the narrative is as recent or newer, and `null` (never a guess) when git history is unavailable or either file is untracked; it ends with a `coverage` object `{with_narrative, total}`.
- [ ] `workshop_brief.py build` takes the selections as arguments — `--contradictions CON-01,CON-03`, `--questions Q-02,Q-05`, `--decisions-json`, `--logistics-json`, optional `--claims-json` and `--load-bearing DOC-001,DOC-004` — and fills `templates/phases/00-discovery/workshop-brief.md` from them, writing to the brief's usual path (`.sdlc/artifacts/00-discovery/workshop-brief.md`) or `--output PATH`.
- [ ] The built brief contains, for each selected contradiction, both source references and the resolving question followed by its `(CON-NN)` id; for each selected question its `(Q-NN)` id grouped under its agenda block; the supplied decisions and logistics; the template's agenda table; and no `${...}` placeholder left unfilled.
- [ ] `workshop_brief.py build` refuses (exit 1, no file written) an unknown `CON-NN` or `Q-NN`, a selection of more than 5 contradictions or more than 12 questions, and any `claims-json` entry without a `DOC-NNN` reference — the template's "every claim carries a DOC-NNN" rule — and it never overwrites an existing brief without `--force`.
- [ ] `workshop_brief.py build` returns, with `--json`, the counts on the page against the totals available and the questions routed pre-workshop (to be emailed instead), and an advisory `lint` list naming any brief line outside the appendices that states a conclusion rather than asks a question (a line under "What nobody has written down" or "Decisions we need from the room" that does not end in `?`).
- [ ] Every script's output with the same inputs is byte-identical across runs (no timestamps in the output other than ones passed in), and the full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** three of the four scripts only read documents and report, and the fourth writes one new file that it refuses to overwrite, so the blast radius is small. It stays MEDIUM, not LOW, because `workshop_brief.py` assembles a document that goes in front of a client's executives and a wrong id or a dropped citation would be silently embarrassing, and because the checks feed Studio buttons that people will trust. Nothing here touches auth, data handling, migrations, pipelines or the protected core, and nothing calls these scripts until later specs. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/{workshop_brief,rules_check,data_contract,narrative_status}.py`, `scripts/tests/test_*.py` and `scripts/tests/fixtures/**` for them (new files only), `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `scripts/track_decisions.py` and `scripts/check_channel.py` — dual `--state`/`--repo`, `--json` printing one document, advisory exit 0, missing data reported as such; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the scripts under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file or an existing template.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker builds a brief from the shipped contradiction and question fixtures and reads it as a workshop attendee would; CI runs the existing suite unmodified.

## Decision List
- **The brief's prose claims are supplied, not written.** "What the documents say" needs sentences, which only a person or a model can write; `workshop_brief.py` accepts them as `--claims-json` (each with its `DOC-NNN`) and assembles everything else. Owner: @MCKRUZ. Answer: supplied.
- **Staleness is by git commit time, not file time.** A checkout resets file modification times, so they would call every narrative stale or fresh at random; commit time is stable across machines. Where git cannot answer, the answer is `null`. Owner: @MCKRUZ. Answer: git, else unknown.
- **`seed_golden_set.py` is deferred**, as in Out of scope. Owner: @MCKRUZ. Answer: deferred to the evals spec.
