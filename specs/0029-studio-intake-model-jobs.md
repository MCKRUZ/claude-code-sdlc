---
spec: "0029"
name: "studio-intake-model-jobs"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: HIGH
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-intake: Summarise; /sdlc-brief: Analyse the corpus) and the registry button that spec 0028 made possible"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "studio/electron/main/{agentRun,draftDocuments,draftKeep,draftTargets}.ts from spec 0027: one read-only model run at a time, from an isolated directory, with a fixed agent table and no document text in the prompt; a result is a candidate that only Keep writes, through one audited whole-document write. This spec adds two more jobs that produce several candidates at once, and the button that writes the registry."
created: "2026-10-03"
---

# Spec 0029 — studio-intake-model-jobs

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
From the Discovery stage a person can summarise the reference documents (one summary per document, reviewed together), have Claude analyse them for contradictions and unanswered questions (two documents from one run), write the document registry and index, and keep or discard each result, with the cost and progress of a multi-document run always in view.

## Why
Spec 0026 let a person catalogue and lock the reference documents, and spec 0028 made the registry and index a script call, but the step between them is still a slash command: reading every document and writing its summary, and then comparing the summaries to find what the documents disagree on and what nobody has written down. Those are the two pieces of work Discovery exists to do before the workshop, and the brief depends on them. They differ from the single-document jobs of spec 0027 in one way that matters: a run now produces several results, and a person needs to see all of them, keep some, and know what the whole batch cost before deciding. Doing this on the existing runner, rather than building another, keeps what Claude may read and do in one place.

## Scope

### In scope
- Two new model jobs on the spec 0027 runner: `summarise` (one run per catalogued, non-skipped document without a filled summary, in priority order, one at a time) and `analyse` (one run of the `discovery-analyst` agent producing both `contradiction-list.md` and `question-list.md`).
- A batch layer in the main process that holds a job's list of candidates (one for each document, two for the analysis), reports progress as "3 of 8", keeps the running cost, stops after the current run when cancelled while keeping the candidates already produced, and offers *Keep all*, *Keep selected* and *Discard all*; Keep reuses spec 0027's per-candidate write, which captures what it replaces and records each file.
- `draftTargets.ts` / `draftKeep.ts`: summary targets under `.sdlc/context/intake/` and the two analysis targets under `.sdlc/artifacts/00-discovery/` join the targets Keep may write; nothing else does.
- A plugin agent for summaries, `claude-code-sdlc:document-summarizer`, added to the fixed agent table; **it must exist in the plugin before this spec is built** (see the Decision List).
- The Reference-documents panel gains *Summarise the documents* (with a confirmation that lists the documents and says it runs Claude once for each), *Analyse the documents*, and *Write the registry and index*, which runs `intake_documents.py --registry --json` and shows what is still missing.
- A candidate list view in the renderer: each candidate with its target and a readable preview, the batch progress and running cost, and the three decisions.
- Studio tests: vitest on the argument lists, the batch state machine and every refusal; jsdom on the list view; a Playwright real-window case for the controls and for "opening the screen starts no run"; no automated test calls a live model.
- `CLAUDE.md`.

