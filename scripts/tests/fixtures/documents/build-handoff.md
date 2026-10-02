# Build Handoff
<!-- Phase 3 — Foundation | Required artifact (handoff into the Build loop) -->

> What the Build loop needs to start.

## State at handoff
- Walking skeleton deployed to dev: https://claims-dev.example.com
- Rails proven (all five workflows fired on real PRs): yes
- HIGH-risk spec that ran the full loop: 0003-duplicate-claim-409

## Ready backlog (first specs into the loop)
| Spec | Risk tier | Moves which outcome | Notes |
|------|-----------|---------------------|-------|
| 0004-claim-status-page | MED | Fewer "where is my claim" calls | |

## Carried forward
- Open questions (with owners + due dates): AQ-02 retention window, Priya N., 2026-10-07
- Constraints locked in Foundation: dev environment is single-region
- Risk-tier map: see `risk-tier-map.md`
- Cadence + WIP cap + tripwire: see `cadence-plan.md`

## First-week focus
Start with the claim status page: it moves the call-deflection metric soonest and exercises the read path end to end.
