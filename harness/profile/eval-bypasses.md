# Eval Gate — Bypass Log

This ledger documents legitimate, time-boxed bypasses of the CI **eval-gate** (the
hard gate in `workflows/ci.yml` that runs your agentic/eval fixture suite). The gate
**still runs** — this log is for audit purposes only. A bypass does **not** disable
the gate; it records why a known failure was accepted at a specific point in time, by
whom, and when that acceptance expires and must be reviewed.

If your project ships no eval-fixture suite (you deleted the `eval-gate` job), this
file is unused — keep it as a stub or delete it.

## Format

```
- case_id: <case id from the eval dataset>
  reason: <why this fixture is temporarily failing>
  expires: <ISO date after which this bypass must be reviewed>
  approved_by: <name or GitHub handle>
```

## Active Bypasses

*(none)*
