# Contradiction List
<!-- Produced by the discovery-analyst agent (Phase 0, Step 0d). Every entry needs TWO
     citations — a claim with one source is a question, not a contradiction; move it to
     question-list.md. Quote the conflicting passages so a human can judge without opening
     the sources. -->

Generated: ${TIMESTAMP}
Corpus: ${TOTAL_DOCUMENTS} documents (see `document-registry.md`)
Status: ${STATUS} <!-- draft | reviewed-by-pod-lead | resolved-at-workshop -->

## Summary

| Severity | Count |
|----------|-------|
| blocks-outcome | ${COUNT_BLOCKS} |
| shapes-design | ${COUNT_SHAPES} |
| minor | ${COUNT_MINOR} |

## Contradictions

<!-- Repeat this block per contradiction. Order by severity: blocks-outcome first. -->

### CON-${NN}: ${SHORT_TITLE}

- **Type:** ${TYPE} <!-- fact | scope | assumption | terminology -->
- **Severity:** ${SEVERITY} <!-- blocks-outcome | shapes-design | minor -->
- **Source A — ${DOC_ID_A}${SECTION_A}:** "${VERBATIM_QUOTE_A}"
- **Source B — ${DOC_ID_B}${SECTION_B}:** "${VERBATIM_QUOTE_B}"
- **Why it matters:** ${ONE_OR_TWO_SENTENCES}
- **The question for the room:** ${RESOLVING_QUESTION}
- **Resolution:** ${RESOLUTION} <!-- open | resolved: [answer, who, date] -->

## Resolution Log

<!-- Filled during/after the workshop. Every blocks-outcome contradiction MUST be resolved
     (or explicitly accepted as a risk) before Phase 0 exit. -->

| ID | Resolved by | Answer | Date |
|----|-------------|--------|------|
| CON-01 | ${WHO} | ${ANSWER} | ${DATE} |
