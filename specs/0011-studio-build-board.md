---
spec: "0011"
name: "studio-build-board"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 21, 22, 23, 24"
channel: "ag-ui"
harness_context: "plugin specs 0001, 0003, 0005 and 0006 — Studio reads and writes specs only through those scripts"
created: "2026-09-19"
---

# Spec 0011 — The Build board and the spec screens

## Goal

A person can see every spec across every team, know what is waiting on them, write a spec until it is
ready, hand it to a developer, and watch where it got to — for a project with hundreds of specs.

## Why

Build is where most of the engagement's time goes, and its constraint is not writing code but knowing
what is waiting to be checked and on whom. A board that only works for twenty specs is a demo; this one
has to stay legible at two hundred across four teams, and has to keep the three roles distinct, because
confusing the person who owns a change with the person building it is what makes review theatre.

## Scope

### In scope
- The board: every spec, grouped, with search, filters and grouping by epic, team or person
- Role views: what needs me, what I own, what I am developing, what I check, and everything
- A summary of where all specs are, and each team's work in progress against its limit
- Writing a spec: the readiness checklist, risk level, scope, acceptance checks, open decisions
- Handing a spec to a developer, including the refusals when a team is at its limit
- The read-only status view of a handed-off spec
- Links out: Claude Code for building, the code host for checking

### Out of scope
- Building anything. Studio writes specs; Claude Code builds them; the code host checks them.
- The scorecard and the feature-complete declaration — specs 0013 and 0014.
- Any status Studio computes for itself rather than reading from a spec or its pull request.

## Acceptance Checks

- [ ] The board opens on what needs the signed-in person, in any role, across every team.
- [ ] Each row shows the spec's number, what it does, its owner, its developer, its risk level, where it
      is, who it is waiting on, and how long it has waited.
- [ ] The signed-in person's own name is marked wherever it appears, and a wait of two days or more is
      marked as overdue.
- [ ] Search, and filters for team, risk and status, narrow the list; grouping switches between epic,
      team and person without losing the current filters.
- [ ] Each team's card shows specs in progress against that team's limit and how long its checks are
      waiting, and is marked when it is at its limit or its alarm is sounding.
- [ ] A board of 200 specs across 4 teams opens in under two seconds on a normal laptop, and switching
      role views does not re-read the repository.
- [ ] A spec cannot be marked ready until every readiness item passes, each stated in plain language
      with what is missing.
- [ ] An acceptance check that could be read two ways is flagged, with the reason, before the spec is ready.
- [ ] The risk level is proposed with its reason and confirmed by a person; nobody but a team lead can
      lower one, and anyone can raise one.
- [ ] Every open decision names the person answering it and when it is due; a spec with an unanswered
      decision cannot be handed off.
- [ ] Handing off names the owner, developer and checker, refuses a developer who is also the checker,
      refuses when the team is at its limit unless a reason is given, and then does the hand-off through
      the plugin's own command.
- [ ] The status view is read-only: it shows the steps a change has been through, from the spec's pull
      request, and offers no control that changes anything.
- [ ] Every number on the board comes from the specs in the repository or their pull requests; none is
      stored by Studio.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it writes spec files and triggers hand-offs, but through the plugin's own commands,
and every change is a commit that can be undone. No personal data, no deployment.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** plugin specs 0001, 0003, 0005 and 0006 for anything to do with people,
  limits, hand-off and status — Studio may not compute any of these itself
- **Permissions:** build, test and read auto-allowed. Anything that writes a spec or calls the code host
  must be confirmed during development
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm the two-hundred-spec case
was actually measured, not assumed, and that no rule about who may approve is enforced only in the app.

## Decision List
- **What happens when someone is the owner, developer and checker of the same spec on a small team?**
  Written here as: allowed for owner and developer, refused for checker, with the refusal explaining
  that someone else must check. Owner: Matt, before this spec is ready.
