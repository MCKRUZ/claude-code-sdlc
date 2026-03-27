---
doc_id: "${DOC_ID}"
filename: "${FILENAME}"
type: "${TYPE}"
source_path: "${SOURCE_PATH}"
estimated_tokens: ${EST_TOKENS}
created: "${TIMESTAMP}"
---
<!-- TARGET: ${SUMMARY_BUDGET_TOKENS} tokens. Prioritize: Overview > Extractable Requirements > Key Terms > Relevance. -->

# ${DOC_ID}: ${FILENAME}

## Document Overview
${ONE_PARAGRAPH_SUMMARY}

## Key Information
- **Purpose:** ${WHY_THIS_DOCUMENT_EXISTS}
- **Audience:** ${INTENDED_AUDIENCE}
- **Scope:** ${WHAT_IT_COVERS}

## Extractable Requirements
<!-- List requirements or constraints found in this document that should inform Phase 1. -->
- ${REQUIREMENT_OR_CONSTRAINT_1}
- ${REQUIREMENT_OR_CONSTRAINT_2}

## Key Terms & Definitions
<!-- Domain terms defined in this document that the project should use consistently. -->
| Term | Definition |
|------|-----------|
| ${TERM} | ${DEFINITION} |

## Relevance to Project
${HOW_THIS_DOCUMENT_RELATES_TO_THE_PROJECT}
