# Design Proposal: Context Repair Loop — self-improving gates from recurring findings

**Status:** Draft for review
**Author:** (via competitor analysis of `chaohong-ai/ai-auto-work`, 2026-07-06)
**Related:** delivery-standard alignment (Chunks 1–5, complete); competitor backlog

---

## 1. Problem

The harness enforces a **fixed** set of gates. When `/sdlc-review` surfaces the same class of
defect a third time across specs or rounds, nothing happens to the harness — the finding is an
anonymous markdown row, overwritten on the next run (`agents/multi-reviewer.md:69,82`), advisory
and non-blocking (`commands/sdlc-review.md:55`). The reviewer catches the defect *after* it's
built, every time, forever. There is **no code path** anywhere that promotes a repeated finding into
a permanent rule, and no persistence of findings across rounds at all (confirmed across the review,
gate, and repair paths — the closest existing thing, `scripts/audit_gates.py`, only *prints*
recommendations from `state.yaml` gate history and never writes back).

`ai-auto-work` solves exactly this with a **Context Repair Loop**: a recurring reviewer finding is
promoted into the project constitution as a *new mechanical gate*, so the same defect is blocked
*before* it reaches review next time. Their governance layer literally grew from their failures.

Two hazards to internalize from their implementation:

1. **The gem** — the loop turns each escaped defect into a permanent, cheaper pre-flight check. This
   is the single highest-leverage idea, and it fits our architecture (profiles + `check_gates.py` +
   metrics JSONL) directly.
2. **The scar tissue** — their `constitution.md` bloated to 578 lines of incident-specific rules,
   each welded to one past task (`FBX_WRAPPER_EXISTENCE_ONLY`, `STUB_ANIMATION_LIBRARY`…), because
   they never built a consolidation discipline. **Any version we ship must include garbage
   collection from day one**, or we inherit the same unreadable pile.

## 2. Goals / Non-goals

**Goals**
- Give findings a stable identity and a persisted disposition, so recurrence is *knowable*.
- Make reviews **blocking on the right condition** (open CRITICAL/HIGH debt), not purely advisory.
- Detect a recurring class of finding and **propose promoting it into a permanent gate**.
- Prefer a **generation-side mechanical check** (blocks before review) over an agent rubric line
  whenever the finding is mechanically checkable — this is `ai-auto-work`'s sharpest insight
  ("write-path enforcement failure": a rule living only reviewer-side is caught after-the-fact
  forever).
- Ship **consolidation/GC** in the same effort as promotion — never after.

**Non-goals**
- Auto-mutating profiles without a human. Profile mutation is currently write-never by any script;
  `smart-repair.md:57-61` sets "structure over content, human-approval-required." Promotion stays
  HITL, consistent with `/sdlc-spec` ("agent proposes the tier, a human confirms").
- Replacing the mechanical gates or the review modes. This is additive.
- Tracking activity metrics. The ledger records finding *dispositions*, not counts-as-productivity;
  it must not become a "defects per author" scoreboard (mirror `scorecard.py`'s `FORBIDDEN_TYPES`
  refusal at `scripts/scorecard.py:43`).

## 3. Current state this builds on (grounding)

