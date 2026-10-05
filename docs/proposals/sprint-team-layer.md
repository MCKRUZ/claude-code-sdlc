# Proposal: Sprint Team Layer — `/sdlc-sprint` and `/sdlc-refine`

**Status:** Reconciled to what shipped in 1.6.0 (2026-09-30) — the tables below describe the implemented behaviour; where the first draft differed, the code was kept and the text corrected (or the reverse, noted inline)
**Author:** drafted 2026-09-24 against v1.5.1 (`master` of the nested `claude-code-sdlc/` clone)
**Related:** `sprint-team-layer-extended-draft.md` (the full analysis this is cut from), `references/team-model.md`, the channel and artifact-audit layers
**Build target:** the nested `claude-code-sdlc/` repo; the outer `.sdlc/` (solo `plugin-self` engagement, two `ready` specs) is the first fixture. ADO is handled manually by the team — nothing here touches a board.

---

## 0. In three lines

1. **`/sdlc-sprint`** slates a set number of specs into a two-week sprint by a **mix of work** (risk tiers), then **readies** the sprint once every slated spec clears the Definition of Ready and its Engineering and Data checks.
2. **`/sdlc-refine`** refines **that sprint's specs**: runs the DoR on each, surfaces vague lines and silent decisions, records the Eng/Data verdicts, and routes any upstream-artifact fix through the existing phase-scoped path so the engagement never "goes backwards".
3. **Nothing locks.** The phase spine, the seven gates, and the protected core are untouched; the sprint layer is additive and advisory, works in any phase where specs exist, and never blocks a gate or is blocked by one.

## 1. The simple ask

| Command | Does | Never does |
|---|---|---|
| `/sdlc-sprint` | Creates a sprint record; proposes a slate of N specs from the backlog matching the mix; a human confirms; shows the slate's readiness; marks the sprint **ready**; closes it with kept / carried / dropped (each with a reason) | Reorder the backlog, gate anything, advance a phase, compute velocity, touch ADO |
| `/sdlc-refine` | For the sprint's slate (or one spec): DoR check, vague-line lint, silent decisions to the decision-log, risk tier confirmed by a human, Engineering and Data verdicts recorded, `status: ready` flipped when READY | Approve anything itself, assign a tier, answer a decision, edit `check_spec.py` |

## 2. What "doesn't lock the gates" means — kept in full

| Behaviour | How the layer guarantees it | Reuses |
|---|---|---|
| Refinement runs in **any phase** where specs exist (Foundation onward, and mid-Build for the *next* sprint) | Neither command reads `current_phase` to decide whether it may run; standalone `--repo` mode needs no `.sdlc/` at all | `new_spec.py`, `check_spec.py` are already phase-agnostic |
| A spec whose gap is in a **Phase 1 or 2 artifact** is fixed **without regressing the phase** — and changing those artifacts during refinement is the normal case | `/sdlc-refine --upstream <spec>` edits the artifact in place (human-confirmed diff), records it with `audit_artifacts.py record --event revised`, re-gates that phase with `check_gates.py --phase N` as information, regenerates that phase's layer (recorded `refreshed`), and the spec re-enters refinement. A `DL-NN` only for a product decision or a Phase 0 change. `current_phase` never moves | `audit_artifacts.py record`, `check_gates.py --phase`, `validate_frozen_layer.py`, the layer template |
| **Layers are living, not frozen** | A phase layer is a summary of its sources; when a source changes it is regenerated, the previous version kept as `.superseded-<date>`, the regeneration recorded. Sign-offs in `state.yaml` are never rewritten; the changed artifact shows as modified in `check_gates.py --phase N` and in the ledger with who and why | `references/frozen-layers.md` ("Living, not frozen"), `/sdlc-next` step 5, the artifact ledger's `frozen-layer-source` lineage edges |
| A sprint is **never a gate** and is **never gated** | `sprint.py` exits 0 on every read; `ready` and `close` check only the slate (DoR + verdicts), never G1–G7; nothing is written to `state.yaml` | the advisory-layer pattern (`check_channel`, `track_decisions`, `audit_artifacts`) |
| Leaving Build stays a **human declaration** | `close` never suggests advancing; `/sdlc-next` gains one advisory line ("slate S07: 5 of 6 merged, 1 carried") | `advance_phase.py` untouched |
| The session reminder stops being **wrong for refinement** | Build's `[SDLC-PHASE]` line gains one clause: "Refinement for the next sprint runs alongside — `/sdlc-refine`"; `[SDLC-SPRINT]` shows the active sprint | both hook twins, same output contract |

