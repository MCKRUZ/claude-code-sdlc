# /sdlc-refine — Refine the Sprint's Specs to Ready

Refine the specs slated into a sprint (or one spec) until each clears the Definition of Ready and its
independent Engineering and Data verdicts — the weekly Intent-triage ceremony made executable. With
no arguments it renders the **refinement agenda** for the Mon/Wed/Fri review: which slated specs are
NOT READY and why, which verdicts are pending and for how long, which `DL-NN` decisions are overdue.
It never approves anything itself, never assigns a tier, never answers a decision, and never edits
`check_spec.py`. Works inside an SDLC project or standalone against any repo with a `specs/` directory.

Refinement runs in **any phase** where specs exist — Foundation onward, and mid-Build for the *next*
sprint. A gap that lives in a Phase 1 or 2 artifact is fixed through `--upstream` without regressing the
phase. The lifecycle and the ready rule are in `references/sprint-model.md`.

## Instructions

1. **Resolve mode and repo root:**
   - **Workflow mode** (default): look for `.sdlc/state.yaml`; pass `--state .sdlc/state.yaml` to
     every script. The repo root is the directory containing `.sdlc/`; the Phase 0–2 artifacts under
     `.sdlc/artifacts/` are the context the specs are checked against.
   - **Standalone mode** (`--repo <path>`, or no `.sdlc/state.yaml` found): pass `--repo <path>`.
     There is no engagement context to check against — skip the upstream checks in step 5, say so in
     the agenda header, and run the DoR, vague-line, and verdict steps as usual. A bare `.sdlc/`
     directory without `state.yaml` is still standalone.
   - Examples show `--state .sdlc/state.yaml`; substitute `--repo <path>` in standalone mode.

2. **Determine the verb** from the arguments: *(none)* → agenda (step 3); `--spec <id|path>` → one
   spec (step 4); `--sprint SNN` → batch over the slate (step 5); `validate` → record a verdict
   (step 6); `--upstream --spec <id>` → the no-regression path (step 7).

3. **Agenda (default) — read-only composition, writes nothing.** Two reads:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/sprint.py status \
     --state .sdlc/state.yaml --json
   ```
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/track_decisions.py \
     --state .sdlc/state.yaml --json
   ```
   If the status JSON's `sprint` is `null`, say "no sprint — `/sdlc-sprint new` to open one" and
   render only the decisions block. Otherwise compose, in this order:
   - **NOT READY specs** — from `readiness.gaps`: per spec, its gap lines against the ready rule (DoR
     blocking findings, `status is draft`, `eng_review is pending`, `data_review is not recorded`,
     dependency cycle or unmerged dependency outside the slate). These are the meeting's work items.
   - **Vague-line hits** — for each NOT READY spec, run `check_spec.py` (step 4a) and list its
     ADVISE findings: acceptance checks that might be wishes rather than checks.
   - **Verdicts pending** — `verdicts_pending` with `since_business_days` (reads `no data` when the
     spec was slated by hand and the ledger has no line). Flag any beyond the review-turnaround
     target if `cadence-plan.md` sets one; otherwise print `no target set`.
   - **Handoffs unacknowledged** — `handoffs_open` with the owner and the age.
   - **Overdue decisions** — the decisions JSON's open items past the 2-business-day clock, owner
     and due shown; note which touch a slated spec (the spec id appears in the decision text).
   - **Next review** — if `.sdlc/artifacts/*/cadence-plan.md` names the review days (the
     Cross-functional review row, e.g. Mon/Wed/Fri), print the next one: `next review: Wed`.
     Otherwise omit the line.
   Every empty block reads `no data`. Nothing here is a verdict — the agenda tells the room where to
   spend the 30 minutes.

