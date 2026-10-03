---
spec: "0028"
name: "intake-registry"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-intake: registry and index are mechanical given the summaries) and CLAUDE.md, which says --registry was left for the intake spec"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "scripts/intake_documents.py and the golden/modes tests from spec 0021: the catalogue script already takes flags that change what it does, prints one JSON document under --json, and its unflagged output is pinned byte-identical by golden captures. This adds one more mode, in a module of its own, the way pipeline_proof_model.py and github_import.py keep pure logic out of their CLIs."
created: "2026-10-03"
---

# Spec 0028 — intake-registry

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
`intake_documents.py --registry` writes the Discovery document registry and the session-start index from the catalogue and the summaries that exist, so step 6 of `/sdlc-intake` is a script call instead of two documents typed out by hand, and SDLC Studio can offer it as a button.

## Why
Step 6 of `/sdlc-intake` asks Claude to produce `document-registry.md` and `index.md` from information that is already on disk: the catalogue says what each document is and how big it is, and the summaries say what is in them. Producing them by hand each time means the numbers are retyped (and can drift from the catalogue), the index can silently overrun the token budget it exists to respect, and a person's edits to the registry's hand-written clusters can be lost when it is regenerated. The command's own checkpoint ("the registry is complete, and the index fits its token budget") is a check a script can do exactly. The judgment that remains is small and stays where it was: which topic clusters the documents form and which documents reference each other.

## Scope

