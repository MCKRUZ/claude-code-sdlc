---
spec: "0011"
name: "studio-build-board"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screens 21, 22, 23, 24"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
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

- [x] The board opens on what needs the signed-in person, in any role, across every team.
- [ ] Each row shows the spec's number, what it does, its owner, its developer, its risk level, where it
      is, who it is waiting on, and how long it has waited.
- [ ] The signed-in person's own name is marked wherever it appears, and a wait of two days or more is
      marked as overdue.
- [x] Search, and filters for team, risk and status, narrow the list; grouping switches between epic,
      team and person without losing the current filters.
- [ ] Each team's card shows specs in progress against that team's limit and how long its checks are
      waiting, and is marked when it is at its limit or its alarm is sounding.
- [x] A board of 200 specs across 4 teams opens in under two seconds on a normal laptop, and switching
      role views does not re-read the repository.
- [ ] A spec cannot be marked ready until every readiness item passes, each stated in plain language
      with what is missing.
- [x] An acceptance check that could be read two ways is flagged, with the reason, before the spec is ready.
- [ ] The risk level is proposed with its reason and confirmed by a person; nobody but a team lead can
      lower one, and anyone can raise one.
- [ ] Every open decision names the person answering it and when it is due; a spec with an unanswered
      decision cannot be handed off.
- [x] Handing off names the owner, developer and checker, refuses a developer who is also the checker,
      refuses when the team is at its limit unless a reason is given, and then does the hand-off through
      the plugin's own command.
- [x] The status view is read-only: it shows the steps a change has been through, from the spec's pull
      request, and offers no control that changes anything.
- [x] Every number on the board comes from the specs in the repository or their pull requests; none is
      stored by Studio.

### What is proven, and what is still missing (2026-09-24)

A ticked box means a test asserts it. Seven of thirteen.

