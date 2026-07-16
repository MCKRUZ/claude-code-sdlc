# Eval datasets — building a golden set

This directory holds the **golden sets** that are the acceptance criteria for
agentic specs (delivery standard §11). A golden set is versioned in the repo
under `eval-datasets/specs/<feature>/`, referencing the spec file it grades
(`specs/NNNN-<feature>.md`), and CI runs it like a test suite. Changing a prompt,
a model selection, or a tool definition is HIGH risk and trips the
[eval-regression gate](../workflows/eval-regression.yml).

Start from [`golden-set.template.yaml`](./golden-set.template.yaml).

> **Maturity flag.** Per-PR eval-regression gating and agentic CI evals are an
> **emerging** practice, not a settled industry standard. The structure here is
> deliberate and defensible, but the numbers (pass thresholds, the regression
> trip-wire) are starting points you must calibrate to your own measured
> variance. Where a figure is a practitioner heuristic rather than published
> guidance, it is flagged inline.

---

## How to build a golden set

The guidance below follows Anthropic's **"Demystifying evals for AI agents."**
Treat it as the verified baseline; the per-number calibration is yours.

### 1. Start from real failures, not imagination

Draw **20-50 tasks** from things that actually went wrong (or representative
production traffic), not hypotheticals. A small set of real failures is worth
far more than a large set of invented ones. Grow the set as new failure modes
appear in production — every incident is a candidate case.

### 2. Make each task unambiguous, with a reference solution

A good case has one clear notion of "correct." If two reasonable reviewers would
disagree on whether an output passed, the case is too vague to grade reliably —
split it or sharpen it. Keep the reference answer / expected state **in the
case** so the golden set is self-contained and reviewable in the diff.

### 3. Grade deterministically first; reach for an LLM judge last

Order of preference:

| Grader | Determinism | Use for |
| --- | --- | --- |
| `state_check` | Deterministic | Final world state / structured output (the answer bucket, the field value, the side-effect count). |
| `transcript_constraint` | Deterministic | A property that MUST / MUST NOT appear in the run (a tool was/wasn't called, a secret never crossed the boundary). |
| `llm_rubric` | **Non-deterministic** | Only what deterministic graders cannot express — open-ended text quality, faithfulness, helpfulness. |

Combine all three on a case where they apply. Deterministic graders are cheaper,
stable, and free of judge drift. An LLM judge is a last resort, and when you use
one it gets a **versioned rubric prompt** (see [`../prompts/`](../prompts)) — its
floor must sit below the judge's own measured noise band.

### 4. Grade the output, not the path

Assert on the **end state**, not the exact sequence of steps. Many valid
trajectories reach a correct result; pinning the trajectory makes the suite
brittle and punishes legitimate improvement. The one exception is when a step
*is* the contract — e.g. "must never call `send_external`" — which is a
`transcript_constraint`, not a path assertion.

### 5. Run multiple trials in a clean env, and track variance

Agents are probabilistic. Run each case **N times** (3 is a sane CI default),
each trial in an **isolated, clean environment** so no state leaks between runs.
Track both the pass-rate and the **variance**: a case that passes 2/3 is not the
same as one that passes 3/3, and the gap is what tells you whether a score move
is real or noise. Calibrate your regression trip-wire to this measured variance.

### 6. Run two suites, not one

| Suite | Trigger | Size / time | Purpose |
| --- | --- | --- | --- |
| **Large benchmark** | Manual + scheduled ([`eval-suite.yml`](../workflows/eval-suite.yml)) | Full set, JUnit output | Periodic quality signal, trend tracking, full coverage. |
| **Fast regression** | Per-PR gate ([`eval-regression.yml`](../workflows/eval-regression.yml)) | ~30 cases, **< 5 min** | Blocks merges that touch prompts / models / tool defs / agent specs when a key metric degrades. |

The fast regression suite is a curated subset of the benchmark — the highest-
signal, mostly-deterministic cases — chosen so the gate stays under five minutes.

---

## Tagging convention

Tags drive suite selection. At minimum tag each case with:

- A **grader-class** tag: `deterministic` or `llm-judge`.
- A **suite** tag: `regression` (fast gate) and/or `benchmark` (full suite).
- A **domain** tag: `security`, `rag`, `routing`, etc.

The regression workflow selects `tags includes regression`; the benchmark
workflow runs everything.

---

## File layout

```
eval-datasets/
  golden-set.template.yaml     # start here — copy to specs/<feature>/ below
  README.md                    # this file
  specs/<feature>/golden-set.yaml   # one golden set per agentic spec (your copies)
```

Place a feature's golden set **under `eval-datasets/specs/<feature>/`, referencing
the spec file** (`spec: specs/NNNN-<feature>.md` — the repo's spec files are flat) —
the set and the spec version together.

---

## Calibration checklist (do this before trusting the gate)

1. Pick a fixed, known-good agent build.
2. Run the full golden set with `trials >= 5`.
3. Record per-metric mean and spread. The **spread is your noise floor.**
4. Set each `pass_threshold` / judge floor *below* the noise floor so a clean
   build does not flake red.
5. Set the regression trip-wire *above* the noise floor so real degradation
   trips but noise does not. (See the gate workflow for the default; it is a
   practitioner figure to calibrate, not a published constant.)
