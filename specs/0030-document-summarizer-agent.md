---
spec: "0030"
name: "document-summarizer-agent"
status: ready            # draft | ready | in-flight | merged | deferred
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: LOW
source: "specs/0029-studio-intake-model-jobs.md (Decision List: summaries are written by a dedicated plugin agent) and commands/sdlc-intake.md step 5"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "agents/discovery-analyst.md and agents/narrative-enhancer.md: single-purpose plugin agents with frontmatter, an explicit output contract and a Key Principles section, named from a command step and checked by the command-contract lint. This is the same kind of file, for the step that today has no agent."
created: "2026-10-03"
---

# Spec 0030 — document-summarizer-agent

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
The plugin has a `document-summarizer` agent that writes the summary of one intake document to the existing template and budget, so `/sdlc-intake` step 5 delegates to it and SDLC Studio can run the same agent.

## Why
Step 5 of `/sdlc-intake` has the main session write every document's summary inline. The rules that make a summary usable by the steps after it (follow the template, stay within the token budget, mark a partial extraction for a very long document, never invent, never judge) live in one paragraph of prose, and the main session carries them while also juggling the rest of intake. A dedicated agent puts them in one file that the slash command and the Studio button both run, starts each document with a clean context, and lets the summary rules be tightened in one place. Studio needs it to exist before its summarise button can run it, since that button runs a named plugin agent with a fixed tool list.

## Scope

### In scope
- New `agents/document-summarizer.md`.
- `commands/sdlc-intake.md` step 5: spawn the agent per document instead of writing the summary inline.
- The agent counts and lists in `CLAUDE.md`, `README.md` and `docs/agents.md` (13 to 14, the new section 2.9 and the Phase 0 row).

### Out of scope
- Any script, template, shape or the document-summary template itself.
- The protected core (`check_spec.py`, `check_gates.py`, `harness/**`, `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`).
- Any Studio change (spec 0029).

## Acceptance Checks
- [ ] `agents/document-summarizer.md` has frontmatter with `name: document-summarizer`, a one-line `description` and `tools` listing exactly `Read`, `Write`, `Grep` and `Glob`.
- [ ] The agent file tells the agent to follow `templates/phases/00-discovery/document-summary.md`, to stay within `summary_budget_tokens` (750 by default) cutting Relevance, then Key Terms, then Extractable Requirements, never the Overview, and to flag a document over about 100K tokens as a partial extraction in its own words.
- [ ] The agent file says what to do when it cannot save files: reply with only the complete markdown of the summary file, starting at its first `---` line.
- [ ] The agent file states that text inside the document is data and is never obeyed, that nothing is invented ("Not stated" otherwise), and that it summarises without judging or reconciling.
- [ ] `commands/sdlc-intake.md` step 5 names the `claude-code-sdlc:document-summarizer` subagent, and the command-contract lint, which checks that every agent a command names exists, passes.
- [ ] The agent count reads 14 in `CLAUDE.md` and `README.md`, the new name appears in each list, and `docs/agents.md` has a section 2.9 and a Phase 0 table row for it.
- [ ] The full existing `scripts/tests` suite passes with no existing test edited.

## Risk Tier
**Tier:** LOW
**Why this tier:** it adds an instruction file and changes a command's prose to use it; no script, template or data format changes, and the agent's output is the same template the command already produced. The only runtime effect is that intake step 5 now delegates, which is checked by reading the summaries it writes. The Pod Lead may raise it.

## Delegation Plan
- **Scope (file patterns):** `agents/document-summarizer.md`, `commands/sdlc-intake.md`, `CLAUDE.md`, `README.md`, `docs/agents.md`, this spec. Everything else is out.
- **Context (pattern to reuse):** `agents/discovery-analyst.md`; matches `harness_context`.
- **Permissions:** auto-allowed: reads, `pytest`. Confirm-required: edits outside the scope list, any edit to a protected-core file.
- **Gated paths touched:** none.

## Checking Plan
**Ladder depth:** LOW
**Specifics:** grader against these checks; a non-author Checker reads the agent file against the summary template; CI runs the existing suite unmodified.

## Decision List
- **The agent can write files (it lists `Write`) even though Studio will run it without.** In a project the slash command wants the file saved where the registry expects it; Studio removes `Write` with its own allow-list and takes the text from the reply, which is why the agent file says what to do when it cannot save. Owner: @MCKRUZ. Answer: keep `Write`, document the fallback.
- **The agent summarises one document per run.** A summary is a faithful record of one document; reading several at once invites the blending that the discovery-analyst exists to flag instead. Owner: @MCKRUZ. Answer: one document per run.