4. **`--spec <id|path>` — refine one spec.** Resolve the id to `specs/NNNN-*.md`. Then:

   a. **DoR (the mechanical floor):**
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/check_spec.py \
     --spec specs/NNNN-name.md --state .sdlc/state.yaml
   ```
   When the spec binds a `channel:`, run the advisory channel lint beside it (exit 0 always; it never
   changes the READY / NOT READY verdict):
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/check_channel.py \
     --spec specs/NNNN-name.md --state .sdlc/state.yaml
   ```

   b. **Vague lines.** For each ADVISE finding and each acceptance check, apply the vague-line test —
   *"Could two people build different things from this?"* — and **propose** a rewrite with a concrete
   value (a status code, a JSON body, a count, a path). Propose; do not silently rewrite.

   c. **Silent decisions.** Surface every unwritten product choice (fail open or closed? what does a
   blocked user see? which record wins on conflict?). A choice local to this spec goes on the spec's
   **Decision List**; a choice that spans specs or phases goes to `.sdlc/decision-log.md` as a
   `DL-NN` row (owner + 2-business-day clock; create the file from
   `templates/phases/01-requirements/decision-log.md` if missing) and is cited from the spec's
   Decision List by id.

   > **HITL GATE:** Use `AskUserQuestion` for every decision: "Who owns `DL-NN` — <name>? Due
   > <today + 2 business days>." A decision without a named human owner is not recorded. The agent
   > never answers a decision.

   d. **Risk tier — propose, never assign.** Compare the spec's `risk:` with `risk-tier-map.md`
   (Foundation) and the taxonomy; state the proposed tier with one sentence of justification.

   > **HITL GATE:** `AskUserQuestion`: "I propose **<TIER>** because <reason>. Confirm or override?"
   > The Pod Lead owns the tier; challenges escalate **up, never down**. The tier sets the Checking
   > Plan depth mechanically, so `check_spec.py` re-runs after any change.

   e. **Dependencies — propose `depends_on`.** Read the spec's Scope and Delegation Plan. When they
   name a file, contract, endpoint, table, or id that another slated spec **introduces**, propose
   `depends_on` on this spec (comma-separated spec ids, e.g. `0007,0009`). Check the slate with:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/track_specs.py \
     --state .sdlc/state.yaml --sprint S07 --json
   ```

   > **HITL GATE:** `AskUserQuestion`: "0012's Delegation Plan extends the claims table that 0007
   > introduces — record `depends_on: 0007`?" On yes, set the `depends_on:` frontmatter value to the
   > confirmed ids only (spec ids, comma-separated; never a `#`, a quote, or a placeholder — the value
   > is read by `check_spec.parse_frontmatter`). On no, leave it as it is.

   f. **Hand the edit to `/sdlc-spec --spec specs/NNNN-name.md`** — it owns the authoring pass and
   the DoR re-run until the spec reads `READY`. When it does, and only then:

   > **HITL GATE:** `AskUserQuestion`: "specs/NNNN-name.md is READY. Flip `status: ready`?" The
   > status field stays hand-moved: a human says yes, then the line is changed. No script writes it.

