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
harness_context: "spec 0010's CLI-isolation model (Studio-owned working directory; `--add-dir` grants scoped, working file access without moving the settings/hooks/CLAUDE.md discovery root), extended from a single blocked-tools draft call to a live, multi-turn, tool-capable conversation — writes still land only through spec 0010's shape-library path"
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
The chat panel drives a real, multi-turn conversation — with the same real file access, specialist
sub-agents, and structured questions the terminal's `/sdlc` session has — that authors a stage's
documents as the person talks, from a blank project with nothing started to a stage ready to sign
off, without ever writing outside the shape-library path spec 0010 already proved safe.

## Why
A brand-new project in Studio shows a stage of empty documents and a chat panel that admits it
does nothing (`ChatPanel.tsx`, spec 0008's deliberate placeholder). Today the only way to actually
begin is to leave Studio and run `/sdlc` in a terminal — which defeats the reason Studio exists:
a front end nobody has to open a command line to use. This closes the one gap that makes Studio a
viewer of someone else's work instead of the place the work happens.

## Scope

### In scope
- `studio/electron/main`: a chat-turn driver that starts a real, multi-turn `claude` session whose
  working directory is spec 0010's Studio-owned scratch folder (never the project) but which is
  explicitly granted real, working file access — via `--add-dir` — to two directories: the actual
  project, and this plugin's own installed copy. That second grant is what lets the session use the
  plugin's real phase guidance and spawn its real discipline sub-agents (`discovery-analyst`, and
  so on) as themselves, sourced from the trusted plugin, never from the untrusted project
- The session keeps `Edit`, `Write` and `Bash` off its tool list for the whole conversation. Every
  proposed document change still surfaces as a proposal — naming the document and field — that the
  person accepts, edits, or discards, exactly as spec 0010's single-field draft flow works; only
  spec 0010's shape-library write path ever touches a file. This is no longer a security boundary
  (the isolation model above is) — it is what keeps every chat-authored document inside Studio's
  version history and draft-audit ledger instead of a raw, unaudited write
- A genuine structured multiple-choice question, rendered as real options in the chat UI (not
  typed-out text), for whatever the phase guidance or a sub-agent asks that way — the terminal
  session's own asking mechanism, not a text workaround
- `studio/src/components/ChatPanel.tsx` and the transcript UI it needs: a real message list, an
  input, structured-question rendering, and a proposal card for every write — matching spec 0010's
  accept / edit / discard pattern
- Reusing, never replacing, spec 0010's document-write functions and the draft-audit ledger
  (`record_draft.py`'s log) for every proposed write, whatever its outcome
- The pre-Build foundation phases (0 Discovery, 1 Requirements, 2 Design, 3 Foundation) — the
  document-based stages Studio already renders as a stage home with a document list
- Starting a conversation on a stage with zero documents started, and continuing one on a
  partially-complete stage
- What the assistant asks, and in what order, is read from that phase's own `phases/NN-*.md` file
  and the plugin's real agent definitions at conversation time — never a second, hand-authored copy
  of that guidance living inside Studio
- The assistant opens the conversation itself. Landing on a stage that has at least one document
  not yet started puts the assistant's opening message in the transcript before the person has
  typed anything — nobody has to know to say "let's start" to begin
- A codified version of the isolation proof this spec's design was verified against (see Decision
  List): a hostile scratch project — a hook that writes a marker file, a `CLAUDE.md` with a
  sentinel string — granted to a live session the same way a real project would be, asserting the
  hook never fires and the sentinel is never read except on explicit request
- The tool list is built as an explicit **allow-list** (`--tools Read,Grep,Glob,Task,AskUserQuestion`),
  not a block-list — so "`Edit`/`Write`/`Bash` are absent" is provable by asserting the launch
  arguments equal a fixed list, not by asserting three names are missing from an open-ended
  denial that a future tool addition could silently rejoin
- The conversation is genuinely multi-turn: one `claude` process per turn, tied together with
  `--session-id`/`--resume` and `--output-format stream-json`, so replies build on prior turns
  without replaying the whole transcript as pasted text each time
- What a proposed write looks like on the wire between the model and Studio is a dedicated,
  no-op tool in the allow-list (e.g. `ProposeWrite`) that the model calls with the document,
  section, field and value — not a hope that the model reliably formats a fenced text block in
  its prose. A real tool call is what the parser reads; free text stays free text
