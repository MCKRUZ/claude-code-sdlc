# Contradiction List
<!-- Produced by the discovery-analyst agent (Phase 0, Step 0d). Every entry needs TWO
     citations — a claim with one source is a question, not a contradiction; move it to
     question-list.md. Quote the conflicting passages so a human can judge without opening
     the sources. -->

Generated: 2026-10-09T14:20:00Z
Corpus: 14 documents (see `document-registry.md`)
Status: draft <!-- draft | reviewed-by-pod-lead | resolved-at-workshop -->

## Summary

| Severity | Count |
|----------|-------|
| blocks-outcome | 1 |
| shapes-design | 1 |
| minor | 0 |

## Contradictions

<!-- Repeat this block per contradiction. Order by severity: blocks-outcome first. -->

### CON-01: Which intake channels the portal replaces

- **Type:** scope
- **Severity:** blocks-outcome
- **Source A — DOC-001 s2.1:** "The portal will replace all existing claim intake channels, including phone and email."
- **Source B — DOC-003 s4.3:** "Large commercial losses continue to be taken by phone through the specialty desk."
- **Why it matters:** The first release scope and the retirement plan for the phone desk depend on which statement is true.
- **The question for the room:** Which intake channels must the portal retire in the first release?
- **Resolution:** open

### CON-02: Adjuster response commitment

- **Type:** fact
- **Severity:** shapes-design
- **Source A — DOC-007 s3.2:** "The adjuster shall respond within 48 hours of assignment."
- **Source B — DOC-001 s5.4:** "Claims are assigned and acknowledged by an adjuster the same business day."
- **Why it matters:** The assignment workflow and the customer-facing status messages need one agreed time commitment.
- **The question for the room:** Which time commitment governs the first release?
- **Resolution:** open

## Resolution Log

<!-- Filled during/after the workshop. Every blocks-outcome contradiction MUST be resolved
     (or explicitly accepted as a risk) before Phase 0 exit. -->

| ID | Resolved by | Answer | Date |
|----|-------------|--------|------|
| CON-01 | Dana Ortiz | Phone intake stays for large commercial losses in release one | 2026-10-14 |