| Concern | Where it lives today | Gap for this feature |
|---|---|---|
| Review findings | `agents/multi-reviewer.md` → markdown table in `.sdlc/artifacts/<slug>/review-report.md`, overwritten each run | No id, no persistence, no disposition, no recurrence |
| Severity scales | Review: `CRITICAL/HIGH/MEDIUM/LOW`; mechanical: `MUST/SHOULD/INFO` | Two disjoint scales — promotion must map between them |
| Mechanical gate loop | `scripts/check_gates.py` → 6 gates; blocks iff any `passed is False and severity=="MUST"` (`:621`); appends `.sdlc/metrics/gate-log.jsonl` (`:506`) | No gate is derived from past findings |
| Generation-side check pattern | `scripts/check_spec.py` (DoR) → `finding()` helper, `spec-log.jsonl`, standalone/`--state` dual mode | This is the *template* for a new learned mechanical check |
| Single-source-of-truth models | `scripts/phase_model.py`, `scripts/risk_model.py` | New `findings_model.py` should mirror these |
| Outcome ledger | `scripts/scorecard.py` → `loop-events.jsonl`, typed append-only events + computed rollup, refuses forbidden types | Same shape a findings ledger needs — but a *separate* `findings-log.jsonl` (harness-calibration data, not delivery outcomes) |
| Profile rule structures | `profile.quality.evaluation_criteria[]` (agent-checked via G6, `check_gates.py:424-440`); `profiles/{id}/compliance/{fw}-gates.yaml` `gates[]` (fully mechanical, dispatched by `check_type` at `:385`) | These are the two **promotion targets** |
| Aggregation half-built | `scripts/audit_gates.py` — "always-pass (candidates for removal)" + "high-fail >50%" detection, read-only | Natural anchor for recurrence detection + consolidation; but it reads `state.yaml` gate_results, which `check_gates.py` never writes (existing inconsistency) |
| Structural repair | `agents/gate-repair.md`, `references/smart-repair.md` — fixes artifacts to satisfy gates; **never** changes a gate | Explicitly not rule-learning; this feature is the missing half |

## 4. Design

Four layers. Each **Increment** below is independently shippable and additive; the end state is all four.

### Layer 0 — Finding identity + disposition ledger  *(Increment A)*

The foundation. Without persisted findings, recurrence is unknowable.

**`scripts/findings_model.py`** (single source of truth, mirrors `risk_model.py`):
- `SEVERITIES = ("CRITICAL","HIGH","MEDIUM","LOW")` and a `to_gate_severity()` map
  (`CRITICAL/HIGH → MUST`, `MEDIUM → SHOULD`, `LOW → INFO`) so review findings and mechanical gates
  share one blocking arithmetic.
- `DISPOSITIONS` and their gate-counting rules, ported from `ai-auto-work`'s state machine:
  - `FIXED` — verified fixed. Does **not** count. (Verification is real — see the post-write
    validator below; a bare "FIXED" claim is not evidence.)
  - `SPLIT(task_id, owner)` — deferred to a tracked unit. Counts unless **both** fields present.
  - `ACCEPTED_RISK(approver, date, reason, review_condition)` — counts unless **all four** present
    **and** `approver` is a human. `is_ai_actor(approver)` → reject; AI may not self-absolve.
  - `POSTPONED(until_round, reason)` — **still counts.** "Debt, not resolution."
  - `OPEN` — counts.
