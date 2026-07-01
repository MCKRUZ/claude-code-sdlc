<!--
  Spec template (kit). Copy to specs/NNNN-name.md — NNNN is the next zero-padded number,
  name is kebab-case (e.g. specs/0007-rate-limiting.md). One spec = one branch
  (spec/0007-rate-limiting) = one PR. The spec ships IN the diff so the reviewer and the
  grader see intent and implementation together. No spec, no build.
-->

# {{NNNN}} — {{Feature name}}

- **Risk tier:** {{HIGH | MEDIUM | LOW}}  <!-- set by the Pod Lead at triage; drives the gates -->
- **Status:** {{draft | ready | in-progress | merged}}
- **Owner (human):** {{name}}

## Goal
{{One or two sentences: the user-facing outcome. What is true after this ships that isn't now.}}

## Why
{{The business reason. Why this, why now. Links to the decision-list item if one drove it.}}

## Scope
**In:**
- {{what this change includes}}

**Out:**
- {{what it explicitly does not include — the boundary that stops scope creep}}

## Acceptance checks
<!--
  Each check must pass the VAGUE-LINE TEST: could two people build different things from this
  line? If yes, rewrite it. Prefer observable, testable statements. These become the grader's
  checklist and (where possible) automated tests.
-->
1. {{Given … when … then … — observable, testable}}
2. {{…}}

## Delegation plan (the bounds for the agent)
- **May touch:** {{file globs / modules the agent is allowed to change}}
- **Gated — do not touch without escalation:** {{auth, migrations, infra, pipeline, prompts …}}
- **Reuse this pattern:** {{the one canonical example in the codebase to follow}}
- **Plan approval:** {{required for MEDIUM/HIGH before any code | not required for LOW}}

## Checking plan (which rungs of the ladder)
- [ ] Stop hook green (build + tests) — always
- [ ] Grader verdict posted (advisory) — always
- [ ] Correctness gate passed (or named override recorded) — on any source change
- [ ] Non-author human approval — always
- [ ] Security-reviewer pass + named sign-off in PR — {{HIGH only}}
- [ ] {{Eval-regression gate passed — if this spec changes prompts/models/tools or ships agent behavior}}

## Evals (only if the deliverable is LLM-powered — see CLAUDE.md "Agentic work")
- **Golden set:** {{path, versioned next to this spec}}
- **Threshold:** correct on >= {{N}}% of the golden set
- **What the grader checks differently:** behavior distribution against the golden set, not just
  code against acceptance lines.

## Notes / open questions
{{Anything the Checker should know. Move resolved product questions to the decision log, not here.}}
