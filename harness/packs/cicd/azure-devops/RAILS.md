# The delivery rails — Azure DevOps operator's guide

This is the Azure Pipelines realization of the delivery standard's rails. The spec is
`delivery-standard/docs/the-rails.md`; the one rule everything hangs off is **the agent proposes, a gate
disposes**. This page is the operator's guide: what the gates are, what you must do to take them live,
and — the part most teams skip — how to **prove they actually catch things**.

> On install, files land as: `azure-pipelines/*.yml` → `.azuredevops/pipelines/`, `scripts/*.sh` →
> `scripts/rails/`, `branch-policies/policies.json` → `.azuredevops/rails/branch-policies.json`. The
> neutral rubrics and `diff-anchors.sh` come from the core/profile layer (`.azuredevops/rails/rubrics/`,
> `scripts/rails/diff-anchors.sh`). Adjust the paths in the prompts if your install layout differs.

## The gates

| Gate | File | Fires on | Blocks or advises |
| --- | --- | --- | --- |
| **build-and-test** | `ci.yml` | every PR | **Blocks** (hard gate) |
| **eval-gate** *(optional)* | `ci.yml` | every PR | **Blocks** — keep only if you ship an eval-fixture suite |
| **grader** | `grader.yml` | every PR | **Advises** — never blocks; required to RUN |
| **correctness-review** | `correctness.yml` | every PR; reviews when source changed | **Blocks** on a high-confidence defect |
| **security-review** | `security.yml` | every PR; reviews on gated paths / `risk:high` | **Blocks** on HIGH |
| **deploy-dev** | `deploy-dev.yml` | successful CI on main (merge) | n/a — it ships; rolls back on failure |
| **eval-regression** | `eval-regression.yml` | PRs touching the agentic surface | **Blocks** on degradation |
| **eval-suite** | `eval-suite.yml` | manual + scheduled | **Advises** — never gates PRs |

Branch policies (`branch-policies.json`, applied by `configure-branch-policies.sh`) make the blocking
checks mandatory and require a non-author approval + code-owner review on gated paths.

## The merge bar (what branch policies enforce)

Every PR, to merge, must clear (the-rails.md §4):

- **CI green** — `build-and-test` (and `eval-gate` if kept). Hard block (blocking build validation).
- **The grader has run** — the `grader` build validation completed and posted its verdict thread. The
  verdict can say anything; the *running* is required. (The grader pipeline always concludes success, so
  requiring it gates "did it run," never "what it said.")
- **Correctness review passed** — `correctness-review` found no high-confidence defect, *or* a named
  human recorded the `accepted-risk:correctness` PR label.
- **A non-author approval** — the minimum-approver-count policy with `creatorVoteCounts: false`.

A `risk:high` change additionally requires **security-review passed** plus a named human sign-off. The
`security-review` build validation trivially passes when no gated path changed and no `risk:high` label
is present, and blocks on a HIGH finding when it does — so listing it as required enforces "HIGH adds
security" without leaving low-risk PRs stuck.

## Go-live — what a human must do (not automatable from here)

1. **Adapt every placeholder.** Search the installed files for `<<...>>` and replace: build/test commands
   + service provisioning in `ci.yml`; gated-path regex in `security.yml` (keep it in sync with the
   required-reviewer path filters in `branch-policies.json` and the security rubric); source pathspec in
   `correctness.yml`; spec directory in `grader.yml`; every deploy/rollback step in `deploy-dev.yml`; and
   the org/project/repo/`<<CODE_OWNER>>` values in `branch-policies.json`.
2. **Ensure Node is on the agents.** The LLM gates install the Claude CLI with `npx @anthropic-ai/claude-code`;
   the `microsoft-hosted ubuntu-latest` image ships Node, and each gate also runs `UseNode@1`.
3. **Create the gate pipelines.** Pipelines → New pipeline → Azure Repos Git → Existing YAML → point at
   each `.azuredevops/pipelines/<gate>.yml`. Name them exactly `build-and-test`, `grader`,
   `correctness-review`, `security-review`, `eval-regression` (the build-validation contexts must match
   the `displayName`s in `branch-policies.json`).
4. **Add the API key as a variable group.** Pipelines → Library → new variable group `<<VARIABLE_GROUP>>`,
   ideally **linked to Azure Key Vault**, exposing `ANTHROPIC_API_KEY` (and `EVAL_LLM_API_KEY` for the
   eval gates). There is a real per-PR token cost. Until this is set, security/correctness **fail closed
   on the PRs they review** (by design) and the grader stays green/no-op.
5. **Allow the OAuth token + PR write.** In each gate pipeline's settings, allow the job to access the
   OAuth token (`System.AccessToken`), and grant the **build service identity** (`<Project> Build
   Service (<Org>)`) the **"Contribute to pull requests"** permission on the repo, so the rails can post
   threads.
