# Document Registry
<!-- TARGET: ${INDEX_BUDGET_TOKENS} tokens. If over budget, truncate Topic Clusters first, then trim 1-line descriptions. -->

Generated: ${TIMESTAMP}
Intake Path: `${INTAKE_PATH}`

## Document Corpus Summary

| Metric | Value |
|--------|-------|
| Total Documents | ${TOTAL_DOCUMENTS} |
| Total Estimated Tokens | ${TOTAL_ESTIMATED_TOKENS} |
| File Types | ${TYPE_BREAKDOWN} |
| Index Budget | ${INDEX_BUDGET_TOKENS} tokens |

## Document Index

| ID | Filename | Type | Est. Tokens | Key Topics | Summary |
|----|----------|------|-------------|------------|---------|
| DOC-001 | ${FILENAME} | ${TYPE} | ${EST_TOKENS} | ${KEY_TOPICS} | [Summary](../../context/intake/DOC-001-${SLUG}.md) |

## Topic Clusters

Group documents by detected theme. Each cluster should list the document IDs that contribute to it.

| Cluster | Documents | Description |
|---------|-----------|-------------|
| ${CLUSTER_NAME} | DOC-001, DOC-003 | ${CLUSTER_DESCRIPTION} |

## Cross-Reference Map

Note which documents reference each other (e.g., an API spec references a compliance doc).

| Document | References | Referenced By |
|----------|------------|---------------|
| DOC-001 | DOC-003 | DOC-002 |

## Usage Guide

To reference a source document from Phase 1 requirements:
- Use `DOC-NNN` IDs in the **Source Document(s)** column of `requirements.md`
- Example: `DOC-003:Section 4.2` references Section 4.2 of document DOC-003
- For full document detail, read the summary at `.sdlc/context/intake/DOC-NNN-*.md`
- For the original source, find the file path in the Document Index above
