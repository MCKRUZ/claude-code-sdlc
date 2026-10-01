---
spec: "0018"
name: "studio-step-authoring-panel"
status: in-flight
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "SDLC Studio canvas — scoped step-authoring panel redesign (chat-mockup iteration, paired with specs 0016/0017)"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "DocumentSections/SectionCard — the exact live section/field rendering DocumentView.tsx (Documents tab) and today's WorkflowTab.tsx LiveDocumentPanel already use — plus getStageReadiness()/openDocument(), called exactly as they already are. No new IPC."
created: "2026-10-01"
---

# Spec 0018 — studio-step-authoring-panel

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
A stage's current step replaces the persistent, always-on chat panel with a panel scoped to
that one document: a named connecting sequence before it's ready, then the real document — read
exactly as the Documents tab already renders it — growing live beside a real, continuously
running conversation, with Previous/Next/Back navigation and a direct path into manual editing.

## Why
The chat panel today looks identical whether Claude is working or idle, so the pause before a
reply reads as nothing happening rather than as progress. It's also generic — present at a fixed
width regardless of which step is current, showing no sign of the document it's supposedly
helping with. Spec 0017 already gives the Workflow tab a live file panel, but today's chat panel
sits beside it as an unrelated, undifferentiated column. This spec makes the help visibly belong
to the step it's helping with, and makes the wait before it's ready legible.

## Scope

### In scope
- `studio/src/components/StageHome.tsx` / `studio/src/components/WorkflowTab.tsx` — the current
  step's panel changes from a fixed, always-present chat column to the sequence described above;
  the sidebar, the Workflow/Documents tab bar, and the Documents tab itself are unchanged
- `studio/src/components/ChatPanel.tsx` — scoped to the current step's document; a pending
  structured question renders as the latest turn in the thread, with quick-reply chips alongside
  it, never in place of the free-text box (the box is always present, exactly as it is today)
