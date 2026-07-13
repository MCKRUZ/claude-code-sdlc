# Data Contract
<!-- Phase 2 — Design | Optional artifact -->

> The fields this feature/spec reads or writes — each with its type, source, and **PII
> classification**. A PII field is a **risk-tier driver**: PII can only *raise* a spec's tier, never
> lower it (see `risk_floor` / `risk_model.py`). The contract sharpens the spec's Scope; it does not
> gate. Owned by Data.

## Contract identity

**Feature / spec:** [FE-NN · spec name]
**Channel:** `<channel>`  <!-- or `—` for channel-agnostic shared logic -->
**Owner:** [Data — name]

---

## Fields

`PII?` is one of: `no` · `customer-linked` (indirectly identifying) · `YES` (directly identifying).
Note masking/handling in the `Note` column for anything not `no`.

| Field | Type | Source | PII? | Note |
|-------|------|--------|------|------|
| [field name] | [id / string / date / enum / text / number] | [system of record] | [no / customer-linked / YES] | [handling, e.g. masked downstream; key for X] |
| [...] | [...] | [...] | [...] | [...] |
| [...] | [...] | [...] | [...] | [...] |

---

## PII summary

- **PII fields:** [list the `YES` / `customer-linked` fields, or `none`]
- **Classification basis:** [how each was classified]
- **Handling:** [masking / redaction / encryption expectations downstream]
- **Risk-tier impact:** [does the PII raise this spec's tier? which specs?]

> Actual regulatory compliance (e.g. SOC 2 / HIPAA controls) is configured **at build time** via the
> existing per-engagement compliance mechanism — it is not set here.

---

## Consumers & writers

| Field | Read by | Written by |
|-------|---------|------------|
| [field name] | [component / surface] | [component / `—` if read-only] |
