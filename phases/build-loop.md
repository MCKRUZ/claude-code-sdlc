# Build Loop

## Purpose
The continuous middle of the engagement. Every change — large or small — runs the same three beats: **Intent** (decide what you want, clearly enough to check, and write it as a spec), **Delegate** (an agent builds it inside bounds a human set, from a plan a human approved), **Discern** (checks and a non-author prove it against the spec, then merge deploys it). The Build loop replaces the batch Implementation, Quality, and Testing phases. It is not a phase: there is no artifact exit gate at the end of a loop pass, because checking happens per change. A human declares the backlog feature-complete to leave.

## Why This Is Not a Batched Phase
The visible gap where Implementation / Quality / Testing used to sit is intentional. Batched checking — write everything, then review everything, then test everything — is the failure mode the standard exists to kill. When an agent can produce code in minutes, the constraint is not building; it is proving. Checking moves to per-change inside the loop, never a later batch phase. The moment the pod starts skipping the loop for "small" changes is the moment unchecked work creeps back in. Small and risky is exactly the cheap-to-type, expensive-to-get-wrong case: the worst bugs in agent-built code ship inside changes someone decided were too small to bother checking.

## Entry Criteria
- Phase 3 (Foundation) exit gate passed and `build-handoff.md` reviewed
- The rails proven (Stop hook blocks, gates fire, deploy-dev rolls back) and the walking skeleton deployed
- The ordered spec backlog, risk-tier map, and cadence calendar in hand
- The WIP cap and review-wait tripwire set

## The Three Beats

### Beat 1 — Intent: decide and write

Nothing enters the loop as a conversation. A story becomes buildable only by clearing the **Definition of Ready** at weekly intent triage:

- **Every acceptance criterion passes the vague-line test.** The test: "Could two people build different things from this line?" If yes, the line is a wish, not a check. "Handle errors gracefully" is a wish; "a duplicate submission returns 409 with `{ "error": "duplicate claim" }`" is a check.
- **Scope in and scope out are both stated.** What the change must not touch is as load-bearing as what it must do.
- **The silent decisions are answered.** A real product choice left unwritten (fail open or fail closed? what does a blocked user see?) does not disappear — the agent makes it for you, fast, under no supervision, and you find out what it chose when something breaks. Surface each onto the decision list, with a named human owner and an answer clock.
- **A risk tier is assigned** by the Pod Lead and recorded in the spec.
- **The harness context is named** — which existing pattern this change reuses, so the agent extends the codebase instead of inventing a second way to do something it already does.

Then write the spec — one file in the repo, durable across sessions:

**The spec format (`specs/NNNN-name.md`):**
- **Goal** — one sentence: what capability exists when this is done
- **Why** — the reason this change matters
- **Scope in / Scope out** — the file patterns it may touch, and what it must not
- **Acceptance checks** — testable, each passing the vague-line test
- **Risk tier** — HIGH / MEDIUM / LOW
- **Delegation plan** — what the agent may touch, what is gated, the named pattern to reuse
- **Checking plan** — how high this change climbs the checking ladder (Beat 3)

The spec outlives the chat that produced it: the agent reads it every session, the grader grades against it, and when behavior changes later, the spec changes in the same PR. A stale spec is a lie that misleads the next reader and the next agent.

**The risk taxonomy** (it lives in the harness so agents see it too):

| Tier | What lands here | What it triggers |
|------|-----------------|------------------|
| HIGH | Auth/identity, payments, personal or client data handling, schema migrations, public API contract changes, infrastructure and pipeline changes, AI-behavior changes (prompts, models, tool definitions), anything hard to undo | Tight agent permissions, the full checking ladder, a security review pass, a named human sign-off |
| MEDIUM | New business logic, external integrations, changes to shared internal services | Standard permissions, grader plus a human Checker |
| LOW | UI within existing patterns, copy, internal tooling, additive CRUD on established rails | Lighter review; the grader and the mechanical gates still run |

Risk challenges escalate up, never down, without discussion — anyone (human or agent) can raise a tier on the spot; lowering one always takes a discussion with the Pod Lead, who owns the tier.

Intent is the highest-leverage hour anyone spends in the loop. When the agent can produce the code in minutes, what decides whether you get what you wanted is how clearly you said it — vague intent doesn't get fixed downstream, it gets built, fast, wrong.

### Beat 2 — Delegate: bound and build

Delegating is not "go build it." It is drawing the box the agent works inside and approving its plan before it starts.

