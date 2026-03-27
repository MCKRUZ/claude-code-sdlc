# Document Intake Reference

This reference documents the document intake subsystem — an opt-in feature that processes external reference documents (RFPs, API specs, vendor docs, compliance handbooks) into indexed, token-budgeted summaries for use across SDLC phases.

## When to Use Document Intake

Document intake is valuable when a project has external materials that inform requirements, constraints, or design:

- **RFP responses** — the RFP itself becomes the source of truth for requirements
- **Compliance-driven projects** — regulatory handbooks define non-negotiable constraints
- **Integration projects** — vendor API docs and SDKs define interface contracts
- **Migration projects** — legacy system documentation informs the target architecture
- **Enterprise projects** — multiple stakeholders produce specs, proposals, and design documents

If the project has no external documentation (e.g., a greenfield personal project), skip document intake entirely.

## Configuration

Add a `documentation` section to the project profile:

```yaml
documentation:
  intake_path: "docs/intake"        # Relative to project root
  types: [pdf, markdown, text]      # File types to scan
  index_budget_tokens: 5000         # Max tokens for session-start index
  summary_budget_tokens: 750        # Token budget per document summary
  max_documents: 50                 # Safety cap for large corpora
```

All fields except `intake_path` have defaults. Only `intake_path` is required.

## DOC-NNN ID Scheme

Each document receives a sequential ID: `DOC-001`, `DOC-002`, etc. IDs are assigned from the alphabetically sorted file list.

- IDs are stable within a single catalog run
- Re-running with `--rescan` may reassign IDs if files were added/removed
- Finalize the catalog before Phase 1 begins — DOC-NNN references in requirements should not change after that
- To reference a specific section: use `DOC-NNN:Section X.Y` format

## Token Budget Strategy

The intake system operates under strict token budgets at every level:

| Level | Budget | Purpose |
|-------|--------|---------|
| Per-document summary | ~750 tokens (configurable) | Condensed document content |
| Intake index | ~5000 tokens (configurable) | Session-start context loading |
| Hook truncation | 3750 words hard cap | Prevents context overflow |

**For large corpora (50+ docs, 500K+ tokens):**
1. The HITL gate lets the human prioritize which documents to process first
2. `max_documents` caps the total count
3. Individual documents over 100K tokens are processed via chunking (first/last 10% + headers)
4. The index budget forces aggressive summarization — only doc IDs, filenames, and 1-line descriptions

**Budget overflow priority (what to cut first):**
1. Cross-Reference Map (lowest value in index)
2. Topic Clusters (nice-to-have)
3. 1-line descriptions (trim to shorter)
4. Document table (never cut — this is the core reference)

## Processing Large Documents

For a single document exceeding 100K estimated tokens:

1. Read the first 10% and last 10% of the document
2. Extract all section headers / table of contents
3. Summarize from this partial read, flagging it as `[partial extraction]`
4. The summary should note which sections were NOT read
5. Claude can read specific sections on-demand later using the source path from the catalog

## Traceability Protocol

Phase 1 requirements trace back to source documents:

```markdown
| REQ-001 | User must authenticate via SSO | P0 | IT Admin | US-001 | DOC-003:Section 4.2 |
```

Rules:
- A requirement MAY trace to multiple documents: `DOC-001, DOC-003:S2.1`
- Requirements not from external docs use: "Discovery interview" or "Stakeholder input"
- The Source Document(s) column is only required when document intake was performed
- Every P0 requirement sourced from an external document MUST have a DOC-NNN reference

## Incremental Intake

To add documents mid-project:

1. Place new files in the `intake_path` folder
2. Run `uv run scripts/intake_documents.py --state .sdlc/state.yaml --rescan`
3. New documents get new DOC-NNN IDs (appended after existing)
4. Generate summaries for new documents manually (read the doc, write the summary)
5. Update `document-registry.md` and `index.md`

Existing DOC-NNN IDs and summaries are not affected by a rescan — only new files are added.

## Supported File Types

| Type | Extension | Extraction | Notes |
|------|-----------|-----------|-------|
| Markdown | `.md` | Direct read | Full text, accurate token count |
| Plain text | `.txt` | Direct read | Full text, accurate token count |
| PDF | `.pdf` | pymupdf (optional) | Falls back to byte-estimate if pymupdf not installed |
| HTML | `.html` | Tag stripping | Rough word count after removing tags |
| DOCX | `.docx` | Byte estimate only | Size-based estimate; Claude reads directly for summarization |

To enable PDF text extraction, install pymupdf: `uv pip install pymupdf`

## File Layout

```
.sdlc/
  context/
    intake/
      catalog.json          # Machine-readable document catalog (metadata)
      index.md              # Token-budgeted index (auto-loaded at session start)
      DOC-001-rfp-v2.md     # Per-document summary
      DOC-002-api-spec.md   # Per-document summary
      DOC-003-compliance.md # Per-document summary
  artifacts/
    00-discovery/
      document-registry.md  # Human-readable registry (full artifact)
```
