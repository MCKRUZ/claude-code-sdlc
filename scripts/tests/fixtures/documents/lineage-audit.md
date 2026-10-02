# Lineage & Audit
<!-- Phase 2 — Design | Optional artifact -->

> Where each data element comes from and where it goes — **source → sink lineage** — plus **retention**
> and the audit trail. For PII-bearing flows, masking and retention are part of the design, not an
> afterthought. Owned by Data; pairs with `data-contract.md`.

## Lineage identity

**Feature / spec:** FE-03 · Claim status lookup
**Channel:** `ag-ui`
**Owner:** Dana Whitfield, Data

---

## Lineage

The path each element travels, source to sink.

```
Acme Claims Core → mask surname → portal cache → claim list screen
```

| Data element | Source | Transform(s) | Sink(s) | PII? |
|--------------|--------|--------------|---------|------|
| claimant_name | Acme Claims Core | mask to first initial and surname | Portal cache, claim list screen | YES |
| policy_number | Policy Admin System | truncate to last four digits | Portal cache, status detail screen | customer-linked |
| claim_status | Acme Claims Core | none | Portal cache, claim list screen, notification service | no |

---

## Retention & handling

| Data element | Retention period | At-rest handling | Deletion trigger |
|--------------|------------------|------------------|------------------|
| claimant_name | 24 hours in the portal cache | encrypt | TTL expiry, or claimant deletion request |
| policy_number | 24 hours in the portal cache | encrypt | TTL expiry, or claimant deletion request |
| claim_status | 90 days in the portal cache | plain | TTL expiry |

---

## Audit trail

- **Recorded on access / change:** Claimant identity, claim id viewed, and UTC timestamp on every status detail view
- **Approvals captured:** none
- **Access controls:** Only the claims support role may read the audit log; the portal cache is readable by the portal service account alone

> Formal compliance controls (e.g. SOC 2 / HIPAA retention obligations) are configured **at build time**
> via the existing per-engagement compliance mechanism — this artifact documents the design, not the
> regulatory contract.