- Every command this spec's chat driver runs is visible in Studio's existing console window, the
  same way every other command Studio runs already is (spec 0008's transparency rule) — this is
  the single biggest new capability grant Studio has made, and it does not get a quiet exemption
  from the "you can always see what Studio is doing" promise. Streaming output is shown as it
  arrives, not only once the turn completes

### Out of scope
- The Build loop and spec authoring via chat — a different surface (the Build board, spec 0011);
  a future spec if wanted
- Any filesystem or network access for the Claude process beyond the two directories this spec
  explicitly grants (the project, the plugin's own install) — no other directory, no credential
  store, no network egress beyond what the `claude` CLI itself already needs to run
- The Workflow-tab UI (steps and a live file preview next to chat) — spec 0017. This spec is the
  engine; 0017 is the screen built on top of it
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
- [ ] The Claude process's working directory is always spec 0010's Studio-owned scratch folder,
      never the project — a test asserts this from the session's launch arguments, not from
      behavior alone. It is granted real read access to the project and to the plugin's own
      install directory, and to nothing else.
- [ ] The hostile-scratch-project test (see Scope) passes as an automated test, not a one-off
      manual run: a planted hook never fires, and a planted `CLAUDE.md` sentinel is absent from
      every prompt sent to the model unless the conversation explicitly reads that file.
- [ ] `Edit`, `Write` and `Bash` are absent from the session's tool list for the entire
      conversation — a test asserts this from the session's own configuration, not from watching
      it behave correctly once.
- [ ] The assistant can spawn one of the plugin's real discipline sub-agents (for example
      `discovery-analyst`) mid-conversation when the phase guidance calls for it, and the
      sub-agent's own output — not a paraphrase Studio wrote — reaches the transcript.
- [ ] A structured, multiple-choice question from the phase guidance or a sub-agent renders as
      selectable options in the chat UI, not as plain sentence text the person has to type an
      answer to by hand.
- [ ] What the assistant asks, and in what order, comes from that phase's own guidance file
      (`phases/NN-*.md`) and the plugin's real agent definitions, read at conversation time — not
      copied into Studio's own source — so a phase's requirements cannot drift between the
      terminal and the chat panel.
- [ ] Closing Studio mid-conversation and reopening the same stage leaves every already-accepted
      write in place and no partially-applied write exists on disk.
- [ ] Chat is available and useful on a stage whose documents are already complete — it answers
      questions about the existing content but does not restart the interview from the beginning.
- [ ] Editing a document that is signed off, via chat, goes through the same approval-required path
      spec 0010 built for the structured editor. Chat is not a way around an approval gate.
- [ ] Round trip: a full stage authored end-to-end through chat alone, with nothing touched in the
      structured editor, produces documents that pass the same completeness check as one authored
      by hand.
- [ ] Every turn of a chat conversation appears in Studio's existing console window as it happens,
      the same way every other command Studio runs already does — a test asserts the chat driver's
      calls go through the same command-visibility path as spec 0008's other commands, not a
      separate, invisible channel.
- [ ] A proposed write is a real tool call the driver parses structurally (document/section/field/
      value), not free text pattern-matched out of the model's prose — a test feeds a reply with no
      such tool call and asserts no proposal card appears, rather than a guessed one.

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
0010 is HIGH — and it is the first Studio feature to grant a live model session real, working
access to a project's own files and to real sub-agents. The access-grant mechanism was measured
safe against a planted trap (see Decision List), but that boundary — working directory separate
from granted directories — is exactly the kind of thing a later, unrelated change could erode by
accident without anyone noticing until it mattered. That calls for the full ladder and a named
security sign-off specifically on the isolation test, not just on the feature working.

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **Scope (file patterns):** `studio/electron/main/chat*.ts` (new), `studio/src/components/ChatPanel.tsx`
  and its supporting renderer state — calling into spec 0010's existing document-write and
  draft-ledger functions only; no new write path.
- **Context (pattern to reuse):** spec 0010's working-directory isolation model, extended with
  scoped `--add-dir` access to the project and the plugin install; propose-then-apply through the
  shape library for every write. `runCommand()` (`commandRunner.ts`) is spec 0008's single
  choke point that makes every command visible in the console — this spec extends it to support
  streaming output rather than bypassing it for chat specifically; a design that routes chat's
  calls outside `runCommand()` does not meet the console-visibility acceptance check above.
- **Permissions:** build, test, lint and reads auto-allowed. New dependencies need confirmation.
  The two `--add-dir` grants named in Scope are the ceiling — adding a third directory, a
  credential, or network access beyond what `claude` itself needs to run is a change this spec
  does not cover and needs its own review, not a quiet addition here.
- **Gated paths touched:** none directly; the working-directory / `--add-dir` boundary is a named
  checkpoint in the security pass, not a gated path of its own.

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** HIGH — the full ladder.
**Specifics:** grader, correctness review, and a security pass that specifically re-runs the
hostile-scratch-project test (see Scope and Decision List) against the shipped code — not the
hand-run version this spec's design was checked against — plus a named human sign-off on that
test's result. The round-trip acceptance check above must be run as a real end-to-end pass
authoring a full stage through chat on a real project, not fixtures alone.

Before the sub-agent-spawning and structured-question pieces are written, two mechanism facts need
to be verified empirically against the local `claude` CLI — the same "measured, not assumed"
discipline spec 0010's own security pass used, not a guess folded into the design:
1. Whether `--add-dir <pluginRoot>` alone makes the plugin's discipline sub-agents spawnable via
   the `Task` tool, or whether the session also needs `--plugin-dir <pluginRoot>` — a materially
   different grant (loading the plugin for the session, not just scoping file-tool access) that
   may pull in more than intended. If `--plugin-dir` is needed, confirm it does not also expose
   this plugin's own hooks or commands to the session beyond what's actually wanted.
2. Whether resuming a session with a plain next-turn message correctly answers a pending
   `AskUserQuestion` tool call, or whether the driver must construct a formal `tool_result` block
   (requiring `--input-format stream-json` in addition to the streamed output).
Both are go/no-go facts about how the CLI actually behaves, not product decisions — verify first,
then build the piece each fact gates.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- **Does spec 0010's CLI-isolation decision stand for a live conversation, or does chat need real
  file and sub-agent access to be faithful to the CLI's actual `/sdlc` behavior?**
  Reopened and re-resolved 2026-09-29 by Matt, superseding this item's first answer from earlier
  the same day. The first answer ("stays boxed out, text-only") was tested against a live scratch
  project set up as a trap — a hook that writes a marker file the instant it runs, a `CLAUDE.md`
  carrying a planted instruction — and driven the way this spec's design actually would: working
  directory left at spec 0010's Studio-owned scratch folder, the trap directory granted only
  through `--add-dir`. The hook never fired; the planted file was read only when the session was
  explicitly told to read it, and was then treated as inert text, not an instruction. That result
  separates two things this spec's first draft had bundled together: keeping the untrusted
  project's own settings/hooks/CLAUDE.md from ever auto-loading (a working-directory question,
  fully solved) versus whether the AI can see and act on the project's real files (an
  access-grant question, independent of the first). Matt's answer: grant the real access — real
  file reads, real discipline sub-agents from the plugin's own trusted install, real structured
  questions — because the thing that made the boxed-out design necessary turned out not to require
  giving up capability to get. `Edit`, `Write` and `Bash` still never reach the model's tool list;
  that boundary was never the isolation question and stays for a different reason (see Scope).
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
- **Does a live chat conversation get to bypass spec 0008's "everything Studio runs is visible in
  the console" rule, since it needs continuous streaming rather than one-shot calls?**
  Resolved 2026-09-29 by Matt: no. `runCommand()` (spec 0008's single choke point for console
  visibility) is extended to support streaming output rather than routing chat's calls around it.
  Exempting the single biggest new capability grant from the one rule that lets a person watch
  everything Studio does would undercut the reason that rule exists.
- **Studio's `claude` working directory is one constant, shared, Studio-owned scratch folder
  across every project and stage (spec 0010's model, kept unchanged here). Is there a session
  collision or retention concern worth addressing now?**
  Resolved 2026-09-29: no action needed for this spec. Session ids are UUIDs generated per
  conversation, so cross-project collision risk is negligible; retention/cleanup of old sessions
  is a real but separate concern, noted here so it isn't lost, not something this spec needs to
  solve.
- **Spec 0008's own Acceptance Check 4 ("the chat panel is present on every screen, and states
  which part of the project it can see") is currently ticked only as "labelling, not a working
  chat."** Once this spec ships a real `ChatPanel.tsx`, that check's own caveat is resolved by
  this spec's work, not by editing spec 0008 separately. Noted here so the bookkeeping doesn't
  fall through the gap between the two specs; spec 0008 itself is otherwise untouched.
