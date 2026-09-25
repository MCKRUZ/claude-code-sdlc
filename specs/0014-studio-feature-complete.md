---
spec: "0014"
name: "studio-feature-complete"
status: draft
type: feature
risk: MEDIUM
source: "SDLC Studio canvas — screen 24c"
channel: "ag-ui"
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "plugin spec 0002 for the deferred status, and scripts/generate_handoff_report.py for the hand-over document"
created: "2026-09-19"
---

# Spec 0014 — Declaring Build feature-complete

## Goal

A person can end Build: every spec that is not merged is either finished first or deferred with a
reason, each team lead confirms their own list, and the declaration produces the hand-over document
that starts the next stage.

## Why

Build has no final inspection, because every change was already checked on its own. What it has instead
is a decision, and the decision is only honest if nothing can be left unexplained: an unbuilt promise
that nobody wrote down becomes a surprise for whoever inherits the system. This screen makes the
unexplained case impossible.

## Scope

### In scope
- The state of the committed backlog: merged, in progress, not started
- For each spec that is not merged: finish first, or defer with a reason
- Confirmation by each team lead of their own team's list
- The hand-over document drafting itself as choices are made
- The declaration itself, and moving the project to the next stage

### Out of scope
- The contents of the hand-over document beyond the deferred items — the plugin's own generator
  produces the rest.
- Reopening Build after the declaration; late changes ride the loop one spec at a time as usual.
- Anything about the next stage.

## Acceptance Checks

- [x] The screen lists every spec that is not merged, grouped so a run of related ones can be handled
      together, with its team, state and risk level.
- [ ] Each one must be set to finish first or deferred; deferring requires a reason in the person's own
      words, and a suggested reason may be offered but never saved unedited by default.
- [x] Deferring writes the deferred status and the reason to the spec file, through the plugin, as a commit.
- [x] The declaration is refused while any spec is undecided, and says how many are left.
- [x] The declaration is refused while any spec is set to finish first, naming them and who is building each.
- [x] Each team lead confirms their own team's list; the declaration is refused until every team with a
      spec in the list has confirmed.
- [x] The person declaring is recorded by name in the hand-over document and in the commit.
- [x] The hand-over document is produced by the plugin's own generator, with the deferred items and
      reasons included, and the screen shows which of its sections are complete before declaring.
- [x] Declaring moves the project to the next stage in its own state file, through the plugin's command,
      and nothing else changes.
- [x] A spec that is deferred no longer counts towards any team's work in progress.
- [x] After the declaration the screen becomes read-only and states when it was declared and by whom.

### What is proven, and what is still missing (2026-09-25)

Ten of eleven ticked. The DECIDING half of this flow was always built and tested; the
RECORDING half now is too, which was the whole of what this note used to be about.

**Updated 2026-09-25, later:** all four gaps below are now closed or nearly so, and every
assertion is made against a real git remote by reading the file back out of a FRESH CLONE
(`test/deferReachesTheRepo.test.ts`, 18 cases) — reading the working copy only ever proved the
half that already worked. The stage advance is tested in BOTH directions: refused while the
gates are unmet with nothing changed for anybody else, and advancing for real once they are,
with a fresh clone showing who signed and when. Testing only the refusal would have been
indistinguishable from a feature that never works.

Deferring commits, so the deferral and its reason reach everybody rather than only the machine
that made the decision. A refused deferral commits nothing; deferring an already-deferred spec
makes no empty commit; and a write that succeeds while the save fails is reported as a failure
naming which half happened, not as a success.

The hand-over document is produced and saved after a declaration, through the plugin's own
generator. That gap's description was wrong about the cause: the generator already assembled
the deferred items and reasons, and checking before building found it — the missing half was
entirely Studio's, which never asked for it.

**A real bug came out of this, and it was not about either.** Producing the document, being
told it was saved, and then not finding it in the clone exposed that a pull recorded any file
that exists locally but not on the remote as the shared baseline — and `save()` pulls before
working out what changed. So NOTHING Studio created could ever reach the repository, in any
screen. Every existing test edits a file that was already there, which takes a different path,
which is why it had gone unseen. Fixed in the sync layer with its own regression test, plus a
control proving a file present on both sides is still treated as in step.

**Proven** (`scripts/tests/test_declare_complete.py`, 24 cases, plus three window tests): the
declaration is refused while any spec is neither merged nor deferred, naming each one and who
is building it; refused until every team with a spec confirms its own list, including a team
whose specs were all deferred; and a deferred spec drops out of its team's work in progress —
that last one verified by running the tracker, not by reading it. Every blocker is reported at
once rather than the first, and every one carries its items.

Also proven in the window: the declare button stays visible while it would be refused and
explains itself when pressed, and a suggested deferral reason is offered but never pre-filled.

**The four gaps, as they now stand:**

1. ~~**Deferring does not commit.**~~ **DONE** — see the update above. It was the most
   important of the four, and it is the one now closed.
2. ~~**The hand-over document is not produced.**~~ **DONE** — and this note was wrong about
   why. `generate_handoff_report.py` already assembled the deferred items and their reasons;
   checking before building found it. The missing half was entirely on Studio's side, which
   never asked the generator for anything. It is now produced and saved after a declaration,
   it refuses to overwrite a report somebody has edited (offered as a choice, never forced),
   and the screen states which of the three outcomes happened rather than only the good one.
