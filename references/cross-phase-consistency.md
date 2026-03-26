# Cross-Phase Consistency Reference

Certain values established in early phases are **locked metrics** — they must remain consistent across subsequent phases unless explicitly overridden with a documented decision.

## Locked Metrics

| Metric | Established In | Locked From | Found In |
|--------|---------------|-------------|----------|
| Budget | Phase 0 (Discovery) | Phase 1+ | constitution.md, frozen layer |
| Timeline | Phase 0–1 | Phase 2+ | success-criteria.md, frozen layer |
| Scope boundaries | Phase 1 (Requirements) | Phase 2+ | requirements.md, frozen layer |
| Stakeholder roster | Phase 0 (Discovery) | Phase 1+ | constitution.md, frozen layer |
| Quality thresholds | Phase 1–2 | Phase 3+ | non-functional-requirements.md, frozen layer |
| Compliance requirements | Profile | Always | profile.yaml (immutable) |

## How Locking Works

1. When a frozen layer is generated, the **Locked Metrics** section captures explicit values (e.g., "Budget: $50,000", "Timeline: 2026-04-01 to 2026-07-01").
2. The G5-consistency gate reads all prior frozen layers and extracts these values.
3. During gate checks, Claude compares the locked values against current phase artifacts.
4. If a value has changed without a decision log entry, the gate flags a **SHOULD-severity warning**.

## Change Protocol

When a locked metric legitimately needs to change:

1. **Create a decision log entry** in `.sdlc/artifacts/{NN}-{phase-name}/decision-log.md`:

```markdown
## Decision: {Metric} Change

- **Metric:** Budget
- **Previous value:** $50,000
- **New value:** $75,000
- **Reason:** Scope expansion to include mobile app, approved by CTO
- **Approved by:** Jane Smith (CTO)
- **Phase:** 3
- **Date:** 2026-04-15
```

2. **Update the current phase's artifacts** to reflect the new value.
3. **Re-run gate checks** — the G5-consistency gate will verify the decision log entry exists and mark the change as justified.

## Gate Behavior

The G5-consistency gate is **SHOULD severity**, meaning:
- It produces warnings, not blockers
- Phase transitions are NOT prevented by consistency warnings
- The warnings surface drift for human review
- Claude should highlight the warning and ask whether the change was intentional

This design is deliberate — legitimate scope changes happen throughout a project. The gate catches *accidental* drift, not all change.

## Detection Method

The gate checker (`scripts/check_gates.py`) implements G5-consistency as follows:

1. Read all frozen layers in `.sdlc/context/layers/` for phases prior to the current one
2. Check for "Locked Metrics" or "Constraints Carried Forward" sections
3. If found, flag for manual review — Claude should compare values against current artifacts
4. Check whether a `decision-log.md` exists in the current phase artifacts
5. Report findings as SHOULD-severity results

The check is heuristic — it flags the *presence* of locked metrics for review rather than attempting automated value comparison. This avoids false positives from format differences while ensuring consistency is always considered at phase transitions.

## When No Locked Metrics Exist

If no prior frozen layers contain a "Locked Metrics" section (e.g., Phase 0 hasn't generated one yet, or the project is in Phase 0), the G5-consistency gate produces no results and silently passes.
