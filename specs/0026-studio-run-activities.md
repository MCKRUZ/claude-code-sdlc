---
spec: "0026"
name: "studio-run-activities"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-phase-report, /sdlc-intake, /sdlc-review and /sdlc-enhance: the parts that need no model)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "studio/src/components/ActivitiesPanel.tsx, studio/shared/activityControls.ts and studio/electron/main/activities.ts from spec 0024: activities are drawn from the plugin's declaration, a table keyed by activity id says which Studio can act on and what each needs from the plugin, and every control is a fixed-argv script call parsed defensively. This spec adds four more entries of the same kind."
created: "2026-10-03"
---

# Spec 0026 — studio-run-activities

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
The Workflow tab can export a stage's report, catalogue and lock the reference documents, show how far the stage's plain-language summaries have got, and show the standing picture of review findings, each with one button and a plain-language result, and none of them needs a model.

## Why
Four of the plugin's commands have a part that is pure bookkeeping: writing the stage report, listing which reference documents exist and freezing their ids, counting which documents have a stakeholder summary, and counting open review findings. Today each is a slash command a person has to know about and run in a terminal. They are also the parts everything else leans on: the brief needs a locked document list before it can be prepared, and the drafting buttons that come next (summaries, reviews, document analysis) need somewhere to show what is missing and what exists. Building these first puts that foundation in place and delivers value that does not depend on running a model.

## Scope

### In scope
- `studio/shared/activityControls.ts`: a second table keyed by activity id for activities that get a small panel of their own (`phase-report`, `intake`, `enhance`, `review`), each naming the plugin capability it needs; `capabilityFor` and `isDrawn` learn it.
- `studio/electron/main/activities.ts` or a new `activityRuns.ts` beside it, plus preload and `shared/types.ts`: one IPC per panel, each a fixed-argv script call parsed into a typed result.
- Phase report: *Export this stage's report* runs `generate_phase_report.py --state <state.yaml> --phase <stage> --json`; a smaller *Export all stages* runs it with `--all`. The result says how many of the stage's documents were found, names the missing ones, and offers *Open report*, which opens the file with the operating system's default program.
- Intake (Discovery): *Catalogue the documents* runs `intake_documents.py --state <state.yaml> --json` and shows the table (id, file, type, size); each row can be skipped, the priority order can be set, and *Lock these ids* freezes them after a confirmation.
- Enhance: a read-only coverage panel from `narrative_status.py --state <state.yaml> --phase <stage> --json`: how many documents have a summary, which do not, and which are out of date.
- Review: a read-only standing picture from `record_findings.py report --state <state.yaml> --json` (tracked, open, marked-fixed-but-unchanged) and a *Strict check* button running it with `--strict`.
- `studio/electron/main/projectPaths.ts`: `.sdlc/context/intake/` joins the sync allowlist, so the catalogue other people need is shared like the rest of the project (a comment names this spec). The generated reports stay local and unsynced.
- Studio tests: vitest adapters pinning exact argv, jsdom component tests, one Playwright real-window case; `CLAUDE.md`.

