---
spec: "NNNN"
name: "short-kebab-name"
status: draft            # draft | ready | in-flight | merged
type: feature            # feature | bugfix — a bugfix PR carries the `type:bugfix` label and
                         # must pass repro-gate: its new test FAILS against the pre-fix code
risk: MEDIUM             # HIGH | MEDIUM | LOW — first-class field; sets review depth
owner: "—"               # the named human accountable for this change
source: "—"              # the story / REQ-id this spec realizes, or — if standalone
harness_context: ""      # the ONE existing pattern this change reuses (DoR requires this named)
created: "YYYY-MM-DD"
---

# Spec NNNN — <title>

<!--
  Copy to specs/NNNN-name.md — NNNN is the next zero-padded number, name is kebab-case
  (e.g. specs/0007-rate-limiting.md). One spec = one branch (spec/0007-rate-limiting) = one PR.
  The spec ships IN the diff so the reviewer and the grader see intent and implementation
  together. No spec, no build.

  The frontmatter above is not decoration: check_spec.py reads `name`, `risk` and
  `harness_context` from it, and the grader grades against this file. Validate before building:
    uv run scripts/check_spec.py --spec specs/NNNN-short-kebab-name.md
-->

## Goal
<!-- One or two sentences: the user-facing outcome. What is true after this ships that isn't now. -->

## Why
<!-- The business reason. Why this, why now. Link the decision-list item if one drove it. -->

## Scope
<!-- What the change must not touch is as load-bearing as what it must do. -->

### In scope
<!-- The file patterns / areas this change may touch. -->
-

### Out of scope
<!-- The boundary that stops scope creep. "Stop and ask" if something here needs to change. -->
-

## Acceptance Checks
<!--
  Each check must pass the VAGUE-LINE TEST: could two people build different things from this
  line? If yes, it is a wish, not a check.
  WISH:  "handle errors gracefully"
  CHECK: "a duplicate submission returns 409 with body { \"error\": \"duplicate claim\" }"
  These become the grader's checklist and, where possible, automated tests.
-->
- [ ]

## Risk Tier
<!--
  HIGH | MEDIUM | LOW (must match the `risk:` frontmatter field). State why this tier.
  Challenges escalate UP, never down, without discussion. The Pod Lead owns the tier.

  HIGH   — auth/identity, payments, PII/client data, schema migrations, public API contract
           changes, IaC/pipeline changes, prompt/model/tool-definition changes, ADR revisions,
           anything hard to undo.
  MEDIUM — new business logic, external integrations, changes to shared internal services.
  LOW    — UI within existing patterns, copy, internal tooling, additive CRUD on established rails.
-->
**Tier:** MEDIUM
**Why this tier:**

## Delegation Plan
<!-- The box the agent works inside. Set per spec. -->
- **May touch:** <file globs the agent is allowed to change; everything else is out>
- **Gated — do not touch without escalation:** <auth, migrations, infra, pipeline, prompts …>
- **Reuse this pattern:** <the one canonical example in the codebase — matches `harness_context`>
- **Permissions:** <auto-allowed: build, test, lint, reads. Confirm-required: installs, network>
- **Plan approval:** <required for MEDIUM/HIGH before any code | not required for LOW>

## Checking Plan
<!--
  How high this change climbs the checking ladder, set by the risk tier:
  LOW    — grader advisory + light human look
  MEDIUM — grader + non-author Checker
  HIGH   — full ladder: grader + correctness + security pass + named human sign-off in the PR
-->
**Ladder depth:** MEDIUM
**Specifics:**
- [ ] Stop hook green (build + tests) — always
- [ ] Repro-gate: the new test FAILS without the fix — bugfix only, enforced in CI
- [ ] Grader verdict posted (advisory) — always
- [ ] Correctness gate passed (or named override recorded) — on any source change
- [ ] Non-author human approval — always
- [ ] Security-reviewer pass + named sign-off in PR — HIGH only
- [ ] Eval-regression gate passed — if this spec changes prompts/models/tools or ships agent behavior

## Evals
<!--
  Only if the deliverable is LLM-powered — see CLAUDE.md "Agentic work". Delete this section
  otherwise; an empty Evals block on a plain CRUD spec is noise.
-->
- **Golden set:** <path, versioned next to this spec>
- **Threshold:** correct on at least <N> percent of the golden set
- **What the grader checks differently:** behavior distribution against the golden set, not just
  code against acceptance lines.

## Decision List
<!--
  Silent product decisions this story leaves unwritten (fail open or closed? what does a blocked
  user see?). Each needs a NAMED human answer on the agreed clock — the agent must not guess.
  Leave "none" only if you have genuinely checked there are none.
-->
- none