## 3. Top five extra recommendations — do these with the simple ask

Each is small, reuses existing machinery, and is the part of sprint teaming that most often fails silently.

| # | Recommendation | Why it matters for a sprint team | What it adds | Cost |
|---|---|---|---|---|
| **R1** | **Assign-and-notify handoffs with acknowledgement** | The operating model's rule "never rely on the next owner noticing". Without it, a spec sits between Product, Engineering and Data and nobody owns the wait | `next_owner:` on the spec; `sprint.py handoff --spec --to <name>` and `ack`; `status` lists unacknowledged handoffs with business-day age | one key, two verbs, one ledger line |
| **R2** | **Independent Engineering and Data verdicts are part of "ready"** | The model's Control 2: Eng validates feasibility and the harness context; Data validates data impact **in parallel**, before anyone builds. "Ready up a sprint" means this, not just DoR | `eng_review:` / `data_review:` (`pending \| accepted \| returned \| n-a`) recorded via `/sdlc-refine validate --lane eng\|data --by <name>`; `sprint.py ready` requires both (Data may be `n-a` only with a reason) | two keys, one verb |
| **R3** | **A self-rendering refinement agenda with the decision clock** | The Mon/Wed/Fri review needs an agenda, not a status deck: which slated specs are NOT READY and why, which verdicts are pending and for how long, which `DL-NN` decisions are overdue | `/sdlc-refine` with no arguments renders it from `sprint.py status --json` + `track_decisions.py --json` | read-only composition |
| **R4** | **Commitment-shaped close, forbidden metrics enforced, contradictions fixed** | Sprints invite velocity back in through the side door. The standard bans it and `scorecard.py` refuses it; the sprint layer must too | `close` records kept / carried (with reason) / dropped (with reason) for **this sprint only**; `FORBIDDEN_FIELDS` imports `scorecard.FORBIDDEN_TYPES` + `points, estimate, effort, hours, capacity`; fix `project-retrospective.md`'s "Sprint velocity" row and `docs/integrations.md`'s "there is no sprint plan" now | a few lines + two doc edits |
| **R5** | **Sprint visible at session start; retire the stale section-plan block** | Everyone should open a session knowing the sprint and its end date; today the Build hook still prints the retired `session-handoff.json` section summary, which would sit next to the new line as a competing progress model | one grep-only `[SDLC-SPRINT]` line in both hook twins; the section-handoff block removed; the first session-start hook test | small, both shells |

One safety note (not a recommendation to build, just to know): the Azure DevOps harness pack merges an MCP server with work-item create tools into client repos. Since the team updates ADO by hand, the target repo's `.claude/settings.local.json` should deny `mcp__azure-devops__wit_*` create/update tools and `Bash(az boards:*)`. That fix belongs in the kit, not here.

## 4. Data model

**Sprint record — `.sdlc/sprints/SNN.md`** (template `templates/phases/build/sprint.md`; id human-typed at `new --sprint S07`)

| Field | Values | Note |
|---|---|---|
| `sprint` | `"S07"` | typed, so the three repos can share one convention |
| `goal` | one outcome-shaped sentence | |
| `start`, `end` | ISO dates; `end` defaults to the last business day of a 10-business-day window — `start` is day 1, so Mon 2026-09-28 → Fri 2026-10-09 | `track_decisions.add_business_days(start, days - 1)`; `status` counts the window inclusively |
| `state` | `planning \| ready \| closed` | human-triggered, forward only |
| `target` | integer — how many specs to slate | the planning input; a count of items, never a size |
| `mix` | flat string, e.g. `"HIGH:1,MEDIUM:2,LOW:3"` | by risk tier (the axis that drives checking depth); counts sum ≤ `target`; a breach warns, never blocks |
| `board_ref` | free text, e.g. `"ADO Iteration 6"` | manual board mapping only; shown in the planning-page header; nothing reads it |
| `readied_by`, `closed_by` | named humans | |
| `created` | ISO date | stamped by `new` |
| `## Goal` | prose | |
| `## Slate` | **written** by `sprint.py slate` / `unslate` / `ready` / `close` from spec frontmatter — never hand-maintained; `status` is read-only and prints the live view | `\| spec \| name \| risk \| type \| status \| DoR \| eng \| data \| next owner \|` |
| `## Close` | `\| spec \| outcome (kept \| carried → SNN \| dropped) \| by \| reason \|` | written at `close`, confirmed by a human |

