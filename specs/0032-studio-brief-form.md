---
spec: "0032"
name: "studio-brief-form"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-brief: Curate — the human gate made a form, then Build the brief); builds on specs 0022 (workshop_brief.py build) and 0031 (workshop_brief.py candidates)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "studio/src/components/ActivitiesPanel.tsx and studio/shared/activityControls.ts from specs 0024 and 0026: an activity is drawn from the plugin's declaration and, where Studio has a panel for it, the panel is keyed by activity id with the plugin capability it needs; every call is fixed argv, validated in the main process, with the result parsed defensively. The brief is the Discovery activity that still shows only a blank Create button."
created: "2026-10-04"
---

# Spec 0032 — studio-brief-form

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
From the Discovery stage a person can prepare the one-page workshop brief in a form: tick which contradictions and questions make the page, name the load-bearing documents, write what the documents say and the decisions the room must leave with, fill in the logistics, and press Build, with the page's limits and the plugin's own checks visible as they go.

## Why
The brief is the product of Discovery that the client sees first, and the plugin deliberately makes a person choose what is on it: the analyst finds many contradictions and questions, and a one-page brief can carry five and twelve. Today that choice is made by reading two long markdown files and typing ids and JSON into a command. After specs 0022 and 0031 everything mechanical about it is a script call with a clear list to choose from, so the only thing left is the choosing and the writing, which is exactly what a form is for. Without it the Discovery workflow in Studio stops one step short: the documents are catalogued, summarised and analysed, and then the person has to leave the app.

## Scope

### In scope
- `studio/electron/main/briefForm.ts` and IPC: `getBriefCandidates` (runs `workshop_brief.py candidates --state <state> --json`) and `buildBrief` (validates the selections itself, then runs `workshop_brief.py build` with exact, fixed arguments and `--json`, with `--force` only when the person confirmed replacing an existing brief).
- A panel for the `brief` activity, keyed by activity id with the `brief-candidates` capability, replacing today's bare *Create* for it: sections for contradictions, questions, load-bearing documents, claims, decisions and logistics; live counters against the plugin's limits; recommended contradictions pre-ticked; the result with the plugin's notes and lint; and the built brief opened in the document editor.
- The question rules shown as the plugin states them: questions routed `pre-workshop` are listed as "email these before the workshop" and are not placed on the page, and questions routed `interview` cannot be ticked.
- Remembering what has been typed, in memory only, while the window is open, per project, so switching tabs does not lose a half-filled form.
- Studio tests: vitest on the exact arguments and every refusal, jsdom on the form, and a Playwright real-window case against the real plugin; `CLAUDE.md`.

