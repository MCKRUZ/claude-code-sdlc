# Design Proposal: Sprint Team Layer — `/sdlc-sprint`, `/sdlc-refine`, and cross-team movement

**Status:** Draft for review
**Author:** drafted 2026-09-24 against v1.5.1 (`master` of the nested `claude-code-sdlc/` clone), grounded in `docs/operating-model/agentic-delivery-operating-model.md` and `team-relevance-files/04_Cross_Team_Collaboration_Model.md`
**Related:** multi-discipline channel layer (1.2.x), artifact update & audit layer (1.3.x), context-repair findings ledger, `references/team-model.md`
**Build target:** the nested `claude-code-sdlc/` repo (v1.5.1), not the outer 0.2.0 checkout. The outer `.sdlc/` (solo `plugin-self` engagement, two `status: ready` specs) is the first migration fixture.

---

## 0. The three lines that matter

1. **Two axes, not one.** The engagement keeps its linear, gate-locked phase spine exactly as it is. Cross-team movement gets a second, **per-spec lane axis** (Product → governed board → Engineering ∥ Data → build → joint Dev QA) recorded on the spec and in an append-only ledger. Nothing in the protected core changes; "phases getting locked" turns out to be a per-project property that was never the right place to model per-item flow.
2. **The operating model's four control points become mechanical records, and its undefined items become checkable definitions.** Product approval, board authorization, independent Engineering and Data validation, and three-lead Dev QA are each a named-human ledger entry with the model's five-part handoff label. Specification-ready, Engineering-ready, Data-ready, Dev-QA-complete, review turnaround, backup approver, work-item fields, and the holding area all get a concrete shape.
3. **Sprints are commitment windows, never throughput trackers.** A sprint is a two-week overlay on the spec backlog. Its report is commitment-shaped (kept / carried / descoped, each with a named human and a reason). Velocity, points, estimates, PR counts, LOC, and per-person aggregates are refused at the ledger, exactly as `scorecard.py` refuses them today.

## 1. Problem

The plugin drives an engagement through a **single, linear, gate-locked phase spine** — one
`current_phase` in `.sdlc/state.yaml`, advanced forward-only by `advance_phase.py` after the seven
gates pass and a named human signs. That shape is right for the *engagement* (Discovery → … →
Close), and the Build loop inside it is already spec-driven (one spec = one branch = one PR).

But the team that will run it does not work as one pod moving through one phase. The documented
operating model has **three lanes** — Product, Engineering, Data (with Design and Bizreq as
disciplines) — moving **specs** between them on a governed board, in **two-week sprints**, with a
Mon/Wed/Fri cross-functional review. Today the plugin has no vocabulary for any of that:

| The team needs | The plugin has today | Where it shows |
|---|---|---|
| A spec that *belongs to a lane* and is *handed to the next owner* with "assign **and** notify" | Specs have no lane, next-owner, or handoff record | `templates/phases/build/spec.md` frontmatter: `spec, name, status, type, risk, source, channel, harness_context, created`; the installed twin `harness/spec-template.md` adds `owner` |
| A board with states finer than four — drafting, product-review, approved, on the board, validating (Eng ∥ Data), accepted, building, peer review, lead review, merged, in Dev, Dev QA, approved-in-Dev | `status: draft \| ready \| in-flight \| merged`, moved by hand | `scripts/track_specs.py:STATUS_ORDER`; `phases/build-loop.md:114` |
| A sprint: goal, committed specs, carry-over, review, close | "there is no sprint plan; the spec backlog *is* the build order" | `docs/integrations.md:200` |
| A refinement ceremony that turns requests into ready specs across all five disciplines | Named as **Intent triage (weekly) — replaces refinement**, but no command runs it | `phases/build-loop.md` "The Week: Cadences"; `templates/phases/03-foundation/cadence-plan.md` |
| Requirements/Design work for a **new epic arriving mid-Build**, without the whole engagement "going backwards" | Global phase is `build`; the SessionStart hook tells everyone "One spec at a time: Intent → Delegate → Discern"; `/sdlc` renders RACI for the *global* phase | `hooks/sdlc-session-start.sh:73-83`, `commands/sdlc.md` |
| A holding area for raw requests that is explicitly **not** the backlog | `/sdlc-intake` catalogues *documents*; `specs/` is the backlog | `scripts/intake_documents.py` |
| Mechanical definitions the operating model leaves open: spec-ready, Engineering-ready, Data-ready, Dev-QA-complete, review turnaround, backup approver, work-item fields | `check_spec.py` defines spec-ready (the DoR). Nothing defines the others; review wait is a scorecard event, not a per-lane tripwire | `scripts/check_spec.py`, `scripts/scorecard.py` |
| Re-entering an earlier phase | Documented (`reentry: true`, Override Protocol) but **no code writes or reads it** | `docs/state-machine.md` Rule 4, §8; `references/validation-rules.md` Override Protocol |

The owner's instinct is right that this touches "phases getting locked". §6 shows **exactly which
lock changes and which stays**. The protected core stays byte-for-byte unchanged — a rule your own
`plugin-self` profile enforces at `severity: fail` ("Additive-only core").

## 2. Goals / Non-goals

**Goals**

- Give a spec a **lane** (board state), a **next owner**, and a **handoff trail** — derived from the spec file and an append-only ledger, never a second tracker that drifts.
- Make `/sdlc-refine` the executable form of the operating model's Stages 0–5 (request → spec → Product approval → board authorization → Engineering + Data independent validation → accepted), with the four undefined readiness definitions made **checkable ladders**.
- Make `/sdlc-sprint` the executable board and sprint lifecycle (board → move/handoff/ack → open → commit → close) on two-week time-boxes, with **commitment-shaped, never throughput-shaped** reporting.
- Let refinement and pre-Build discipline work happen for a *feature* while the *engagement* is in Build, and tell the person doing it the right thing at session start.
- Fill the operating model's "items requiring final definition" that are mechanical — without inventing facts the team has not decided (fork names, meeting times, production promotion).

**Non-goals**

- Re-introducing velocity, story points, estimates, PR/commit counts, LOC, burndown, or any per-person ranking. `scorecard.py` refuses these today (`FORBIDDEN_TYPES`, exit 2); this layer imports that list and extends it.
- Automatic Azure DevOps board intake. The operating model's controlled period says board intake is manual and no AI/MCP path may place work on the board. Anything ADO-facing is paste-block / export / read-only reconcile.
- Replacing the engagement phase spine, `advance_phase.py`, or the seven gates. The engagement still opens, builds, and closes through the same doors.
- Modelling production promotion. The team's model ends at "Approved in Development"; Phases 7–9 remain available and untouched for engagements that go further.
- A new agent in the first release. Both commands run command-only (the `/sdlc-channel` precedent); one optional read-only facilitator is a later increment.

## 3. Current state this builds on (grounding)

| Concern | Where it lives today | Reused as-is / extended / gap |
|---|---|---|
| Spec identity + DoR | `scripts/new_spec.py` (scaffold, `next_spec_id` = max+1, `SPEC_FILE_RE ^\d{4}-`), `scripts/check_spec.py` (required sections, risk tier, scope in/out, `PLACEHOLDER_RE`, vague-line lint; `parse_frontmatter` is a flat tolerant parser that **truncates values at `#`**) | **Reused as-is** (protected). New keys are enumerations/ids only, defaults `""` |
| Backlog derivation | `scripts/track_specs.py` (`scan_specs`, `summarize`, `wip_warnings`, `--wip-cap`; globs every `specs/*.md`, so the installed `specs/spec-template.md` is counted as a phantom draft) | **Extended additively**: `by_lane`, `by_sprint` (from sprint files); legacy output byte-identical |
| Risk tier → checking depth | `scripts/risk_model.py` | Reused as-is |
| Cadences, WIP cap, review-wait tripwire | `phases/build-loop.md` cadence table; `templates/phases/03-foundation/cadence-plan.md` (cap is prose "per Orchestrator"; `track_specs` enforces it globally) | **Extended**: Mon/Wed/Fri row, sprint length, turnaround; per-lane WIP shown beside the global cap |
| Phase-spanning decisions | `.sdlc/decision-log.md` + `scripts/track_decisions.py` (owner, 2-business-day clock, weekend-aware `business_days_elapsed`; `parse_iso_date` is **date-only**) | Reused; needs a `ts → date` adapter for ledger timestamps |
| Outcome metrics | `scripts/scorecard.py` (`EVENT_TYPES`, `FORBIDDEN_TYPES`, `_rate`/`_median` return `None` → "no data") | **Reused**: `spec_bounced` / `review_wait` / `deploy` fed from lane moves; `FORBIDDEN_TYPES` imported |
| Ledger + pure-model pattern | `findings_model.py` / `record_findings.py`; `artifact_model.py` / `audit_artifacts.py` (multi-verb, exit 0) | **Pattern reused**: `board_model.py` (pure) + `board.py` (I/O) |
| One Rule enforcement | `findings_model.is_ai_actor` (a **name regex** — honest labelling, not prevention) | Reused, and described honestly |
| Discipline agents | `multi-reviewer` council (7 lenses) — **phase-directory scoped**; `record_findings` has no `spec` field | One additive paragraph in `multi-reviewer.md` for a single-spec target; spec id carried in the finding `target` |
| Team model & RACI | `references/team-model.md` (five disciplines, per-phase RACI, zero coupling) | **Extended** with lane vocabulary and the two-records-by-design note |
| Phase-targeted checks | `check_gates.py --phase`, `/sdlc-review <phase>`, `/sdlc-revise` + re-gate, `/sdlc-refresh`, frozen-layer `.superseded` convention, `track_artifacts.py --snapshot` | Reused as-is — this is most of the "unlock" |
| Session context | `hooks/sdlc-session-start.sh` + `.ps1` twins (`pwsh … \|\| bash …`, 10 s shared timeout, **no test today**; still prints the retired section-plan `session-handoff.json` block in Build) | **Extended** with one `[SDLC-SPRINT]` line; retired block removed in the same change; first hook test added |
| Status dashboard | `generate_status.py` (untouched by every prior layer) + additive reads in `commands/sdlc-status.md` | **Extended** by an additive read only |
| Feature decomposition | `/sdlc-feature` → `feature-brief.md` (epic → feature → spec rows) | Reused; refinement consumes brief rows as candidates |
| Prior additive layers' contract | Protected core byte-for-byte unchanged: `check_spec.py`, `check_gates.py`, `section-evaluator`, `harness/**` (also **generated** — CI `sync-check` fails on any byte drift), `phase_model.py`, `phase-registry.yaml`, `/sdlc-coach`, `/sdlc-spec`, `advance_phase.py` | **Honoured** (see §6, §11) |
| ADO harness pack | `harness/packs/cicd/azure-devops/mcp.fragment.json` merges `@azure-devops/mcp@2.8.1` (work-item tools included) into the client `.mcp.json`; `settings.fragment.json` puts `Bash(az devops invoke:*)` under `ask` | **Gap**: the controlled period is not a permissions posture today (§12 R1) |

