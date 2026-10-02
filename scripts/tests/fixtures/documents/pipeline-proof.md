# Pipeline Proof
<!-- Phase 3 — Foundation | Optional artifact (evidence for the exit gate's "rails are proven" check) -->

> Which delivery rails have actually fired on this repository, read from GitHub's own history.

**Repository:** acme/claims-portal
**Evidence gathered:** 2026-09-30 14:05 UTC

---

## Rail status

| Rail | Status | What the history shows | Evidence |
|------|--------|------------------------|----------|
| ci | PROVEN | Went red on 3 pull request runs that were then fixed or closed unmerged. | [PR #12](https://github.com/acme/claims-portal/pull/12) |
| grader | RAN-UNPROVEN | Ran green and posted verdicts, but never one naming an uncovered check. | |

## Branch protection

Enforcement is active. Required checks match the checked-in ruleset.

## Merge history

14 merged pull requests: 4 before the ruleset went live, 10 after. Every post-enforcement merge was approved.

## Proofs still needed

- **grader** — a pull request with a planted mismatch between the spec and the code. Touches a spec under specs/ and the source file it describes.

## Forced-failure proofs

| Rail | Proof | Evidence (PR / run URL) | Date |
|------|-------|-------------------------|------|
| ci | Planted a failing test; the merge was blocked. | https://github.com/acme/claims-portal/pull/12 | 2026-09-27 |