### Out of scope
- Any model run: choosing and writing are the person's. A *Draft with Claude* for claims or decisions is a possible later addition, not part of this.
- Changing `workshop_brief.py`, the template, the shapes or the parsers; the protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`). **Stop and ask** if a limit or a message must change in the plugin.
- Editing the built brief inside the form: after Build it opens in the document editor, which already records versions.
- Saving a half-filled form to disk or sharing it between people.

## Acceptance Checks
- [ ] With a plugin that lists `brief-candidates` and `activities`, the Discovery stage's `brief` activity draws the form instead of a bare *Create* button once its intake requirement is met; while the plugin reports it blocked, the row shows the plugin's reason and no form; a plugin without the capability shows the existing "needs a newer plugin: lacks brief-candidates" line.
- [ ] Opening the form runs exactly `workshop_brief.py candidates --state <project>/.sdlc/state.yaml --json` and writes nothing; a result with `has_data: false` shows the plugin's notes ("run the document analysis first") and no form, never "0 contradictions".
- [ ] Contradictions are listed with id, title, severity and the question for the room, each expandable to show both quoted sources; those the plugin marks `recommended` start ticked, the rest unticked, and the counter reads "2 of 5" against the plugin's limit; ticking a sixth is prevented with the reason shown.
- [ ] Questions are grouped by agenda block with the counter "N of 12"; a question routed `pre-workshop` is shown in a separate "Email these before the workshop" list, cannot be ticked onto the page, and is still passed to the build so it is reported as emailed instead; one routed `interview` is shown with the reason "neither in the room nor emailed" and cannot be ticked.
- [ ] Load-bearing documents are picked from the registry's documents with the counter "N of 3 to 5"; claims are rows of text plus a document picked from the registry, and a claim without a document cannot be added; claims may be empty, with the plugin's note shown after the build.
- [ ] Decisions are rows of text with a counter that counts the template's standing decisions, so with 2 standing the form asks for 1 to 3 more to land in the plugin's 3 to 5; logistics are client name, date/time/location, duration and facilitator (defaulting to the signed-in person), and attendees as rows of name and role, with an "add a team member" shortcut from the roster; an empty required logistics field prevents Build with the field named.
- [ ] A brief takes at most 15 claims and 30 attendees (`studio/shared/briefLimits.ts`, read by both the form and the main process): the form stops adding at the cap and says "A brief takes up to 15 claims." or "…30 attendees."; the main process refuses one more with "The page takes up to 15 claims." and starts no process; and the longest allowed brief (15 claims of 500 characters, 30 attendees of 200) stays under 26,000 characters of arguments, inside the Windows command-line limit.
- [ ] *Build the brief* is disabled until every rule the main process will enforce is met, with the reason beside the button; the main process re-checks all of it and never trusts the renderer: ids must match `^CON-\d+$`, `^Q-\d+$` and `^DOC-\d+$` and exist in the candidates it just read, counts must be within the plugin's limits, text must be non-empty, single-line where the plugin requires it, and at most 500 characters, otherwise `buildBrief` returns `ok: false` with one line and starts no process.
- [ ] `buildBrief` runs exactly `workshop_brief.py build --state <state> --contradictions <ids> --questions <ids> --load-bearing <ids> --decisions-json <json> --logistics-json <json> --claims-json <json> --json`, with the ids joined by commas in the order shown, and adds `--force` only when the person ticked "Replace the existing brief"; no selection text is placed anywhere else in the argument list.
- [ ] When a brief already exists, the form says so and *Build* stays disabled until "Replace the existing brief" is ticked; an unconfirmed build never passes `--force`, and the existing file is byte-identical after a refused build (SHA-256).
- [ ] After a successful build the result shows the number of contradictions, on-page questions and emailed-instead questions the plugin reports, each of its notes and each lint line ("this line does not end with a question mark"), and opens `workshop-brief.md` in the document editor; the path shown is repo-relative.
- [ ] A refusal from the plugin (for example more than 5 contradictions slipping through, or a claim without a document) is shown as the plugin's one `Error:` line with any absolute path reduced to its file name, and nothing is written.
- [ ] A script that is missing, exits with an unexpected code, or prints text that is not one JSON document shows exactly one error line (`role="alert"`) and no counts, for both calls.
- [ ] The typed form survives switching from the Workflow tab to Documents and back, and to another stage and back, within the same window, per project: a contradiction ticked, a claim typed ("Average claim takes 19 days") and a client name entered are still there; the form is cleared after a successful build, and project A's "Acme Insurance" never appears in project B.
- [ ] Nothing is written to the project except by `build`: a test snapshots the SHA-256 of every file under the project before and after opening, filling and abandoning the form, and finds no difference.
- [ ] The full Studio suite (typecheck, vitest, Playwright real window with `STUDIO_SKIP_LIVE_MODEL=1`) and the plugin suite pass; no existing Studio test is edited except to add the `brief` activity where a fixture needs it.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** it writes the client-facing workshop brief and can replace an existing one, and it passes a person's free text to a script. It stays MEDIUM because no model runs, replacing needs an explicit tick and is refused otherwise, the selections are validated again in the main process and travel only as `--json` arguments to a fixed argument list with no shell, and the script itself refuses anything outside the one-page rules. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `studio/electron/main/{briefForm,index}.ts` (index: one registration line at most), `studio/electron/preload/index.ts`, `studio/shared/{types,activityControls}.ts`, `studio/src/components/{ActivitiesPanel,BriefForm,BriefSections,useBriefForm}.tsx` (and `.ts`), `studio/test/**` (new files and fixtures), `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** spec 0026's `activityRuns.ts` and `IntakePanel.tsx` for a fixed-argv call with a typed result, spec 0029's `useDraftBatch.ts` for state that must survive a remount, and the shipped fixtures in `scripts/tests/fixtures/documents/`.
- **Permissions:** auto-allowed: reads, `npm` scripts under `studio/`, `pytest`, `uv run` of plugin scripts. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker fills the form on a project with a real analysis, builds, replaces, and reads the brief for fidelity to what was picked; CI runs the Studio and plugin suites.

## Decision List
- **One scrollable form with live counters, not a step-by-step wizard.** The brief is one page and its sections constrain each other (the decisions count includes the template's standing ones, the load-bearing documents must come from the same corpus the claims cite), so seeing the whole page's choices at once is the point; counters and the disabled Build button carry the rules. Owner: @MCKRUZ. Answer: one form.
- **Claims and decisions are typed by the person, with no model assistance in this spec.** They are the facts and the questions the client will read first, and the plugin's rule is that nothing is invented; a draft button is a separate, later decision. Owner: @MCKRUZ. Answer: typed.
- **Attendees are free text with an optional shortcut from the team roster.** Most workshop attendees are the client's people, who are not in the roster; forcing a roster pick would exclude them. Owner: @MCKRUZ. Answer: free text plus roster shortcut.
- **The form is kept in memory per project, not saved to disk.** It survives switching tabs, which is the realistic loss, without creating a second place a half-written brief lives that could drift from the plan or be shared by accident. Owner: @MCKRUZ. Answer: memory only.
- **The main process re-validates every selection.** The plugin refuses bad input too, but a clear one-line refusal before any process starts is better than a script error, and the renderer is not the authority on what ids exist. Owner: @MCKRUZ. Answer: validate twice.