**Spec frontmatter — five optional keys**, inserted by `sprint.py` after `status:` on first write (values `""`, enumerations and spec ids only, so `check_spec.parse_frontmatter`'s `#`-truncation and `PLACEHOLDER_RE` never bite; `harness/spec-template.md` is generated and stays untouched)

| Key | Values | Written by | Read by |
|---|---|---|---|
| `sprint` | `""` or `SNN` | `slate`, `unslate`, `close --carry-to` | `track_specs` (`by_sprint`, `--sprint`), `sprint.py`, `/sdlc-refine` |
| `next_owner` | a name | `handoff`; cleared by `ack` | `status`, agenda |
| `eng_review` | `pending \| accepted \| returned \| n-a` | `/sdlc-refine validate --lane eng` | `ready` rule |
| `data_review` | `pending \| accepted \| returned \| n-a` | `/sdlc-refine validate --lane data` (`n-a` needs `--reason`) | `ready` rule |
| `depends_on` | `""` or comma-separated spec ids, e.g. `"0007,0009"` | `/sdlc-refine` proposes from Scope/Delegation overlaps, a human confirms; `slate` may add when pulling a dependency in | `status` build order and next-up, `slate` warning, `ready` gap (cycle or unmerged dependency outside the slate) |

`status` stays the protected four-value field and is still moved by hand as today. The only new writer is `sprint.py`, which only ever touches its own five keys and only in files matching `^\d{4}-` (so the installed `specs/spec-template.md` is never listed or written).

**Ledger — `.sdlc/metrics/sprint-log.jsonl`** (append-only; one line per event; `ts` full ISO)

| `event` | Fields |
|---|---|
| `sprint_new` | `sprint, by` |
| `slated` / `unslated` | `sprint, spec, by, reason?` |
| `handoff` / `ack` | `spec, to?, by` |
| `verdict` | `spec, lane: eng\|data, verdict, by, reason?` |
| `ready` / `closed` | `sprint, by` |
| `carried` / `dropped` | `sprint, spec, to_sprint?, by, reason` |

**Sprint-planning page — `.sdlc/reports/sprint-S07-planning.html`** (written by `ready`, re-rendered on demand by `plan`; linked from `.sdlc/reports/index.html`; self-contained HTML in the style of the phase reports, same renderer helpers as `generate_phase_report.py`). This is the artifact the team runs the sprint-planning meeting from.

| Section | Content | Source |
|---|---|---|
| Header | sprint id, goal, start → end, `board_ref` (e.g. "ADO Iteration 6"), readied by / when | sprint record |
| Commitment | the slate: spec, name, risk, type, channel, DoR, eng, data, next owner | spec frontmatter + `check_spec` |
| Mix and capacity | mix actual vs target; WIP cap from `cadence-plan.md`; review-turnaround target or "no target set" | sprint record, cadence plan |
| Build order and next up | the ordered list with dependency arrows; the recommended first spec and why | `sprint_model.build_order` |
| Dependencies | per spec: depends on / unblocks; anything outside the slate flagged | `depends_on` |
| Spec cards | one per slated spec: Goal, Why, acceptance-check count, tier and "why this tier", harness context, Decision List items, source ids and whether they resolve | spec bodies (`extract_section`) |
| Open decisions | `DL-NN` items open or overdue that touch slated specs | `track_decisions` |
| Carried in | specs carried from the previous sprint with the recorded reason | previous sprint's `## Close` / ledger |
| Footer | "Never tracked: velocity, story points, PR count, lines of code." | the standard's guardrail |

The same renderer produces `sprint-S07-review.html` at `close` (kept / carried / dropped with reasons, carry-over recurrence per spec) — decision D8. `close` builds the view **before** it rewrites carried specs to the next sprint and clears dropped ones, then hands that view (stamped `state: closed`) to the renderer, so the review page shows the slate it is reviewing; `status` on a closed sprint replays the same slate from the ledger (`slated` − `unslated` + `carried` / `dropped`).

## 5. Commands

**When `/sdlc-sprint` runs** — it is not one moment; different verbs belong to different points in the two-week rhythm.

| Moment | Verbs | Who | Companion |
|---|---|---|---|
| **Setting up the next sprint** — during the current sprint's last week, at the Mon/Wed/Fri review | `new`, `slate`, `unslate` | Product proposes and confirms the slate | `/sdlc-refine --sprint` drives the slated specs to READY and records Eng/Data verdicts |
| **Sprint planning meeting** — day 0 | `ready` → writes the **sprint-planning page**; `plan` re-renders it on demand before or after | a named human readies it; the team walks the page | the page is the meeting's agenda and record |
| **Every day** — the flow check | `status` (default) | anyone | `/sdlc-refine` (no args) for the refinement agenda |
| **Whenever work changes hands** | `handoff`, `ack` | the recorder and the recipient | — |
| **Last day** — sprint review and Retro+ | `close` → writes the **sprint-review page** | a named human confirms carried / dropped with reasons | `/sdlc-retro` for the cross-sprint patterns |

**`/sdlc-sprint`** (the command owns the script; users never call `sprint.py` directly)

| Verb | Does | HITL |
|---|---|---|
| `new --sprint S07 --goal "…" --start YYYY-MM-DD [--end YYYY-MM-DD \| --days 10] --target 6 [--mix HIGH:1,MEDIUM:2,LOW:3] [--board-ref "ADO Iteration 6"] --by <name>` | Creates the record in `planning`; `--by` is required, like every write | goal, dates, target and mix confirmed |
| `slate [--sprint S07] [--json]` | **Proposal (read, exit 0 always — an unknown or malformed id prints "no data")**: candidates from specs with `status: ready \| draft` and no sprint, in backlog order (spec id), filling the mix; writes nothing | the human confirms or edits the set |
| `slate --sprint S07 --by <name> --spec N [--spec N …] [--override --reason "…"]` | **Confirm (write)**: writes `sprint:` on each named spec. Over `target` → exit 1 unless `--override --reason` (recorded); mix breach → warning; a slated spec whose `depends_on` names a spec that is neither merged nor in this slate → warning with an offer to pull the dependency in | the named human confirms |
| `unslate --sprint S07 --spec N --by <name> --reason "…"` | Removes a spec from the slate; the reason is recorded | name and reason |
| `status [--sprint S07] [--wip-cap N] [--json]` *(default)* | Renders the slate (spec, name, risk, type, status, DoR, eng, data, next owner — DoR via `check_spec.check_spec_text`), unacknowledged handoffs with age, mix actual vs target, WIP vs cap (the cap from `--wip-cap N`, else the bold value on the `WIP cap` line of `.sdlc/artifacts/*/cadence-plan.md`, else "not set" — `track_specs` is not called; the cap stays global per cadence plan); plus a **Build order** — topological by `depends_on`, then the spec that unblocks the most others, then HIGH → MEDIUM → LOW (the longest checking ladder starts first), then backlog order — and **Next up**: the first spec in that order that is READY, whose dependencies are merged, within the WIP cap. Advisory; the human picks. With `--sprint` omitted the active sprint is the highest-numbered one not yet closed, else the highest closed one (slate replayed from the ledger, header shows `closed by`) | none |
| `handoff --spec N --to <name> --by <name> [--note]` / `ack --spec N --by <name>` | R1; `ack` by someone other than `next_owner` warns, never fails | recorder, recipient |
| `verdict --spec N --lane eng\|data --verdict accepted\|returned\|pending\|n-a --by <name> [--reason]` | R2 (the write behind `/sdlc-refine validate`): `n-a` is legal for `--lane data` only and only with `--reason` (exit 1 otherwise); `returned` without a reason records but warns; `pending` resets a verdict | the named lead |
| `ready --sprint S07 --by <name>` | Requires every slated spec: `check_spec` READY, `status: ready`, `eng_review: accepted`, `data_review: accepted \| n-a`; and a dependency graph with no cycle and no `depends_on` pointing outside the slate at an unmerged spec; else exit 1 listing the gaps per spec. On success sets `state: ready` and writes the **sprint-planning page** `.sdlc/reports/sprint-S07-planning.html` (§4), linking it from `.sdlc/reports/index.html` | the person readying it |
| `plan --sprint S07` | Renders (or re-renders) the sprint-planning page on demand — before `ready`, to run the meeting from a draft that still shows the gaps, or after a late change | none |
| `close --sprint S07 --by <name> [--carry-to S08] [--carry SPEC=REASON …] [--drop SPEC=REASON …]` | Derives kept (`status: merged`) vs open; every open spec must appear in exactly one `--carry` or `--drop` (exit 1 naming the undecided); `--carry` requires `--carry-to` (a carry-to sprint without a record is a warning). Carried specs get `sprint: "S08"`, dropped `sprint: ""`; writes `## Close`, sets `state: closed` + `closed_by`, appends `carried` / `dropped` / `closed`, and renders the **sprint-review page** `.sdlc/reports/sprint-S07-review.html` from the pre-write view | every carry/drop has a name and a reason |
| `--repo <path>` | Standalone: sprints and ledger under `<repo>/.sdlc/` (created); header notes the missing engagement context; workflow mode detected by `state.yaml` presence, never by `.sdlc/` alone | — |

**`/sdlc-refine`**

| Verb | Does | HITL |
|---|---|---|
| *(no args)* | **Agenda** for the current sprint (R3): NOT READY specs with their blocking findings, vague-line hits, pending verdicts with business-day age, unacknowledged handoffs, overdue `DL-NN` items, "next review: Wed" if `review_days` is set in `cadence-plan.md` | none |
| `--spec <id\|path>` | Refines one spec: `check_spec.py` (+ `check_channel.py` when bound), proposes fixes to vague lines, surfaces silent decisions to the spec's Decision List or to `.sdlc/decision-log.md` as `DL-NN` (owner + 2-day clock), proposes the risk tier, **proposes `depends_on`** when the spec's Scope or Delegation Plan names files, contracts, or ids that another slated spec introduces, then hands the edit to `/sdlc-spec --spec` | tier confirmed; dependencies confirmed; decisions owned by a named human; `status: ready` flipped only after READY and a human's yes |
| `--sprint S07` | **Batch mode.** Loads the Phase 0–2 context once (constitution, frozen layers, `requirements.md`, `epics.md`, `business-rules.md`, `design-doc.md`, `adr-registry.md`, `api-contracts.md`, `data/data-contract.md`, `risk-tier-map.md`) and checks every slated spec against it: mechanically — DoR (`check_spec`), `source:` ids resolve (`artifact_lineage` id vocabulary), cited upstream artifacts not stale (`audit_artifacts.py report --json` — a spec whose `source` artifact is in the stale list is routed to `--upstream`), tier vs `risk-tier-map.md`, channel dimensions (`check_channel`); by judgment — the `multi-reviewer` lenses (design/ADR/API contradictions, PII classification, `BR-NN` coverage, fit to the problem statement) fanned out across specs. Renders one agenda for the sprint, then walks fixes one spec at a time (the weekly Intent-triage ceremony, made executable) | as above, per spec |
| `validate --spec N --lane eng\|data --verdict accepted\|returned\|pending\|n-a --by <name> [--reason]` | R2: records the independent verdict through `sprint.py verdict`; `returned` sends the spec back to refinement with the reason (a missing reason is recorded with a warning, not refused); `n-a` is allowed only from Data with a reason (exit 1 otherwise); `pending` resets a verdict | the named lead |
| `--upstream --spec N` | The no-regression path, made light: pick the upstream artifact (`FR-…`, `BR-…`, `ADR-…`), edit it in place, `audit_artifacts.py record --event revised`, advisory `check_gates.py --phase N`, regenerate that phase's layer (`refreshed`), back to refinement. `/sdlc-revise` remains the heavier path for changes raised outside refinement | which artifact; the diff; who made it; a `DL-NN` only for a product decision or Phase 0 |
| `--repo <path>` | Standalone, same degradation as `/sdlc-sprint` | — |

**Touched existing commands (additive only)**

| Command | Change |
|---|---|
| `/sdlc-status` | one additive read: `sprint.py status --json` → "Sprint S07 (ends 2026-10-09): 6 slated · 4 ready · 1 verdict pending · 2 handoffs unacknowledged"; skipped silently when no sprint exists |
| `/sdlc-next` | one advisory line at the Build declaration: slate outcome of the last closed sprint |
| `/sdlc-retro` | `retro_report.py` gains "Carry-over recurrence" (per spec, ≥2 sprints) — never by person |

## 6. Scripts, templates, docs

| File | Kind | Content |
|---|---|---|
| `scripts/sprint_model.py` | **new, pure** (mirrors `findings_model.py`) | `STATES`, `parse_mix`, `propose_slate(specs, target, mix)`, `ready_gaps(spec_rows)` (incl. dependency gaps), `build_order(slate, deps)` and `next_up(...)` reusing `check_dependencies.detect_cycles` / `topological_sort` (imported; the Phase-2 aid regains a Build-loop use without changing), `outcomes(rows)`, `FORBIDDEN_FIELDS = set(scorecard.FORBIDDEN_TYPES) \| {points, estimate, effort, hours, capacity}`, `ts_to_date` adapter over `track_decisions.business_days_elapsed`, `set_frontmatter(text, key, value)` (refuses `#`, quotes, placeholder tokens) |
| `scripts/sprint.py` | **new, I/O CLI**, dual-mode `--state \| --repo`, flat verbs (`new slate unslate status handoff ack verdict ready plan close`), `--help` exits 0 with no filesystem work | reads only `^\d{4}-` spec files; writes frontmatter then the ledger; on ledger failure prints DRIFT and exits 1; reads (`status`, `slate` proposal) exit 0 always; writes 0 ok / 1 gap or illegal / 2 forbidden field, malformed value or AI `--by`; every write requires `--by` |
| `scripts/generate_sprint_report.py` | **new** (mirrors `generate_phase_report.py`; dual-mode `--state \| --repo`, `--sprint SNN`, `--kind planning\|review`, `--output`) | Renders the self-contained planning / review page from the sprint record, spec frontmatter and bodies, `check_spec` verdicts, `sprint_model.build_order`, `track_decisions`, and the ledger; reuses `generate_phase_report.md_to_html` and its style block; updates `.sdlc/reports/index.html` the way `--all` does today. "no data" for any empty section; never writes anything but the HTML |
| `scripts/track_specs.py` | extended | `sprint` passed through; `by_sprint`; `--sprint SNN` filter; legacy output byte-identical |
| `scripts/retro_report.py` | extended | carry-over recurrence section, `has_data`, exit 0 |
| `hooks/sdlc-session-start.sh` + `.ps1` | extended | `[SDLC-SPRINT]` line (grep only, `try/catch` + `exit 0` in `.ps1`); Build reminder clause; section-handoff block removed |
| `templates/phases/build/sprint.md` | new | as §4 |
| `templates/phases/build/spec.md` | edited | five optional keys with `""` defaults and comments (`test_spec_templates.py` still green) |
| `templates/phases/03-foundation/cadence-plan.md` | edited | rows for sprint length, Mon/Wed/Fri review, review-turnaround target ("not set" allowed) |
| `templates/phases/09-monitoring/project-retrospective.md` | edited | "Sprint velocity" row → "Sprint commitment outcomes (kept / carried / dropped, with reasons)" |
| `docs/integrations.md:200`, `phases/build-loop.md:125`, `docs/hooks.md`, `docs/state-machine.md` `current_sprint` | edited | "a sprint is a commitment window over the backlog order, never a second backlog"; "run Intent triage with `/sdlc-refine`"; hook line contract; retired field removed |
| `references/sprint-model.md` | new | the sprint lifecycle, the ready rule, the mix, the no-lock guarantees, the metrics policy |
| Registration | edited | `SKILL.md`, `README.md`, `docs/commands.md` (both commands get full sections, 13 → 15; the "Fifteen commands" sentence counts the *summaries* table and stays as is), `docs/scripts.md`, `CLAUDE.md` (30 commands), `CHANGELOG.md` `## 1.6.0`, `plugin.json` + `marketplace.json` |

## 7. Metrics policy

| Shown (this sprint only; "no data" when empty) | Refused |
|---|---|
| slated / ready / not-ready counts during refinement; kept / carried / dropped at close, each carry or drop with a named human and a reason | velocity, story points, estimates, effort, hours — `FORBIDDEN_FIELDS`, exit 2 |
| pending verdicts and unacknowledged handoffs with business-day age | PR count, commit count, LOC — never computed |
| mix actual vs target; WIP vs cap (cap from `--wip-cap` or `cadence-plan.md`; enforced globally by `track_specs --wip-cap`) | any per-person aggregation — no such key exists in any JSON |
| carry-over recurrence per spec (the only cross-sprint number) | cross-sprint trend of kept/carried counts ("velocity with the points removed") |
| overdue `DL-NN` decisions (from `track_decisions`) | "% complete" as a sprint number; fabricated zeros |

## 8. Rollout

| Inc | Ships | Value if we stop here |
|---|---|---|
| **1 — Sprint** | `sprint_model.py`, `sprint.py` (`new slate unslate status ready plan close`), `generate_sprint_report.py` (planning and review pages), `sprint:` and `depends_on:` keys, `templates/phases/build/sprint.md`, `commands/sdlc-sprint.md`, `track_specs` `by_sprint`, `/sdlc-status` line, R4 doc fixes, `references/sprint-model.md`, registration | The team slates N specs by mix, sees the slate's DoR readiness, readies and closes sprints with honest outcomes |
| **2 — Refine + teaming** | `commands/sdlc-refine.md` (agenda, `--spec`, `--sprint`, `validate`, `--upstream`), `handoff`/`ack`/`verdict` verbs and the three keys (R1, R2, R3), hook line + reminder clause + block retirement + first hook test (R5), `/sdlc-next` and `/sdlc-retro` lines | Refinement runs as a ceremony with an agenda; Eng and Data validate in parallel before "ready"; handoffs are owned; nothing regresses a phase |

Both ship together as **1.6.0** (new capability = minor per `RELEASING.md`).

## 9. Backward-compatibility ledger

- **Unchanged (byte-for-byte):** `check_spec.py`, `check_gates.py`, `advance_phase.py`, `phase_model.py`, `phase-registry.yaml`, `section-evaluator`, `harness/**`, `/sdlc-coach`, `/sdlc-spec`, `new_spec.py`, `scorecard.py`, `generate_status.py`, `.sdlc/state.yaml`.
- **Touched, additive:** `track_specs.py`, `retro_report.py`, both session-start hooks, `templates/phases/build/spec.md`, `cadence-plan.md`, `project-retrospective.md`, `commands/sdlc-status.md`, `sdlc-next.md`, `sdlc-retro.md`, docs and registration files.
- **New:** `commands/sdlc-sprint.md`, `commands/sdlc-refine.md`, `scripts/sprint_model.py`, `scripts/sprint.py`, `templates/phases/build/sprint.md`, `references/sprint-model.md`, `.sdlc/sprints/`, `.sdlc/metrics/sprint-log.jsonl`, tests.
- **Migration:** none. Specs without the new keys behave exactly as today; the first `slate` inserts them and a test proves `check_spec`'s verdict is unchanged.

## 10. Decisions (taken 2026-09-30 — every recommended default was adopted)

| # | Decision | Recommended (adopted) | Alternative |
|---|---|---|---|
| D1 | Mix axis | Risk tier (`HIGH:n,MEDIUM:n,LOW:n`) — it is what sets checking depth; type and channel are shown for information | by `type` (`feature`/`bugfix`) or by channel |
| D2 | Sprint length and id | 10 business days, counted inclusively (`start` is day 1, so a Monday start ends the second Friday); id typed at `new` | 14 calendar days; auto-numbered |
| D3 | "Ready" rule | DoR READY **and** `status` at least `ready` (`ready`, `in-flight` or `merged`; only `draft` falls short) **and** Eng accepted **and** Data accepted-or-n-a (R2), plus no dependency cycle and no `depends_on` outside the slate at an unmerged spec | DoR only |
| D4 | Data verdict | required until Data records `n-a` with a reason | optional |
| D5 | Slate over `target` | exit 1 unless `--override --reason` (recorded); mix breach warns | both warn |
| D6 | The retrospective's velocity row and the "no sprint plan" sentence | fix in Inc 1 (they contradict a shipped rule today) | later |
| D7 | Build-order heuristic shown by `status` | dependencies first (topological), then the spec that unblocks the most others, then HIGH → MEDIUM → LOW, then backlog order; advisory, never enforced | backlog order only |
| D8 | Sprint pages | planning page written automatically at `ready` (and on demand via `plan`); review page written at `close` with the same renderer | planning page only |

## 11. Deferred (kept in `sprint-team-layer-extended-draft.md`)

| Idea | Why not now |
|---|---|
| Full lane state machine (14 board states, control points 1/3/4, root-cause rework routing) | The simple ask covers Intent and readiness; build-side movement is already governed by the PR rails |
| Request holding area (`.sdlc/requests/`) | Product is triaging requests outside the plugin for now |
| Team roster (`.sdlc/team.yaml`), backup approver enforcement | Verdicts carry `--by` names; no roster needed to start |
| ADO card / export / reconcile | The team updates ADO manually |
| Epic tracks for a new epic mid-Build (`.sdlc/tracks.yaml`) | `--upstream` routing covers the case without new state; revisit if the team hits it |
| Cross-repo board, facilitator agent, per-person `[SDLC-LANE]` reminder | After one or two real sprints |
| **Studio Sprint view — shipped** (`feat/studio-improvements`, `docs/proposals/studio-improvements.md` Batches 1–2) | Was deferred as "after a real sprint"; now a read-only Build › Sprint view over `sprint.py status --json` plus the planning / review page via `generate_sprint_report.py --json`, declared through `phases/activities.yaml` `"build":` and `capabilities.py`. Write verbs from Studio (verdict, hand-off, ack, ready) remain deferred to that proposal's Batch 3 |

## 12. Tests

| Test | Covers |
|---|---|
| `test_sprint_model.py` (new) | mix parsing and validation; `propose_slate` fills the mix in backlog order and never exceeds `target`; `ready_gaps` on every combination of DoR/status/verdicts plus dependency gaps (cycle; unmerged dependency outside the slate); `build_order` tie-breaks (unblocks-most, then HIGH → LOW, then id) and `next_up` respecting merged dependencies and the WIP cap; `outcomes`; `FORBIDDEN_FIELDS ⊇ scorecard.FORBIDDEN_TYPES`; `ts_to_date` on real ledger timestamps; `set_frontmatter` refuses `#`/quotes/placeholders and round-trips through `check_spec.parse_frontmatter`; "no data" never 0 |
| `test_sprint.py` (new) | dual-mode (`--repo` bare repo, `--state` via `conftest.state_yaml`); exit codes per verb; key insertion on both template shapes leaves the body byte-identical and `check_spec`'s verdict unchanged; `specs/spec-template.md` never listed or written; one sprint per id; `ready` lists gaps; `close` carries and drops with reasons; JSON has no per-person key; `state.yaml` byte-identical before/after every verb; `--help` exits 0 for every verb |
| `test_generate_sprint_report.py` (new) | planning page renders every §4 section from a fixture sprint (spec cards, build order, dependencies, carried-in); "no data" for empty sections; `index.html` gains the link and existing phase links are unchanged; review page at `close`; output is self-contained (no external URLs); the footer guardrail sentence is present; dual-mode |
| `test_session_start_hook.py` (new) | `[SDLC-SPRINT]` appears iff an active sprint exists; retired block gone; prior lines byte-identical after `\r\n` normalisation; malformed sprint file → no error, no double print |
| `test_track_specs.py` (extend) | `by_sprint`, `--sprint`; legacy output byte-identical |
| `test_retro_report.py` (extend) | carry-over section; no actor key; exit 0 |
| unchanged: `test_spec_templates.py`, `test_command_contracts.py`, `test_registry_docs_consistency.py`, `test_release_manifest_agreement.py` | pick up the template keys, both command docs' flags, the docs word count, and the version agreement automatically |

Run: `uv run --project scripts python -m pytest scripts/tests/ -q` from the nested repo.
