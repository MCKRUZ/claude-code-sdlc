# Data Readiness
<!-- Phase 2 — Design | Optional artifact -->

> Is the data this feature needs actually **available, clean, and complete** enough to build on? Every
> gap is **advisory** — it becomes a `decision-log.md` item with an owner and a clock, not a blocker.
> PII presence is a **risk-tier driver** (it can only raise a tier). Owned by Data.

## Readiness identity

**Feature / spec:** [FE-NN · spec name]
**Channel:** `<channel>`  <!-- or `—` for channel-agnostic shared logic -->
**Owner:** [Data — name]
**Sources assessed:** [systems of record checked]

---

## Availability & quality

| Data source | Available? | Quality / completeness | Notes |
|-------------|------------|------------------------|-------|
| [source] | [yes / partial / no] | [e.g. complete; ~X% missing field Y] | [how assessed — live query, sample] |
| [...] | [...] | [...] | [...] |

---

## Gaps

Each gap is advisory and routes to the decision-log — it never blocks the phase.

| Gap | Impact on the feature | Severity (advisory) | Decision-log ref |
|-----|------------------------|---------------------|------------------|
| [e.g. field missing for X% of records] | [what breaks / is ambiguous] | [low / med / high] | [DL-NN] |
| [...] | [...] | [...] | [...] |

---

## PII & risk-tier impact

- **PII present:** [which data, from `data-contract.md`, or `none`]
- **Risk-tier effect:** [which specs this pushes to HIGH, and why]

> Regulatory handling of that PII (retention, recording consent, etc.) is configured **at build time**
> via the existing per-engagement compliance mechanism — not here.

---

## Readiness verdict

[One paragraph: is the data ready to build on as-is, ready with the listed gaps tracked, or not ready
until a source is instrumented (which would become its own epic)? This verdict is **advisory** — it
informs the phase gate but does not block it.]