**Plan mode first, always.** The agent starts in plan mode: it reads the repo and the spec and proposes an approach — which files it will touch, how it will satisfy each acceptance check — before it may write anything. The Orchestrator corrects or approves the plan, and looks for the one decision the plan glosses over. Correcting a plan costs a sentence; correcting a finished build costs a redo. The most dangerous decisions in agent-built code are the ones nobody noticed being made — plan approval is where they get noticed.

**Three bounds, set per spec:**
- **Scope** — the file patterns the change may touch. Everything else is out, and "if you think something outside this needs to change, stop and ask" is part of the handoff.
- **Context** — the one canonical pattern to reuse, named explicitly. An agent not pointed at the existing pattern will happily invent a second one, and now the codebase has two.
- **Permissions** — what the agent may do without asking. The harness auto-allows the safe commands (build, test, lint, reads) and forces a human confirm on the rest: package installs, network calls, anything under a gated path like migrations or auth.

**Freedom by risk, within one change.** The parts that are cheap to undo get a loose leash ("implement the log throttling however reads cleanest"); the parts expensive to get wrong get a tight one ("for the keying and the auth check, follow the plan exactly — deviate only by asking"). Stay out of the keystrokes on the easy stuff; stay in the big calls on the hard stuff.

**One agent or many.** Fan out to *explore*: independent investigations (three candidate approaches, each written up by its own agent) run in parallel because they touch nothing shared. Single-thread to *build*: one feature writing into shared code paths gets exactly one agent, start to finish, because parallel agents in the same files clobber each other. The test: are the pieces independent (fan out) or tangled (single-thread)? Spread out to explore, line up to commit.

**TDD inside Delegate (when the profile or the spec requires it).** When TDD applies, the agent writes the failing test first (red), implements the minimum to pass (green), then refactors while the test stays green. For a bug fix, this is mandatory regardless of profile: write the regression test that reproduces the bug (it fails, proving the bug exists), fix the code, watch it pass, and add the test to the permanent suite. Never fix a bug without a test that would have caught it. Tests must encode *why* the behavior matters, not just *what* it does — a test that can't fail when the business logic changes is wrong.

**The box is enforced, not requested.** The permission rules hold whether or not anyone is watching, and the **Stop hook** refuses to let the agent finish with failing tests or a broken build. This hook is the single highest-value automation in the standard: it turns "the tests must pass" from a request the agent might rationalize past into a fact about the world.

### Beat 3 — Discern: prove, then merge

Written is cheap now; checked is the bar. A change is done when it has been proven against its spec by something other than its author — not when the code exists. The proving climbs a **five-rung checking ladder**, each rung catching what the one below cannot:

| Rung | The check | What it catches that the rung below can't |
|------|-----------|--------------------------------------------|
| 1 | The done-rule in the harness | Sets the bar ("done means checked, not typed"); persuasion only |
| 2 | The agent re-checks each turn | The agent's own mechanical slips: the broken import, the test it broke two steps back |
| 3 | The blocking Stop hook | The agent declaring itself done anyway — it cannot finish with red tests or a broken build. But a hook enforces the tests that exist; it cannot enforce a test nobody wrote |
| 4 | The separate grader | The hole the author was blind to: it grades check-by-check against the spec, not against the tests, so it catches the case the author never thought to test |
| 5 | The human / security gate | The judgment calls no machine should own: the risk acceptance, the product call, the security sign-off on a HIGH change |

Rung 4 is where the bug the author's green test suite hid goes to die — and it only works because Intent wrote checkable acceptance criteria for it to grade against. The ladder is the payoff of the spec.

In the rails, the ladder lands as three layers on every PR:
- **Mechanical gates in CI** (hard blocks): build, tests, lint, 80% coverage on new code.
- **The grader in CI** (required to run, advisory verdict): a fresh agent reads the spec in the diff and posts a check-by-check verdict as a PR comment, pinned to the exact changed lines. It cannot be skipped — "the grader has run" is a required status check — but its verdict does not block. The human Checker reads it and makes the call.
- **The human Checker** (hard block): non-author approval on every PR. On HIGH risk, also a security review pass and a named human sign-off recorded in the PR.

**The merge bar** every change clears:
- CI green (build, tests, lint, coverage)
- The grader has run
- Correctness passed, or a named-human override recorded
- A non-author approval — **the author never approves their own work**, no exceptions; this rule survives every collapse of pod size

A `risk:high` change adds the security workflow pass and a named human sign-off recorded in the PR.

**The depth scales by risk tier.** You do not run every change up all five rungs — that recreates the review bottleneck the loop exists to remove. LOW stops after the grader's advisory pass and a light human look; MEDIUM gets the standard grader-plus-Checker treatment; HIGH goes all the way up. One depth for everything fails in both directions — reading a typo fix as hard as an auth change burns the pod's scarce review attention, and waving an auth change through on a glance ships the instability.

