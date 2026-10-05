# Document Registry
<!-- TARGET: 4000 tokens. If over budget, truncate Topic Clusters first, then trim 1-line descriptions. -->

Generated: 2026-10-09T13:05:00Z
Intake Path: `docs/client-intake/`

## Document Corpus Summary

| Metric | Value |
|--------|-------|
| Total Documents | 3 |
| Total Estimated Tokens | 41200 |
| File Types | 2 PDF, 1 DOCX |
| Index Budget | 4000 tokens |

## Document Index

| ID | Filename | Type | Est. Tokens | Key Topics | Summary |
|----|----------|------|-------------|------------|---------|
| DOC-001 | claims-modernization-rfp.pdf | PDF | 18500 | goals, scope, vendor requirements | [Summary](../../context/intake/DOC-001-claims-modernization-rfp.md) |
| DOC-002 | current-state-process-map.docx | DOCX | 9700 | intake flow, re-keying, handoffs | [Summary](../../context/intake/DOC-002-current-state-process-map.md) |
| DOC-003 | adjuster-network-sla.pdf | PDF | 13000 | response times, penalties | [Summary](../../context/intake/DOC-003-adjuster-network-sla.md) |

## Topic Clusters

Group documents by detected theme. Each cluster should list the document IDs that contribute to it.

| Cluster | Documents | Description |
|---------|-----------|-------------|
| Claim intake | DOC-001, DOC-002 | How a claim enters the business today and how the portal should change it |
| Service levels | DOC-001, DOC-003 | Response-time commitments to customers and to adjusters |

## Cross-Reference Map

Note which documents reference each other (e.g., an API spec references a compliance doc).

| Document | References | Referenced By |
|----------|------------|---------------|
| DOC-001 | DOC-003 | DOC-002 |
| DOC-002 | DOC-001 | none |
| DOC-003 | none | DOC-001 |

## Usage Guide

To reference a source document from Phase 1 requirements:
- Use `DOC-NNN` IDs in the **Source Document(s)** column of `requirements.md`
- Example: `DOC-003:Section 4.2` references Section 4.2 of document DOC-003
- For full document detail, read the summary at `.sdlc/context/intake/DOC-NNN-*.md`
- For the original source, find the file path in the Document Index above