### Out of scope
- The workshop brief form (choosing which contradictions and questions make the page) and the brief build: the next spec.
- Running summaries in parallel, automatic re-runs, and editing a candidate before keeping it.
- The registry's topic clusters and cross-reference map: judgment, still written by a person or the model step in the editor.
- Any change to the protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`) and to the chat's tools. **Stop and ask** if the agent for summaries cannot be added to the plugin.

## Acceptance Checks
- [ ] The summarise job runs one agent run per document that needs a summary, sequentially in the catalogue's `priority_order` and then by id, and never for a skipped document or one whose `DOC-NNN-*.md` summary is already filled; a catalogue with five documents, one skipped and one already summarised, starts exactly 3 runs, and the ids are read from `catalog.json` by the main process, never sent by the renderer.
- [ ] Starting a summarise job when `catalog.json` has `locked: false`, or when no document needs a summary, returns `ok: false` with one line ("Lock the document ids first" and "Every document already has a summary" respectively) and starts 0 processes.
- [ ] The renderer's confirmation before a summarise job shows one row per document as `DOC-003 · gamma-api.md`, the sentence "Claude runs once for each of these N documents" with N filled in, and a *Start* button; until *Start* is pressed `startBatch` is called 0 times.
- [ ] Progress reads "Summarising 3 of 8" with the current document's name, the elapsed time and the running cost so far (omitted, not $0.00, while unknown); Cancel stops after the run in progress, kills it, and keeps the candidates already finished.
- [ ] A run that fails does not end the batch: its document is listed as "failed" with one plain line, the next run starts, and the finished candidates stay available.
- [ ] A summary candidate that still contains an unfilled `${...}` placeholder, or is empty, is not offered for keeping: it is listed as failed.
- [ ] The analyse job runs once, with the `discovery-analyst` agent, and its reply must contain both documents between exact marker lines (`=== FILE: contradiction-list.md ===`, `=== FILE: question-list.md ===`, `=== END ===`, once each, in that order); a reply with a marker missing, duplicated, out of order, or an extra `=== FILE: … ===` line is a failed run with one line, and no candidate is produced. Prose before the first marker or after the end marker is discarded, not rejected: the real analyst opens with a sentence of its own, and a code fence around the whole reply is treated the same way.
- [ ] The two analysis candidates (`.sdlc/artifacts/00-discovery/contradiction-list.md` and `question-list.md`) are shown together and *Keep* writes both; if the second write fails the first stays written, the result names the file written and the file not written, and only the written one is recorded `accepted`.
- [ ] Every argument list for the new jobs is pinned by an exact-match test and none contains `Bash`, `Edit`, `Write`, `Task`, `WebFetch`, `WebSearch` or `--mcp-config`; the agent names (`document-summarizer`, `discovery-analyst`) come from the fixed table, and a unique marker string placed inside a source document is absent from every argument list.
- [ ] *Keep all* writes every candidate through the spec 0027 write (allowlist check, `resolveProjectDocument`, temp-file-and-rename, capture before replace), records each as `created` or `revised` with the person's name, and records each in the draft ledger as `accepted`; *Keep selected* does the same for the ticked ones and records the others as `discarded` only when the person presses *Discard the rest*.
- [ ] *Discard all* writes nothing, and records every candidate as `discarded` in the draft ledger.
- [ ] A Keep target outside `.sdlc/context/intake/DOC-NNN-*.md` and the two analysis files, or containing `..`, or resolving outside the project, is refused with one line and nothing is written.
- [ ] Batch state belongs to the project it was started in, as in spec 0027: another project's screen shows no running batch and no candidates, and Keep and Discard from another project are refused and write nothing there.
- [ ] *Write the registry and index* runs exactly `intake_documents.py --state <state> --registry --json` and shows how many documents are summarised, which are not, and whether the index fits its budget; it does not call a model.
- [ ] The cost shown for a batch is the sum of the runs' own `total_cost_usd` (three runs reporting 0.10, 0.12 and 0.08 show "Cost so far: $0.30"); a run that reported none contributes nothing and is not counted as $0.00, and with no run reporting any the cost line is omitted.
- [ ] Nothing is written to the project while a batch runs or after it is cancelled, discarded or fails: a test snapshots the SHA-256 of every file under the project before and after.
- [ ] The full Studio suite (typecheck, vitest, Playwright real window with `STUDIO_SKIP_LIVE_MODEL=1`) and the plugin suite pass; no automated test calls a live model.

## Risk Tier
**Tier:** HIGH
**Why this tier:** it extends the one place where a model run reads the project and its result reaches the disk, from one result to many, over documents that are the most likely in the project to carry outside text (a vendor's PDF, a customer's brief), and a batch can cost real money without a person watching each run. It stays an extension of the spec 0027 controls rather than a new path: the same read-only tool list, isolated directory, fixed agent table, no document text in the prompt, and the same audited write. The Pod Lead may lower it only after the argument-list, marker-parsing and no-write tests are read.

## Delegation Plan
- **Scope (file patterns):** `studio/electron/main/{draftBatch,draftTargets,draftKeep,agentRun,draftDocuments,index}.ts` (index: one registration line at most), `studio/electron/preload/index.ts`, `studio/shared/types.ts`, `studio/src/components/{IntakePanel,BatchCandidateList,useDraftBatch}.tsx` (and `.ts`), `studio/test/**` (new files and fixtures, including the stand-in `claude`), `CLAUDE.md`, this spec. Everything else is out; the `document-summarizer` agent is a separate plugin change (its own spec) that must land first.
- **Context (pattern to reuse):** spec 0027's `agentRun.ts`, `draftDocuments.ts`, `draftKeep.ts` and `useDraftJob.ts`, and spec 0026's `IntakePanel.tsx`.
- **Permissions:** auto-allowed: reads, `npm` scripts under `studio/`, `pytest`, `uv run` of plugin scripts. Confirm-required: edits outside the scope list, any edit to a protected-core file, any change to `CHAT_TOOLS`, any automated test that would call a live model.
- **Gated paths touched:** `agentRun.ts`, `draftKeep.ts` and `draftTargets.ts` decide what a model may do and what it may write; gated for review. Security pass required (HIGH).

## Checking Plan
**Ladder depth:** HIGH
**Specifics:** grader against these checks; the security review reads the argument lists, the marker parsing and the widened Keep targets; a non-author Checker runs the whole path on a scratch project with three small documents and a live model: summarise, cancel one batch part-way, keep two and discard one, run the analysis and keep both lists, write the registry; a named sign-off from the Pod Lead; CI runs the Studio and plugin suites with no live model.

## Decision List
- **Summaries are written by a dedicated plugin agent, not by reusing the analysis agent.** The command today has the main session write each summary inline, so the summary rules (the template, the token budget, the partial-extraction flag for long documents, no invention) live only in a paragraph of prose. A `document-summarizer` agent puts them in one place that both the slash command and Studio use. Reusing `discovery-analyst` would make a comparison agent write summaries on the strength of a prompt. Owner: @MCKRUZ. Answer: a new plugin agent, added first.
- **Summaries run one at a time, not in parallel.** The cost is the number of documents either way, but sequential runs show progress and a running total, can be stopped after the current one with nothing in flight to clean up, and never put several model processes reading the project at once. A batch of ten is slower, which is acceptable for work done once per engagement. Owner: @MCKRUZ. Answer: sequential.
- **A batch asks first.** A single summary costs about the same as the ones in spec 0027, but a batch over a corpus can cost many times that, so the person confirms with the document list in front of them; the running total is shown while it runs. There is no estimate in advance, because a guess would be a number nobody gave. Owner: @MCKRUZ. Answer: confirm, then show actual cost.
- **The analysis returns both documents in one reply, between marker lines, and a reply that does not match is a failure.** The contradictions end in questions and the question list leans on them, so one run reading the corpus once is cheaper and more consistent than two. Parsing by exact marker means a half-formed reply produces nothing rather than a half-written list. The first version also rejected any prose outside the markers; running the real agent showed it opens with a sentence of its own, which would have failed every analysis, so that sentence (and a wrapping code fence) is now discarded while everything between the markers stays strict. Owner: @MCKRUZ. Answer: one run, strict markers, outside prose dropped.
- **A cancelled batch keeps what it finished.** Throwing away paid-for summaries because the person stopped early would waste money and trust; they stay as candidates to keep or discard. Owner: @MCKRUZ. Answer: keep finished candidates.
- **The batch layer reuses the spec 0027 per-candidate write rather than a new one.** One audited write path is the point of that spec; Keep all is a loop over it. Owner: @MCKRUZ. Answer: loop over the existing write.