### Out of scope
- Anything that runs a model: summarising a document, analysing the corpus, running a review, writing a narrative, and the Keep / Discard step. Those are the next spec; until then the Enhance and Review panels show only the read-only picture.
- Writing the document registry and index (`intake_documents.py --registry`, which does not exist yet) and the workshop brief form.
- Any plugin change and the protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`). **Stop and ask** if the plugin's output lacks something a panel needs.
- Opening a report inside Studio: it is a self-contained web page and opens in the person's default browser.

## Acceptance Checks
- [ ] With a plugin that lists `phase-report-json`, `intake-modes` and `narrative-status` in its capabilities, the Discovery stage's Workflow tab draws rows for `intake`, `enhance`, `review` and `phase-report` (the activities the plugin declares there), each with its panel; a plugin that lacks a capability shows that row disabled with a reason naming it, as in spec 0024.
- [ ] *Export this stage's report* runs exactly `generate_phase_report.py --state <project>/.sdlc/state.yaml --phase <stage id> --json`; on success it reads "Report written: 3 of 5 documents present" (the plugin's numbers) and lists each missing document by name; it never reads "complete" when `missing` is above 0.
- [ ] *Export all stages* runs the same script with `--all --json` and reads "9 reports written" with the plugin's count.
- [ ] *Open report* opens only a file inside `<project>/.sdlc/reports/`; a path anywhere else, or containing `..`, is refused with one error line and nothing is opened.
- [ ] Reports are described as staying on this computer, and `.sdlc/reports/` is not on the sync allowlist (a test asserts it).
- [ ] *Catalogue the documents* runs exactly `intake_documents.py --state <project>/.sdlc/state.yaml --json` and renders one row per document with its `DOC-NNN` id, file, type and token count, plus the totals; a catalogue with zero documents reads "No reference documents found" and not an empty table.
- [ ] Skipping a document runs `intake_documents.py --state <state> --json --skip DOC-003`; setting priority runs it with `--priority DOC-001,DOC-004` in the order shown; both re-read and re-render the catalogue.
- [ ] *Lock these ids* asks for confirmation first, then runs exactly `intake_documents.py --state <state> --json --lock`; once the result reports `locked: true` the skip, priority and lock controls are gone and the panel says the ids are frozen, because the script refuses further changes.
- [ ] If the plugin's `intake_documents.py` exits non-zero or prints text that is not one JSON document, the panel shows exactly one error line and no table.
- [ ] The Enhance panel runs exactly `narrative_status.py --state <state> --phase <stage id> --json` and reads "2 of 5 documents have a plain-language summary" from `coverage`, lists the documents without one, and marks each present-but-stale summary as out of date; a result with `has_data: false` reads "No documents in this stage yet" and never "0 of 0".
- [ ] The Review panel runs `record_findings.py report --state <state> --json` and reads "3 findings tracked, 1 still open, 0 marked fixed without a change to their file"; a project with nothing tracked reads "No review findings recorded yet" and not a row of zeros.
- [ ] *Strict check* runs `record_findings.py report --state <state> --json --strict`; exit code 2 is shown as "1 finding is marked fixed but its file never changed" (the plugin's count), not as a failed run; exit code 0 reads "No false fixed-claims found".
- [ ] Each of the four panels shows exactly one error line (`role="alert"`) and no digit-only count when its script is missing, exits with code 1 (code 2 for the strict check is a result, not an error), or prints text that does not parse as one JSON document; one test per panel and per failure asserts it.
- [ ] None of the four panels writes a file from Studio itself: a test snapshots the SHA-256 of every file under `.sdlc/` before and after each panel's action and asserts the only differences are `.sdlc/reports/*.html` and `.sdlc/context/intake/catalog.json`.
- [ ] The full Studio suite (typecheck, vitest, Playwright real window with `STUDIO_SKIP_LIVE_MODEL=1`) and the plugin suite pass; no existing Studio test is edited except where a readiness fixture needs the new activity ids.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** it adds the first Studio buttons that let a person freeze the reference document ids and that open a generated file with the operating system. It stays MEDIUM because every call is fixed-argv with no user text in it beyond validated ids, locking asks first and the plugin script is what enforces it, opening is confined to one folder by a path check, the allowlist change is one folder of shared catalogue data, and no model is involved. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `studio/shared/{activityControls,types}.ts`, `studio/electron/main/{activities,activityRuns,projectPaths,index}.ts` (index: one registration line at most), `studio/electron/preload/index.ts`, `studio/src/{workflowSteps.ts}`, `studio/src/components/{ActivitiesPanel,PhaseReportPanel,IntakePanel,NarrativeCoveragePanel,ReviewStandingPanel}.tsx`, `studio/test/**` (new files, plus fixtures), `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** spec 0024's `ActivitiesPanel.tsx`, `activities.ts` and `activityControls.ts`; `PipelineEvidencePanel.tsx` for a button that runs a script and shows a plain-language result.
- **Permissions:** auto-allowed: reads, `npm` scripts under `studio/`, `pytest`, `uv run` of plugin scripts. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** `studio/electron/main/projectPaths.ts` (what Studio may sync) is a security-relevant list; the change is one added folder and is covered by the allowlist tests.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker opens the real window on a Discovery project with the intake path set, catalogues three documents, skips one, locks, exports the stage report and opens it; CI runs the Studio and plugin suites.

## Decision List
- **Enhance and Review get their read-only panel now and their model-run button in the next spec.** The coverage and the standing picture are what the next buttons act on, and each is useful without them; shipping them separately keeps this change free of any model run. Owner: @MCKRUZ. Answer: read-only first.
- **Intake needs a button that catalogues, rather than reading on open.** The script writes `catalog.json` the first time it runs, so reading it on every screen open would create a file just by looking. Owner: @MCKRUZ. Answer: explicit button.
- **Review's plugin capability is not separately declared.** `record_findings.py report --json` predates the activities declaration, so any plugin that declares activities has it. Gating on `activities` is true, and adding a capability name for an old flag would be a plugin change this spec does not need. Owner: @MCKRUZ. Answer: gate on `activities`.
- **Reports open in the default browser, not inside Studio.** They are a self-contained page with their own navigation and a diagram script that loads from a CDN; embedding it would mean a second renderer with its own security story. Owner: @MCKRUZ. Answer: default browser, path-checked.
