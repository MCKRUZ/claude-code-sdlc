# /sdlc-intake — Catalog and Summarize the Document Corpus

Process external reference documents (RFPs, API specs, vendor docs, decks) into a cataloged,
token-budgeted set of summaries for use across the engagement. This is the Phase 0 Step 0c
workflow wrapped as one command, so no one runs the cataloger script by hand.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not
   found, tell the user to run `/sdlc-setup` first.

2. **Resolve the intake source:**
   - Workflow mode (default): read the `documentation.intake_path` from `.sdlc/profile.yaml`.
     If the profile has no `documentation` section, tell the user document intake is not
     configured for this profile and stop (or offer to add it).
   - `--docs <path>`: use the given folder instead of the profile path (standalone use).

3. **Run the cataloger:** Execute the intake script — the user never calls it directly:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/intake_documents.py --state .sdlc/state.yaml
   ```
   This produces `.sdlc/context/intake/catalog.json` with document metadata (DOC-NNN IDs,
   types, token estimates, checksums). Pass `--rescan` through when the user runs
   `/sdlc-intake --rescan`.

4. **Review the catalog with the human:**

> **HITL GATE:** Present the catalog using the `AskUserQuestion` tool: "I found N documents in
> [intake_path] totaling ~X estimated tokens: [table of DOC-NNN | filename | type | est.
> tokens]. (1) Are all relevant documents present, or should any be added/removed? (2) Which
> are highest priority for understanding the project? (3) Any to skip?" Adjust before proceeding.

5. **Generate per-document summaries:** For each document (respecting `max_documents`), ordered
   by human-indicated priority: read the content, write a summary following the
   `document-summary.md` template to `.sdlc/context/intake/DOC-NNN-{slug}.md`, targeting
   `summary_budget_tokens`. For any document over ~100K tokens, chunk it (first and last 10%
   plus section headers) and flag the summary as a partial extraction.

6. **Generate the registry and index:** Create `.sdlc/artifacts/00-discovery/document-registry.md`
   (human-readable, all DOC-NNN IDs, key topics, summary links, topic clusters) and
   `.sdlc/context/intake/index.md` (the condensed session-start index, within
   `index_budget_tokens`).

7. **Lock the catalog:**

> CHECKPOINT: Verify all summaries exist, the registry is complete, and the index fits its
> token budget. If over budget, trim topic clusters first, then 1-line descriptions. Then lock
> the catalog by setting `"locked": true` in `.sdlc/context/intake/catalog.json` so DOC-NNN IDs
> stay stable for the rest of the engagement (Phase 1 traceability depends on this).

8. **Report:**
   ```
   Document Intake Complete
   ========================
   Cataloged: N documents (DOC-001 … DOC-0NN)
   Summaries: N written to .sdlc/context/intake/
   Registry:  .sdlc/artifacts/00-discovery/document-registry.md
   Catalog locked. Next: /sdlc-brief to prep a stakeholder workshop from this corpus.
   ```

## Arguments

- No arguments: workflow mode against the profile's `documentation.intake_path`
- `--docs <path>`: catalog a folder directly (standalone; DOC-NNN IDs provisional until locked)
- `--rescan`: re-catalog after documents were added or removed (appends new DOC-NNN IDs;
   existing IDs and summaries are preserved)

## Important

- The user runs `/sdlc-intake` — never `intake_documents.py` by hand. The command owns the
  script invocation, the HITL gate, summarization, and locking.
- Intake is the prerequisite for `/sdlc-brief` (the workshop brief is built on the summaries).
- If the project has no external documents, skip intake entirely — it is opt-in.
