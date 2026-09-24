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

- [ ] Build opens lists what Foundation delivered, each item naming its source document and its location
      on disk, and the list is read from those documents rather than written into the app.
- [ ] Every scorecard number comes from the plugin's scorecard output; the app performs no arithmetic on
      loop events of its own.
- [ ] A measure with no recorded events reads "no data", never zero, and says what would produce data.
- [ ] Velocity, story points, pull-request counts and lines of code appear nowhere, and the screen states
      that they are not measured and why.
- [ ] Waiting times are shown against the project's own alarm thresholds, and a measure over its
      threshold is marked.
- [ ] Security-review waiting time is shown on its own line, never folded into the general figure.
- [ ] Each bug that got through names the check that should have caught it and the proposed fix, ready
      for the weekly retro.
- [ ] The scorecard can be filtered to one team, and states which team it is showing.
- [ ] Exporting produces a document containing exactly what is on screen, suitable for a steering meeting.
- [ ] Checks and gates lists every gate the project's pipeline files actually contain — a gate the
      playbook ships but this project does not have is absent, and a gate present but not in the
      playbook is shown.
- [ ] Each gate states what it does, when it runs, whether it blocks, and any recorded way past it.
- [ ] A gate that has never been tested by being deliberately broken is marked as not yet proven.
- [ ] Choosing a risk level, or a bug fix, dims the gates that would not run for that kind of change.
- [ ] Nothing on any of these three screens writes to the repository or the code host.

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