**Failed checks come back to the same Orchestrator,** who drives the fix on the same branch. Every gate, including a fresh grader run, runs again on the updated PR before merge. Re-run the gate that flagged the issue to confirm the fix — never self-certify.

Merge deploys to the client's dev environment automatically — the rails from Foundation. A true emergency merge past a gate requires the Pod Lead plus one other human, an exception label, and a retro agenda item. Two exceptions in a month means the gate or the specs are wrong — fix that, don't keep excepting.

## Session Continuity

The Build loop spans many sessions. Context windows fill; people pause. The spec is the durable source of truth across sessions — the agent re-reads it every session, so a spec kept current *is* the handoff. Beyond the spec:

- **A spec in flight is the unit of handoff.** One spec = one branch = one PR. A spec is either not-started, in-flight (its branch open), or merged. Do not start a new spec while one you own is in-flight and half-built — finishing the in-flight spec before starting the next is how the loop avoids compounding half-done work across sessions. This is the same discipline the old batch Implementation phase enforced per section, now enforced per spec.
- **Session health check.** When `session_health_check.enabled` is true in the profile, run the configured command (via the Bash tool) at session start before touching new work. On failure, do not start new spec work — diagnose and fix the build first (spawn `build-error-resolver` if needed). This catches a broken build before you compound it.
- **At a session boundary**, leave the in-flight spec's branch and PR in a state the next session can resume from: the spec current, the plan recorded, the failing/passing test state obvious. If the engagement uses a machine-readable handoff file, update it with the in-flight specs, what's blocked, and the next action. The 60 seconds this costs saves 30 minutes of context reconstruction next session.

## The Week: Cadences

Four short meetings replace the ceremony calendar. None asks "what did you do yesterday" — when agents do the building, that answer is "the agents wrote a lot," and the number means nothing. The meetings point at the two things that actually constrain the loop: the clarity of intent going in, and the review queue coming out.

| Meeting | Length | Replaces | What it does |
|---------|--------|----------|--------------|
| **Flow check** (daily) | 10-15 min | standup | The queue number first: how many changes wait for checking, how long the oldest has waited. Walk in-flight changes nearest-done first. Every waiting change gets a Checker; vague specs get flagged back to triage; the WIP cap gets enforced; one commitment each. |
| **Intent triage** (weekly) | 60 min | refinement | Stories become ready specs: vague lines sharpened, silent decisions surfaced onto the decision list, risk tiers assigned, the backlog ordered. |
| **Retro+** (weekly) | 60 min | retro | Every escaped bug gets the same question — "which check should have caught it?" — and the answer becomes a harness improvement, not a resolution to try harder. |
| **Setup review** (weekly) | 30-60 min | (new) | The week's harness changes merge: `CLAUDE.md` updates, skill and hook improvements, permission tuning — versioned, PR'd, reviewed by the Setup Owner's deputy. |

**Two numbers run the week.** The **WIP cap** keeps the pod from opening more changes than its checking capacity can clear — agents can always write more code; the constraint is proving it. The **review-wait tripwire** is the alarm on the same constraint: when the median wait crosses the agreed threshold, the pod stops starting new work and clears the queue. The security queue is read separately at every flow check — it clears slower, and averaged in with the rest it hides until something HIGH has quietly waited a week.

## Hardening Passes

Quality in the loop is per-change; some concerns only exist at the integration level — performance under load, end-to-end journeys across many features, penetration testing. The Quality Engineer plans and runs these as **scheduled hardening passes** (typically one mid-Build and one before deployment prep) using the end-to-end (`/e2e`) and security tooling. The first hardening pass is also where the test environment gets added alongside dev. Hardening is scheduled work inside the flow — specs, triage, the loop — not a phase that gates all other work.

A hardening pass runs its own specs through the loop. Use the expander pattern: after each successful integration test run, identify 3–5 untested edge cases (boundary conditions, error paths, concurrent/timing scenarios, data edges — empty, null, max-length, Unicode) and add specs for them. Record findings and the resulting specs in `hardening-pass-notes.md`.

## The Numbers That Steer the Loop

Internal dashboard, baseline-and-trend, no vanity targets:
- **Accepted-as-is rate** — agent work merged without rework. The trust signal: rising means intent and bounds are working.
- **Review wait (median)** — the real bottleneck indicator. If it grows, stop opening streams; more building throughput cannot fix a checking constraint.
- **Rework / revert rate** and **bounce-back-for-unclear rate** — intent quality signals. A spec that bounces back as unbuildable is a triage miss, not an agent failure.
- **Escaped bugs** — every one answered at Retro+ with "which check should have caught it?"
- **The DORA four** — deploy frequency, lead time, change-fail rate, time-to-recover, watched as trends.
- **Security-review wait** — on its own line, always.

