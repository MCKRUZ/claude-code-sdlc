# Pipeline Proof
<!-- Phase 3 — Foundation | Optional artifact (evidence for the exit gate's "rails are proven" check) -->

> Which delivery rails have actually fired on this repository, read from GitHub's own history. A
> rail that has only ever seen green has not been tested — it has been assumed. The first four
> sections are gathered by `scripts/pipeline_proof.py` (Studio: "Gather pipeline evidence") and
> are rewritten each time it runs; **Forced-failure proofs** is yours and is never overwritten.

**Repository:** [owner/name]
**Evidence gathered:** [YYYY-MM-DD HH:MM UTC]

---

## Rail status

| Rail | Status | What the history shows | Evidence |
|------|--------|------------------------|----------|
| [workflow] | [PROVEN / RAN-UNPROVEN / NEVER-FIRED / BROKEN / NO DATA] | [reason] | [PR / run links] |

## Branch protection

[What GitHub actually enforces, against the ruleset checked into the repository.]

## Merge history

[Merged pull requests, split at the moment the ruleset went live.]

## Proofs still needed

[For every rail not yet proven: the forced failure that would prove it, and the file it would touch.]

## Forced-failure proofs

| Rail | Proof | Evidence (PR / run URL) | Date |
|------|-------|-------------------------|------|
| [rail] | [what was planted and what caught it] | [URL] | [YYYY-MM-DD] |
