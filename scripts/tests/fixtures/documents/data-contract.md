# Data Contract
<!-- Phase 2 — Design | Optional artifact -->

> The fields this feature/spec reads or writes — each with its type, source, and **PII
> classification**. A PII field is a **risk-tier driver**: PII can only *raise* a spec's tier, never
> lower it (see `risk_floor` / `risk_model.py`). The contract sharpens the spec's Scope; it does not
> gate. Owned by Data.

## Contract identity

**Feature / spec:** FE-03 · Claim status lookup
**Channel:** `ag-ui`
**Owner:** Dana Whitfield, Data

---

## Fields

`PII?` is one of: `no` · `customer-linked` (indirectly identifying) · `YES` (directly identifying).
Note masking/handling in the `Note` column for anything not `no`.

| Field | Type | Source | PII? | Note |
|-------|------|--------|------|------|
| claim_id | id | Acme Claims Core | no | Public reference shown to the claimant; key for status lookups |
| claimant_name | string | Acme Claims Core | YES | Masked to first initial and surname in the portal list view |
| policy_number | string | Policy Admin System | customer-linked | Last four digits only on screen; full value never logged |
| date_of_loss | date | Acme Claims Core | no | Displayed as entered by the adjuster |
| claim_status | enum | Acme Claims Core | no | One of open, under review, approved, denied, closed |

---

## PII summary

- **PII fields:** `claimant_name` (YES), `policy_number` (customer-linked)
- **Classification basis:** Name directly identifies a person; policy number identifies a person only when joined to the policy system
- **Handling:** Mask both in the view, redact from application logs, encrypt at rest in the portal cache
- **Risk-tier impact:** Yes. Both fields push the claim status lookup spec (and the claimant profile spec) to HIGH

> Actual regulatory compliance (e.g. SOC 2 / HIPAA controls) is configured **at build time** via the
> existing per-engagement compliance mechanism — it is not set here.

---

## Consumers & writers

| Field | Read by | Written by |
|-------|---------|------------|
| claim_id | Claim list screen, status detail screen | — |
| claimant_name | Claim list screen | — |
| policy_number | Status detail screen | — |
| claim_status | Claim list screen, notification service | Adjuster workbench |