5. **`--sprint SNN` — batch mode over the slate** (the weekly Intent triage, one sitting).

   a. **Load the Phase 0–2 context once**, not per spec. Read, where present: the Foundation
   constitution and the frozen layers in `.sdlc/context/layers/`, `requirements.md`, `epics.md`,
   `business-rules.md` (with `golden-scenarios.md`), `design-doc.md`, `adr-registry.md`,
   `api-contracts.md`, `data/data-contract.md`, and `risk-tier-map.md`. Say which were found and
   which were absent — an absent artifact means that lens reads `no data`, not "no findings".

   b. **List the slate** and take every slated spec's path:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/sprint.py status \
     --state .sdlc/state.yaml --sprint S07 --json
   ```

   c. **Mechanical checks, every spec** — the same four each time:
   - DoR: `check_spec.py --spec <path>` (step 4a); channel dimensions via `check_channel.py` when
     `channel:` is bound.
   - `source:` ids resolve — each `FR-`, `BR-`, `EP-`, `US-`, `FE-`, `ADR-` id the spec cites exists in
     the loaded artifacts (the `artifact_lineage` id vocabulary); an id that resolves to nothing is a
     gap.
   - Cited upstream artifacts are not stale right now:
     ```bash
     uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/audit_artifacts.py report \
       --state .sdlc/state.yaml --json
     ```
     A spec whose `source` artifact appears in the stale list is refined against a moving target —
     flag it and route it to `--upstream` (step 7).
   - Tier vs `risk-tier-map.md`: a spec touching a HIGH-mapped area (auth, data, migrations, API,
     infra, AI behaviour, hard-to-undo) that declares a lower tier is proposed **up**.

   d. **Judgment lenses — spawn the `multi-reviewer` agent** via the Agent tool in council mode,
   **fanned out** across the slated specs (one invocation per spec, or per two or three small specs;
   run them in parallel). Give each the loaded Phase 0–2 context, the spec path, and this brief:
   design / ADR / API-contract contradictions, PII classification and the data contract, `BR-NN`
   coverage, and fit to the Phase 0 problem statement. Collect findings per spec, severity-tagged.
   The lenses **advise**; they never flip a verdict.

   e. **Render one agenda for the sprint** (the step-3 shape, plus the mechanical and lens findings
   per spec, HIGH-tier specs first). Then **walk the fixes one spec at a time** — steps 4b–4f per
   spec, in build order — so no spec is half-refined when the sitting ends. Record verdicts as the
   named leads give them (step 6).

6. **`validate --spec N --lane eng|data --verdict … --by <name> [--reason]` — the independent
   verdicts.** Engineering validates feasibility and the harness context; Data validates the data
   impact — **in parallel**, before anyone builds. "Ready" means both, not just the DoR.

   > **HITL GATE:** The verdict is the named lead's, given in their words. `AskUserQuestion`:
   > "Engineering verdict on 0007 — accepted, or returned with a reason?" The agent records; it does
   > not decide. `--by` must be the lead's name.

   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/sprint.py verdict \
     --state .sdlc/state.yaml --spec 0007 --lane eng --verdict accepted --by "<engineering lead>"
   ```
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/sprint.py verdict \
     --state .sdlc/state.yaml --spec 0007 --lane data --verdict n-a --by "<data lead>" \
     --reason "<why this spec has no data impact>"
   ```
   - `returned` sends the spec back to refinement **with the reason** (give one — the script records
     without it but warns; the agenda then shows the spec as NOT READY with that reason).
   - `n-a` is legal **only** from `--lane data` and **only** with `--reason` (exit 1 otherwise). The
     Data verdict is required until Data itself records `n-a`.
   - The verdict lands in `eng_review:` / `data_review:` and on the ledger; `sprint.py ready` reads it.

7. **`--upstream --spec N` — the no-regression path.** The gap is not in the spec but in a Phase 1
   or 2 artifact the spec builds on (a requirement, a business rule, an ADR, a contract).

   > **HITL GATE:** `AskUserQuestion`: "Which upstream artifact needs the change — `FR-012`, `BR-04`,
   > `ADR-004`, …?" Never guess the artifact.

   Then, in order:
   1. **`/sdlc-revise <id>`** — the owning discipline proposes the wording, a named human decides it,
      the change ledger and a `DL-NN` decision-log row record the why.
   2. **Re-gate that phase only** — dirty-tracking re-validates the changed artifact:
      ```bash
      uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/check_gates.py \
        --state .sdlc/state.yaml --phase 1
      ```
      Use the phase the artifact belongs to (`1` for requirements, `2` for design). This is a check,
      not a transition: `current_phase` **never moves**, and no frozen layer is rewritten here — if the
      re-gate shows a frozen-layer delta, the `.superseded` convention in `/sdlc-next` handles it the
      next time that phase's layer is regenerated.

      > **HITL GATE:** Show the re-gate result and ask before continuing: "Phase 1 re-gate PASS. Return
      > 0007 to refinement with `DL-NN`?"
   3. **Back to refinement** — the spec re-enters step 4 with its `DL-NN` link cited on its Decision
      List, so the next reader sees why the upstream moved.

8. **Report:**
   ```
   Refinement — S07 (Mon/Wed/Fri review)                        next review: Wed | (not set)
   Slate:      6 slated · 4 READY · 2 NOT READY
     0009      eng_review is pending, needs accepted (3 business days) · 1 vague line proposed
     0012      DoR: NOT READY (Scope out missing) · depends_on 0007 proposed (unconfirmed)
   Verdicts:   1 pending (0009 eng) | no data          Handoffs: 1 unacknowledged (0007 → <name>) | no data
   Decisions:  2 open · 1 overdue (DL-04, <owner>, due 2026-09-29)
   Upstream:   FR-012 revised via /sdlc-revise (DL-05) · Phase 1 re-gate PASS · current_phase unchanged
   Next: /sdlc-refine --spec 0012 · /sdlc-sprint ready --by <name> when the slate reads 6 of 6
   ```

## Arguments

- No arguments: the refinement agenda for the active sprint (read-only).
- `--spec <id|path>`: refine one spec (DoR, channel lint, vague lines, decisions, tier, dependencies,
  then `/sdlc-spec --spec`).
- `--sprint SNN`: batch mode — Phase 0–2 context loaded once, mechanical checks and the
  `multi-reviewer` council lenses over every slated spec, one agenda, fixes one spec at a time.
- `validate --spec N --lane eng|data --verdict accepted|returned|pending|n-a --by <name> [--reason]`:
  record an independent verdict (`n-a`: data lane only, reason required).
- `--upstream --spec N`: route a Phase 1/2 artifact fix through `/sdlc-revise` and a phase-scoped
  `check_gates.py --phase N`, never moving `current_phase`.
- `--repo <path>`: standalone mode — no `.sdlc/state.yaml`; upstream checks and the phase re-gate are
  skipped and the agenda header says so.

## Important

- The user runs `/sdlc-refine` — never `sprint.py`, `check_spec.py`, `check_channel.py`, or
  `track_decisions.py` by hand. The command owns the composition and every interview.
- **Agent proposes, named human decides** — the tier, each `depends_on`, each decision's owner, the
  flip of `status: ready`, and every verdict. The agent never approves anything itself, never assigns
  a tier, never answers a decision. A `--by` that reads as an AI or automation is refused (exit 2).
- **`status` is still hand-moved.** READY is a precondition for flipping it, not a trigger; no script
  writes it. `check_spec.py` and `check_gates.py` are byte-for-byte unchanged by this layer.
- **Never regress a phase.** `--upstream` changes the artifact through `/sdlc-revise`, re-gates that
  phase with `check_gates.py --phase N`, and returns to refinement — `current_phase` does not move.
  Neither this command nor `/sdlc-sprint` reads `current_phase` to decide whether it may run.
- **No activity metrics, no per-person numbers.** The agenda shows counts of specs, ages of waits in
  business days, and owners' names on the items they hold — never velocity, points, estimates, effort,
  hours, PR count, or lines of code, and nothing aggregated by person. Empty blocks read `no data`.
- **Advisory by construction.** The agenda, the lenses, and the channel lint never block; only the
  DoR's MUST findings are a floor, and they belong to `check_spec.py` exactly as before.
