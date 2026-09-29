---
spec: "0016"
name: "studio-chat-authoring"
status: in-flight
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: HIGH
source: "SDLC Studio canvas — Chat panel (spec 0008 deferral)"              # the story / REQ-id this spec realizes, or — if standalone
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "spec 0010's Claude-drafts-a-field mechanism — Electron main process pastes project content in as context, Claude proposes, the shape library applies the write — generalized from one field to a multi-turn conversation across a whole stage"
created: "2026-09-29"
---

# Spec 0016 — studio-chat-authoring

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
The chat panel drives a real, multi-turn conversation that authors a stage's documents as the
person talks — from a blank project with nothing started, to a stage ready to sign off — without
ever writing outside the shape-library path spec 0010 already proved safe.

## Why
A brand-new project in Studio shows a stage of empty documents and a chat panel that admits it
does nothing (`ChatPanel.tsx`, spec 0008's deliberate placeholder). Today the only way to actually
begin is to leave Studio and run `/sdlc` in a terminal — which defeats the reason Studio exists:
a front end nobody has to open a command line to use. This closes the one gap that makes Studio a
viewer of someone else's work instead of the place the work happens.

## Scope

### In scope
- `studio/electron/main`: a chat-turn driver that assembles phase context (`state.yaml`, the
  current `phases/NN-*.md`, the prior phase's handoff document, any in-progress document text) the
  same way spec 0010's single-field draft call already does, and turns each of Claude's replies
  into either a question shown in the chat or a proposed document/field write
- `studio/src/components/ChatPanel.tsx` and the transcript UI it needs: a real message list, an
  input, and a proposal card for every write — matching spec 0010's accept / edit / discard pattern
- Reusing, never replacing, spec 0010's document-write functions and the draft-audit ledger
  (`record_draft.py`'s log) for every proposed write, whatever its outcome
- The pre-Build foundation phases (0 Discovery, 1 Requirements, 2 Design, 3 Foundation) — the
  document-based stages Studio already renders as a stage home with a document list
- Starting a conversation on a stage with zero documents started, and continuing one on a
  partially-complete stage
- What the assistant asks, and in what order, is read from that phase's own `phases/NN-*.md` file
  at conversation time — never a second, hand-authored copy of that guidance living inside Studio
- The assistant opens the conversation itself. Landing on a stage that has at least one document
  not yet started puts the assistant's opening message in the transcript before the person has
  typed anything — nobody has to know to say "let's start" to begin

### Out of scope
- The Build loop and spec authoring via chat — a different surface (the Build board, spec 0011);
  a future spec if wanted
- Any filesystem or network access for the Claude process beyond what spec 0010 already grants —
  the CLI call stays isolated in its own empty directory with content pasted in by the main
  process, never run with the project directory as its working directory. This spec reaffirms
  spec 0010's isolation decision under a live conversation; it does not reopen it silently (see
  Decision List)
- Voice or any non-web channel — chat stays the `ag-ui` surface
- Multiple people in concurrent chat sessions against the same document
- Any write that reaches disk by a path other than the shape library

## Acceptance Checks
<!--
  Each check is testable and passes the vague-line test:
  "Could two people build different things from this line?" If yes, it is a wish, not a check.
  WISH:  "handle errors gracefully"
  CHECK: "a duplicate submission returns 409 with body { \"error\": \"duplicate claim\" }"
-->
- [ ] Opening a stage that has at least one document not yet started shows the assistant's opening
      message already sitting in the transcript, naming the stage and the specific document it is
      starting with — the person is never shown an empty chat box waiting for a first message from
      them.
- [ ] Answering the assistant's opening message continues that stage's interview — the assistant's
      next reply builds on what was just answered rather than repeating or restarting the opening
      question.
- [ ] Every proposed write appears in the chat as a proposal — naming the document and field it
      would change — before anything is written; the person must accept, edit, or discard it,
      exactly as spec 0010's single-field draft flow works.
- [ ] An accepted proposal reaches disk only through the shape-library write path spec 0010 built —
      never a second write mechanism — so a chat-authored document round-trips exactly like a
      manually-edited one.
- [ ] A discarded or edited-then-accepted proposal is recorded in the existing draft-audit ledger,
      with the same three outcomes spec 0010 defined (accepted / edited then accepted / discarded).
      Chat does not get a ledger of its own.
- [ ] The Claude process driving the conversation is given the project's contents only as
      pasted-in context assembled by Studio's main process; it is never run with the project
      directory as its working directory, and a test proves it cannot read or write any file the
      main process did not explicitly hand it.
- [ ] What the assistant asks, and in what order, comes from that phase's own guidance file
      (`phases/NN-*.md`), read at conversation time — not copied into Studio's own source — so a
      phase's requirements cannot drift between the terminal and the chat panel.
- [ ] Closing Studio mid-conversation and reopening the same stage leaves every already-accepted
      write in place and no partially-applied write exists on disk.
- [ ] Chat is available and useful on a stage whose documents are already complete — it answers
      questions about the existing content but does not restart the interview from the beginning.
- [ ] Editing a document that is signed off, via chat, goes through the same approval-required path
      spec 0010 built for the structured editor. Chat is not a way around an approval gate.
- [ ] Round trip: a full stage authored end-to-end through chat alone, with nothing touched in the
      structured editor, produces documents that pass the same completeness check as one authored
      by hand.

## Risk Tier
<!--
  HIGH | MEDIUM | LOW (must match the `risk:` frontmatter field). State why this tier.
  Challenges escalate UP, never down, without discussion. The Pod Lead owns the tier.

  HIGH   — auth/identity, payments, PII/client data, schema migrations, public API contract
           changes, IaC/pipeline changes, prompt/model/tool-definition changes, anything hard
           to undo. Triggers: tight permissions, full checking ladder, security pass, named sign-off.
  MEDIUM — new business logic, external integrations, changes to shared internal services.
           Triggers: standard permissions, grader + human Checker.
  LOW    — UI within existing patterns, copy, internal tooling, additive CRUD on established rails.
           Triggers: lighter review; grader + mechanical gates still run.
-->
**Tier:** HIGH
**Why this tier:** it writes the documents the whole engagement depends on — the same reason spec
0010 is HIGH — and it is the exact case spec 0010's own security decision flagged for revisiting:
giving the Claude process a live, multi-turn role in a person's first, blank-project experience,
where a proposed write is most likely to be accepted without a second look.

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **Scope (file patterns):** `studio/electron/main/chat*.ts` (new), `studio/src/components/ChatPanel.tsx`
  and its supporting renderer state — calling into spec 0010's existing document-write and
  draft-ledger functions only; no new write path.
- **Context (pattern to reuse):** spec 0010's per-field Claude-draft mechanism — pasted-in context,
  main-process-only CLI isolation, propose-then-apply through the shape library.
- **Permissions:** build, test, lint and reads auto-allowed. New dependencies need confirmation.
  Any change to what the Claude CLI process can reach on disk or network needs explicit
  confirmation, not just code review — this is the one thing this spec must not silently widen.
- **Gated paths touched:** none directly; the CLI-isolation boundary from spec 0010 is a named
  checkpoint in the security pass, not a gated path of its own.

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** HIGH — the full ladder.
**Specifics:** grader, correctness review, and a security pass that explicitly re-verifies spec
0010's CLI-isolation boundary still holds across a live multi-turn session (not just a single
draft call), plus a named human sign-off. The round-trip acceptance check above must be run as a
real end-to-end pass authoring a full stage through chat on a real project, not fixtures alone.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- **Does spec 0010's CLI-isolation decision stand for a live conversation, or does chat need the
  process to run inside the project directory to be faithful to the CLI's actual `/sdlc` behavior
  (skills, agents, hooks)?**
  Resolved 2026-09-29 by Matt: it stands. The Claude process stays boxed out of the project
  directory for the whole conversation, exactly as spec 0010 built it — Studio pastes in only
  what it explicitly chooses to hand over. Confirmed after walking the terminal-vs-Studio
  comparison directly: Matt already accepts this exposure at his own terminal as a deliberate,
  occasional, expert act, but Studio's chat is meant for people with no reason to expect that
  typing in a chat box could run code from disk — silently, on every turn. The same mechanism
  aimed at an audience that never agreed to it is the risk this spec exists to avoid, even though
  it already had one critical finding under the single-field version of this same call.
- **Does the chat transcript itself sync to the repo** (so a teammate opening the same project in
  their own Studio sees the conversation that produced a document), **or does it stay local-only**,
  like a pending draft does today?
  Resolved 2026-09-29 by Matt, accepting Claude's proposed default: local-only. Matches how a
  pending draft already behaves in spec 0010 — no change to spec 0009's sync model needed.
- **When a person free-types something the interview hasn't asked for yet, does the assistant
  follow it, or hold to the phase file's stated step order and redirect back?**
  Resolved 2026-09-29 by Matt, accepting Claude's proposed default: hold to the phase file's
  order and redirect back. Keeps one source of truth for "what to ask and in what order" —
  the phase guidance file — instead of a second, harder-to-audit copy of that judgment living in
  the chat driver's own logic.