### In scope
- `scripts/intake_documents.py`: a `--registry` flag, handled before any scanning or catalogue change, that needs an existing catalogue and a project (`--state` or `--repo`).
- New `scripts/intake_registry.py`: the logic, pure where it can be — reading the catalogue and the `DOC-NNN-*.md` summaries, filling the registry's Document Corpus Summary and Document Index sections, building the index within `index_budget_tokens`, and reporting what is missing.
- `.sdlc/artifacts/00-discovery/document-registry.md`: created from its template when absent; when present, only the Document Corpus Summary and Document Index sections and the `Generated:` line are rewritten, and every other byte (including hand-written Topic Clusters and the Cross-Reference Map, and the file's line endings) is kept.
- `.sdlc/context/intake/index.md`: written within the budget, trimming in the command's own order.
- `--json` for the new mode (one document), a `intake-registry` capability in `scripts/capabilities.py`, the `commands/sdlc-intake.md` step that now calls it, `CLAUDE.md`, and tests (new files only, plus golden captures taken before the change).

### Out of scope
- Writing the per-document summaries and the topic clusters: those are model work (the Studio runner does them in a later spec), and this mode only reads what exists.
- Locking the catalogue (already `--lock`) and any change to the catalogue file.
- The protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`) and any template or shape change. **Stop and ask** if the registry template needs a new section.
- Any Studio change.

## Acceptance Checks
- [ ] Without `--registry`, the script's output and exit codes for a fresh scan, an existing catalogue, `--json`, `--skip`, `--priority`, `--lock` and the locked-catalogue refusal are byte-identical to golden captures taken from the script before this change; the existing intake tests pass unmodified.
- [ ] `--registry` with no catalogue exits 1 with the message "no catalog to build a registry from; run intake first" and writes nothing; with neither `--state` nor `--repo` the existing usage error (exit 2) applies; combined with `--skip`, `--priority`, `--lock`, `--rescan` or `--docs` it exits 2 as well.
- [ ] On a project with a three-document catalogue and one summary, it creates `.sdlc/artifacts/00-discovery/document-registry.md` whose Document Corpus Summary shows Total Documents `3`, the catalogue's own token total, a file-type breakdown (for example `markdown: 2, pdf: 1`) and the index budget, and whose Document Index has one row per document in priority order then id order, each with its type and token estimate from the catalogue.
- [ ] A document with a filled summary gets a `[Summary](../../context/intake/DOC-NNN-<slug>.md)` link and a Key Topics cell taken from that summary's Scope line, cut to 80 characters; a document with no summary, or whose summary still holds `${...}` placeholders, shows "(not yet summarised)" and a dash for Key Topics, and its id is listed under `missing_summaries` in the JSON.
- [ ] A skipped document stays in the registry marked "(skipped)" and is left out of the index.
- [ ] Run again on an existing registry whose Topic Clusters table a person has filled in, it rewrites only the two gathered sections and the `Generated:` line: a test compares every other line of the file, with LF and with CRLF line endings, and finds them identical, and the file's line endings are preserved.
- [ ] If an existing registry has lost one of the two gathered headings, that section is left alone, the other is still updated, and the JSON `warnings` names the missing heading; the script does not fail.
- [ ] `index.md` lists one line per non-skipped document (id, file, type, one-line description from the summary's Document Overview, or "no summary yet") plus the filled Topic Clusters from the registry when there are any, and its estimated tokens, counted with the script's own estimator, are at most `index_budget_tokens`.
- [ ] When the index would exceed the budget it is trimmed in this order and the JSON `trimmed` lists the steps taken: topic clusters dropped first, then one-line descriptions shortened to 120, 80 and 40 characters, then removed; no document id is ever dropped, and if the ids alone still exceed the budget the file is written in full and `index_within_budget` is false, never truncated silently.
- [ ] `--registry --json` prints exactly one JSON document with `registry`, `index` (repo-relative, forward slashes), `documents`, `summarised`, `missing_summaries`, `index_tokens`, `index_budget`, `index_within_budget`, `trimmed`, `registry_created` and `warnings`; the text mode prints the same facts in plain lines.
- [ ] Running it twice in a row changes nothing the second time except the `Generated:` timestamp line.
- [ ] `capabilities.list_capabilities()` includes `intake-registry`, and the existing capability test, which runs the script's real `--help` and requires `--registry` and `--json`, passes.
- [ ] `commands/sdlc-intake.md` step 6 runs the script and leaves only the topic clusters and cross-reference map to be written, and the command-contract lint passes against it.
- [ ] The full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** MEDIUM
**Why this tier:** it writes two project documents, one of which a person edits by hand, so a bug could overwrite their work, and the index exists to keep a session's context within a budget. It stays MEDIUM because the existing registry is only touched in two named sections and every other byte is compared by a test, the catalogue is read and never written, unflagged behaviour is pinned by golden captures, and nothing consumes the new mode until the Studio spec after this. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/intake_documents.py`, `scripts/intake_registry.py`, `scripts/capabilities.py`, `commands/sdlc-intake.md`, `scripts/tests/test_intake_registry.py`, `scripts/tests/fixtures/golden/intake_documents-*.txt`, `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** spec 0021's golden captures and `golden_support.py`; `scripts/pipeline_proof.py`, which rewrites only its gathered sections and keeps the person's; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `uv run` of the scripts under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file, any template or shape change.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** MEDIUM
**Specifics:** grader against these checks; a non-author Checker runs it twice on a project with a hand-filled Topic Clusters table and confirms nothing of theirs moved; CI runs the existing suite unmodified.

## Decision List
- **The registry's Topic Clusters and Cross-Reference Map are not generated.** Grouping documents by theme and noting which reference which is judgment, and a script that guessed would put plausible-looking but invented structure into a client-facing document. They stay as the template's fill-in sections for a person or the model step. Owner: @MCKRUZ. Answer: not generated.
- **Key Topics come from the summary's Scope line, nothing cleverer.** It is the one field the summary template defines for "what it covers"; deriving topics from the text would be an invented heuristic. A document without a summary shows a dash, which is true. Owner: @MCKRUZ. Answer: Scope line, 80 characters.
- **An over-budget index is reported, never silently cut.** Dropping a document id would break the traceability the ids exist for. The command's own trimming order is followed, and if that is not enough the file is complete and the JSON says so. Owner: @MCKRUZ. Answer: report, do not truncate.
- **The logic lives in its own module, not in `intake_documents.py`.** That file is already near 500 lines, and the registry code is mostly pure functions that deserve direct tests. Owner: @MCKRUZ. Answer: `intake_registry.py`.