- `blocks(findings) -> bool`: True iff ≥ 2 counting findings at `HIGH` or `CRITICAL`. (Threshold
  configurable per profile; default 2, matching `ai-auto-work`'s `.constitution §8`.)
- `fingerprint(finding) -> str`: a **reviewer-assigned category slug** (kebab-case, like the
  `ReportFindings` tool's `category`) plus an optional normalized `target` (file path or spec id).
  We deliberately do **not** hash natural-language titles — see Risk R1. Category is assigned by the
  reviewer agent, low-cardinality, and stable.

**Reviewer emits structured findings.** Extend `agents/multi-reviewer.md` to append, after its
human-readable report, a machine-readable block and a counts footer (Layer-0 also delivers idea #5
from the analysis):

```markdown
## Gate Results
<!-- findings: critical=1 high=2 medium=3 low=0 | open=3 fixed=1 accepted_risk=0 postponed=0 -->
| id | category | severity | target | disposition | evidence |
|----|----------|----------|--------|-------------|----------|
| F1 | error-swallowed | HIGH | src/x.ts:42 | OPEN | — |
```

Position-enforced at the top of `review-report.md` (their hard-won lesson: reviewers buried the
block inside diff bodies to dodge parsing — `reviewer-brief.md §零-B`). A parser that can't find a
top-level `## Gate Results` block treats the review as **incomplete and blocking**, not "pass."

**`scripts/record_findings.py`** (dual-mode like `check_spec.py`): parses the `## Gate Results`
block, appends each finding to **`.sdlc/metrics/findings-log.jsonl`**:

```json
{"timestamp","phase","spec","id","category","severity","target","disposition","evidence","fingerprint"}
```

**Post-write / FIXED-claim validator** (analysis idea #4). We already store per-artifact checksums
(`state.yaml phases[].artifact_checksums`, `check_gates.py:156`). For any finding whose disposition
flipped to `FIXED`, require that its `target` artifact's checksum **changed** since the finding was
recorded. If a finding is marked `FIXED` but the target file is byte-identical → `FIXED_CLAIM_MISMATCH`:
force it back to `OPEN` for gate math. Cheap, and it kills the most common agent over-report.

**Wiring:** `/sdlc-review` calls `record_findings.py` after the agent writes the report. A new gate
in `check_gates.py` (or an extension of the Build gate) calls `findings_model.blocks(...)` on the
open ledger for the current phase/spec and emits a `MUST` failure when true. Reviews stop being
purely advisory *for the debt condition only* — everything else stays advisory.

*Increment A delivers value alone:* trackable, honest, appropriately-blocking reviews with an
anti-hallucination check — even if we never build promotion.

### Layer 1 — Recurrence detection  *(Increment B, read-only)*

**`scripts/track_findings.py`** (mirrors `track_specs.py`): reads `findings-log.jsonl`, groups by
`fingerprint`, computes for each: distinct-round occurrences, current open/closed split, and a
`[RECURRING]` flag when the same fingerprint appears **OPEN in ≥ N distinct review runs** (default
N=2, cross-round or cross-spec). Emits a promotion-candidate list.

**Extend `scripts/audit_gates.py`**: it already flags always-pass and high-fail gates. Add a
"Recurring findings (promotion candidates)" section fed by `track_findings`. Still **read-only** —
it recommends, a human decides. This is the minimal-surface place to surface the loop.

### Layer 2 — Promotion (the Context Repair)  *(Increment C, HITL)*

When a fingerprint recurs past threshold, **draft** a permanent gate. Two-pass, like
`generate_handoff_report.py`: the script does deterministic assembly, a human confirms.

**Target selection encodes the write-path principle.** For each candidate:
- **Mechanically checkable** (file-exists / content-regex / forbidden-pattern / metric-threshold) →
  draft an entry for a new **`profiles/{id}/learned-gates.yaml`**, shaped exactly like the compliance
  `gates[]` (`check_type: artifact_exists|artifact_content|manual|metric`, `severity`, `phase`).
  Loaded by a new `get_learned_gates()` in `check_gates.py` (sibling to `get_compliance_gates`; the
  existing loader keys off `profile.compliance.frameworks` at `:34`, so learned gates need their own
  small loader rather than a fake framework). **This is the preferred path** — it blocks the defect
  pre-review.
- **Needs judgment** → append to `profile.quality.evaluation_criteria[]` (already agent-checked via
  G6, already phase-scoped). Fallback only when no mechanical check exists.

**`/sdlc-repair`** (new command): shows the recurring finding, its evidence trail, the drafted YAML,
and the target file; on human `confirm`, appends the gate and writes a provenance entry to
**`.sdlc/context/context-repair-log.md`** (origin finding id, dates, specs, chosen target). The agent
**proposes**, the human **confirms** — never auto-applies. Every learned gate carries `origin`,
`promoted_at`, and either `review_after` or a running `hit_count` in its YAML — provenance is
mandatory, because it's what makes GC possible.

### Layer 3 — Consolidation / GC  *(Increment D — ships with C, not after)*

The anti-bloat discipline. This is non-negotiable given `ai-auto-work`'s 578-line outcome.

**Extend `audit_gates.py`** to flag, among learned gates:
- **Dead** — promoted but never fired since (`hit_count == 0` past `review_after`) → retire.
- **Redundant** — fires identically to a sibling learned/compliance gate → merge.
- **Over-specific** — a heuristic: the gate names a single concrete file path or a spec id in its
  `artifact`/`required_content` → candidate for *generalization* before it calcifies.

**`/sdlc-repair --consolidate`** (and a step in Phase C / Close): reviews learned gates, generalizes
the specific, retires the dead, dedupes — HITL. A **soft cap**: `check_gates.py` emits an INFO
warning when `learned-gates.yaml` exceeds M entries (default 20) without a consolidation pass logged
in the last K days. Bloat becomes visible and actionable instead of silent.

## 5. Rollout

Each increment is a self-justifying, tested, additive PR.

| Inc | Ships | Value even if we stop here |
|-----|-------|----------------------------|
| **A** | `findings_model.py`, structured reviewer output + counts footer, `record_findings.py`, `findings-log.jsonl`, FIXED-claim validator, debt-blocking gate | Reviews become trackable, honest, and block on real debt |
| **B** | `track_findings.py`, `audit_gates.py` recurrence section | Systemic gaps become visible |
| **C** | `learned-gates.yaml` + `get_learned_gates()`, `/sdlc-repair`, `context-repair-log.md`, mechanical-first promotion | The self-improving loop |
| **D** | GC/consolidation in `audit_gates.py`, `--consolidate`, soft cap | Loop stays maintainable forever |

**C and D land together.** Never merge promotion without its garbage collector, even in stub form.

## 6. Risks & open questions

- **R1 — Recurrence matching is inherently fuzzy.** NL-hashing titles would over/under-match. Mitigation:
  reviewer-assigned low-cardinality `category` slugs + optional file target; accept **false negatives
  over false positives** (better to miss a recurrence than promote a bogus permanent gate). Open: do
  we seed a fixed category enum (like OWASP/defect taxonomies) or let it grow? Recommend a seeded enum
  in `findings_model.py` with an "other" escape hatch, GC'd like everything else.
- **R2 — Two severity scales.** Resolved by `to_gate_severity()` (§Layer 0). Documented mapping, one
  blocking arithmetic.
- **R3 — Profile mutation crosses the write-never line.** Deliberately HITL + provenance + never-auto.
  Consistent with existing "propose, human confirms." Worth an explicit callout in `smart-repair.md`
  that learned-gate promotion is the *one* sanctioned profile-write path, and only via `/sdlc-repair`.
- **R4 — `state.yaml gate_results` is written by nobody in the mechanical path** yet `audit_gates.py`
  reads it (`:28`, `:64`). This feature routes around it (findings-log.jsonl is the ledger), but we
  should decide whether to (a) start writing `gate_results` from `check_gates.py`, or (b) formally
  retire that field. Flagging as adjacent cleanup, not blocking.
- **R5 — Standard alignment.** The delivery-standard harvest (2026-06-24) found the written playbook
  held up under mechanization. "Self-improving gates" **extends beyond** the current standard. If
  adopted, this should be harvested back into the sibling `delivery-standard` repo as a new practice,
  not silently diverge.
- **R6 — YAGNI check.** Is a per-finding disposition ledger overkill? No: it's the minimum substrate
  for recurrence, and Increment A justifies itself independently (blocking + honesty + anti-halluc).
  But we should *not* build B–D speculatively — gate each increment on the prior one actually
  surfacing recurring findings in real use.

## 7. Test plan

Mirror the existing pytest suite (`uv run --project scripts --extra test python -m pytest scripts/tests/ -q`, currently 179 green):
- `test_findings_model.py` — disposition counting, human-only ACCEPTED_RISK, AI-actor rejection, `blocks()` threshold, severity mapping.
- `test_record_findings.py` — parse structured block; reject missing/buried `## Gate Results`; FIXED-claim validator flips unchanged-target FIXED → OPEN.
- `test_track_findings.py` — recurrence threshold, cross-spec grouping, promotion-candidate output.
- `test_learned_gates.py` — `get_learned_gates()` loads + dispatches by `check_type`; blocking parity with compliance gates.
- `test_audit_gates.py` (extend) — dead/redundant/over-specific detection; soft-cap warning.
- Standalone-mode tests for every new script (no `.sdlc/` present → provisional output, no metrics), per the project's Standalone-or-Workflow rule.

## 8. Recommendation

Build **Increment A now** — it's valuable standalone (blocking, honest, anti-hallucination reviews)
and it's the substrate everything else needs. Then gate B–D on A actually surfacing recurring
findings in real engagements. When you build **C, ship D with it.** Prefer mechanical
(generation-side) promotion targets over agent rubric lines every time a finding is mechanically
checkable — that's the whole point of the pattern, and the reason `ai-auto-work`'s loop works
despite its bloat problem.
