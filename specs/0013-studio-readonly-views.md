---
spec: "0013"
name: "studio-readonly-views"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 20b, 24b, 24d"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "scripts/scorecard.py for the numbers and the harness's own pipeline files for the gate list — Studio restates, never recalculates"
created: "2026-09-19"
---

# Spec 0013 — Three views that explain, and change nothing

## Goal

Three read-only screens: what Foundation put in place when Build opens, how Build is going, and every
check a change must pass from check-in to production.

## Why

People are asked to trust a process they cannot see. These screens make it visible: what safety rails
exist and whether they were ever tested, how the loop is actually performing, and what will happen to
a change when it is pushed. They change nothing, so they can be shown to a client or an auditor without
risk, and they are the main answer to "why is this taking so long" being answered with evidence.

## Scope

### In scope
- Build opens: what Foundation delivered, each item naming the document it came from, who does what,
  and the first week's meetings
- The scorecard: work accepted as-is, rework, specs sent back, waiting times, the four delivery measures,
  and bugs that got through with which check should have caught each one
- Checks and gates: every gate the playbook installed, in the order a change meets them, what each does,
  whether it blocks, whether there is a recorded way past it, and whether it has ever been tested by
  being broken on purpose
- Exporting the scorecard for a steering meeting

### Out of scope
- Any control that changes anything on these screens.
- Calculating metrics in the app — every number comes from the plugin's scorecard.
- The feature-complete declaration — spec 0014.

## Acceptance Checks

- [x] Build opens lists what Foundation delivered, each item naming its source document and its location
      on disk, and the list is read from those documents rather than written into the app.
- [x] Every scorecard number comes from the plugin's scorecard output; the app performs no arithmetic on
      loop events of its own.
- [x] A measure with no recorded events reads "no data", never zero, and says what would produce data.
- [x] Velocity, story points, pull-request counts and lines of code appear nowhere, and the screen states
      that they are not measured and why.
- [ ] Waiting times are shown against the project's own alarm thresholds, and a measure over its
      threshold is marked.
- [x] Security-review waiting time is shown on its own line, never folded into the general figure.
- [x] Each bug that got through names the check that should have caught it and the proposed fix, ready
      for the weekly retro.
- [ ] The scorecard can be filtered to one team, and states which team it is showing.
- [x] Exporting produces a document containing exactly what is on screen, suitable for a steering meeting.
- [x] Checks and gates lists every gate the project's pipeline files actually contain — a gate the
      playbook ships but this project does not have is absent, and a gate present but not in the
      playbook is shown.
- [x] Each gate states what it does, when it runs, whether it blocks, and any recorded way past it.
- [ ] A gate that has never been tested by being deliberately broken is marked as not yet proven.
- [ ] Choosing a risk level, or a bug fix, dims the gates that would not run for that kind of change.
- [x] Nothing on any of these three screens writes to the repository or the code host.

### What is proven, and what is still missing (2026-09-25)

Ten of fourteen ticked. A ticked box means a test asserts it.

**Proven in the real window** (`test/e2e/board.spec.ts`): what Build inherited is read from the
documents and says so; a document Foundation did not produce is shown rather than quietly
omitted; a measure with nothing behind it reads "no data" and says what would produce some; the
security-review wait keeps its own line; the refused activity measures are stated as refused
WITH the reason; the gates screen names which guide describes them; and a gate the playbook
ships but this project does not run is shown as not protecting anything.

**Proven by test.** `test/scorecardExport.test.ts` (21 cases as of 2026-09-26, was 17) covers
the export's honesty rather than its formatting — a missing rate never renders as 0% or 0.0h, a
real count of zero still renders as a number, a bug nobody analysed says "not recorded" rather
than inventing a check, and the document shares its row list with the screen so the two cannot
describe the same measure differently. `scripts/tests/test_gate_inventory.py` (24 as of
2026-09-26, was 14) and `test_foundation_summary.py` (11) cover the read side, including the
distinction that matters most in both: "there are no gates" and "the guide could not be read"
are different claims, as are "Foundation delivered nothing" and "this could not be read".

**Re-audited independently, 2026-09-26, as part of the session-wide pass across specs 0008-0011:
all ten ticks and all four unticked checks hold up unchanged.** No stale checkmarks found here —
this spec's write-up was accurate before this pass and still is, aside from the two test counts
above having grown since it was last written. One nuance worth recording: check 8 ("filter to
one team") is correctly unticked — no team selector exists in `ExplainViews.tsx` and
`getScorecard()` takes no team argument — but `scorecardExport.test.ts` already has a `team`
option on the formatter and asserts it prints "team claims"/"every team" correctly. That's
scaffolding for the export layer only, not evidence the feature exists anywhere upstream; it
just means building the filter later starts from a formatter that already knows how to label one.

**Nothing writes.** Every one of these screens is read-only by construction — no write path
exists in the three components. The one exception is the export, which writes only where a
person pointed in a save dialog, and writes nothing to the repository or the code host.

**NOT BUILT — missing features, not merely unverified:**

1. **Waiting times against the project's own alarm thresholds, with an over-threshold measure
   marked.** The thresholds are read (they ride along in the cadence plan's table and reach
   the settings screen) but the scorecard screen does not compare against them. The comparison
   is small; what it needs is the live waiting time, which shares a root cause with spec 0011's
   "how long it has waited" — real elapsed time needs a per-pull-request fetch the bulk call
   deliberately does not make.
2. **Filtering the scorecard to one team.** The plugin's scorecard reports across the whole
   project; a per-team figure needs the scorecard itself to accept a team, which is a plugin
   change rather than a screen one. Deliberately not faked by filtering in the app — that
   would be Studio doing arithmetic on loop events, which this spec's second check forbids by
   name.
3. **A gate marked as not yet proven by being deliberately broken.** This is the decision
   flagged as the weakest of the seven taken on 2026-09-24: the answer comes from the
   Foundation proof document, which means it depends on somebody remembering to update a
   document after doing something else. Nothing reads that document yet. **Worth revisiting
   before building it** — if the source is going to go stale, a screen reporting from it will
   confidently say a gate is proven when it is not, which is worse than saying nothing.
4. **Choosing a risk level or a bug fix to dim the gates that would not run.** `risk_model.py`
   owns the ladder and could answer it; the screen does not ask yet.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** read-only, but it reports numbers people steer by and claims about which safety
checks exist. A wrong claim here is believed.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** the scorecard's output and its honesty rules — the app restates them
  and never softens a "no data"
- **Permissions:** build, test and read auto-allowed. No writes at all in this spec
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should check one screen against the raw
plugin output side by side, and confirm the gate list is read from the project rather than hard-coded.

## Decision List
- **Where does "has this gate ever been tested by breaking it" come from?**
  Confirmed as written: the Foundation proof document, which means a gate proven later by hand
  needs that document updated. Delegated by Matt on 2026-09-24 ("do what you think is best") and decided by Claude — recorded as a delegated decision rather than as Matt's own, so a later reader knows whose judgement this was.
  **Flagged as the weakest of these decisions.** It depends on somebody remembering to update a
  document after doing something else — the failure mode this whole product exists to remove.
  Taken anyway because the alternative is inventing a second record of the same fact, and two
  records of one thing is the drift problem in miniature. **Revisit** after the first engagement
  that proves a gate by hand: if the document went stale, this answer was wrong.
