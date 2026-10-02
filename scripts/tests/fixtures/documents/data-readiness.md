# Data Readiness
<!-- Phase 2 — Design | Optional artifact -->

> Is the data this feature needs actually **available, clean, and complete** enough to build on? Every
> gap is **advisory** — it becomes a `decision-log.md` item with an owner and a clock, not a blocker.
> PII presence is a **risk-tier driver** (it can only raise a tier). Owned by Data.

## Readiness identity

**Feature / spec:** FE-03 · Claim status lookup
**Channel:** `ag-ui`
**Owner:** Dana Whitfield, Data
**Sources assessed:** Acme Claims Core (claims table), Policy Admin System, notification event log

---

## Availability & quality

| Data source | Available? | Quality / completeness | Notes |
|-------------|------------|------------------------|-------|
| Acme Claims Core | yes | Complete; about 2% of claims missing date_of_loss | Live read-only query against the reporting replica, 500-row sample |
| Policy Admin System | partial | Complete for active policies; lapsed policies purged after 24 months | Checked with a data steward and a sample of 200 policy numbers |
| Notification event log | no | Not yet captured for portal-originated updates | Confirmed with the platform team; no table exists today |

---

## Gaps

Each gap is advisory and routes to the decision-log — it never blocks the phase.

| Gap | Impact on the feature | Severity (advisory) | Decision-log ref |
|-----|------------------------|---------------------|------------------|
| date_of_loss missing for about 2% of claims | Status detail screen shows an empty date; unclear whether to hide the row | low | DL-07 |
| Lapsed policies purged after 24 months | Older claims cannot show a masked policy number | med | DL-08 |
| No notification event log for portal updates | Cannot show "last notified" on the status screen | high | DL-09 |

---

## PII & risk-tier impact

- **PII present:** Claimant name and policy number, as classified in `data-contract.md`
- **Risk-tier effect:** The claim status lookup and claimant profile specs move to HIGH because both display masked PII

> Regulatory handling of that PII (retention, recording consent, etc.) is configured **at build time**
> via the existing per-engagement compliance mechanism — not here.

---

## Readiness verdict

Ready to build with the listed gaps tracked. The claims and policy data are available and clean enough for the status lookup as designed. The missing notification event log (DL-09) would need to be instrumented before the "last notified" element can ship, so that element is deferred and would become its own epic.
