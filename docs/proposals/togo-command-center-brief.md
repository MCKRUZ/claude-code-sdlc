# Tōgō Command Center — the brief

Owner's direction (2026-10-06): "a command center for the team". Not another polish round over the
screens-plus-sidebar app. The product reorganises around how a team actually works in the Build
loop — sprints, specs, hand-offs, verdicts, decisions — with the lifecycle as context, and it maps
one to one onto what the plugin and the IDD kit already do. Nothing in the UI computes status;
every number, state and order comes from a plugin script, and every write goes through a plugin
verb. Where a verb does not exist yet, the control is present, disabled, and says "arrives with a
newer plugin" — or the plan adds the verb (additively, tested, text and exit codes of existing
verbs unchanged).

## The five screens (mocked and agreed)

### 1. The sprint home — the command center (default while the project is in the Build loop)
- **Omnibar** (⌘K) across the top: plain words → plugin verbs ("pull 0005", "verdict 0002
  accepted", "hand 0006 to Sam", "defer 0003 to S08 because …"), each confirmed through the
  structured dialog so the plugin's refusal lands verbatim.
- **Lifecycle strip**: a thin Spine (nine stations, lit rail) with the Build loop station marked
  "Build loop · Nth sprint". Click/lean in → the lifecycle home (today's stage home, documents,
  sign-offs). Carries the "needs you · N" chip.
- **Sprint header**: id, goal, target specs, WIP cap n of cap, risk mix, end date, and a
  **business-day bar** (one segment per business day, done/today/left) from `sprint.py status`.
- **Filter + keys**: Mine / Team / All; keyboard `j`/`k` move, `↵` open, `h` hand off, `v` verdict.
- **Four lanes = the loop**: Ready (DoR admitted; "next up · deps merged · pull →" from the
  plugin's next_up), Building (n / WIP cap; cards carry PR, check count and the failing check by
  name from the code host; "hand-off ready"), Checking (verdict queue with the real wait in
  business days; amber only when the plugin's wait exceeds a business day), Merged (date,
  accepted-as-is). Cards carry id · name · risk chip · owner/builder/checker initials with a "you"
  marker. A hand-off baton sits on the lane edge between Building and Checking.
- **Today column**: "needs you" first (verdicts that are yours, hand-offs ready, decision clocks you
  own, tiers to confirm), each with one action; then "since yesterday" (merged, handed off, still
  waiting, decisions recorded) from loop events + code host; Claude's work as one line ("drafted
  …, N proposals waiting for a yes"); a "Standup notes" button that drafts from the stream.
- **In the room**: who holds what right now (roster + specs) — presence, never totals. Hover a
  person → their cards light.
- **Refining for S(n+1)**: not-ready specs with the exact DoR gap, tiers proposed by Claude
  awaiting a person, deferrals with their reason.
- **How it is going**: the steering scorecard reduced to the standard's numbers — accepted-as-is,
  review-wait median, rework, escaped bugs — "no data" where there is none. No velocity, points,
  PR counts or lines, ever.

### 2. Sprint planning
- Header: sprint id, dates and business days, goal (editable), WIP cap, last sprint's close line
  (deferrals with reasons carried in).
- **Refined backlog** (left): candidates ordered ready-first with DoR state, risk chip, tier
  confirmation state, depends_on, owner. Only a DoR-admitted spec can enter the slate; a not-ready
  one offers "refine in place →"; an unconfirmed tier offers "Confirm".
- **The slate** (middle): ordered by the plugin's build order; slots with builder/checker (and
  security signer for HIGH) pickers; the no-self-check rule enforced live; a risk-mix meter vs
  target and last sprint; "every HIGH needs a security pass and a named sign-off".
- **What the plugin says** (right): DoR verdicts, dependency order check, missing checker,
  unconfirmed tier; **Claude proposes** a slate with reasoning + "Apply proposal"; **Commit the
  sprint** runs the sprint verbs, writes `.sdlc/reports/sprint-S08-planning.html`, opens a
  decision-log item per unconfirmed tier.

### 3. The spec card, opened in place (the IDD loop made visible)
- Header: id, name, risk, type, channel, owner/builder/checker, path, PR.
- **Intent · Definition of Ready**: scope in/out, harness_context (the ONE reused pattern),
  acceptance checks with the vague-line lint offering a concrete rewrite (Claude proposes),
  eng/data review state, channel acceptance dimensions.
- **Checking ladder**: rungs set by the risk tier (CI, grader, correctness, non-author approval;
  security pass at HIGH or on a gated path; named sign-off), coloured by the code host, the
  failing rung naming its reason. "Raising a tier adds rungs for free; lowering is recorded
  against whoever decided."
- **Findings ledger**: findings with dispositions (OPEN / FIXED verified against a changed file /
  SPLIT / ACCEPTED_RISK signed by a person / POSTPONED); "seen N times across specs → promote to
  a permanent check".
- **Hand off** at the foot, disabled with its reason until the ladder allows; "one spec · one
  branch · one PR".

### 4. The lifecycle home (default outside the Build loop; reachable from the strip)
- The round-1/round-2 Spine as navigation: current station with its live fact, lean in to a
  station → its documents, decisions, people, sign-off. The Build station carries its spec
  constellation. "Needs you" and "Claude is working the <stage>" and "Decisions this week"
  columns as on the sprint home.

### 5. Sprint review / close and steering mode
- `sprint close` as a screen: outcomes in the standard's numbers, deferrals carried with reasons,
  decisions closed, a Claude-drafted review page for the steering committee.
- Steering mode: read-only presentation of the scorecard + narrative companions.

## Non-negotiables
- Honesty: every element names its source script/field; "no data" never a fabricated zero; no
  activity metrics; no per-person totals (presence is fine); no geometry/colour the plugin did
  not report; disabled controls always carry their reason.
- The plugin is the only source of truth; the renderer never spawns; the protected core
  (`check_gates.py`, `check_spec.py`, `scorecard.py`, `phase_model.py`, `new_spec.py`,
  `advance_phase.py`, `generate_status.py`, `harness/**`, `phase-registry.yaml`,
  `section-evaluator`, `/sdlc-coach`, `/sdlc-spec`, `templates/state-init.yaml`) is byte-for-byte
  unchanged; `sprint.py`/`doctor.py` keep existing text and exit codes (new verbs may be added).
- CSP unchanged; main chunk ≤ 800 KB; motion off under test and reduced motion; every canvas keeps
  a DOM twin; one live WebGL canvas; pinned tests (studio-upgrade-2.md §5) stay green or change
  only with recorded evidence.
- Lands on `feat/togo-overhaul`, then fast-forwards into `feat/studio-improvements` so PR #1
  carries it.