3. ~~**Declaring does not advance the phase.**~~ **DONE.** The screen now runs the plugin's
   own `advance_phase.py` with the declaring person's name as the sign-off, as a separate and
   explicitly named act rather than something the declaration does on the way past. Studio
   still decides nothing: when the stage's gates refuse, the plugin's own output is shown
   whole, because somebody who has to fix a gate needs to know which one.
4. ~~**The declaration is not persisted.**~~ **DONE, via (3).** The state file carries who
   signed and when, so the declaration is a fact about the project — proven by cloning fresh
   and reading the name back. The screen now reads that record rather than the session, so
   reopening Studio on a project declared months ago states who signed it and when instead of
   offering to declare it again. Two things it refuses to invent: a time that was never
   recorded reads as "not recorded" rather than today, and a missing name says so, because
   rendering an empty one puts a blank signature line in front of somebody, which reads as
   signed. (That last one needed `generate_status.py` to report the signer, since the only
   alternative was Studio parsing `state.yaml` itself — a second reader of that file is a
   second thing to keep in step with the first.)

**The recorded time is now stated too.** Read back out of the project's record once the stage
moves, never printed from the current clock — until then the screen says plainly that nothing
is recorded yet and the declaration is "true on this screen and nowhere else". The NAME is read
back the same way rather than echoed from what was typed, so a person sees what was written
down rather than their own request reflected back. Both are keyed on the stage that JUST
completed rather than on Build by name: it is Build here, so naming it would have been right by
coincidence and wrong anywhere else — a test advancing a different stage is what surfaced that.

**The declaring name now reaches the hand-over document too.** The project's own RECORD always
beats the name Studio offers: the document is drafted at the moment of declaring, before the
stage has moved and recorded anything, so Studio supplies the name it is about to record and the
record supersedes it the instant one exists. Preferring the offer would let a delivered document
name somebody the project does not. The document says WHICH of the two it is showing, and prints
a fill-this-in slot when neither exists — a hand-over that admits it does not know beats one that
looks signed by nobody.

**Still open — one check, and it is a decision rather than more building:**

- The choice is modelled as defer-or-leave rather than an explicit finish-first-or-defer, so
  "I have decided to finish this" and "I have not thought about it" are indistinguishable to the
  plugin — which is why the refusal names both together. Closing it means adding a status to the
  spec vocabulary that every other part of the system reads, so it is a decision about how the
  process represents intent rather than a screen detail.

**Grouping: done.** The unmerged list is gathered by TEAM, which is the grouping this check is
actually about — each lead confirms their own team's list, so a lead working down a flat list of
everybody's specs keeps having to re-find which ones are theirs. Teams are ordered the same way
every read and specs keep their numbering within a team, because a list that reshuffles between
reads loses somebody's place at the moment it matters most. A spec with no team is gathered
separately and labelled as one nobody can confirm, rather than blended in where that would be
the one thing about it nobody notices. Risk is now shown alongside team and state.

**Still partly built:** the choice is modelled as defer-or-leave rather than an explicit
finish-first-or-defer, so "undecided" and "chosen to finish first" look identical to the plugin
— which is why the refusal names both together. Closing that means a new spec status, which is
a plugin change rather than a screen one.

**Why this matters more than the count suggests:** a declaration that is not recorded anywhere
is a conversation, not a declaration. Items 1 and 4 are what make it a fact about the project
rather than a state of somebody's window — item 1 is now done, so a DEFERRAL is a fact about
the project, and item 2 means the hand-over document is too. The declaration ITSELF still is
not, which is what item 4 (and, through it, item 3) remains for.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it advances the project's stage and writes several spec files, all recorded and
reversible. The real risk is a dishonest record rather than a technical failure, which the refusals
above address.

## Delegation Plan
- **Scope (file patterns):** the Studio application repository only
- **Context (pattern to reuse):** plugin spec 0002 for deferring and the plugin's hand-off generator —
  Studio never writes the hand-over document itself
- **Permissions:** build, test and read auto-allowed. Writing spec files and advancing the stage must
  be confirmed during development
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm each refusal path leaves
the project exactly as it was, including the specs already deferred in that sitting.

## Decision List
- **Who may declare Build feature-complete?**
  Confirmed as written: the project owner declares it, and each team lead confirms their own
  list first. Delegated by Matt on 2026-09-24 ("do what you think is best") and decided by Claude — recorded as a delegated decision rather than as Matt's own, so a later reader knows whose judgement this was.
  One name accountable for the declaration, several names accountable for its contents — which
  is the same shape as every other sign-off in this system.
- **Can a spec be deferred after the declaration?**
  Confirmed as written: no. Late work is a new spec. Delegated by Matt on 2026-09-24 ("do what you think is best") and decided by Claude — recorded as a delegated decision rather than as Matt's own, so a later reader knows whose judgement this was.
  "Feature-complete, except…" is how a declaration stops meaning anything. A new spec costs a
  few minutes and keeps the statement true.
