# The delivery rails — operator's guide

This is the CI/CD + DevOps governance layer of the kit, built to the **delivery
standard**. The spec is `delivery-standard/docs/the-rails.md`; the one rule
everything hangs off is **the agent proposes, a gate disposes**.

This page is the operator's guide: what the gates are, what you must do to take them
live, and — the part most teams skip — how to **prove they actually catch things**.

> On install, these files land in the client repo as:
> `workflows/*.yml` → `.github/workflows/`, `profile/rubrics/*` →
> `.github/profile/rubrics/`, `profile/CODEOWNERS` → `.github/CODEOWNERS`,
> `profile/rulesets/*` → `.github/rulesets/`, `profile/scripts/*` →
> `scripts/rails/`. The workflow prompts reference those installed `.github/...`
> paths; adjust if your install layout differs.

## The gates

| Gate | File | Fires on | Blocks or advises |
| --- | --- | --- | --- |
| **build-and-test** | `ci.yml` | every PR | **Blocks** (hard gate) |
| **eval-gate** *(optional)* | `ci.yml` | every PR | **Blocks** (hard gate) — keep only if you ship an eval-fixture suite |
| **grader** | `grader.yml` | every PR | **Advises** — never blocks; required to RUN |
| **correctness-review** | `correctness.yml` | every PR; reviews when source changed | **Blocks** on a high-confidence defect |
| **security-review** | `security.yml` | every PR; reviews on gated paths / `risk:high` | **Blocks** on HIGH |
| **deploy-dev** | `deploy-dev.yml` | successful CI on `main` (merge) | n/a — it ships; rolls back on failure |
| **Stop gate** | `.claude/hooks/stop-gate.ps1` | agent tries to finish locally | **Blocks** a red build |

Branch protection (`profile/rulesets/branch-protection.json`) makes the blocking
checks mandatory and requires a non-author approval + code-owner review.

## The merge bar (what branch protection enforces)

Every PR, to merge, must clear (the-rails.md §4):