- A new, small connecting-state component rendering the named sequence ("Connecting to Claude
  Code" → "Reading `<project>`" → "Loading `<file>`") from whatever signals `ChatPanel.tsx`
  already has for "not yet ready" — no new signal invented if an existing one covers it
- The current step's live document view is re-rendered with `DocumentSections`/`SectionCard` —
  the same component `DocumentView.tsx` and today's `LiveDocumentPanel` already use — not a new
  rendering of section/field data
- Previous / Next / Back-to-Workflow controls in the document panel's header, walking the same
  declared document order `studio/src/workflowSteps.ts` already computes; an Edit control that
  opens the existing structured editor (Documents tab) for the same document

### Out of scope
- Chat's own mechanism — the MCP tools, proposal/accept-edit-discard flow, and multi-turn engine
  spec 0016 built are unchanged; this spec only changes where and how that conversation is shown
- Any new document read or write path — reuses `getStageReadiness()` and `openDocument()` exactly
  as the Documents tab and today's chat panel already call them; no new IPC handler
- The sign-off panel and its mechanism (reconnected post-spec-0017) — unchanged
- Document templates or shapes — a document with no `.shape.yaml` keeps degrading exactly as the
  shape library already documents (free text, presence-only readiness); this spec adds no new
  behavior for that case

## Acceptance Checks
<!--
  Each check is testable and passes the vague-line test:
  "Could two people build different things from this line?" If yes, it is a wish, not a check.
  WISH:  "handle errors gracefully"
  CHECK: "a duplicate submission returns 409 with body { \"error\": \"duplicate claim\" }"
-->
- [ ] Before the chat connection is ready, the step panel renders a named sequence of states
      (connecting, reading the project, loading the current file) rather than an empty or
      static-looking chat box; a test drives the same state transitions the real connection goes
      through and asserts each named state renders in order.
- [ ] Once ready, free-text entry is visible and usable at all times — never behind a reveal
      control or a link a person has to click first. A test types a message that is not an
      answer to the pending structured question and asserts it sends normally.
- [ ] A pending structured question's quick-reply chips render as part of the conversation
      thread (below the assistant's message that posed them), not as a layout that replaces or
      hides the text box.
- [ ] Given the same stage and document, the step panel's live content and the Documents tab
      render identical section headings and field values for every section — a test asserts this
      directly (not by convention), the same shared-source discipline spec 0017 already applies
      between the Workflow and Documents tabs.
- [ ] A field the shape declares but the document doesn't yet answer renders with the same label
      the Documents tab already uses for that state (no new placeholder string invented for this
      panel).
- [ ] The document panel's header shows Back to Workflow, Previous, and Next. Previous is
      disabled on the stage's first required document; Next is disabled on its last. Clicking
      Next/Previous on a stage with 3+ required documents moves to the adjacent one in declared
      order without leaving the Workflow tab.
- [ ] The header's Edit control opens the existing structured editor for the same document —
      proving a person can always drop into manual editing, not only chat.
- [ ] A test/code-review step confirms no new `electron/main` IPC handler was added for reading
      or writing a document — `openDocument()`/`getStageReadiness()` are called exactly as the
      Documents tab and the pre-existing chat panel already called them.
- [ ] At a 400px viewport width, the document panel and chat stack into a single column with no
      horizontal page scroll (same responsive bar spec 0017 held itself to).

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
**Tier:** MEDIUM
**Why this tier:** a rework of an already-shipped surface that reuses every existing read/write
mechanism rather than adding one — no new IPC, no new write path, nothing touching auth or a
security boundary. But a rendering bug here (the document panel disagreeing with the Documents
tab about a field's value, or free text silently becoming unavailable mid-conversation) would
mislead someone about what they actually wrote, or quietly take away the one thing Matt flagged
as load-bearing — which is worth a non-author check, not just the lighter LOW bar.

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **Scope (file patterns):** `studio/src/components/StageHome.tsx`, `studio/src/components/WorkflowTab.tsx`,
  `studio/src/components/ChatPanel.tsx`, a new small connecting-state component under
  `studio/src/components/`, and `studio/src/workflowSteps.ts` only if Previous/Next needs a small
  addition to the step list it already computes. No changes expected under `studio/electron/main/`
  — this spec needs no new IPC handler, the same constraint spec 0017 held itself to.
- **Context (pattern to reuse):** `DocumentSections`/`SectionCard` and `getStageReadiness()`/
  `openDocument()`, used exactly as `DocumentView.tsx` and today's `LiveDocumentPanel` already use
  them (see `harness_context`). The declared document order already computed by
  `computeWorkflowSteps()` in `workflowSteps.ts` is what Previous/Next walks — not a new ordering.
- **Permissions:** build, test, lint and reads auto-allowed. No new dependencies expected. Adding
  any new IPC handler or main-process function needs confirmation first — this spec shouldn't need
  one, so needing one is a sign the design has drifted (mirrors spec 0017's own wording).
- **Gated paths touched:** none.

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** MEDIUM — grader plus a non-author Checker.
**Specifics:** the Checker specifically verifies the shared-source acceptance check (the step
panel and the Documents tab never disagree on a document's content) and that free-text entry is
never gated behind a reveal control at any point in the connecting → ready sequence — both are
easy to get right in the common case and wrong in an edge case (a slow connection, a field no
section declares) that a diff alone won't surface.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- **Keep the existing shell, or redesign around a full-width "no sidebar" workflow view?**
  Resolved 2026-10-01 by Matt: keep the existing sidebar, phase header, and Workflow/Documents
  tabs exactly as they are; only the current step's own panel changes.
- **Is free-text chat the primary interaction, or a secondary action behind a structured-question
  flow?** Resolved 2026-10-01 by Matt: chat must keep working exactly as it does today — a real,
  continuously running conversation, free text always available. The structured question is just
  the latest assistant turn in that same thread, not a gate in front of it; there is accordingly
  no separate "what happens to the pending question when you go off-script" state to design —
  a user's next message is simply the next turn, same as spec 0016 already handles.
- **Does the center panel show document content, or an abstracted build-progress view (a
  checklist of sections)?** Resolved 2026-10-01 by Matt, after seeing both in mockup: real
  document content, rendered the same way the Documents tab already renders it.
- **How does a person move to the next document without a persistent step-list column?**
  Resolved 2026-10-01 by Matt: Back to Workflow (returns to the step cards) plus in-panel
  Previous/Next through the declared order — not a column competing with the document for width.