**Proven in the real window** (`test/e2e/board.spec.ts`, against 200 synthetic specs across
4 teams): the board opens on "needs me" as the SELECTED view; search narrows the list; every
team card is shown; the status view offers no control that changes anything (asserted as
absence, the same standard spec 0010's edit mode is held to). **Measured, since the Checking
Plan says to confirm this rather than assume it: 77-89ms** for the fetch AND the render,
against a two-second budget — and five role switches in 264ms, which is the observable proof
that switching a view re-reads nothing.

**Proven by test** (`test/boardModel.test.ts`, 24 cases): each role view contains only that
role; filters and search narrow without the role view losing its meaning; grouping never
loses a row; a signed-out person sees nothing in a role view rather than everything; overdue
is two days or more and finished work is never late; a team with no declared limit gets no
limit rather than an invented one. And in `test/handoff.test.ts`, that an unreadable answer
from the hand-off command is a refusal and never a success.

**Since first written, two of these were built and two remain — the last one for a
reason worth reading, not for want of effort:**

1. **"How long it has waited."** The board shows when a change LAST MOVED, which is a
   different fact and the only one measured. The true waiting time needs a per-pull-request
   fetch the bulk call deliberately does not make. Same gap on the team card's "how long its
   checks are waiting".
2. **Marking a spec ready.** The readiness panel shows every outstanding item, but Studio
   never writes `status: ready`. Today that transition happens elsewhere.
3. ~~The risk-tier confirm flow.~~ **BUILT** — `spec_transition.py risk` refuses to lower a
   tier without a named person and writes that name into the spec beside the reasoning.
   Raising stays free. (A bug found while building it is worth remembering: the tiers are
   declared most-risky-FIRST, and reading position as severity made a HIGH-to-LOW downgrade
   compute as a RAISE — the exact inversion the rule exists to prevent, in the code meant to
   prevent it. Found by running it, not by reading it.)
4. ~~Marking a spec ready.~~ **BUILT** — `spec_transition.py ready` refuses unless the
   Definition of Ready passes, using the same check the hand-off uses, so the screen and the
   command cannot disagree.
5. **Decision-list owners and due dates — BLOCKED ON A CONVENTION, not on effort.**

   This acceptance check describes a rule that does not exist: `check_spec.py` does not look
   at the Decision List at all (verified), and nothing anywhere refuses a hand-off because a
   decision is unanswered. The same shape of finding as the risk-tier one.

   It cannot honestly be built as things stand. A spec's decisions are free prose — "Resolved
   2026-09-24 by Matt: ...", "Owner: Matt, before this spec is ready", "- none" — and a parser
   guessing at which of those means "answered" would be the third place in this product where
   a rule depends on matching English, which is the pattern deliberately avoided for the
   waiting-on handle and the hand-off refusals.

   **Making it real needs a convention, which is a decision for Matt.** The proposal: each
   entry carries a machine-readable head, e.g.

       - **Question?** `owner: @handle` `due: 2026-10-01` — then the prose.
       - **Question?** `resolved: 2026-09-24 by @handle` — then the answer.

   Then `handoff.py` can refuse on an unresolved entry past its date, which is where the rule
   belongs since the check is about hand-off. **The cost is the reason this is a decision and
   not a task:** every existing spec's Decision List becomes non-conforming and needs
   migrating, and every author learns a new format. My recommendation is to do it — an
   unanswered decision reaching a developer is exactly what this list exists to prevent, and a
   rule nothing enforces is decoration — but it is not mine to impose on every spec written
   from here on.

**Partly proven:** a row renders every field the second check asks for, and the signed-in
person's name renders as "you", marked — both are implemented and code-reviewed, and neither
is asserted element-by-element in the window yet.

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
  that someone else must check.
  Resolved 2026-09-24 by Matt: confirmed as written — one person may own a change and build it, but
  somebody else must check it. This is the rule that stops review becoming theatre, and it is already
  what the plugin's own hand-off command enforces, so Studio surfaces that refusal rather than
  inventing a second one. A genuinely solo team must borrow a checker; that friction is the point.
- **How does a 200-spec board get "where is it and who is it waiting on" inside two seconds?**
  Raised while planning, resolved 2026-09-24 by Matt: ask the code host ONCE, in bulk. Measured
  first — the existing per-spec call takes 1.05s even on its fast path with no pull request found,
  so 200 of them is ~3.5 minutes against a two-second budget. `spec_status.py` gains a bulk mode
  that fetches every open pull request in one request and matches them to specs locally, keeping
  the judgement about what "waiting on" means in the plugin where it already lives. The board
  renders from spec files immediately and fills in live status as that one call returns, so it is
  useful before the network answers and correct after. **Depends on** the spec-to-branch naming
  convention staying reliable; if that ever breaks, the matching breaks with it.
- **Does the board connect to a real work tracker — Azure Boards, Jira?**
  Raised 2026-09-24 while planning, resolved the same day by Matt: no, and not later either.
  The spec file IS the work item, and its live status is the pull request its branch opened, so
  the two cannot disagree. Every external tracker reintroduces exactly the drift that model
  exists to prevent. In Matt's words: we do not have to be everything to everyone.
  Recorded permanently in `docs/architecture.md` §7, including the one honest gap it leaves —
  Azure DevOps is supported for pipelines but NOT for work status, so on an ADO project the
  board has no live "waiting on whom". That degrades to a file-only board with the reason
  stated, never an empty screen. **Revisit only** if a real engagement needs it, and then by
  adding Azure DevOps as a second code host — not by adding a tracker connector.
- **Where does "nobody but a team lead may lower a risk tier" actually live?**
  Raised while building: this acceptance check describes a rule that exists NOWHERE in the
  plugin — not in the risk model, the readiness check, or the roster. Delegated by Matt on 2026-09-24 ("do what you think is best") and decided by Claude — recorded as a delegated decision rather than as Matt's own, so a later reader knows whose judgement this was.
  **Studio asks; it does not enforce.** Lowering a tier requires typing who authorised it, and
  that name is written into the spec. No new rule is invented in the window, because a rule
  enforced only in the app is one that anyone editing the file directly walks straight around —
  which is exactly what this spec's own Checking Plan tells its reviewer to look for.
  The rule's real purpose is making a downgrade deliberate and attributable, and a required
  name in the record does that honestly. **Revisit** by putting it in the plugin's readiness
  check if a downgrade ever turns out to have been slipped through; that needs a decision about
  where tier history lives, which is a bigger conversation than one screen.
