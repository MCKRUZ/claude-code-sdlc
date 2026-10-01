---
spec: "0019"
name: "studio-shared-stage-readiness"
status: in-flight
deferred_reason: ""      # required when status is deferred — why this spec was not built
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM
source: "PR #76 code review (spec 0018) — finding 5: ChatPanel.tsx redundant getStageReadiness calls"
channel: ""              # optional — delivery surface (see channels/); blank = channel-agnostic
owner: "@MCKRUZ"
developer: "@MCKRUZ"
checker: ""              # non-author approval — filled at hand-off
team: "core"
harness_context: "Frame.tsx already fetches one readiness-shaped thing for the current stage (useCurrentStageDocs); this spec widens that single fetch into the full StageReadiness object and threads it to both descendants that need it, rather than each fetching its own."
created: "2026-10-01"
---

# Spec 0019 — studio-shared-stage-readiness

<!--
  The durable per-change record of the Build loop. One spec = one branch = one PR.
  No spec, no build. The agent re-reads this every session; the grader grades against it;
  when behavior changes later, this file changes in the same PR. A stale spec is a lie.

  This spec clears the Definition of Ready before anyone builds it. Validate with:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
One stage's readiness — the data `getStageReadiness()` returns — is fetched once per view and
shared by every component on screen that needs it, instead of each one calling it independently.

## Why
Spec 0018's review (PR #76, finding 5) found that opening chat on a stage whose documents
haven't started yet triggers `getStageReadiness()` up to 3-4 times for one screen: Frame.tsx's
own `useCurrentStageDocs`, StageHome.tsx's own `refresh()`, and spec 0018's new ChatPanel
`readinessFlow` all read the same stage independently — and `ensureChatStarted`'s own IPC handler
calls it internally too. Each call is a real `stage_readiness.py` subprocess per this codebase's
own comments, plus one `openDocument()` subprocess per flagged artifact `locate()` finds. This
was flagged as a real regression risk worth its own spec rather than a rushed patch inside 0018,
and Matt asked for it to land first so spec 0018 can consume the fix rather than add to the
problem. `Frame.tsx` is the actual common ancestor of both `StageHome` (rendered as its
`children`) and `ChatPanel` (rendered as its direct sibling) — see `studio/src/App.tsx` — so it is
the natural single owner.

## Scope

### In scope
- `studio/src/components/Frame.tsx` — becomes the single owner of the current stage's
  `StageReadiness` (fetch, loading state, and a `refresh()` the owner exposes downward),
  replacing its existing narrower `useCurrentStageDocs` hook rather than running both
- `studio/src/components/StageHome.tsx` — stops owning its own `readiness`/`loading`/`refresh`
  state; consumes the value Frame now provides, and calls the SAME shared `refresh()` after a
  judgement-confirmation toggle (and anywhere else it currently calls its own `refresh()`),
  rather than re-fetching independently
- `studio/src/components/ChatPanel.tsx` — spec 0018's `readinessFlow` call is removed; it
  consumes the same shared value instead, for both the connecting-checklist's "Reading
  `<project>`" step and the "Helping with: `<document>`" header label
- How the shared value reaches both consumers (React Context, or threading `children` as a
  render-prop function, or another mechanism) is an implementation decision within this scope —
  state which one you chose and why

### Out of scope
- `ensureChatStarted`'s own internal `getStageReadiness()` call (`electron/main/index.ts`) — that
  one is a main-process call inside a different IPC handler, not a renderer-side duplication, and
  changing it is a different, main-process-side concern
- Any change to what `getStageReadiness()` itself does, or to `stage_readiness.py` — this spec
  only reduces how many times the renderer calls it, not the call's own behavior
- Any UI change — the Workflow tab, Documents tab, sign-off panel, and chat panel must look and
  behave exactly as they do today; this is a pure data-flow change

## Acceptance Checks
<!--
  Each check is testable and passes the vague-line test:
  "Could two people build different things from this line?" If yes, it is a wish, not a check.
  WISH:  "handle errors gracefully"
  CHECK: "a duplicate submission returns 409 with body { \"error\": \"duplicate claim\" }"
-->
- [ ] Opening a stage's home page (StageHome mounted inside Frame, chat panel also mounted) calls
      `window.studio.getStageReadiness` exactly once for that stage, not once per consumer — a
      test mocks the IPC call and asserts the call count.
- [ ] Confirming a judgement question (the existing toggle flow) still refreshes both StageHome's
      own view AND the chat panel's "Helping with" label / connecting-checklist state from the
      SAME re-fetch — a test confirms a toggle updates both, backed by one call, not two.
- [ ] Switching the viewed stage (clicking a different stage in the sidebar) re-fetches readiness
      exactly once for the new stage, and both StageHome and ChatPanel reflect the new stage's
      data — not a stale mix of the old and new.
- [ ] `ChatPanel.tsx` contains no direct call to `window.studio.getStageReadiness` after this
      change — a grep/review step confirms removal, not just a passing test.
- [ ] Frame.tsx's existing `useCurrentStageDocs` hook is removed (not left running alongside the
      new shared fetch) — the sidebar's document-count line is derived from the same shared
      `StageReadiness` object instead of its own separate fetch.
- [ ] Every existing StageHome and ChatPanel test (from spec 0016, 0017, and 0018) still passes
      unmodified in behavior — this is a refactor of WHERE data comes from, not what any screen
      shows.

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
**Why this tier:** no new IPC, no new write path, no security boundary — but this moves where
state LIVES across three components (Frame, StageHome, ChatPanel) rather than adding a new
isolated piece. Getting the refresh-after-write wiring wrong would silently leave the sign-off
panel's judgement questions or the chat panel's document label showing stale data after a real
confirmation — a correctness regression in already-shipped, already-relied-on functionality,
which is worth a non-author check rather than the lighter LOW bar.

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **Scope (file patterns):** `studio/src/components/Frame.tsx`, `studio/src/components/StageHome.tsx`,
  `studio/src/components/ChatPanel.tsx`. No changes expected under `studio/electron/main/` — this
  spec changes which renderer component calls an existing IPC method, not the method itself.
- **Context (pattern to reuse):** Frame.tsx's existing `useCurrentStageDocs` hook is the seed —
  widen its fetch to the full `StageReadiness` shape and share the result, rather than building a
  second, parallel mechanism alongside it. React Context is a natural fit for making one value
  reach two non-nested descendants (StageHome via `children`, ChatPanel as a sibling) without
  reshaping `App.tsx`'s call site, but the agent should state and justify whichever mechanism it
  actually uses.
- **Permissions:** build, test, lint and reads auto-allowed. No new dependencies expected.
- **Gated paths touched:** none.

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** MEDIUM — grader plus a non-author Checker.
**Specifics:** the Checker specifically verifies the refresh-after-write path (toggling a
judgement question still correctly updates every consumer from one fetch) and that no consumer
silently kept its own fallback fetch "just in case" — the whole point is exactly one call per
stage view, and a defensive leftover call would quietly undo the fix while looking correct.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- **Sequencing with spec 0018 (PR #76):** Resolved 2026-10-01 by Matt — this spec merges to
  `master` FIRST. Spec 0018's branch then rebases onto the new `master` and updates `ChatPanel.tsx`
  (already in its own file scope) to consume the shared value this spec builds, removing its
  stopgap `readinessFlow` call, before PR #76 itself merges.
- **Mechanism for sharing the value (Context vs. render-prop vs. other):** left to the
  implementing agent to decide and justify — not a product decision, a technical one with no
  user-visible consequence either way.
