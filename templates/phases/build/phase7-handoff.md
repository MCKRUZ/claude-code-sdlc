# Documentation Handoff
<!-- Build Loop | Required artifact (handoff out of the loop into Phase 7) -->

> Produced when a human declares the backlog **feature-complete**. There is no batch artifact gate
> on the Build loop — checking happened per change. This handoff hands a working, merged system to
> the Documentation phase.

## Feature-complete declaration
- Declared by: [name]  Date: [YYYY-MM-DD]
- All planned epics merged and deployed to dev: [yes/no]
- Open specs deliberately deferred (with rationale): [...]

## What was built
[Short narrative of the delivered system — outcomes, not activity. No PR counts, no LOC.]

## Spec library
- Specs live in `specs/` — the durable source of truth, one file per change.
- Known spec/behavior drift to resolve in Phase 7: [list, or "none"]

## Steering snapshot (for the record)
- Accepted-as-is trend: [...]
- DORA stability pair (change-fail rate, time-to-recover): [...]
- Outcome metric in dev: [current read]

## Carried forward to Documentation
- Open questions (owners + due dates): [...]
- Areas needing a RUNBOOK / API-doc focus: [...]
