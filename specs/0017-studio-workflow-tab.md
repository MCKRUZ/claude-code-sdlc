---
spec: "0017"
name: "studio-workflow-tab"
status: in-flight
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "SDLC Studio canvas — Workflow tab redesign (paired with spec 0016)"              # the story / REQ-id this spec realizes, or — if standalone
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "spec 0010's getStageReadiness()/openDocument() read path — this spec only renders existing data in a new layout; no new read or write mechanism"
created: "2026-09-29"
---

# Spec 0017 — studio-workflow-tab

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
A stage's home page gets a Workflow tab that replaces the flat document list, by default, with a
step-by-step guide to that phase — done, current, and locked steps in order — with the current
step's real file shown live beside it.

## Why
Today a stage home is a static list: five documents, all "Not started," with no sense of order or
of what's happening right now. Once chat (spec 0016) is doing the actual authoring, a flat list
can't show a person where they are or that anything is changing while they talk — they'd have to
leave the page and come back to see a document update. The Workflow tab turns the same underlying
data into a guided sequence with the file visible beside it, so the work is visible as it happens.

## Scope

### In scope
- A new **Workflow** tab alongside the existing **Documents** tab on a stage's home page, in the
  same tab-bar location; Workflow is the default view when a stage home is opened
- The step sequence: one step per required document in that stage's declared order, plus a final
  Sign-off step, each showing done / current / locked status computed from the same
  `getStageReadiness()` data the Documents tab already reads — not a second, separately maintained
  progress source
- Each step's one-line description reuses the exact text already written for the Documents tab —
  not a second copy of the same sentence
- A live file panel beside the steps, showing the current step's document content via
  `openDocument()` — the same function the structured editor already uses — refreshed when that
  document's content changes on disk, with no page reload
- A locked step shows only its title and description — no document content, no controls
- A done step's row states it is complete without re-rendering the full document text underneath
  it — that text is what the Documents tab and the structured editor are for
- Responsive collapse to a single column (steps above file) at phone width, with no horizontal
  page scroll

### Out of scope
- Chat's own behavior or content — spec 0016 owns that; this spec only renders whatever chat and
  the document store already contain
- Editing a document from the Workflow tab — editing stays the structured editor (Documents tab)
  and chat (spec 0016); this tab is read-only
- Any new read or write mechanism — reuses `getStageReadiness()` and `openDocument()` exactly as
  they exist today; no new IPC handler
- The sign-off confirmation mechanism itself — unchanged from the existing sign-off panel; this
  spec only places it as the sequence's last step

## Acceptance Checks
<!--
  Each check is testable and passes the vague-line test:
  "Could two people build different things from this line?" If yes, it is a wish, not a check.
  WISH:  "handle errors gracefully"
  CHECK: "a duplicate submission returns 409 with body { \"error\": \"duplicate claim\" }"
-->
- [ ] A stage's home page shows two tabs, Workflow and Documents; opening a stage lands on
      Workflow by default.
- [ ] The Documents tab's list, sign-off questions, and banner are byte-for-byte what exists
      today — a snapshot test on that tab's rendered output shows no change.
- [ ] The Workflow tab renders exactly one step per required document, in that stage's declared
      order, plus one Sign-off step at the end.
- [ ] A test asserts the Workflow tab and the Documents tab, given the same stage and the same
      readiness data, report the same done-count for every document — proving both read one
      shared source rather than two that can drift apart.
- [ ] The current step's file panel shows that document's real, current content; a test that
      changes the underlying file while the tab is open asserts the panel's rendered text updates
      without the person reloading or clicking anything.
- [ ] A locked step's row contains its title and description and nothing else — no document text,
      no button, no link — asserted as absence, not as disabled.
- [ ] A done step's row shows a completion state and does not render that document's full body
      text on the page a second time.
- [ ] At a 400px viewport width, the steps and file panel stack into a single column and the page
      has no horizontal scrollbar.

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
**Why this tier:** it's a new screen that becomes the *default* view of a stage's progress, reading
data that already exists rather than writing anything new. A rendering bug here (a step's status
disagreeing with the real readiness data, say) would mislead someone about where a stage actually
stands, which is worth a non-author check — but nothing here touches a write path, a security
boundary, or a credential, so the full HIGH ladder isn't warranted.

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **Scope (file patterns):** `studio/src/components/StageHome.tsx` and a new `WorkflowTab.tsx` (or
  similarly named) component plus its supporting pieces. No changes to `studio/electron/main` —
  this spec needs no new IPC handler.
- **Context (pattern to reuse):** `getStageReadiness()` (`readiness.ts`) and `openDocument()`
  (`documents.ts`), used exactly as the existing Documents tab already uses them.
- **Permissions:** build, test, lint and reads auto-allowed. No new dependencies expected. Adding
  any new IPC handler or main-process function needs confirmation first — this spec shouldn't need
  one, so needing one is a sign the design has drifted.
- **Gated paths touched:** none.

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** MEDIUM — grader plus a non-author Checker.
**Specifics:** the Checker specifically verifies the shared-source acceptance check (Workflow and
Documents tabs never disagree on status) and runs the e2e pass at both a normal desktop width and
400px, since a layout regression here is the kind of thing that's easy to miss reading a diff.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- none — checked: every open question here (default tab, locked-step content, done-step content,
  narrow-width layout) is resolved above in Scope, following the mockup Matt approved.
