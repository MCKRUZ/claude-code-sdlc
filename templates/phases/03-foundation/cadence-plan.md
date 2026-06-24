# Cadence Plan
<!-- Phase 3 — Foundation | Required artifact -->

> The standing meetings and the two numbers that run the Build loop. The constraint on parallelism
> is **checking capacity, not headcount** — never open more agent streams than the team can review
> without the queue growing.

## The week

| Meeting | Length | Replaces | Output |
|---------|--------|----------|--------|
| Flow check (daily) | 10–15 min | standup | A Checker assigned to every waiting change; vague specs flagged; WIP cap enforced (queue number first) |
| Intent triage | 60 min | refinement | Stories → ready specs; risk tiers assigned; decision lists answered |
| Retro+ | 60 min | retro | Every escaped bug answered with "which check should have caught it?"; harness backlog |
| Setup review | 30–60 min | (new) | Versioned harness changes merged; Setup Owner's deputy reviews |

## Client cadence
- Biweekly 45-min steering: live demo in dev + outcome scorecard + decision list + gate status.
- Weekly 5-bullet async summary.
- **No activity metrics in client materials, ever.** Outcomes and demos only.

## The two numbers
- **WIP cap:** no Orchestrator runs more than **[2]** concurrent agent streams.
- **Review-wait tripwire:** halt new streams when median review wait exceeds **[one working day]**.
- Security-review wait is tracked **separately** (it clears slower and would hide in an average).

## Hardening passes (scheduled, not a gating phase)
- Mid-Build: [date/trigger] — adds the test environment.
- Before Phase 8: [date/trigger] — load, E2E journeys, pen-test.