6. **Apply branch policies.**
   ```bash
   scripts/rails/configure-branch-policies.sh --dry-run   # review the plan
   scripts/rails/configure-branch-policies.sh             # apply (prompts to confirm)
   ```
   This is the only sanctioned way to change branch policy — edit the JSON, re-run the script. Do not
   hand-edit policies in the Azure DevOps UI.
7. **Wire and rehearse `deploy-dev`.** It ships as a STARTER that fails until its placeholder
   deploy/rollback steps are adapted. Create a dev **Environment** (attach approvals/checks for
   promotion beyond dev), wire the steps, then rehearse the rollback (§9 shakedown) before trusting it.

## Solo-repo accommodation (read this)

Azure DevOps forbids a PR author from satisfying their own approval when `creatorVoteCounts: false`, so on
a single-maintainer repo the "non-author approval" rule cannot be self-satisfied. Grant the maintainer
(or the Project Administrators group) the **"Bypass policies when completing pull requests"** permission
on the repo — they can then complete their own PRs today, while every change to the protected branch still
rides a PR and its blocking build validations (the bypass waives only the human-approval requirement a
solo repo can't satisfy, not the CI gates). This is honest, not hidden: the human-review rule is fully
wired and becomes real the moment a second reviewer (or a review bot) joins — remove the bypass then.

## Gate integrity (known residual risk)

These pipelines run the **PR's own copy** of the pipeline YAML, the rubric, and the gated-path regex. A
PR could in principle weaken its own gate (rewrite the rubric to force PASS, edit the regex to exclude its
path, neutralize the enforce step). Mitigations in place: the verdict file is written/read **outside** the
working tree (`$(Agent.TempDirectory)`) and any committed copy is deleted before review (so a planted
PASS can't pass); and changes to `.azuredevops/**` are a gated path requiring code-owner review. The real
closure is a **non-author review of rails changes** — exactly what the approver-count + required-reviewer
policies enforce once a second reviewer exists (remove the owner bypass then). Do not point the gate
pipelines at **fork** PRs with secrets exposed — keep the variable group scoped so forked-PR runs cannot
read the API key (the Azure analogue of never switching to `pull_request_target`).

## Prove the rails — the SHAKEDOWN DRILL (the-rails.md §9)

> A pipeline that has never caught anything is not proven — it is merely present. A rail that has only
> ever seen green has not been tested; it has been *assumed*.

Before trusting these, force each one to fail and confirm it is caught. A blocking gate is only proven
when **both its block and its escape** have been seen to work.

- **CI / eval-gate** — introduce a failing test (and a sub-threshold coverage change), open a PR. The
  `build-and-test` build validation must go red and block completion. Already exercised by every real PR.
- **grader** — open a PR whose **spec file claims something the diff does not do** (or whose stated
  intent and implementation disagree). The grader's PR comment thread must call out the mismatch. (No
  verdict blocks — you are confirming it *posts the miss* and that the `grader` build validation still
  reports success.)
- **correctness** — open a throwaway PR with a planted high-confidence defect under source (e.g. an
  inverted null check, or an off-by-one that drops a row). The `correctness-review` build validation must
  go **red** with `CORRECTNESS_VERDICT: BLOCK`, anchored to the exact changed line, and block completion.
  Then apply the `accepted-risk:correctness` PR label and re-queue; confirm it goes **green** — the
  override clears it. Abandon the PR. Do this before relying on it as a required policy.
- **security** — open a **probe PR touching a guarded path** (e.g. add a comment in a file under
  `**/Auth/`) with a planted HIGH issue. The `security-review` build validation must go red. Abandon it.
- **deploy-dev** — stage a **known-bad deploy** (a deliberately broken artifact or a health check pointed
  at a failing build). The deployment must fail and the `on.failure` steps must **restore the last
  known-good version** — the rollback the rails rehearse. Run deploy → roll back → redeploy against the
  dev Environment, with the rollback trigger condition written down in advance, not invented mid-incident.
- **eval-regression** — open a PR touching `prompts/**` that degrades a key metric past the trip-wire (or
  point the runner at a fixture that regresses). The `eval-regression` build validation must go red.
- **secret scan** — open a throwaway PR that commits a **fake but realistic credential** (e.g. an invented
  `AKIA…`-style key in a config file — never a real one). The `build-and-test` build validation must go red
  at its first step, `Secret scan (gitleaks)`, with the planted string redacted in the log. Abandon the PR.

A rail that has never failed safely has not been proven. The shakedown is not optional polish — it is the
difference between a rail and a decoration.

## Watch the rails

Health shows up in the DORA four — deploy frequency, lead time, change-fail rate, time-to-recover — read
as trends. **Never** velocity, story points, PR count, or LOC: agents inflate every one of those. The
rails are healthy when changes flow and fail rarely, not when the agents are busy. Log every agent
recommendation, applied artifact, and gate outcome centrally, with co-authorship on commits, so any
change is traceable to the identity that produced it.