- **CI green** — `build-and-test` (and `eval-gate` if kept). Hard block.
- **The grader has run** — the `grader` check completed and posted its verdict. The
  verdict can say anything; the *running* is required. (The grader job always
  concludes successfully, so requiring it gates "did it run," never "what did it
  say.")
- **Correctness review passed** — `correctness-review` found no high-confidence
  defect, *or* a named human recorded the `accepted-risk:correctness` override.
- **A non-author approval** — someone who did not write the change approved it.

A `risk:high` change additionally requires **the security workflow passed** plus a
named human sign-off recorded in the PR. Mechanically, `security-review` is a required
check that trivially passes when no gated path changed and no `risk:high` label is
present, and blocks on a HIGH finding when it does — so listing it as required
enforces "HIGH adds security" without leaving low-risk PRs stuck pending.

## Go-live — what a human must do (not automatable from here)

These are deliberate, outward-facing actions. Nothing in the kit performs them.

1. **Adapt every placeholder.** Search the installed files for `<<...>>` markers and
   the `@your-org/your-team` owner handle, and replace them: build/test commands and
   service provisioning in `ci.yml`, gated-path regex in `security.yml` (keep it in
   sync with `CODEOWNERS` and the security rubric), source pathspec in
   `correctness.yml`, the spec directory in `grader.yml`, and every deploy/rollback
   step in `deploy-dev.yml`. The `~DEFAULT_BRANCH` token in the ruleset JSON resolves
   to the repo default branch when applied.
2. **Install the Claude GitHub App** on the repo (`/install-github-app` in Claude
   Code, or <https://github.com/apps/claude>). Needed for grader, security-review,
   and correctness-review. (Repo admin required.)
3. **Add the `ANTHROPIC_API_KEY` repository secret** (Settings → Secrets and
   variables → Actions). The agent gates call the Claude API; there is a real per-PR
   token cost. Until this is set, security-review and correctness-review **fail
   closed on the PRs they review** (by design) and the grader stays green/no-op.
4. **Apply branch protection** once you've read the desired ruleset:
   ```bash
   scripts/rails/apply-branch-protection.sh --dry-run   # review the plan
   scripts/rails/apply-branch-protection.sh             # apply (prompts to confirm)
   ```
   This is the only sanctioned way to change branch protection — edit the JSON,
   re-run the script. Do not hand-edit rules in the GitHub UI.
5. **Wire and rehearse `deploy-dev`.** It ships as a STARTER that fails until its
   placeholder deploy/rollback steps are adapted to the client platform. Wire them,
   point it at a real dev environment, then rehearse the rollback (§9 shakedown)
   before trusting it.

## Required status checks

The ruleset requires exactly these check contexts to be green before merge:

- `build-and-test`
- `grader` (required to have RUN — its verdict never blocks)
- `correctness-review`
- `security-review`

If you keep the optional `eval-gate` job in `ci.yml`, add `eval-gate` to the
`required_status_checks` array too and re-apply.

> **Staged correctness rollout (optional).** If you want to watch `correctness-review`
> on a few PRs before it can wedge merges, omit it from `required_status_checks` at
> first — it still runs and fails-closed, it just won't block — then add it back once
> the Claude App + key are live and you've seen it behave. This is the same caution the
> source harness took; the kit ships it required by default because the standard's
> merge bar (§4) lists it.

## Solo-repo accommodation (read this)

GitHub forbids approving your own PR, so on a single-maintainer repo the "non-author
approval" rule cannot be self-satisfied. The ruleset is configured **armed with an
owner bypass**: it requires 1 approval + code-owner review, but the repository-admin
role is a bypass actor with `bypass_mode: pull_request`, so you can still self-merge
your own PRs today. `pull_request` (not `always`) is deliberate: even the owner cannot
push *directly* to `main` skipping CI — every change to `main` still rides a PR and its
checks; the bypass only waives the human-approval requirement a solo repo can't satisfy.

This is honest, not hidden: the human-review rule is fully wired and becomes real the
moment a second collaborator (or a review bot) joins — at that point, **remove the
bypass actor** from `branch-protection.json` and re-apply.

## Gate integrity (known residual risk)

These workflows trigger on `pull_request`, which runs the **PR's own copy** of the
workflow, the rubric, and the gated-path regex. For a same-repo branch that runs with
secrets, a PR could in principle weaken its own gate (rewrite the rubric to force
`PASS`, edit the regex to exclude its path, neutralize the enforce step). Mitigations
in place: the verdict file is written/read **outside** the working tree and any
committed copy is deleted before review (so a planted `PASS` can't pass); and changes
to `.github/**` are a gated path requiring code-owner review. The real closure is a
**non-author review of rails changes** — exactly what branch protection enforces once a
second reviewer exists (remove the owner bypass then). **Never** switch these workflows
to `pull_request_target`: that would expose secrets and the write token to forked-PR
code.

## Prove the rails — the SHAKEDOWN DRILL (the-rails.md §9)

> A pipeline that has never caught anything is not proven — it is merely present. A
> rail that has only ever seen green has not been tested; it has been *assumed*.

Before trusting these, force each one to fail and confirm it is caught. A blocking
gate is only proven when **both its block and its escape** have been seen to work.

- **Stop gate** — break a source file (introduce a failing test / a compile error),
  then try to end a Claude Code turn. The Stop hook must refuse and hand back the
  build error.
- **grader** — open a PR whose **spec file claims something the diff does not do**
  (or whose stated intent and implementation disagree). The grader's comment must
  call out the mismatch. (No verdict blocks — you are confirming it *posts the miss*.)
- **correctness** — open a throwaway PR with a planted high-confidence defect under
  source (e.g. an inverted null check, or an off-by-one that drops a row). The check
  must go **red** with `CORRECTNESS_VERDICT: BLOCK`, anchored to the exact changed
  line. Then apply the `accepted-risk:correctness` label and confirm it goes **green**
  — the override clears it. Close it unmerged. Do this before relying on it as a
  required check.
- **deploy-dev** — stage a **known-bad deploy** (a deliberately broken artifact or a
  health check pointed at a failing build). The workflow must fail the deploy and
  **restore the last known-good version** — the rollback the rails rehearse. Run
  deploy → roll back → redeploy in test, with the rollback trigger condition written
  down in advance, not invented mid-incident.
- **security** — open a **probe PR touching a guarded path** (e.g. add a comment in a
  file under `**/Auth/`) with a planted HIGH issue. The check must go red. Close it
  unmerged.
- **secret scan** — open a throwaway PR that commits a **fake but realistic credential**
  (e.g. an invented `AKIA…`-style key in a config file — never a real one). The
  `build-and-test` check must go red at its first step, `Secret scan (gitleaks)`, with
  the planted string redacted in the log. Close it unmerged.
- **CI / eval-gate** — already exercised by every real PR.

A rail that has never failed safely has not been proven. The shakedown is not optional
polish — it is the difference between a rail and a decoration.

## Watch the rails

Health shows up in the DORA four — deploy frequency, lead time, change-fail rate,
time-to-recover — read as trends. **Never** velocity, story points, PR count, or LOC:
agents inflate every one of those. The rails are healthy when changes flow and fail
rarely, not when the agents are busy. Log every agent recommendation, applied
artifact, and gate outcome centrally, with co-authorship on commits, so any change is
traceable to the identity that produced it.
