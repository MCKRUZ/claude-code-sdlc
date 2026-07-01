---
name: eval-builder
description: >-
  Build a golden set for an agentic (LLM-powered) spec — the acceptance criteria for probabilistic
  behavior. Use when a spec's deliverable is an agent/prompt/tool and needs evals before build, or
  when adding cases from a production failure. Produces a versioned golden-set.yaml next to the spec.
allowed-tools: [Read, Grep, Glob, Write]
---

# Eval builder

For LLM-powered work, "tests pass" is not sufficient verification. The golden set is the spec's
acceptance criteria; CI runs it like tests, and a regression in it blocks a merge like a failing
test. This skill builds one that actually tracks quality.

## Procedure (grounded in Anthropic's agent-eval guidance)
1. **Start from real failures, small.** 20–50 tasks is a strong start — drawn from the manual
   pre-release checks and the bug/support queue, not invented in the abstract. Each task is one a
   second person would grade the same way (unambiguous, with a reference answer).
2. **Pick graders deterministic-first.** Prefer a `state_check` (did it reach the right end state?)
   or `transcript_constraint` (e.g. finished in ≤ N turns) over an LLM judge. Use an `llm_rubric`
   only for what rules can't capture (tone, explanation quality), and **grade the output, not the
   path** — don't assert an exact tool-call sequence; agents find valid routes you didn't predict.
3. **Compose multidimensional success** where needed (state + transcript + rubric), with partial
   credit for multi-part tasks instead of all-or-nothing.
4. **Write it next to the spec**, versioned: `eval-datasets/specs/<feature>/golden-set.yaml` (use
   `kit/eval-datasets/golden-set.template.yaml` as the shape). Set the **threshold** the spec
   requires (e.g. ">= 95%").
5. **Plan for variance.** Agents are stochastic — the suite runs multiple trials per task from a
   clean, isolated environment (so prior-trial state can't leak or be gamed). Note the trial count.

## Calibrate before you gate
- Validate the LLM judges against a few human-graded cases before trusting them; the regression
  trip-wire (~±3% is a practitioner starting point, not a constant) must be calibrated to the
  suite's measured variance before it becomes a required check.

## Done when
- A versioned `golden-set.yaml` exists next to the spec with 20–50 grounded cases.
- Graders are deterministic where possible; LLM rubrics grade output, not trajectory.
- The threshold and trial count are set; the judge has been sanity-checked against human grades.
