# Lineage & Audit
<!-- Phase 2 — Design | Optional artifact -->

> Where each data element comes from and where it goes — **source → sink lineage** — plus **retention**
> and the audit trail. For PII-bearing flows, masking and retention are part of the design, not an
> afterthought. Owned by Data; pairs with `data-contract.md`.

## Lineage identity

**Feature / spec:** [FE-NN · spec name]
**Channel:** `<channel>`  <!-- or `—` for channel-agnostic shared logic -->
**Owner:** [Data — name]

---

## Lineage

The path each element travels, source to sink.

```
[source] → [transform / step] → [transform / step] → [sink]
```

| Data element | Source | Transform(s) | Sink(s) | PII? |
|--------------|--------|--------------|---------|------|
| [element] | [system of record] | [derive / mask / aggregate] | [store / surface / export] | [no / customer-linked / YES] |
| [...] | [...] | [...] | [...] | [...] |

---

## Retention & handling

| Data element | Retention period | At-rest handling | Deletion trigger |
|--------------|------------------|------------------|------------------|
| [element] | [e.g. 90 days / duration] | [mask / encrypt / plain] | [what removes it — TTL, request, event] |
| [...] | [...] | [...] | [...] |

---

## Audit trail

- **Recorded on access / change:** [who touched what, when — actor + UTC timestamp]
- **Approvals captured:** [any named human sign-off recorded on the record, or `none`]
- **Access controls:** [who may read PII-bearing sinks]

> Formal compliance controls (e.g. SOC 2 / HIPAA retention obligations) are configured **at build time**
> via the existing per-engagement compliance mechanism — this artifact documents the design, not the
> regulatory contract.
