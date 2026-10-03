---
spec: "0024"
name: "studio-activities-workflow"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md sections 2.1, 2.3 and 5 (the Workflow tab draws the stage's declared activities; the Guide tab; one stage chat with a [Studio] pre-seed)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "studio/src/components/WorkflowTab.tsx, studio/src/workflowSteps.ts and studio/electron/main/readiness.ts: the Workflow tab is already derived from stage readiness through one function, and readiness is already one subprocess call to stage_readiness.py that Studio parses defensively. Activities arrive as two more optional keys on that same document, and ensureDocumentFromTemplate in studio/electron/main/documents.ts is the existing never-overwrites way to start a document."
created: "2026-10-03"
---

# Spec 0024 — studio-activities-workflow

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
A stage's Workflow tab lists the optional things a person can do there, as the plugin declares them, and gives each kind one control: start the documents, run a check, or talk it through. A Guide tab beside it shows the stage's own guidance, so no one has to leave the app to read what the stage is for.

## Why
Today the Workflow tab shows only the required documents and the sign-off step, so every other command (the feature breakdown, the business rules, the data contract, the experience documents) can only be reached by knowing a slash command and leaving the app. The approved plan turns those commands into deterministic buttons where they can be, and keeps the chat for judgement. The plugin now declares the list (spec 0023), so Studio can draw it without holding a second copy that drifts. This is the first Studio change in that plan and the smallest one that proves the whole route: the declaration, the controls for three of the five kinds, the Guide tab, and the fallback for an older plugin.

## Scope

### In scope
- `studio/electron/main/readiness.ts` and `studio/shared/types.ts`: parse the new optional `activities`, `definition` and `warnings` keys of `stage_readiness.py --json` into `StageReadiness`; and read the plugin's `capabilities` (from `generate_status.py --json`) once per project.
- `studio/src/workflowSteps.ts`: derive the activity rows to draw from readiness and capabilities, in the plugin's declared order. The existing done / current / locked rule for documents and sign-off is not changed.
- `studio/src/components/WorkflowTab.tsx` plus a new `ActivitiesPanel.tsx`: an "Also in this stage" list under the step list, one row per drawn activity, showing its label, its status (done, available, blocked with the plugin's reason) and the one control its kind gets. Drawn kinds in this spec: **create**, **check** (the two checks named below) and **talk**.
- Create: a new IPC that starts every file an activity declares from its template (never overwriting) and opens the first one in the structured editor. `ensureDocumentFromTemplate` in `studio/electron/main/documents.ts` is extended to nested paths (`.sdlc/artifacts/02-design/data/data-contract.md`) and to the shared `review-report.md` template.
- Check: *Check rules* runs `rules_check.py --repo --json` and *Check personal data* runs `data_contract.py summary --repo --json`, each shown as plain-language rows that link to the document.
- Talk: *Talk it through* sends one Studio-authored turn, beginning `[Studio]`, through the existing chat send path, and `buildSystemPrompt` in `studio/electron/main/chatArgs.ts` gains one sentence saying how to treat it. No tool change.
- `studio/src/components/GuideTab.tsx` (new) and `StageHome.tsx`: a third tab that renders the plugin's phase definition file for the stage (`definition`) as markdown, and lists each activity's command with its one-line description.
- Capability gating: an activity whose capability the installed plugin lacks is shown disabled with a one-line reason; a plugin that emits no `activities` key leaves the tab exactly as it is today.
- New handler module `studio/electron/main/activities.ts` for the new IPC, so `index.ts` (already over the 800-line cap) gains one registration line and no more.
- Studio tests: vitest adapters pinning exact argv, jsdom component tests, one Playwright real-window case.

### Out of scope
- **Run** and **draft** activities (intake, brief, review, enhance, phase report, pipeline proof's new home) and every check other than the two named: they are the next specs. Until then they are not drawn in the Workflow tab, and the Guide tab still lists them with their command.
- The add-row dialog, the decision dialog and the Build-board actions.
- The LLM-assisted runner (`agentRun.ts`), `CandidateView` and `writeWholeDocument`: they arrive with the first draft button.
- Any plugin change, and the protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`). **Stop and ask** if the plugin's JSON needs a new key.
- Any change to `CHAT_TOOLS` or the chat's write path: the chat's only writes stay accepted proposals.
- Splitting `index.ts` or `shared/types.ts`: new code goes in new files; the existing ones gain only what the new code must touch.

## Acceptance Checks
- [ ] With a plugin that emits `activities`, the Workflow tab shows an "Also in this stage" list under the step list containing exactly the activities of kind create, talk, and the two named checks, in the plugin's declared order; an activity of kind run or draft is not drawn; a jsdom test and one real-window test assert both.
- [ ] Each drawn row shows the plugin's status: `done` reads "Done", `blocked` shows the plugin's own reason sentence unchanged and no enabled control, `available` shows its control enabled.
- [ ] With a plugin that emits no `activities` key (an older plugin), the Workflow tab renders the same rows as before this spec and no "Also in this stage" heading, and a test using an old-shape readiness fixture asserts it.
- [ ] A `warnings` entry from the plugin is shown as one plain line under the heading rather than hiding the whole tab; a broken activity declaration never blanks the document steps.
- [ ] *Create* on an available create activity writes each file in its `creates` list from its template and opens the first one in the structured editor; for `data` that is three files under `.sdlc/artifacts/02-design/data/`.
- [ ] Create never overwrites: starting `data` when `data-contract.md` already exists leaves that file byte-identical (same SHA-256 before and after), still creates `data-readiness.md` and `lineage-audit.md`, and reports exactly those two as created.
- [ ] Create refuses a path outside `.sdlc/artifacts/` or one containing `..`, with no file written; the existing `ensureDocument.test.ts` cases still pass unmodified.
- [ ] *Check rules* runs exactly `rules_check.py --repo <project> --json` and renders each finding's message in plain language with its subject; zero findings reads "No problems found", and a result with `has_data: false` reads "Nothing to check yet" with the plugin's note, never "No problems found".
- [ ] *Check personal data* runs exactly `data_contract.py summary --repo <project> --json` and shows the field count, the PII field count with the names, and, when the plugin returns `risk_implication`, that sentence; a result with `has_data: false` reads "Nothing to check yet", never "0 personal data fields".
- [ ] A check whose script is missing, exits with code 1, or prints text that does not parse as one JSON document shows exactly one error line and no count; a test asserts the rendered output contains no digit-only count for each of the three failures.
- [ ] *Talk it through* sends exactly one chat turn whose text begins `[Studio] ` and names the stage and the activity's command, and focuses the chat panel; it does not create a second thread; a test asserts the single `sendChatMessage` call.
- [ ] `buildSystemPrompt` contains one new sentence about a message beginning `[Studio]`; `CHAT_TOOLS` and its exact-list test are unmodified and pass; one new assertion in `chatArgs.test.ts` pins the sentence.
- [ ] An activity whose capability the plugin does not list (for example `rules-check` on a plugin without it) is drawn disabled with a reason naming what is missing; a plugin that lists it enables the control.
- [ ] The Guide tab renders the stage's `definition` file from the plugin as markdown, lists every declared activity by its label and slash command (including those not drawn in the Workflow tab; the plugin declares no longer description to show), and shows "No guidance file for this stage" when `definition` is absent or unreadable.
- [ ] The Guide tab and the Workflow tab each reset to Workflow when the stage or project changes, as the existing tabs do (`stageHomeKey`).
- [ ] `index.ts` is no longer than before this spec plus the lines needed to register the new handler module.
- [ ] The full Studio suite (typecheck, vitest, Playwright real window with `STUDIO_SKIP_LIVE_MODEL=1`) and the plugin suite pass; no existing Studio test is edited except to add the new `activities` field to a readiness fixture where one is required.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** it adds the first Studio code that creates project files from a button and a new instruction in the chat's system prompt. It stays MEDIUM because creation never overwrites and is confined to `.sdlc/artifacts/` by the existing path guard, both checks are read-only subprocess calls with fixed argv, the chat gains one sentence and no tool, and an older plugin leaves the screen exactly as it is. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `studio/electron/main/{readiness,documents,chatArgs,activities,index}.ts` (index: one registration line), `studio/electron/preload/index.ts`, `studio/shared/types.ts`, `studio/src/{workflowSteps.ts}`, `studio/src/components/{WorkflowTab,ActivitiesPanel,GuideTab,StageHome,ChatPanel}.tsx`, `studio/test/**` (new files, plus the one fixture field and the one `chatArgs.test.ts` assertion), `CLAUDE.md`, `studio/README.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `PipelineEvidencePanel.tsx` and `pipelineEvidence.test.ts` for a button that runs a script and shows a plain-language result; `ensureDocumentFromTemplate` and `ensureDocument.test.ts` for starting a document.
- **Permissions:** auto-allowed: reads, `npm` scripts under `studio/`, `pytest`, `uv run` of plugin scripts. Confirm-required: edits outside the scope list, any edit to a protected-core file, any change to `CHAT_TOOLS`.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker opens the real window against a project initialised by `init_project.py` and starts the data documents from the Design stage, runs both checks, and confirms the older-plugin fixture shows today's tab; CI runs the Studio and plugin suites.

## Decision List
- **Activities with no control yet are not drawn, rather than drawn disabled.** A row that says "coming soon" is a promise the tab cannot keep and teaches people to ignore the list; the Guide tab already names every command. Owner: @MCKRUZ. Answer: not drawn, listed in the Guide tab.
- **The activity list sits under the document steps, not interleaved with them.** Activities are optional and never gate a stage, while the document steps carry the first-not-ready-is-current rule; mixing them would make an optional step look like the thing blocking sign-off. Owner: @MCKRUZ. Answer: separate list.
- **Which check an activity runs is a small table in Studio keyed by activity id**, because the plugin declares that a check exists but not which script produces it, and the two scripts have different output. A new check is one table entry plus its renderer; an activity with no entry is not drawn. Owner: @MCKRUZ. Answer: keyed table.
- **Talk it through reuses the one stage chat with a `[Studio]` first line**, not a second thread, because the chat is deliberately a single conversation per stage and the only reason it needs a hint is that optional steps are ones its interview would otherwise redirect away from. Owner: @MCKRUZ. Answer: pre-seed in the existing thread.