**Never tracked, never reported:** velocity, story points, PR count, lines of code. Agents inflate all of them — measured teams have doubled PR volume while actual delivery stayed flat. No activity metrics in client materials, ever; demos and outcomes don't lie.

## Leaving the Loop

There is no batch exit gate. The loop ends when a **human declares the backlog feature-complete** — every story that the engagement committed to has ridden the loop and merged. That declaration produces `phase7-handoff.md`: the entry package for Phase 7 Documentation. The handoff names what was built, the current state of the system in dev, the open questions carried forward, the deferred items with their rationale, and anything the documentation phase must cover that surfaced during Build.

## Standalone or Workflow

In the workflow, the loop reads `.sdlc/state.yaml`, the spec backlog, the risk-tier map, and the cadence calendar from Foundation. It also runs standalone: a single spec can ride the full three-beat loop against any repo with no `.sdlc/` present — write the spec to `specs/NNNN-name.md`, assign a provisional risk tier, run plan-mode → bounded build → checking-ladder → non-author review, and note the missing engagement context in the spec header. The loop's discipline (no spec/no build, plan first, the author never approves their own work, the merge bar) holds identically in both modes; only the surrounding cadences and dashboards require the full engagement.

## Artifact Specifications

### `phase7-handoff.md` (REQUIRED)
Produced by the human feature-complete declaration. Must contain ALL of:
- **What was built** — the merged spec backlog, organized for a reader who wasn't in the room
- **System state** — what is running in dev and verified
- **Open questions** — carried under their original IDs into Documentation
- **Deferred items** — anything not built, with rationale
- **Documentation focus** — what Phase 7 must cover based on what surfaced during Build (drift from the Phase 2 contracts, novel patterns, operational concerns)

### Optional Artifacts
- `specs/` — the spec files (`specs/NNNN-name.md`), the durable per-change record. These live in the repo, not only under `.sdlc/`.
- `build-summary.md` — a rolling summary of merged work, useful for the weekly client async summary and the feature-complete declaration
- `hardening-pass-notes.md` — per hardening pass: scope, findings, the specs raised, and their resolution

## Exit
The Build loop has **no artifact exit gate**. It is left by a human feature-complete declaration that produces `phase7-handoff.md`. `/sdlc-gate` for this phase verifies only that `phase7-handoff.md` exists and is complete — it does not batch-check the build, because checking already happened per change inside the loop.

## Next Phase
The Build loop hands off into **Phase 7: Documentation** (`phases/07-documentation.md`) — when Build is feature-complete, the close begins: proving a stranger can understand, run, and operate the system from its documentation alone. `phase7-handoff.md` is the entry package.

## Guidance
- **Skipping Intent** — typing the wish straight to the agent ("add rate limiting, go") — builds something plausible and fast, and the undescribed case is the one it gets wrong. Everything enters through a ready spec, every time.
- **The author grading itself** is checking theater — it catches nothing the author didn't already think of. The author never approves, no exceptions.
- **One review depth for everything** recreates the bottleneck (every typo behind a human) or ships the incident (auth waved through on a glance). The tier sets the climb.
- **"Too small to bother"** is the expensive case. The discipline is the same at forty lines as at four hundred.
- **The unbounded handoff** — no scope, no named pattern, no permissions — makes the agent fill every gap with a guess and touch three things nobody wanted touched.
- **Fanning out a build** clobbers shared files. Fan out only to explore; one agent writes shared code.
- **The rotting spec** lies to the next agent and the next human. The spec changes in the same PR as the behavior.
- **A hook that passes by hiding the failure** (skipping the flaky test to go green) is the rail lying to you. Fix the cause; never suppress the check.
- **Ignoring the queue number** silts the loop up invisibly until nothing merges. The tripwire makes stopping automatic, not heroic.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this loop:

### Opening (starting Build)
- "What's the next ready spec? Does every acceptance check pass the vague-line test — could two people build different things from it?"
- "What's the risk tier, and what's the one existing pattern this change should reuse?"
- "What are the silent product decisions in this story that nobody's answered yet?"

### Progress Check (specs in flight)
- "How long has the oldest PR waited for a Checker? Are we past the review-wait tripwire?"
- "Did the grader catch anything the tests missed on the last merge? That's rung 4 doing its job."

### Ready Check (approaching feature-complete)
- "Is the backlog actually feature-complete, or are there specs hiding as 'too small to spec'?"
- "Has every escaped bug been answered at Retro+ with 'which check should have caught it?'"
