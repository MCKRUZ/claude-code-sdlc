# Team Model — the five-discipline collaboration model

The plugin's machinery is strong for **Product** and **Engineering**; the multi-discipline channel
layer gives **Data**, **Design**, and **Bizreq** first-class seats too. This document is the
generalized, product-agnostic collaboration model: what each discipline owns, and — keyed by phase id —
who is Responsible / Accountable / Consulted / Informed as the work moves through the lifecycle.

It is a **Tier-3 reference**: loaded on demand, read by nothing at runtime except the commands that
choose to surface it. It has **zero coupling** — no script imports it, no gate depends on it. It
**degrades gracefully if absent**: `commands/sdlc.md` looks up the current phase's row to render a
"Team & RACI (this phase)" block, and simply skips that block when this file is missing. The model is
deliberately **product-agnostic** — the disciplines and cadences here fit any engagement; product
specifics live in the engagement's own docs, never in the model.

---

## The five disciplines

Each discipline has a mandate, an own command or two, and named checkpoints it signs (the IDD One Rule:
the agent drafts and interrogates; a **named human decides**).

### Product

Owns the **problem, the outcome, and the decomposition** — Outcome → Epic → **Feature** → Spec. Runs
`/sdlc-feature` (drives the `feature-architect` agent) to do channel-aware epic → feature → spec
decomposition, and `/sdlc-channel` to bind a spec to its channel. Owns the phase-spanning
**decision-log** (named owner + a 2-business-day clock per open decision). Confirms every risk tier a
discipline agent *proposes*. Signs the feature brief's **Feature** section at the Phase-1 gate.

### Data

Owns the **data contract, data readiness, lineage/PII classification**, and the eval **golden data**.
Runs `/sdlc-data` (drives the `data-analyst` agent) to author `data-contract.md` (PII-classified),
`data-readiness.md`, and `lineage-audit.md`. PII on a data-bearing spec is a **risk-tier driver**. In
`/sdlc-evals`, **Data owns the data** in the golden set (Bizreq owns the scenarios). Signs the
data-contract section at the Phase-1/2 gate.

### Design

Owns the **experience across channels** — journeys, surface layouts, and the channel interaction
contract. Runs `/sdlc-experience`, which routes by channel to the `visual-designer` (web) or the
`conversation-designer` (voice / chat) agent, producing `user-journey.md`, `surface-layout.md`
(channel-adaptive: screens for visual, turn-script for voice, message-flow for chat), and
`channel-interaction-spec.md` (the descriptor-dimension → contract → acceptance-check mapping). Persona
is first-class here — the experience layer is (channel × persona)-aware. Signs the interaction-specs at
the Phase-2 gate.

### Engineering

Owns **architecture and ADRs, the shared "brains," the build, and the harness rails** — the
code-artifact core. Runs the unchanged `/sdlc-spec` (the Build-loop Intent beat) and drives the Build
loop (Intent → Delegate → Discern). Architecture in Phase 2 fixes how thin **surfaces** connect to the
shared **brains** so a new channel reuses a brain instead of re-implementing it. Signs ADRs at the
Phase-2 gate and the non-author checks (security pass, named sign-off) in the Build loop.

### Bizreq

Owns the **business rules and the outcome intent** — `business-rules.md` (BR-NN decision table) and
`golden-scenarios.md` (SCEN-NN). Runs `/sdlc-intake` (corpus cataloguing) in Discovery and `/sdlc-rules`
(drives the `bizreq-analyst` agent) in Requirements. Each BR-NN maps to an acceptance check (advisory /
soft traceability); each SCEN-NN feeds the golden set. In `/sdlc-evals`, **Bizreq owns the scenarios**.
Accepts business-intent at the Build-loop merge (captured in state). Signs the Outcome section at the
Phase-1 gate.

All five are also **review lenses**: `/sdlc-review` gains Design / Data / Bizreq viewpoints inside the
`multi-reviewer` council (4 → 7 viewpoints), advisory and never-blocking.

---

## Per-phase RACI

One row per phase id, so a command can look up the current phase directly. Cells use standard RACI:

- **R — Responsible:** does the work in this phase.
- **A — Accountable:** owns the phase outcome and signs it off (one owner unless a split is noted).
- **C — Consulted:** two-way input before the work lands.
- **I — Informed:** kept in the loop; no action required.

| Phase id | Phase | Product | Data | Design | Engineering | Bizreq |
|----------|-------|:--:|:--:|:--:|:--:|:--:|
| `0` | Discovery | A | R | C | C | R |
| `1` | Requirements | A | R | C | C | R |
| `2` | Design | C | R | A¹ | A¹ | C |
| `3` | Foundation | C | C | C | A | I |
| `build` | Build Loop | A | C | C | R | C |
| `7` | Documentation | A | C | C | R | C |
| `8` | Deployment | A | C | I | R | C |
| `9` | Monitoring | A | R | I | R | C |
| `close` | Close & Transfer | A | C | C | R | C |

¹ **Phase 2 has a co-accountability split by area:** Engineering is accountable for architecture / ADRs;
Design is accountable for interaction / experience. Data is Responsible for the data contract; Product
and Bizreq are Consulted. This is the one phase where accountability is intentionally shared, because the
architecture and the interaction contract are authored in parallel and signed separately.

**Reading the table.** `commands/sdlc.md` resolves the current phase id from `.sdlc/state.yaml`, looks
up the matching row, and renders a "Team & RACI (this phase)" block naming who is active and in what
role. If this file is absent, that block is skipped and `/sdlc` renders exactly as before.

---

## Cadences and sign-off

- **Discipline sign-off is captured in state.** Each discipline signs its section at the phase gate;
  `/sdlc-next` records this as optional additive fields on the existing sign-off record in
  `state.yaml`, and the gate/phase report renders them automatically. This is the named-human checkpoint
  each discipline now has — captured, not ceremonial.
- **The decision-log carries the clock.** Cross-cutting product decisions live in a phase-spanning
  `decision-log.md` with a named owner and a 2-business-day clock; `/sdlc-status` surfaces open and
  overdue items. Silent decisions *inside a single spec* stay in that spec's Decision List — the two
  records don't overlap (phase-scoped vs spec-scoped).
- **Nothing here blocks.** Unfilled discipline sections are advisory flags; formal acceptance happens at
  the phase gate via the sign-off captured in state. The model organizes collaboration; it never gates
  code — the code-artifact core owns that.
