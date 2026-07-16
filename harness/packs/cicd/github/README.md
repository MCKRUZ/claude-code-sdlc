# github — CI/CD pack

The **GitHub Actions** realization of the delivery standard's rails. This is one axis
of the pack model (`packs/cicd/<id>`); it pairs with any one **stack pack**
(`packs/stacks/<id>`) to give a repo a complete pipeline. `dotnet` + `github` and
`dotnet` + `azure-devops` reuse the *same* stack pack — the technology conventions
don't change because the pipeline platform did.

For the operator's guide — go-live steps, the merge bar, and the **shakedown drill**
that proves each rail fails safely — read [`RAILS.md`](./RAILS.md).

## What's in the pack

Seven workflows plus the rails guide:

| Workflow | File | Fires on | Block or advise |
| --- | --- | --- | --- |
| **CI** | `workflows/ci.yml` | every PR + push to main | **BLOCKS** (build/test + enforced coverage floor; `spec-gate` job — no spec, no build; optional eval-gate) |
| **Grader** | `workflows/grader.yml` | every PR | **ADVISES** — required to RUN, verdict never blocks |
| **Correctness Review** | `workflows/correctness.yml` | every PR (reviews when source changed) | **BLOCKS** on a high-confidence defect (override label) |
| **Security Review** | `workflows/security.yml` | every PR (reviews on gated paths / `risk:high`) | **BLOCKS** on HIGH |
| **Deploy Dev** | `workflows/deploy-dev.yml` | successful CI on `main` (merge) | ships; **rolls back** on failure — starter, adapt per client |
| **Eval Regression Gate** | `workflows/eval-regression.yml` | PRs touching the HIGH-risk agentic surface | **BLOCKS** on a metric regression past the trip-wire (§11) |
| **Eval Suite** | `workflows/eval-suite.yml` | manual + scheduled | **ADVISES** — periodic full benchmark, off by default |

Why each block-vs-advise choice exists (the-rails.md §3): mechanical truth (CI)
blocks; the grader **advises** because a confident AI verdict is exactly how an agent
talks a human into approving harm — "the grader ran" is required, *what it said* is the
human Checker's call; correctness and security **block** because a logic defect or a
HIGH vulnerability is a fact a machine can stand behind, with a human-recorded override
when consciously accepted.

## Install map — which file goes where

| Pack source | Repo destination |
| --- | --- |
| `workflows/ci.yml` | `.github/workflows/ci.yml` |
| `workflows/grader.yml` | `.github/workflows/grader.yml` |
| `workflows/correctness.yml` | `.github/workflows/correctness.yml` |
| `workflows/security.yml` | `.github/workflows/security.yml` |
| `workflows/deploy-dev.yml` | `.github/workflows/deploy-dev.yml` |
| `workflows/eval-regression.yml` | `.github/workflows/eval-regression.yml` |
| `workflows/eval-suite.yml` | `.github/workflows/eval-suite.yml` |
| `RAILS.md` | `.github/RAILS.md` |

The overlay map above is declared machine-readably in [`pack.yaml`](./pack.yaml) under
`overlays`, mirroring the stack pack's format.

## How this pack consumes the stack pack's `ci-profile.yaml` (the seam)

The stack pack **declares its commands** in `packs/stacks/<id>/ci-profile.yaml`
(`toolchain.{id,version}`, `solution`, `commands.{restore,build,test,lint}`,
`coverage.floor_percent`, `eval_gate.test_filter`, `session_health.command`). This
pack **realizes** those into GitHub Actions YAML. That is what keeps the two axes
independent: add a new stack and this pack can run it; add a new CI platform and every
stack works on it.

The consumption is explicit and greppable. Every stack-sourced line in a workflow is
marked with a seam comment:

```yaml
- name: Build
  run: dotnet build {{SOLUTION_OR_PROJECT}} --no-restore --configuration Release   # «stack pack: ci-profile.commands.build»
```

Because the installer does not yet do token substitution, each marked line carries the
**.NET reference value verbatim** (from `packs/stacks/dotnet/ci-profile.yaml`) as a
runnable DEFAULT, so the workflow works out of the box on a .NET repo. A future
profile-aware installer resolves the selected stack's `ci-profile.yaml` and overwrites
each `«stack pack: …»` line with that stack's value.

**Where the seam lives:**

| Workflow | Stack-sourced slots (`ci-profile.<path>`) |
| --- | --- |
| `ci.yml` | `toolchain.id` → setup action, `toolchain.version`, `commands.restore`, `commands.build`, `commands.test`, `coverage.floor_percent` (enforced by the `Enforce coverage floor` step, `COVERAGE_FLOOR` env), `eval_gate.test_filter` (eval-gate job). `commands.lint` is declared but left unwired to preserve the reference rail's gate semantics — add a lint step from it if desired. The `spec-gate` job has no stack seam (pure git + jq). |
| `eval-regression.yml` | `toolchain` (the "Setup runtime" step + the `DOTNET_*` env defaults) |
| `eval-suite.yml` | `toolchain` (the "Setup runtime" step + the `DOTNET_*` env defaults) |
| `grader.yml`, `correctness.yml`, `security.yml`, `deploy-dev.yml` | **none** — these run no stack build/test commands. Their placeholders are methodology/repo/deploy-platform level, and the Claude invocation is carried verbatim. |

`{{SOLUTION_OR_PROJECT}}` is a distinct, repo-adaptation (Phase 3) token — the same
token `ci-profile.yaml` uses — that the product repo fills with its solution/workspace
path. It is not the stack seam; it is filled once per repo regardless of stack.

## Branch-protection dependency

The blocking checks are only mandatory once branch protection is applied. This pack's
gates depend on the profile layer's ruleset:

- **Ruleset:** `profile/rulesets/branch-protection.json` — lists the required status
  check contexts, which must match the workflow **job names** exactly:
  `build-and-test`, `spec-gate`, `grader`, `correctness-review`, `security-review`
  (plus `eval-gate` if you keep that job). Rename a job → rename its required-check
  context.
- **Apply it:** `scripts/rails/apply-branch-protection.sh` (the installed location of
  `profile/scripts/apply-branch-protection.sh`) — the only sanctioned way to change
  branch protection. Edit the JSON, re-run the script; do not hand-edit rules in the
  GitHub UI.

```bash
scripts/rails/apply-branch-protection.sh --dry-run   # review the plan
scripts/rails/apply-branch-protection.sh             # apply (prompts to confirm)
```

See [`RAILS.md`](./RAILS.md) for the full go-live sequence (Claude GitHub App,
`ANTHROPIC_API_KEY`, the solo-repo owner bypass) and the shakedown drills.

## Fail-safe semantics (do not weaken)

- **Blocking gates fail CLOSED.** A gated change whose review can't complete (missing
  key, API hiccup) BLOCKS, never passes. The grader is the one exception — it advises,
  so it fails SOFT (green/no-op) to avoid false red.
- **Anti-tamper.** Security and correctness write/read their verdict file OUTSIDE the
  working tree and delete any committed copy first, so a planted `PASS` can't satisfy
  the gate. The enforce step matches the verdict token as an **exact first-line
  prefix**.
- **Promote, never rebuild.** `deploy-dev` ships the exact artifact CI built for the
  commit (via `workflow_run` download), and restores the last known-good version on a
  failed deploy or health check.
