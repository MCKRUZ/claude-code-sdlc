---
spec: "0031"
name: "brief-candidates"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: LOW
source: "docs/proposals/studio-command-coverage-plan-v2.md section 4 (/sdlc-brief: Curate — the checkboxes over every CON-NN and Q-NN, the limits, pre-workshop questions listed as emailed instead)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "scripts/workshop_brief.py, which already holds the parsers for the contradiction list, the question list and the document registry that its build step selects from. A person curating the page needs to see exactly what those parsers see, so the read-only verb that shows it lives beside them and reuses them, the way spec 0028 put the registry reading next to the catalogue."
created: "2026-10-03"
---

# Spec 0031 — brief-candidates

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
`workshop_brief.py candidates --json` reports, read-only, everything a person needs in order to choose what goes on the one-page workshop brief: every contradiction and question the analyst found, which of them the command recommends, the documents that can be named as load-bearing, and the page's limits, so SDLC Studio can show a selection form without parsing the analyst's documents itself.

## Why
`/sdlc-brief` has a human gate where a person picks, from everything the analyst produced, which five or fewer contradictions and twelve or fewer questions make the page. Today that choice is made by reading two long markdown files and typing ids into a command. A form needs the same lists, in structure, with the page's rules beside them (the limits, the recommended picks, which questions are emailed instead of discussed). If Studio parsed the analyst's documents itself it would hold a second copy of the parsing that `workshop_brief.py build` relies on, and the form and the build could disagree about what an entry is. Reusing the build's own parsers makes that impossible.

## Scope

### In scope
- `scripts/workshop_brief.py`: a `candidates` verb beside `build`, taking `--state` or `--repo` (and the same `--contradictions-file`, `--questions-file` and `--registry-file` overrides), printing text or, with `--json`, one document. It writes nothing.
- Its report: each contradiction (`id`, `title`, `severity`, `question`, both `sources` with their document reference and quoted passage, and `recommended`), each question (`id`, `question`, `block`, `route`), the registry's documents (`id`, `filename`, `topics`), the limits the build enforces, the number of standing decisions the template already carries, whether a brief already exists, and whether the ids are provisional.
- `scripts/capabilities.py`: a `brief-candidates` capability, `CLAUDE.md`, and tests in a new file.

### Out of scope
- Changing `build`, the template, the parsers or any shape; the protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`). **Stop and ask** if a parser must change.
- Any Studio change: the form is the next spec.
- Ranking or scoring the entries beyond the command's own recommendation.

## Acceptance Checks
- [ ] On the shipped fixtures, `candidates --json` lists contradictions `CON-01` (severity `blocks-outcome`) and `CON-02` (`shapes-design`) with their question, and each source as a document reference and the quoted passage, exactly as `workshop_brief.parse_contradictions` returns them.
- [ ] It lists questions `Q-01` to `Q-08` with each question's block and route (`workshop`, `pre-workshop` or `interview`), exactly as `parse_questions` returns them, and the registry's documents `DOC-001` to `DOC-003` with filename and topics, exactly as `parse_registry` returns them.
- [ ] `recommended` is true for a contradiction whose severity is `blocks-outcome` or `shapes-design` and false for any other severity, including `minor` and an empty severity.
- [ ] `limits` carries the build's own constants (5 contradictions, 12 questions, 3 to 5 decisions, 3 to 5 load-bearing documents) read from the script's constants, not retyped, and `standing_decisions` is the count of numbered, placeholder-free decisions already in `workshop-brief.md`'s template (2 today).
- [ ] When the contradiction list, the question list or the registry is missing, the result has `has_data` false for the missing part: an empty list and a note naming the file and saying to run the discovery analysis or intake, never a zero count or an error exit; with all three present `has_data` is true.
- [ ] `existing_brief` is true when `workshop-brief.md` is already in the discovery artifacts folder (so a form can ask before overwriting) and false otherwise; `provisional_ids` is true only without a project `state.yaml`.
- [ ] The verb writes nothing: the SHA-256 of every file under the project is identical before and after.
- [ ] `--json` prints exactly one JSON document and nothing else; the text mode prints the same facts as plain lines; the exit code is 0 for every case above, and a usage error is 2.
- [ ] `workshop_brief.py build` is untouched: its existing tests pass unmodified, and its `--help` still lists the same flags.
- [ ] `capabilities.list_capabilities()` includes `brief-candidates`, and the existing capability test, which runs the script's real `--help` for the `candidates` verb and requires `--json`, passes.
- [ ] The full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** LOW
**Why this tier:** it adds a read-only verb that reuses the build's existing parsers and prints what they already return; nothing is written, the build is untouched, and nothing consumes it until the Studio spec after this. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `scripts/workshop_brief.py`, `scripts/capabilities.py`, `scripts/tests/test_workshop_brief_candidates.py`, `CLAUDE.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `scripts/workshop_brief.py`'s own parsers and the shipped fixtures in `scripts/tests/fixtures/documents/`; spec 0028's read-then-report shape.
- **Permissions:** auto-allowed: reads, `uv run` of the script under test, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file or to `build`.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** LOW
**Specifics:** grader against these checks; CI runs the existing suite unmodified, which proves `build` did not move.

## Decision List
- **`recommended` is exactly the command's own rule and nothing more.** The `/sdlc-brief` curation step pre-ticks `blocks-outcome` and `shapes-design`; a form should start from that and let the person change it, not invent another ranking. Owner: @MCKRUZ. Answer: severity is the only input.
- **A missing input is `has_data: false` with a note, not an error.** A person opening the form before the analysis has run should be told what to do next, not shown a failure; the same "no data over a fabricated zero" rule the other read-only reports follow. Owner: @MCKRUZ. Answer: report, exit 0.
- **The limits are read from the script's constants.** Retyping 5 and 12 in a form would drift the first time the one-page rule changes. Owner: @MCKRUZ. Answer: one source.
