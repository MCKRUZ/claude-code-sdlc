# Steering Scorecard
<!-- Build loop | Biweekly steering artifact | Outcomes only -->

> The outcome scorecard shown at biweekly steering, alongside a live demo in the dev environment.
> Baseline-and-trend, no vanity targets. Generate the numbers with:
> `uv run scripts/scorecard.py report --state .sdlc/state.yaml --window-days 14`
>
> **No activity metrics in client materials, ever** — no PR counts, no "AI productivity" claims.
> Agents inflate every activity number; demos and outcomes don't lie.

**Period:** [YYYY-MM-DD → YYYY-MM-DD]

## The outcome metric
<!-- The one number the client hired us to move, fixed in Phase 0. State it with honest caveats. -->
- **[metric name]:** [current read] — [trend vs. last steering] — [caveats]

## Trust & intent
| Signal | This period | Trend | Reading |
|--------|-------------|-------|---------|
| Accepted-as-is rate | [%] | [↑/↓/→] | Rising = intent and bounds are working |
| Rework / revert rate | [%] | [↑/↓/→] | |
| Bounce-back (unclear) | [%] | [↑/↓/→] | A spec bounced as unbuildable is a triage miss, not an agent failure |

## Delivery health (DORA four)
| Measure | This period | Trend |
|---------|-------------|-------|
| Deploy frequency | [n / period] | [↑/↓/→] |
| Lead time (median) | [hours] | [↑/↓/→] |
| Change-fail rate | [%] | [↑/↓/→] |
| Time-to-recover (median) | [hours] | [↑/↓/→] |

## The bottleneck
- **Review wait (median):** [hours] — if this grows, stop opening streams; more building throughput cannot fix a checking constraint.
- **Security-review wait (median):** [hours] — *tracked on its own line; it clears slower and hides in an average.*

## Escaped bugs
<!-- Every one answered at Retro+ with "which check should have caught it?" — the answer becomes a harness change. -->
- [count] this period. [For each: which check should have caught it.]

---
**Never tracked, never reported:** velocity, story points, PR count, lines of code.