## 4. The team flow to mimic — stage by stage

Operating-model stage → what the plugin does today → what this layer adds. Node ids are the
operating model's (`HRA1`, `GATE1`, `DENG1`, …).

| # | Operating-model stage / control | Plugin today | This layer |
|---|---|---|---|
| 0 | Request captured into the **Holding Area** (`HRA1`), not the backlog; a spec owner is named (`P0`) | No request object | `.sdlc/requests/REQ-NNNN.md` (outside `specs/`, so no backlog scan can count it); `/sdlc-refine capture` / `assign` |
| 1 | Designated contributor drafts spec + markdown artifacts, PR into product fork (`P1–P4`), notifies Product (`N1`) | `/sdlc-spec` scaffolds + DoR | `/sdlc-refine promote REQ-NNNN` → `new_spec.py --source REQ-NNNN` → `/sdlc-spec` (unchanged); lane `drafting → product-review` is a handoff record |
| 2 | Product review runs SDLC status / audit / review (`PG4–PG6`); decides (`DPG1`); may consult Eng/Data (`CE1`/`CD1`); approves and merges spec upstream (`PG11–12`) | Those commands exist, scoped to the *global* phase | `/sdlc-refine review <spec>`: spec-ready ladder + single-spec council review; `approved` requires `check_spec` MUST-clean or a ledgered waiver; clarifications open `DL-NN` items |
| 3 | **Control 1** — board authorization (`GATE1`, `LOCK1`), governed work item (`ADO1`); manual for the controlled period | Nothing | `/sdlc-refine authorize <spec> --work-item <id> --by <Product lead\|backup>`; refuses off-roster approvers when a roster exists; `card` prints the ADO1 field set for manual paste; `team.yaml board.intake: manual` is the only accepted value |
| 4 | **Assign and notify** the next owners (`H1`) — never rely on noticing | Nothing | Every lane move carries `--to-owner` and `--notified teams\|ado\|other\|none`; `ack` closes it; unacknowledged handoffs are a visible queue with business-day age |
| 5A | **Control 2** — Engineering independent validation (`ENG3–ENG10`, `DENG1`), bounce to Product on gaps | `/sdlc-review --adversarial` exists, phase-scoped | `/sdlc-refine validate <spec> --lane eng`: Engineering-ready ladder; `verdict accepted\|returned`; returned routes to `product-review` with cause `spec-gap` |
| 5B | **Control 2** — Data independent validation in parallel (`DATA2–DATA9`, `DDATA1`); may raise a data spec | `/sdlc-data` authors data-contract/readiness/lineage | `/sdlc-refine validate <spec> --lane data`: Data-ready ladder; `data_impact: unknown` **fails closed**; `n-a` only by a named Data human with a reason; a raised data spec is `type: data`, `source: <parent>` |
| 5→6 | Lead accepts, assigns developer, controlled branch (`ENG11–ENG14`, `DATA10–DATA12`) | `status: ready → in-flight` by hand | `accepted` is **derived** from both verdicts; `move --to building --to-owner <developer>` writes `developer:` and `status: in-flight` in the same edit |
| 6 | **Control 3** — self-check, peer review, lead approval, no self-merge (`DENG2/3`, `DDATA2/3`) | Build-loop merge bar (CI, grader, non-author approval); risk ladder | Lane `building → peer-review → lead-review → merged`; a verdict by the recorded `developer` is written with `unverified: author-self-approval` and counts as debt (solo pods still work; the PR platform's non-author rule remains the real block) |
| 7 | Merge-type classification: spec/markdown-only merges must not trigger a build (`DMERGE1`) | Harness CI rails | `--merge-type spec-only\|eng-code\|data-code` required at `merged`; `spec-only` stops at `merged` (never Dev QA) |
| 8 | CI/CD → Dev (`CICD1–3`) | Harness deploy-dev rail | `merged → in-dev` may be recorded by `--by pipeline:<run>` (the one sanctioned automation actor, on this single non-control edge) |
| 9 | **Control 4** — cross-functional QA by all three leads in Dev (`QA1`, `DQA1`), rework routed by root cause | Nothing after `merged` | Three `verdict --lane product\|eng\|data pass` by named humans derive `approved-in-dev`; one person signing several roles is allowed with an advisory note; fail routes by `(origin, cause)` |
| — | Mon/Wed/Fri cross-functional review; 2-week sprints | Build cadence table | `/sdlc-refine` (no args) *is* the agenda; `/sdlc-sprint` *is* the time-box; `team.yaml review_days` labels "next review: Wed" |
| — | Undefined: readiness definitions; review turnaround; backup approver; work-item fields; holding area | `check_spec.py` = spec-ready only | Four ladders in `board_model.py`; per-lane turnaround in `team.yaml` (no invented default — reads "no target set" until typed); `backup` list per lane; `card`/`export` field set; `.sdlc/requests/` |

## 5. Design

### 5.1 The one idea — two orthogonal axes

| Axis | Scope | Owner of truth | Moves how | Locked how |
|---|---|---|---|---|
| **Engagement phase** (existing) | The whole engagement | `.sdlc/state.yaml current_phase` via `advance_phase.py` | Forward only, after G1–G7 + `--confirmed` | Gates, checksum snapshots, frozen layers, sign-offs — **unchanged** |
| **Spec lane** (new) | One spec | `lane:` on the spec (projection) + `.sdlc/metrics/board-events.jsonl` (history, authoritative for control-point arithmetic) | Forward on the spine, backward only via root-cause `return` | Control points are named-human records; illegal moves exit 1; refusals (exit 2) only for structurally impossible things |
| **Sprint window** (new) | A two-week commitment over lane items | `.sdlc/sprints/SNN.md` (membership lives **only** here) | `open → commit → close`, human-triggered | Never gates anything; never advances the phase |

The Build loop's own precedent applies: hardening passes are "scheduled work inside the flow — not a
phase that gates all other work". A sprint is the same kind of thing.

### 5.2 Data model

**Spec frontmatter — optional keys, inserted by `board.py` on first write** (after `status:` if present, else after the opening `---`). Enumerations and ids only, because `check_spec.parse_frontmatter` truncates values at `#` and `PLACEHOLDER_RE` scans frontmatter. Free text (labels, reasons, URLs) lives only in the ledger. `harness/spec-template.md` is **not** edited (generated + CI `sync-check`).

| Key | Values | Written by | Read by | Note |
|---|---|---|---|---|
| `lane` | `""` (legacy/ungoverned) or a lane state (§5.3) | `board.py` only | `board.py`, `track_specs` (`by_lane`) | `""` renders as "legacy — board authorization not recorded"; never derived upward from `status` |
| `eng_review` / `data_review` | `pending \| accepted \| returned \| n-a` | derived by `board.py` from `verdict` events | board view | Parallel Stage-5 sub-states visible in the file |
| `data_impact` | `unknown \| yes \| none` | Product at review; `none` only by a named Data human | Data-ready ladder | `unknown` fails closed (mirrors `RequiredArtifact.applies_to`) |
| `next_owner` | a name (no `#`, no quotes; writer refuses otherwise) | every move with `--to-owner` | board queue, hook | Per-item routing fact, **never aggregated** |
| `developer` | a name | `move --to building` | non-author check | `owner` keeps its harness meaning (accountable human) |
| `merge_type` | `spec-only \| eng-code \| data-code` | `move --to merged` | `in-dev` precondition | DMERGE1 |
| `ado_id` | digits only | `authorize --work-item` (human-typed) | `card`, `export`, `reconcile` | Never written by any API/MCP path; `AB#4521` shorthand is refused (the `#` would be truncated) |
| `accepted_hash` | `sha256:<16hex>` of the spec body at acceptance | derived at CP2 and each CP4 pass | "acceptance stale" flag | ENG3 "confirm latest approved version"; computed with `hashlib` directly |
| `status` (existing) | unchanged vocabulary | **write-through** by `board.py` from the coarse map on every recorded move; legacy specs keep hand-edited `status` as their only truth | `check_gates` Build INFO line, WIP cap, handoff report | Hand edits on governed specs are reported as DRIFT, never auto-repaired |

**Ledger — `.sdlc/metrics/board-events.jsonl`** (append-only; shape owned by `board_model.event_entry`; `ts` full ISO datetime supplied by the caller):

| `event` | Fields | Op-model node |
|---|---|---|
| `move` | `spec, from, to, by, actor_kind: human\|pipeline, to_owner, notified: teams\|ado\|other\|none, what, condition, next_action, merge_type?, work_item?, waiver?` | every solid arrow; `what/condition/next_action` pre-filled from `HANDOFF_LABELS[(from,to)]`, human may override |
| `verdict` | `spec, lane: eng\|data\|peer\|lead\|product, verdict: accepted\|returned\|n-a\|pass\|fail, by, reason?, hash, unverified?` | `DENG1`, `DDATA1`, `DENG2/3`, `DDATA2/3`, `DQA1` |
| `return` | `spec, from, to (routed), cause: spec-gap\|eng-defect\|data-defect\|data-spec-required\|pipeline-failed\|integration, by, to_owner, reason` | every dashed arrow; also appends `scorecard` `spec_bounced` |
| `ack` | `spec, by` | closes the matching `move` handoff |
| `request` | `req, event: captured\|owner-assigned\|promoted\|declined, by, spec?, reason?` | Stage 0 |
| `sprint` | `sprint, event: opened\|committed\|added\|carried\|descoped\|closed, spec?, by, reason?, goal?, start?, end?` | the time-box |

Forbidden field keys (`velocity, story_points, storypoints, pr_count, prcount, lines_of_code, loc, commits` imported from `scorecard.FORBIDDEN_TYPES`, plus `points, estimate, effort, hours, capacity`) are refused at any write with exit 2 and the scorecard's own refusal text.

**Holding area — `.sdlc/requests/REQ-NNNN.md`** (template `templates/phases/build/request.md`; id = max+1 like `new_spec.next_spec_id`; never under `specs/`):

| Field | Values |
|---|---|
| `request` | `"0001"` (example ids in the template are `0000`-style, never `NNNN`, so `check_spec` can never trip on them if a request is ever scanned) |
| `title`, `source` | free text |
| `source_type` | `business \| product \| operational \| technical \| data \| engineering \| defect` (REQ0) |
| `product_area` | one of `team.yaml.product_areas` (neutral placeholders in the shipped template) |
| `captured`, `captured_by` | ISO date, name |
| `spec_owner` | `unassigned` or a name (`P0`) |
| `state` | `captured \| owner-assigned \| promoted \| declined` — the **only** exit into work is `promoted` → a spec at `lane: drafting` |
| `spec` | `NNNN` once promoted |
| Body | `## What was asked` (verbatim) · `## Why now` · `## D0 — already an approved, implementation-ready spec? (default No)` · `## Triage notes` |

**Sprint record — `.sdlc/sprints/SNN.md`** (template `templates/phases/build/sprint.md`; sprint id **human-typed** at `open --sprint S07`, never auto-allocated, so the three repos can share one convention):

| Field / section | Content |
|---|---|
| `sprint`, `goal`, `start`, `end` | `end` defaults to `start` + `team.yaml.sprint_length_business_days` (default 10) via `track_decisions.add_business_days` |
| `state` | `planned \| active \| closed`; one `active` per repo |
| `done_at` | `approved-in-dev` (default, the model's milestone) or `merged` (per-sprint override) |
| `opened_by`, `committed_by`, `closed_by` | named humans |
| `## Commitment` | `\| spec \| name \| lane at commit \| risk \| committed_as (committed\|stretch) \|` — frozen at commit; `commit` refuses anything below `on-board` |
| `## Changes` | rendered from `added / carried / descoped` events with reasons |
| `## Review` | `\| spec \| outcome (kept \| carried \| descoped \| open) \| by \| reason \|` — derived from current lanes at close, confirmed by a human |
| `## Retro+ input` | free text |

No estimate or points column exists; a test greps the template and every report format string for `points|velocity|estimate|burndown` outside the quoted "Never tracked" sentence.

**Team roster — `.sdlc/team.yaml`** (template `templates/team.yaml`; optional; absent → role checks print "role unverified", nothing else changes):

```yaml
version: "1"
board: { intake: manual }            # the ONLY accepted value; anything else → exit 2 with the controlled-period message
product_areas: ["<area-1>", "<area-2>"]
lanes:
  product:     { lead: "<name>", backup: ["<name>"], contributors: [] }
  engineering: { lead: "<name>", backup: [], developers: [] }
  data:        { lead: "<name>", backup: [], developers: [] }
review_days: [Mon, Wed, Fri]
turnaround_business_days: {}         # per lane state; EMPTY by default → reports read "no target set"
sprint_length_business_days: 10
wip_cap_per_lane: {}                 # optional; the global cap still comes from cadence-plan.md via track_specs --wip-cap
```

### 5.3 Lane state machine (`board_model.LANES`, `TRANSITIONS`, `HANDOFF_LABELS`)

| From → to | Op-model node | Who records (`--by`) | Mechanical precondition (else exit 1, naming the gap) | Control point |
|---|---|---|---|---|
| `""` (legacy) → any | — | — | never derived upward from `status`; a human records the first move explicitly | — |
| request `promoted` → `drafting` | `P0/P1` | Product (assigns owner) | `spec_owner` set on the request; spec scaffolded via `new_spec.py --source REQ-NNNN` | — |
| `drafting → product-review` | `P4/N1` | spec owner | `--to-owner <Product lead>`, `--notified` | — |
| `product-review → approved` | `DPG1` yes, `PG11–12` | Product lead or roster backup | spec-ready ladder MUST rungs pass (`check_spec.check_spec_text` has 0 MUST failures), or `--waive "<name>: reason"` ledgered | **CP1a** |
| `product-review → drafting` | `PG-R1` | Product | `return --cause spec-gap` | rework |
| `approved → on-board` | `GATE1/ADO1` | Product lead/backup **only** when a roster exists (else "unverified") | `--work-item <digits>` typed by the human; `board.intake == manual` | **CP1** |
| `on-board → validating` | `H1` | Product | a `move` to the Eng lead and one to the Data lead (or `data_impact: none` recorded by Data) — "authorized but not handed off" otherwise | — |
| `validating` → `accepted` | `ENG11` + `DATA10` | **derived** | `eng_review == accepted` and `data_review ∈ {accepted, n-a}`; records `accepted_hash` | **CP2** |
| `validating → product-review` | `ENG-R2` / `DATA-R2` | Eng or Data lead | `return --cause spec-gap\|data-spec-required` | rework |
| `accepted → building` | `ENG12–14` / `DATA11–12` | lane lead | `--to-owner <developer>` → writes `developer:`; `status: in-flight` write-through | — |
| `building → peer-review` | `ENG16–18` | developer | `--to-owner <peer>`; PR URL in ledger `condition` | — |
| `peer-review → lead-review` | `DENG2` / `DDATA2` | peer | `verdict --lane peer accepted`; if `by == developer` → written with `unverified: author-self-approval` (debt, not refusal) | **CP3a** |
| `lead-review → merged` | `DENG3` / `DDATA3` | lane lead | `verdict --lane lead accepted` (same self-approval labelling) + `--merge-type` | **CP3b** |
| `peer-review \| lead-review → building` | `ENG-R3..R5`, `DATA-R4` | peer/lead | `return --cause eng-defect\|data-defect` | rework |
| `merged → in-dev` | `CICD1–3` | implementation owner, or `--by pipeline:<run>` (`actor_kind: pipeline`) | `merge_type != spec-only` (`spec-only` is terminal at `merged`, labelled "MRG-A: no build") | — |
| `in-dev → building` | `CICD-R1..R3` | anyone | `return --cause pipeline-failed` (to the recorded developer) | rework |
| `in-dev → dev-qa` | `QA1` begins | anyone | `--to-owner` names the three leads | — |
| `dev-qa → approved-in-dev` | `DQA1` yes, `M1` | **derived** | three `verdict --lane product\|eng\|data pass` by named humans on the same `accepted_hash`; one name covering several roles is allowed with the note "one person signed N roles" | **CP4** |
| `dev-qa → product-review \| building \| joint-review` | `QA-R-SPEC / ENG / DATA / INT` | any lead | `return --cause` routed by §5.4 | rework |
| `joint-review → product-review \| building` | `QA-R-INT` resolution | any lead | `return --cause spec-gap\|eng-defect\|data-defect` | — |

Terminal in the model's scope: `approved-in-dev`. Production promotion is deliberately absent (no state invented). Every legal edge has a `HANDOFF_LABELS` entry (a test asserts totality) so the human confirms a pre-filled five-part label rather than typing one.

Coarse map (`board_model.COARSE`, applied write-through): `drafting, product-review → draft` · `approved, on-board, validating, accepted → ready` · `building, peer-review, lead-review, joint-review → in-flight` · `merged, in-dev, dev-qa, approved-in-dev → merged`.

### 5.4 Rework routing (`board_model.REWORK_ROUTES`, keyed by origin **and** cause)

| Origin lane | Cause | Target lane | Required recipient (`--to-owner`) |
|---|---|---|---|
| `product-review` | `spec-gap` | `drafting` | spec owner |
| `validating` (Eng) | `spec-gap` | `product-review` | Product lead |
| `validating` (Data) | `data-spec-required` | `product-review` | Product lead (`--related <new data spec>` optional) |
| `peer-review` / `lead-review` | `eng-defect` / `data-defect` | `building` | `developer` |
| `in-dev` | `pipeline-failed` | `building` | `developer` |
| `dev-qa` | `spec-gap` | `product-review` | Product lead |
| `dev-qa` | `eng-defect` / `data-defect` | `building` | `developer` |
| `dev-qa` | `integration` | `joint-review` | the three leads |
| `joint-review` | `spec-gap` / `eng-defect` / `data-defect` | as above | as above |
| any other pair | — | exit 1 "not a defined rework path" | — |

Every `return` also appends `scorecard.record_event(..., "spec_bounced", {spec, cause})` to `loop-events.jsonl` via import — one outcome ledger, `scorecard.py` untouched.

### 5.5 Readiness ladders (`board_model.ladder(which, …)`, surfaced by `board.py ladder --spec N --which …`; rows `{rung, passed, severity, message}`)

| Ladder | Fills the model's undefined item | MUST rungs | SHOULD rungs | Gate it feeds |
|---|---|---|---|---|
| **spec-ready** | "Definition of specification-ready" | `check_spec` 0 MUST failures (imported `check_spec_text`); `owner` named; `product_area` set; `data_impact ∈ {yes, none}` (`unknown` fails); every Decision List item has a named owner | `check_channel` dimensions when `channel:` set; request back-link (`source: REQ-NNNN`) | `product-review → approved` |
| **eng-ready** | "Definition of Engineering-ready" | spec-ready; `accepted_hash` will be recorded against the current body; a findings-ledger round whose `target` names this spec with an Architecture/Security/Quality lens; `findings_model.open_debt` for that spec == 0 (human-only `ACCEPTED_RISK`); Delegation Plan "Gated paths touched" filled | `harness_context` non-empty; risk tier confirmed in the verdict reason | `eng_review → accepted` |
| **data-ready** | "Definition of Data-ready" | `data_impact` declared; if `yes`: a Data-lead verdict with `--related` data specs or `--reason "no additional data spec required"`; if `none`: a Data-lead `n-a` verdict with reason | `.sdlc/artifacts/02-design/data/data-contract.md` present when `yes` | `data_review → accepted \| n-a` |
| **dev-qa-complete** | "Definition of Development-QA complete" | lane `dev-qa`; `in-dev` recorded (pipeline ref in ledger); three role verdicts `pass` on the same `accepted_hash`; any `fail` carries a cause | "N of M acceptance checks ticked" — scoped to `extract_section(body, "Acceptance Checks")`, **advisory only** (the harness template's Checking Plan checkboxes must never count) | `dev-qa → approved-in-dev` |

### 5.6 Commands

**`/sdlc-refine` — the Intent side (Stages 0–5; the Mon/Wed/Fri agenda; Intent triage made executable)**

| Verb | What it does | HITL (named human decides) | Scripts it owns |
|---|---|---|---|
| *(no args)* `agenda` | Renders the review agenda: requests awaiting an owner (age), specs in `product-review` with their spec-ready ladder, returned specs, validation waits vs turnaround, overdue `DL-NN` items, unacknowledged handoffs, "next review: Wed" | none (read) | `board.py board --agenda --json`, `track_decisions.py --json` |
| `capture "<title>" --source-type <t> --area <a>` | Files a request into the holding area; asks D0 explicitly (default No) | who captured it | `board.py capture` |
| `assign REQ-NNNN --to <name>` | Names the designated spec owner (`P0`) | the owner's name | `board.py assign` |
| `promote REQ-NNNN` | Scaffolds the spec (`new_spec.py --source REQ-NNNN`), sets `lane: drafting`, marks the request `promoted`, then hands to `/sdlc-spec` for authoring | risk tier proposed, confirmed at `/sdlc-spec` | `board.py promote` (imports `new_spec.create_spec`) |
| `decline REQ-NNNN --reason` | Closes a request without work | the reason | `board.py decline` |
| `review <spec>` | Stage 2: spec-ready ladder + `check_spec` + `check_channel`; spawns `multi-reviewer` (council) on the **single spec** writing `.sdlc/artifacts/build/reviews/<spec>-product-r<N>.md`; records findings; then DPG1/DPG2 | pass → `approved` (or `--waive` with reason); return → `return --cause spec-gap`; clarify → `DL-NN` items owned by the Eng/Data lead on the 2-day clock | `board.py ladder`, `check_spec.py`, `check_channel.py`, `record_findings.py`, `board.py move\|return` |
| `authorize <spec> --work-item <id> --eng <name> --data <name\|n-a> --notified …` | **Control 1**: `approved → on-board → validating`; prints the ADO1 field block for the human to paste into the work item they create by hand; prints the controlled-period deny lines (§12 R1) if the repo carries the ADO pack | approver confirms as themselves; the work item id is typed | `board.py move --to on-board`, `board.py card` |
| `validate <spec> --lane eng\|data` | **Control 2**: Engineering-ready or Data-ready ladder; points Data at `/sdlc-data`; spawns `multi-reviewer` with the matching lens; records the lead's verdict | `accepted` / `returned --cause` / `n-a --reason` | `board.py ladder`, `board.py verdict\|return` |
| `--upstream <spec>` | The "backwards move without moving the phase": routes a spec whose gap is in a Phase 1/2 artifact through `/sdlc-revise <id>` → `check_gates.py --phase N` → the spec re-enters `product-review` with the `DL-NN` link | human picks the artifact and confirms the re-gate | `audit_artifacts.py` (via `/sdlc-revise`), `check_gates.py --phase` |
| `--repo <path>` | Standalone: requests/ledger/sprints under `<repo>/.sdlc/` (created); header says "no engagement context — roster absent, roles unverified"; decision-log falls back to `<repo>/decision-log.md` | — | — |

**`/sdlc-sprint` — the board and the time-box (Stages 4–9; daily flow check; 2-week sprints)**

| Verb | What it does | HITL | Scripts it owns |
|---|---|---|---|
| *(no args)* `board` | Lanes as columns: each spec's `next_owner`, business days in lane, turnaround flag, sprint membership, `legacy` / unnotified / DRIFT / acceptance-stale flags; headed by the active sprint (day X of N, commitment so far) and the flow-check numbers (waiting per review lane, oldest wait, HIGH-risk wait on its own line, WIP vs cap global and per lane) | none (read) | `board.py board --json`, `track_specs.py --wip-cap N` |
| `move <spec> --to <lane> --to-owner <name> --notified … [--merge-type] [--pr] [--run]` | A lane transition with the pre-filled five-part label shown for confirmation; write-through `status` | every move names the recorder; CP3 confirms peer/lead and merge type | `board.py move` |
| `verdict <spec> --lane peer\|lead\|product\|eng\|data --verdict …` | Records a review or QA verdict; derives `accepted` / `approved-in-dev` when complete | the named reviewer | `board.py verdict` |
| `return <spec> --cause … --to-owner <name> --reason` | Root-cause rework, routed by §5.4; appends `spec_bounced` | cause chosen by a human | `board.py return` |
| `ack <spec>` | The recipient acknowledges a handoff | the recipient | `board.py ack` |
| `open --sprint S07 --goal "…" --start YYYY-MM-DD` | Creates the sprint record (`planned`); refuses a second `active` | goal + start confirmed | `board.py open` |
| `commit <spec>… [--stretch]` | Freezes the commitment (specs at `≥ on-board` only; the agent may propose a set within the WIP cap, a human commits) | the committer, WIP override with reason | `board.py commit` |
| `add \| carry \| descope <spec> --reason` | Mid-sprint changes, each with a reason | the human | `board.py add\|carry\|descope` |
| `close` | Derives each committed item's outcome from its lane, asks the human to confirm carried/descoped with reasons, writes `## Review`, records `sprint closed`; **never** suggests advancing the phase | the closer | `board.py close` |
| `card <spec>` / `export [--format csv\|json]` | The ADO1 field set for manual paste / bulk manual import | none | `board.py card\|export` |
| `reconcile --ado-csv <file>` | Read-only diff of a human-downloaded ADO export against local lanes (missing here / missing there / state mismatch) | none | `board.py reconcile` |
| `--repo <path>` | Standalone (same degradation as above) | — | — |

**Touched existing commands (additive reads/prose only)**

| Command | Change |
|---|---|
| `/sdlc-status` | One additive read: `board.py board --state … --json` → a "Board:" line (specs per lane, tripwire breaches, unnotified handoffs, legacy count) and a "Sprint SNN (day X/N): committed N · kept k · carried m" line; skipped silently when absent — the `track_specs`/`track_decisions`/`audit_artifacts` pattern |
| `/sdlc-next` | One advisory line before the Build feature-complete declaration: "Board completeness: N of M boarded specs approved-in-dev; K carried; J returned" — prose only, `advance_phase.py` untouched |
| `/sdlc-retro` | `retro_report.py` gains "Carry-over recurrence" (per spec) and "Bounces by root cause" (per cause/lane) — never by actor |
| `/sdlc` | After the RACI block, an optional "Your lane" block when `.sdlc/local/lane.yaml` exists (Inc 5) |
| `/sdlc-doctor` | New check: FAIL when `team.yaml board.intake: manual` and the repo's `.mcp.json`/settings still expose `wit_*` create/update tools or `az boards` (§12 R1) |

### 5.7 Scripts and agents

| File | Kind | Content |
|---|---|---|
| `scripts/board_model.py` | **new, pure** (no I/O; mirrors `findings_model.py` / `artifact_model.py`) | `LANES`, `COARSE`, `TRANSITIONS`, `CONTROL_POINTS`, `HANDOFF_LABELS`, `REWORK_ROUTES`, `SUB_STATES`; `validate_transition(...) → (ok, reasons, exit_code)`; `derive_accepted`, `derive_qa`; `ladder(which, inputs)`; `event_entry(...)`; `fold_events(events)`; `ts_to_date(ts)` adapter (tz-aware → UTC date) over `track_decisions.business_days_elapsed`; `queue_ages`, `tripwires`; `commitment_outcomes(...)` incl. `unrecorded_additions`; `FORBIDDEN_FIELDS = set(scorecard.FORBIDDEN_TYPES) \| {points, estimate, effort, hours, capacity}`; `set_frontmatter(text, key, value)` (line-level; refuses `#`, quotes, `\n---`, `PLACEHOLDER_RE` tokens); reuses `findings_model.is_ai_actor` for labelling |
| `scripts/board.py` | **new, I/O CLI** (dual-mode `--state \| --repo`; flat verbs; argparse subparsers so `test_command_contracts` introspects `--help`; no filesystem work before argparse) | Verbs: `board`, `move`, `verdict`, `return`, `ack`, `ladder`, `card`, `export`, `reconcile`, `capture`, `assign`, `promote`, `decline`, `open`, `commit`, `add`, `carry`, `descope`, `close`. Reads only `^\d{4}-` spec files (`new_spec.SPEC_FILE_RE`) so the installed `specs/spec-template.md` is never listed or rewritten. Writes frontmatter first, then the ledger; on ledger failure prints DRIFT and exits 1. Exit codes: reads 0 always; writes 0 ok / 1 illegal transition, missing precondition, unknown spec, second active sprint / 2 refused (forbidden field, `board.intake != manual`, self-identifying automation at a control point, `--work-item` missing at CP1, off-roster approver at CP1 when a roster exists). Never writes `state.yaml` |
| `scripts/track_specs.py` | extended (not protected) | `scan_specs` passes through `lane`, `next_owner`; `summarize` adds `by_lane` and `by_sprint` (derived from `.sdlc/sprints/*.md`); `format_report` renders the new blocks only when any spec carries `lane`; legacy output byte-identical (tested) |
| `scripts/retro_report.py` | extended | additive sections (carry-over recurrence per spec; bounces by cause); `has_data`; exit 0 |
| `scripts/doctor.py` | extended | controlled-period posture check (§12 R1) |
| `agents/multi-reviewer.md` | one additive paragraph | when given a single spec path, review that file with the requested lens set and write `## Gate Results` with the spec id in each `target` (`specs/0007-x.md:42`) so `record_findings` needs no schema change |
| `agents/flow-facilitator.md` | **optional, Inc 5**, Read/Grep/Glob only | drafts the Mon/Wed/Fri agenda narrative, proposes commitment sets within the WIP cap, drafts carry/descope reasons and Retro+ prompts; never moves a lane, never records a verdict, never produces a per-person figure |
| Templates | new | `templates/phases/build/request.md`, `templates/phases/build/sprint.md`, `templates/team.yaml` |
| Templates | edited | `templates/phases/build/spec.md` (nine optional keys, `""` defaults, comments), `templates/phases/03-foundation/cadence-plan.md` (Mon/Wed/Fri row, sprint length, turnaround, WIP clarification), `templates/phases/09-monitoring/project-retrospective.md` (velocity row replaced — Inc 1) |
| References / docs | new | `references/board-model.md` (lanes, control points, handoff standard, ladders, ADO relationship incl. the honest "labelling, not prevention" note, metrics policy, two-records-by-design) |

### 5.8 Session context (hooks; both twins, same output contract)

| Line | Source | Condition | Note |
|---|---|---|---|
| `[SDLC-SPRINT] S07 — "<goal>" — ends 2026-10-09` | grep of `.sdlc/sprints/*.md` for `state: active` + two fields | active sprint exists | No date arithmetic in the shells; the CLI computes days. `try/catch` + `exit 0` in `.ps1` so a thrown error never triggers the `\|\| bash` double-print |
| *(removed)* section-plan `session-handoff.json` summary | `sdlc-session-start.sh:169-224`, `.ps1:158-192` | — | Retired in the same change so two progress models never stack; `docs/hooks.md:106` line contract updated |
| `[SDLC-LANE] data: Validate data impact independently (DDATA1); raise a data spec through Product when needed…` | gitignored `.sdlc/local/lane.yaml` set by `/sdlc-sprint me --lane data --focus 0007` | **Inc 5**, after the first hook test exists | The `me` verb appends `.sdlc/local/` to the **target** repo's `.gitignore` after asking (the plugin's `.gitignore` does not apply to clients) |
| `[SDLC-PHASE] …` (existing global reminder) | unchanged | — | — |

## 6. The phase lock — what changes and what stays

### 6.1 The four options, weighed

| Option | What it would do | Verdict | Why |
|---|---|---|---|
| 1. Leave the machine alone; route through existing `--phase` / `/sdlc-revise` paths | Documentation + command prose only | **Necessary but insufficient alone** | Gives no per-item cross-team state, no handoff record; the hook stays wrong for non-Engineering lanes. Shipped as the `--upstream` routing in Inc 2 |
| 2. **Orthogonal per-spec lane axis + (later) epic tracks alongside the global phase** | New files and ledgers only; `current_phase` untouched | **Recommended** | Realises everything the team needs; touches no protected file; reuses the ledger pattern; every existing engagement and test keeps passing |
| 3. Backwards phase transition with re-gating | `prev_phase()`, `advance_phase.py` edit, `reentry: true` history | **Rejected** | Wrong model: one epic needing Requirements work would drag every other lane back; breaks `history` semantics, frozen-layer ordering (`is_before`), G5, checksum baselines, and sign-off records; edits protected `advance_phase.py`/`phase_model.py` (your `plugin-self` profile fails on it) |
| 4. Global phase derived from tracks | Rewrite every `current_phase` reader | **Rejected** | Non-additive; makes sign-offs flap as tracks move; touches hooks (regex readers), `generate_status.py`, `check_gates.py`, `advance_phase.py`, `phase_model.py` |

### 6.2 What changes and what stays

| Aspect | Today | Proposed | Protected core touched? |
|---|---|---|---|
| Global `current_phase`, forward-only advance | one field; G1–G7 + `--confirmed`; no backwards move | **Unchanged.** Reinterpreted in `references/board-model.md` as the *engagement floor*; movement of work happens on the lane axis. For this team the controlled period is steady-state `build` | No |
| Per-item progress | `status` (four values) only | `lane` + sub-states + `next_owner` + ledger; `status` written through from the coarse map | No (`parse_frontmatter` tolerates extra keys; `check_gates` reads only `by_status`) |
| "Backwards" to fix an upstream artifact mid-Build | possible but invisible: `/sdlc-revise` + `check_gates.py --phase 1` + `/sdlc-review 1` | **Made explicit and routed** by `/sdlc-refine --upstream`: "you do not go back a phase; you revise the artifact, re-gate that phase, the spec re-enters product-review" | No |
| New epic needing Requirements/Design-shaped work mid-Build | invisible; the Phase-1 frozen layer silently stale | **Inc 6 (optional):** `.sdlc/tracks.yaml` epic tracks (`work_phase`, `needs/done`, `regated`, `layer_refreshed`) driven by `/sdlc-refine epic` — routes to `/sdlc-feature` and `/sdlc-revise`, re-gates with `check_gates.py --phase N`, offers the existing frozen-layer `.superseded` refresh + `validate_frozen_layer.py`, and a **human-confirmed** `track_artifacts.py --snapshot` re-baseline. `current_phase` never moves | No (`phase_model.get_phase` imported read-only to validate ids) |
| Parallel work | no parallel phases | Parallel *lanes* on one spec (Eng review ∥ Data review; Eng build ∥ a Data child spec) — separate verdict/move events; `accepted` derived from both | No |
| Gates vs control points | G1–G7 on phase exit only | CP1–CP4 live in `board_model.validate_transition`, enforced by `board.py` (exit 1/2); never fed into `check_gates.py` or `state.yaml gate_results` — separate arithmetic, separate ledger (the same reason findings-log and artifact-log are separate from gate-log) | No |
| Definition of Ready | `check_spec` READY is the floor; nothing records Product approval | spec-ready := `check_spec` READY **and** a named Product `approved` event (waiver ledgered) | No (imported, not modified — as `track_specs`/`check_channel` already do) |
| Leaving Build | human declaration → `phase7-handoff.md` | **Unchanged.** `/sdlc-next` shows one advisory "Board completeness" line; `/sdlc-sprint close` never suggests advancing. The declaration is a release-scoped decision Product makes when a release candidate exists | No |
| Session reminder | `[SDLC-PHASE]` for the global phase | kept; `[SDLC-SPRINT]` now, `[SDLC-LANE]` in Inc 5 | No (hooks are not protected) |
| Documented-but-unimplemented re-entry (`reentry: true`, Override Protocol) | prose only | **Left as is.** This layer needs neither; noted in §13 as a doc leftover to either implement separately or retire | No |

## 7. How this maintains the IDD core

| # | Invariant | How the layer preserves it |
|---|---|---|
| 1 | One Rule — machine reports, named human signs | Every control point is a `--by <human>` record; derived states (`accepted`, `approved-in-dev`, `kept`) cannot be typed; the agent proposes owners, labels, causes, and commitment sets and executes nothing without a confirmed name. **Honestly stated:** the `is_ai_actor` regex labels self-identifying automation; it is not a lock |
| 2 | The Loop, every change | Lanes attach to the existing three beats; no new loop, no batch phase; a sprint is scheduled work inside Build (the hardening-pass precedent) |
| 3 | The spec is the hinge | Lane state rides the spec file (projection) and the ledger; requests are structurally *not* specs; sprints are windows over specs |
| 4 | DoR + vague-line test gate the front | `check_spec.py` unmodified; spec-ready is `check_spec` READY plus Product's recorded approval |
| 5 | Risk escalates up, never down | Tiers are proposed at triage and confirmed at `/sdlc-spec`; Data-raised specs inherit the parent tier as a floor; no verb lowers a tier |
| 6 | Checking ladder — mechanical BLOCKS, grader ADVISES, human DECIDES | CP3 records what the PR platform enforces; nothing here replaces CI, the grader, or non-author approval |
| 7 | Machines gate mechanical; humans own judgment | Illegal moves and missing preconditions exit 1; judgment calls (approve, accept, pass, carry) are human records; refusals (exit 2) only for structurally impossible things |
| 8 | Evals ARE acceptance criteria | Untouched; Dev-QA's "acceptance checks ticked" is advisory and scoped to `## Acceptance Checks` |
| 9 | Outcomes, never vanity | §8: commitment-shaped numbers, per sprint, with reasons; `FORBIDDEN_FIELDS` imports the scorecard list; no per-person aggregation exists in any JSON |
| 10 | Anti-patterns | Requests cannot skip Intent (anti-vibe); self-approval is labelled debt (anti-self-grade); additive (nothing cut); per-change (anti-batch); one lane per verdict, one spec per child (anti-sprawl) |

## 8. Metrics policy

| Shown (per current sprint unless noted; "no data" when empty) | Refused (and how) |
|---|---|
| Commitment outcomes for **this sprint**: committed, kept (reached `done_at`), carried, descoped, added, plus "unrecorded additions" — each carried/descoped row names the human and the reason | **Velocity, points, estimates, effort, hours, capacity-in-points** — `board_model.FORBIDDEN_FIELDS` (imports `scorecard.FORBIDDEN_TYPES`); any write with such a key exits 2 with the scorecard's refusal text |
| Lane queue numbers: items waiting per review lane, oldest and median wait in business days; HIGH-risk wait on its own line | **PR count, commit count, LOC** — never computed |
| Turnaround tripwire breaches per lane (only when `team.yaml` has a target; otherwise "no target set") | **Any per-person aggregation or ranking** — no `--by-person` flag exists; a test asserts no counts block is keyed by `by`/`owner`/`next_owner`/`developer` |
| Bounces by root cause (the intent-quality signal; also fed to `scorecard` as `spec_bounced`) | **Cross-sprint trend of kept/carried counts** — "items per sprint is velocity with the points removed"; the only cross-sprint numbers are carry-over recurrence per spec and `scorecard.py`'s own outcomes |
| Handoff health: unacknowledged handoffs and age; `notified: none` count | **"% complete"** as a sprint number |
| Governance health: legacy specs, waivers used, `unverified: author-self-approval` count, backup approver used / not configured | **Fabricated zeros** — `_median([])`/`_rate(_, 0)` → `None` → "no data"; an absent ledger renders "no board events recorded" |
| Holding-area health: requests held, awaiting owner (age), promoted, declined | **AI-productivity claims** in any client material |
| WIP vs cap (global from `track_specs --wip-cap`, per lane beside it) and the existing scorecard outcomes — surfaced, not duplicated | — |

Client steering material gets a per-sprint **text** section (kept / carried / descoped with reasons), never a chart, never a trend, never a target.

## 9. Who uses what — command × discipline

P = primary, S = secondary, – = not involved. New or touched entries in bold.

| Command | Prod | Data | Design | Eng | Bizreq |
|---|:--:|:--:|:--:|:--:|:--:|
| **`/sdlc-refine`** (agenda, capture, assign, promote, review, authorize, `--upstream`) | **P** | S | S | S | S |
| **`/sdlc-refine validate --lane eng`** | S | – | – | **P** | – |
| **`/sdlc-refine validate --lane data`** | S | **P** | – | S | S |
| **`/sdlc-sprint`** (board, open, commit, close) | **P** | S | S | **P** | S |
| **`/sdlc-sprint move / verdict / return / ack`** (build side) | S | **P** | S | **P** | – |
| **`/sdlc-sprint verdict --lane product\|eng\|data`** (Dev QA) | **P** | **P** | S | **P** | S |
| `/sdlc-spec` *(unchanged)* | P | S | S | P | S |
| `/sdlc-feature` *(unchanged; feeds candidates)* | P | S | S | S | S |
| `/sdlc-status` (+board and sprint lines) | P | S | S | P | S |
| `/sdlc-retro` (+carry-over and bounce sections) | P | S | S | P | S |
| `/sdlc-next` (+board completeness line) | P | S | S | P | P |
| `/sdlc-doctor` (+controlled-period posture check) | S | – | – | P | – |

## 10. Rollout — value first, one purpose per increment

| Inc | Ships | Value even if we stop here | Version |
|---|---|---|---|
| **1 — Lane machine, ledger, board view** | `board_model.py` (lanes, transitions, labels, routes, coarse map, forbidden fields, `ts_to_date`, `set_frontmatter`), `board.py` `board / move / verdict / return / ack / card`, `board-events.jsonl`, `templates/team.yaml`, nine optional keys in `templates/phases/build/spec.md`, `commands/sdlc-sprint.md` (board + build-side verbs), `references/board-model.md`, `track_specs` `by_lane`; **fix the `project-retrospective.md` velocity row now** (it contradicts a shipped rule today); this proposal committed; registration (SKILL, README, docs/commands, docs/scripts, CLAUDE.md counts, CHANGELOG, plugin.json + marketplace.json) | Every spec shows where it is across Product/Eng/Data with a named next owner and a five-part handoff record; CP1/CP3/CP4 are named-human records; rework is routed by root cause; legacy specs are folded and labelled; the phase spine untouched | 1.6.0 |
| **2 — Holding area + `/sdlc-refine`** | `board.py` `capture / assign / promote / decline / ladder`, `templates/phases/build/request.md`, the four ladders, `commands/sdlc-refine.md` (agenda, review, authorize, validate, `--upstream`), `multi-reviewer.md` single-spec paragraph, review path `.sdlc/artifacts/build/reviews/`, `spec_bounced` feed, controlled-period deny-lines text + `/sdlc-doctor` posture check, cadence-plan Mon/Wed/Fri row, build-loop.md "run Intent triage with /sdlc-refine" | Stages 0–5 run in the plugin: no raw request reaches `specs/` except by a named-human promote; Product approval, board authorization, and parallel Eng/Data validation each have a checkable ladder and a recorded decision; the Mon/Wed/Fri agenda renders itself; "phases are locked" is answered by `--upstream` | 1.6.0 |
| **3 — Sprint window + session/status lines** | `board.py` `open / commit / add / carry / descope / close / export`, `templates/phases/build/sprint.md`, commitment outcomes, `track_specs` `by_sprint`, `/sdlc-status` additive lines, `[SDLC-SPRINT]` in both hook twins **with the retired section-handoff block removed** and the **first session-start hook test** (bash always, pwsh when present, CRLF-normalised), `docs/hooks.md` contract | Real two-week sprints with a human-committed, frozen commitment and honest outcome accounting; the sprint visible at session start and in the dashboard | 1.6.0 |
| **4 — ADO twin under the controlled period** | `board.py reconcile --ado-csv` (read-only diff), `export` column order pinned, ADO state-model paste table in `references/board-model.md`, `docs/integrations.md` ADO Boards section, **kit issue** to restrict the ADO MCP server's domains / deny `wit_*` create-update tools and `az boards` (harness is generated — the fix lands upstream) | ADO stays manual as the model requires, but work items are never hand-typed from memory and local-vs-board drift is detectable | 1.7.0 |
| **5 — Retro, per-lane context, doc reconciliation, optional facilitator** | `retro_report.py` sections, `/sdlc-sprint me` + `.sdlc/local/lane.yaml` + `[SDLC-LANE]`, `/sdlc` "Your lane" block, `agents/flow-facilitator.md` (Read-only), the §13 leftovers | Retro+ gets pattern inputs (never people); a Data lead sees Data's reminder instead of the build mantra; the plugin stops contradicting itself about sprints and velocity | 1.7.0 |
| **6 — (optional, owner decision) Epic tracks + cross-repo board** | `scripts/tracks.py` + `.sdlc/tracks.yaml` + `/sdlc-refine epic` (re-gate via `check_gates.py --phase`, frozen-layer supersede + `validate_frozen_layer.py`, human-confirmed `track_artifacts.py --snapshot`); `board.py board --also-repo <path>` keyed by `(repo, spec)` | A new epic can be taken through Requirements/Design-shaped work while the engagement stays in Build with gates and frozen layers kept honest; the three repos read as one board | 1.8.0 |

Each increment is an additive, independently tested PR. Inc 1–3 ship together as 1.6.0.

## 11. Backward-compatibility ledger

- **Unchanged (byte-for-byte):** `check_spec.py`, `check_gates.py` (7 gates), `section-evaluator`, `harness/**` (generated; CI `sync-check`), `phase_model.py`, `phase-registry.yaml`, `advance_phase.py`, `/sdlc-coach`, `/sdlc-spec`, `new_spec.py`, `scorecard.py`, `generate_status.py`, `.sdlc/state.yaml` schema, the single-change guardrail, the coverage bar.
- **Touched, additive & backward-compatible:** `track_specs.py` (`by_lane`, `by_sprint`; legacy output byte-identical), `retro_report.py` (two sections), `doctor.py` (one check), `agents/multi-reviewer.md` (one paragraph), `commands/sdlc-status.md` / `sdlc-next.md` / `sdlc-retro.md` / `sdlc.md` (additive reads), `hooks/sdlc-session-start.{sh,ps1}` (one line added, the retired block removed), `templates/phases/build/spec.md` (optional keys), `templates/phases/03-foundation/cadence-plan.md`, `templates/phases/09-monitoring/project-retrospective.md`, `references/team-model.md`, `phases/build-loop.md` (prose), docs and registration files.
- **New:** `commands/sdlc-refine.md`, `commands/sdlc-sprint.md`, `scripts/board_model.py`, `scripts/board.py`, `templates/phases/build/request.md`, `templates/phases/build/sprint.md`, `templates/team.yaml`, `references/board-model.md`, `.sdlc/metrics/board-events.jsonl`, `.sdlc/requests/`, `.sdlc/sprints/`, `.sdlc/team.yaml`, tests (§14); later: `agents/flow-facilitator.md`, `scripts/tracks.py`.
- **Migration:** zero. Specs without `lane` are legacy and behave exactly as today; `status` stays their only truth. The first `board.py` write on a spec inserts the keys and proves `check_spec`'s verdict is unchanged.

## 12. Risks & open questions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Controlled-period leak through the installed harness.** The ADO pack merges `@azure-devops/mcp` (work-item create/update tools) into the client `.mcp.json` and leaves `Bash(az devops invoke:*)` under `ask`. An agent running `/sdlc-refine authorize` could create the work item itself and paste the id. A grep test over the new scripts cannot see this surface | **Critical** | Treat the controlled period as a **permissions posture**: (a) kit-side, restrict the MCP server's domains or add `deny` rules for `mcp__azure-devops__wit_*` create/update and `Bash(az boards:*)`; (b) until the kit ships that, `/sdlc-refine authorize` prints the deny lines for the target repo's `.claude/settings.local.json`; (c) `/sdlc-doctor` FAILs when `board.intake: manual` but those tools are reachable; (d) say plainly in `references/board-model.md` that the script-level grep test does not cover MCP |
| R2 | **`harness/spec-template.md` cannot be edited here** — it is generated from the kit; CI `sync-check` fails on any byte drift and the golden tree pins the installed file set | Critical (if attempted) | Drop every "template symmetry" option; insert keys on first write; note that `test_spec_templates.py` requires only `spec/name/risk/harness_context` per template |
| R3 | `parse_frontmatter` truncates at `#`; `PLACEHOLDER_RE` scans frontmatter | High | Frontmatter holds enumerations/ids only; writer refuses `#`, quotes, `\n---`, and placeholder tokens; round-trip test (write → parse → equal); ADO ids are digits only |
| R4 | `is_ai_actor` is a name regex and the agent runs the script — "refuses AI" is labelling, not prevention | High | State it honestly; corroborate CP entries with out-of-band evidence in the ledger (PR approval URL, work-item id, commit author of the ledger change); make the roster the positive allowlist for CP1; `pipeline:<ref>` is an explicit `actor_kind`, not a regex pass |
| R5 | **Team of one deadlocks at CP3** under a hard non-author refusal — your own dogfooding engagement is that case | High | Record and label (`unverified: author-self-approval` = debt in board and Retro+), never refuse; the PR platform's non-author rule remains the real enforcement |
| R6 | Three writable sources for one fact (`status`, `lane`, ledger) while `build-loop.md:114` still tells humans to move `status` by hand | High | One writer, write-through; frontmatter first then ledger; DRIFT reported, never auto-repaired; legacy specs exempt; prose rule "governance moves happen on the main/product branch" |
| R7 | `track_decisions.parse_iso_date` is date-only; ledger `ts` are datetimes — every wait would read "unparseable" | High | `board_model.ts_to_date` adapter; tests use real ledger `ts` strings; report footer notes the helpers ignore public holidays |
| R8 | The installed `specs/spec-template.md` is counted by `track_specs` as a phantom draft and could be rewritten | High | The new scanner/writer touches only `^\d{4}-` files; test that the template is never listed or written; propose the same additive filter for `track_specs` |
| R9 | Hook fallback `pwsh … \|\| bash …` double-prints on any `.ps1` error; no hook test exists; 10 s shared timeout; CRLF on Windows CI | Medium | `try/catch` + `exit 0`; grep-only lines; first `test_session_start_hook.py` normalising `\r\n`; retire the section-handoff block in the same change |
| R10 | WIP cap semantics: prose says per Orchestrator, `track_specs` enforces globally; parent + Data child specs double-count | Medium | Show global and per-lane WIP side by side; per-lane caps optional in `team.yaml`; never block |
| R11 | Cross-repo boards collide on spec ids and drift on auto-allocated sprint ids | Medium | Sprint id human-typed at `open`; any fold keyed by `(repo, spec)`; deferred to Inc 6 |
| R12 | `test_command_contracts` skips a script whose `--help` exits non-zero and only checks fenced `uv run … scripts/*.py` lines | Medium | Self-test that `--help` exits 0 for every verb; every verb gets a fenced example; flat verbs; no filesystem work before argparse |
| R13 | Two live template shapes (plugin: `channel`, no `owner`; harness: `owner`, `## Evals`, no `channel`) plus hand-written specs without `status:` | Medium | Insert after `status:` when present else after `---`; never repurpose `owner`; test all three shapes for verdict stability |
| R14 | Forbidden-word tests fail today on Phase-1 templates (`epics.md`, `user-stories.md` carry `**Estimate:** [Story points or T-shirt size]` and `Total estimate: [N points / days]`) and `docs/templates-artifacts.md:506` | Medium | **Owner decision** (§15 D14): retire to "Relative size: [S/M/L] (planning input only — never reported)" or allowlist explicitly before the test lands |
| R15 | No single-spec review path exists today (`/sdlc-review` and `multi-reviewer` are phase-directory scoped; `record_findings` has no `spec` field) | Medium | Plan the one additive `multi-reviewer.md` paragraph honestly; spec id travels in the finding `target`; do not claim zero agent edits |
| R16 | Two trees in the workspace (outer 0.2.0 checkout vs nested 1.5.1 clone); the draft is untracked | Medium | Build target is the nested repo on a branch off `master`; first commit is this proposal; run the suite from the nested `scripts/` project only |
| R17 | Registration tests go red on a two-command release (`docs/commands.md:723` "Fifteen commands…" word must match; every command must appear in `docs/commands.md`; `docs/hooks.md:106` line count; CLAUDE.md prose counts; CHANGELOG heading = both manifests) | Low | Follow the 1.5.x checklist; run `test_registry_docs_consistency` and `test_release_manifest_agreement` first |
| R18 | Standalone mode creates a half `.sdlc/` that other commands misread | Low | Detect workflow mode by `state.yaml` presence (the `/sdlc-channel` rule), never by `.sdlc/` alone |
| R19 | Ceremony fatigue: 14 states and named verdicts are more than a small pod will type | Medium | Commands offer only the legal next moves with pre-filled labels; `lane: ""` is fully supported (a team may adopt CP1/CP2 only); the board must earn its keep in Inc 1 before sprints land |

## 13. Leftovers to reconcile (docs and templates that contradict the layer or the metrics rule)

| File : line | Today | Change | Inc |
|---|---|---|---|
| `templates/phases/09-monitoring/project-retrospective.md:105` | `Sprint velocity (avg) \| [N] points/sprint` | `Sprint commitment outcomes \| kept / carried / descoped per sprint, with reasons (from /sdlc-sprint close)` | **1** (contradicts `FORBIDDEN_TYPES` today) |
| `docs/integrations.md:200` | "there is no sprint plan; the spec backlog *is* the build order" | "the spec backlog is the build order; a sprint is a time-boxed commitment overlay on that order (`/sdlc-sprint`), never a second backlog or a reordering" | 3 |
| `docs/state-machine.md:402, 466`; `docs/templates-artifacts.md:628`; `templates/phases/build/session-handoff.json:7` | `current_sprint` in the retired section-plan model | remove; point at `.sdlc/sprints/` | 3 (with the hook block retirement) |
| `hooks/sdlc-session-start.sh:169-224`, `.ps1:158-192`; `docs/hooks.md:106, 113-120` | retired section-handoff summary; "up to four additional lines" | remove the block; update the line contract | 3 |
| `phases/build-loop.md:114, 125, 151-153` | status by hand; "Intent triage … replaces refinement"; Leaving the Loop | governed specs' `status` is written by `board.py` (hand edits = DRIFT); "run it with `/sdlc-refine`"; sprints are windows inside Build, the declaration is release-scoped | 2–3 |
| `templates/phases/03-foundation/cadence-plan.md:10-25` | four cadences; WIP cap "per Orchestrator" | add Mon/Wed/Fri review, sprint length, turnaround; note the cap is enforced globally by `track_specs --wip-cap` | 3 |
| `SKILL.md:200` | "Section review & sprint plan … sprint timeline" | "Section review / spec backlog order" | 5 |
| `scripts/map_deep_plan_artifacts.py:358-359` | "[Assign during sprint planning]" | "[Assign at /sdlc-sprint commit]" — **do not touch `:226`** (`"sprint"` is a detection keyword) | 5 |
| `templates/phases/03-foundation/section-plans/SECTION-template*.md:5` | `**Sprint(s):** Sprint [N] – Sprint [M]` | "Sprint window: [SNN] (set at /sdlc-sprint commit; blank until committed)" + a comment that section plans are not the Build backlog | 5 |
| `templates/phases/01-requirements/epics.md:35,58,79,96,105,114`; `user-stories.md:34,57,78,95,104,113` | `**Estimate:** [Story points or T-shirt size]`, `Total estimate: [N points / days]` | owner decision D14 | 5 |
| `docs/templates-artifacts.md:313, 506` | "sprint targets"; "estimated effort (S/M/L/XL)" | reword / allowlist per D14 | 5 |
| `templates/phases/02-design/phase3-handoff.md:27,70`; `07-documentation/phase8-handoff.md:39`; `08-deployment/phase9-handoff.md:67` | "sprint N" prose | use the `SNN` id form | 5 |
| `references/team-model.md` | five disciplines, RACI | add lane vocabulary; state that phase-level sign-offs (`state.yaml sign_offs`) and item-level control-point records (the ledger) are two records by design | 2 |
| `docs/state-machine.md` Rule 4 / `references/validation-rules.md` Override Protocol | documented, never implemented | leave; flag as a separate cleanup (implement in a sibling script or retire) | — |
| `docs/commands.md:723`; `CLAUDE.md:9-10`; `docs/hooks.md:106` | "Fifteen"; 26 commands / 13 agents; four lines | "Seventeen"; 28 / 13 (14 after Inc 5); updated line contract | 1 |
| `harness/packs/cicd/azure-devops/{mcp,settings}.fragment.json` | MCP work-item tools merged; `az devops invoke` under `ask` | not a doc leftover — **kit issue** (R1) | 4 |

## 14. Test plan

Run: `uv run --project scripts python -m pytest scripts/tests/ -q` from the nested repo.

| Test file | Covers |
|---|---|
| `test_board_model.py` (new) | every `TRANSITIONS` edge has a `HANDOFF_LABELS` entry and a `COARSE` mapping; illegal moves rejected with the legal list; `REWORK_ROUTES` matches §5.4 (parametrised); CP1 refuses missing work item / off-roster approver with roster / labels "unverified" without roster; CP2 and CP4 derivation (incl. Data `n-a` with reason, one person several roles note); CP3 self-approval labelled not refused; `FORBIDDEN_FIELDS ⊇ scorecard.FORBIDDEN_TYPES`; `ts_to_date` on real ledger timestamps; `set_frontmatter` refuses `#`/quotes/placeholders and round-trips through `check_spec.parse_frontmatter`; commitment outcomes incl. unrecorded additions; "no data" never 0 |
| `test_board.py` (new) | dual-mode (`--repo` bare tmp repo and `--state` via `conftest.state_yaml`); exit codes 0/1/2 per verb; frontmatter insertion on all three legacy shapes leaves the body byte-identical and `check_spec` verdict unchanged; write-through `status`; DRIFT detection on hand edits; partial-write → DRIFT + exit 1; `specs/spec-template.md` never listed or written; requests never under `specs/`; `promote` calls `new_spec.create_spec` with `source=REQ-NNNN`; one active sprint; `commit` refuses below `on-board` and any forbidden field (exit 2); `close` derives outcomes; report JSON has no actor-keyed counts block; `card`/`export` column order pinned; `reconcile` read-only; `state.yaml` byte-identical before/after every verb; `--help` exits 0 for every verb |
| `test_no_board_automation.py` (new) | grep of `board.py`, `board_model.py`, both command docs, templates, and `references/board-model.md` for `az boards`, `wit_`, `azure-devops` MCP tokens outside the documented "never" sentences; `team.yaml board.intake: automated` → exit 2 |
| `test_no_activity_metrics_in_layer.py` (new) | `points\|velocity\|estimate\|burndown` appear in the new templates and report format strings only inside the quoted "Never tracked" sentence; pre-existing Phase-1 `Estimate` lines handled per D14 |
| `test_session_start_hook.py` (new) | bash twin always, pwsh when present: `[SDLC-SPRINT]` appears iff an active sprint file exists; retired handoff block gone; prior lines byte-identical after `\r\n` normalisation; a malformed sprint file produces no error and no double print |
| `test_track_specs.py` (extend) | `by_lane`, `by_sprint`; legacy output byte-identical |
| `test_retro_report.py` (extend) | carry-over recurrence and bounces sections; `has_data`; no actor key; exit 0 |
| `test_doctor.py` (extend) | controlled-period posture check |
| `test_spec_templates.py` (unchanged) | still green with nine `""`-default keys in the plugin template; the harness template untouched |
| `test_command_contracts.py`, `test_agent_references.py`, `test_registry_docs_consistency.py`, `test_release_manifest_agreement.py` (unchanged) | pick up the two new command docs, every flag against live `--help`, the `multi-reviewer` reference, the docs word count, and the version/CHANGELOG agreement automatically |
| Migration fixture | the outer workspace's `.sdlc/` + `specs/0001`, `0002` (`status: ready`, no `lane`) run as a solo pod: board shows them as legacy, first `move` inserts keys, CP3 self-approval is labelled, nothing deadlocks |

## 15. Decisions for you (recommended default first)

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| D1 | Source of truth for lane state | Spec frontmatter is the projection; the ledger is authoritative for control-point arithmetic | Ledger-only, lane derived at read time |
| D2 | Sprint membership | Only in `.sdlc/sprints/SNN.md`; `by_sprint` derived from it | A `sprint:` key on each spec (more churn, merge conflicts on feature branches) |
| D3 | `status` on governed specs | Write-through from the coarse map by `board.py`; hand edits reported as DRIFT; legacy specs untouched | Keep `status` independent with an advisory mismatch line |
| D4 | CP1 approver when a roster exists | Refuse (exit 2) anyone outside Product lead/backup; "role unverified" when no roster; self-identifying automation always refused | Warn and record even with a roster |
| D5 | CP3 non-author rule | Record and label `unverified: author-self-approval` as debt (solo pods keep working) | Refuse (exit 2) — deadlocks your own dogfooding repo |
| D6 | Approving a NOT READY spec | Refuse unless a named human supplies `--waive "<name>: reason"` (ledgered) | Advise only |
| D7 | Data lane | Required until a named Data human records `n-a` with a reason (`data_impact: unknown` fails closed) | Optional until Product flags data impact |
| D8 | Sprint "done" | `approved-in-dev` (the model's milestone), per-sprint override to `merged` | `merged` |
| D9 | Sprint length and clock | 10 business days (`team.yaml`, weekend-aware), sprint id human-typed | 14 calendar days, auto-allocated id |
| D10 | Review turnaround default | **No default** — "no target set" until typed per lane in `team.yaml` (the model left it undefined) | 2 business days everywhere |
| D11 | ADO during the controlled period | Human-typed work-item id; `card`/`export` for manual paste; `reconcile --ado-csv` read-only; kit issue to deny `wit_*` create/update + `az boards`; `/sdlc-doctor` check | Allow a read-only `az boards work-item show` to verify the id |
| D12 | Commitment outcomes in client steering | Per-sprint text section with reasons; no chart, no trend, no target | Internal only |
| D13 | Agents | None in Inc 1–4; one optional Read-only `flow-facilitator` in Inc 5 | Ship a triager and a facilitator now |
| D14 | Phase-1 `Estimate` lines (`epics.md`, `user-stories.md`) | Retire to "Relative size: [S/M/L] (planning input only — never reported)" | Allowlist explicitly with a reason |
| D15 | Epic tracks (`.sdlc/tracks.yaml`) and cross-repo board | Defer to optional Inc 6 after one or two real sprints; `--upstream` routing ships in Inc 2 | Include tracks in Inc 3 |
| D16 | Release shape | 1.6.0 = Inc 1–3; 1.7.0 = Inc 4–5; names `/sdlc-refine` and `/sdlc-sprint` final | Minor per increment; `/sdlc-triage`, `/sdlc-board` |
| D17 | Build target | Nested `claude-code-sdlc/` (1.5.1) on a branch off `master`; outer `.sdlc/` as the migration fixture | — |

### The one open call — command surface

This adds **2 commands (28 → 30)** and, later, **1 optional agent (13 → 14)**. You flagged command-surface size as the one thing worth your judgment on the channel layer. The clean fold, if you want to hold at 29: make `/sdlc-refine` the only new command and expose the board/sprint verbs as `/sdlc-status --board` plus `/sdlc-refine sprint …`. I recommend **two commands**, because the model's Intent side (Product-owned) and its board side (Engineering/Data-owned) have different primary users, and the RACI in §9 stays legible only when they are separate.

## 16. Recommendation

Build **Increment 1 now** — the lane machine, the ledger, and the read-only board view are valuable standalone (every spec gets a named owner and a handoff trail; control points become records; legacy specs are folded and labelled) and they are the substrate everything else needs. Ship Inc 2 and 3 with it as 1.6.0 so the team gets `/sdlc-refine` and real sprints in one release. Fix the `project-retrospective.md` velocity row in Inc 1 because it contradicts a shipped rule today. Raise the ADO MCP kit issue (R1) in the same week — the controlled period is only as real as the permissions the harness installs. Gate Inc 6 (epic tracks, cross-repo board) on the team actually hitting the mid-Build-epic case in a real sprint.

## 17. Provenance

Grounded against the plugin's verified 1.5.1 surface (four read-only explorers over the phase model, spec backlog, command/agent conventions, and the outer workspace), three independent designs (additive overlay, board-fidelity twin, phase-model rethink), three judges scoring house-principles fit, operating-model fidelity, blast radius, phase-lock answer quality, and testability, and one adversarial critique whose findings are folded into §12 and §13 with file:line evidence. Personal names from the operating model are rendered as roles; the shipped templates carry neutral placeholders.
