# Cadence Plan
<!-- Phase 3 — Foundation | Required artifact -->

> The standing meetings and the two numbers that run the Build loop.

## The week

| Meeting | Length | Replaces | Output |
|---------|--------|----------|--------|
| Flow check (daily) | 10–15 min | standup | A Checker assigned to every waiting change |
| Intent triage | 60 min | refinement | Stories become ready specs; risk tiers assigned |
| Retro+ | 60 min | retro | Every escaped bug answered with "which check should have caught it?" |
| Setup review | 30–60 min | (new) | Versioned harness changes merged |

## Client cadence
- Biweekly 45-min steering: live demo in dev + outcome scorecard.
- Weekly 5-bullet async summary.
- **No activity metrics in client materials, ever.**

## The two numbers
- **WIP cap:** no Orchestrator runs more than **2** concurrent agent streams.
- **Review-wait tripwire:** halt new streams when median review wait exceeds **one working day**.
- Security-review wait is tracked **separately**.

## WIP Limits

| team | wip_limit | review_alarm_hours | security_alarm_hours |
|------|-----------|---------------------|-----------------------|
| core | 3 | 24 | 48 |

## Hardening passes (scheduled, not a gating phase)
- Mid-Build: after the third merged slice — adds the test environment.
- Before Phase 8: load, E2E journeys, pen-test.
