# Provenance & fidelity — Azure DevOps CI/CD pack

Honest record of how faithfully each rail maps from the GitHub Actions harness (`kit/workflows/`) to
Azure Pipelines, and where Azure DevOps forced an approximation or a genuinely different mechanism. Read
this before trusting a "1:1" claim — several rails are close but not identical, and two carry a real
behavioral gap (flagged **⚠ GAP**).

## Built fresh vs. harvested

- **Harvested (behavior reproduced 1:1 from the source workflows):** the gate structure, the block/advise
  choices, the fail-closed/fail-soft posture, the anti-tamper verdict handling, the exact verdict tokens
  (`CORRECTNESS_VERDICT: PASS|BLOCK`, `SECURITY_VERDICT: PASS|BLOCK`), the changed-line anchor scaffolding
  (`diff-anchors.sh`, reused verbatim from the neutral profile), and the rubric-driven prompts.
- **Built fresh (no source equivalent existed):** `deploy-dev.yml` (the source deferred deploy entirely),
  the Claude-CLI invocation script (`run-claude-review.sh`), the REST thread-posting script
  (`post-pr-thread.sh`), and the branch-policy configurator (`configure-branch-policies.sh`).
- **Reused, not re-authored (neutral, shared with the github pack):** `diff-anchors.sh` and the three
  rubrics. They are platform- and stack-neutral; duplicating them would contradict the two-axis model's
  "authored once." This pack references the installed paths and declares them under `pack.yaml: consumes`.

## Cross-cutting mechanism swaps (apply to every gate)

| GitHub mechanism | Azure DevOps mechanism | Fidelity |
| --- | --- | --- |
| `on: pull_request` workflow trigger | **Build validation branch policy** runs the pipeline on PRs — Azure Repos **ignores** `pr:` in YAML | Different mechanism, same effect. The pipeline's `pr: none` is deliberate; PR runs come from the policy. |
| Required status checks (branch-protection.json) | **Build validation** policies, one per gate pipeline | 1:1 in effect. Contexts = pipeline display names, must match. |
| `anthropics/claude-code-action@v1` | Headless **Claude Code CLI** via `run-claude-review.sh` (`npx @anthropic-ai/claude-code -p …`) | Same CLI, same `--model/--max-turns/--allowedTools`. Two differences below. |
| Action posts the PR comment itself (Claude has a GitHub token) | Claude writes its verdict as its **final message**; a **separate deterministic step** posts it via the REST threads API with `System.AccessToken` | Different split. Arguably safer (model output is untrusted data a deterministic step publishes), but it means Claude does **not** post inline diff-anchored review comments — see ⚠ below. |
| `${{ secrets.ANTHROPIC_API_KEY }}` | Variable group (ideally Key-Vault-backed) → `ANTHROPIC_API_KEY` env | 1:1. |
| `${{ secrets.GITHUB_TOKEN }}` for PR writes | `$(System.AccessToken)` + build identity "Contribute to pull requests" | 1:1 in effect; requires an explicit permission grant Azure does not give by default. |

**⚠ GAP — line-anchored comments.** The GitHub grader posts a *line-anchored* verdict (the action can
attach comments to specific diff lines). `post-pr-thread.sh` posts a **single PR thread** whose body
cites `path:line` textually (from the anchor set) but is **not** natively anchored to diff lines. The
Azure REST API *does* support `threadContext` (file path + line range), so this is an available
enhancement, not a hard limit — but as shipped, anchoring is textual, not native. Flagged, not hidden.

**⚠ GAP — `--permission-mode bypassPermissions`.** The CLI has no interactive approver on a CI agent, so
the review runs with permissions bypassed. This is mitigated by the restricted `--allowedTools` allowlist
per gate and the ephemeral runner, but it is a concession the action abstracted away. Keep the allowlists
tight; do not add `Write`/`Edit`/`Bash` to the grader.

## Gate-by-gate ledger

### 1. CI (`ci.yml`) — build-and-test (+ optional eval-gate)
- **Maps 1:1:** restore/build/test/lint via the seam templates; coverage floor enforced in the runner;
  eval-gate as an optional second hard stage from `ci-profile.eval_gate.command`.
- **Approximation:** `setup-dotnet` → `UseDotNet@2`; `services:` (GitHub service containers with an
  init-script caveat) → Azure requires a **container job** to attach `services`, so the Postgres sidecar
  is shipped commented-out with a note, not as a drop-in. Coverage threshold is expressed via coverlet
  `Threshold`/`ThresholdType` run-settings args (GitHub left it to "configure in the runner"); this is a
  concrete realization, faithful to the intent.
- **Also blocks on push:** the `trigger:` on main runs CI on merge to feed deploy-dev (GitHub had the
  same dual `push` + `pull_request`).

### 2. Grader (`grader.yml`) — advisory
- **Maps 1:1:** spec-file detection in the diff, anchor set, sonnet model, `Bash Read Grep Glob`,
  fail-soft (Claude step `continueOnError`, job always succeeds), "update the same comment on re-runs"
  (reproduced by the hidden `<!-- rails-gate:grader -->` marker + PATCH).
- **Approximation:** "required to RUN, verdict never blocks" → a **blocking build validation** of a
  pipeline engineered to always conclude success. Requiring it therefore gates *ran*, never *verdict* —
  the faithful analogue of GitHub adding `grader` to required checks. If you prefer a purely advisory
  posture, set `isBlocking: false` (documented in `branch-policies.json`), at the cost of not enforcing
  "it ran."
- **⚠ GAP:** line-anchored comment (see cross-cutting).

### 3. Correctness (`correctness.yml`) — blocks
- **Maps 1:1:** source-scoped anchors as the scope, short-circuit-to-pass when no source changed, opus
  model, `Bash Read Grep Glob Write`, verdict file **outside** the work tree, exact first-line prefix
  match, fail-closed when no verdict appears.
- **⚠ GAP — override re-trigger.** GitHub re-runs the gate on `labeled`/`unlabeled` events, so applying
  `accepted-risk:correctness` promptly unblocks the merge. **Azure DevOps does not re-queue a build
  validation when a PR label changes.** The override is honored (the enforce step queries PR labels via
  REST and passes on the label), but you must **manually re-queue** the `correctness-review` build (or
  push a commit) for it to take effect. This is the single most material behavioral difference in the
  pack — flagged loudly here and in RAILS.md.
- **Approximation:** GitHub PR "labels" → Azure PR "labels" (tags), read via `GET pullRequests/{id}/labels`.

### 4. Security (`security.yml`) — blocks
- **Maps 1:1:** gated-path regex (slash-anchored, `.azuredevops/` self-gates the pipeline), `risk:high`
  escalation, short-circuit-to-pass, opus, `Bash Read Grep Glob Write Edit`, verdict outside the tree,
  fail-closed.
- **Approximation:** `risk:high` label read via REST (same as correctness). Same **⚠ label re-trigger
  GAP** applies to `risk:high` — adding the label does not auto-re-queue the security build; re-queue or
  push.
- **Note:** the gated-path regex must stay in sync across three files, exactly as on GitHub — here
  `security.yml`, the required-reviewer path filters in `branch-policies.json`, and the security rubric.

### 5. Deploy Dev (`deploy-dev.yml`) — starter
- **Built fresh** to §5 (as on GitHub — the source deferred deploy).
- **Maps 1:1 in principle:** promote-never-rebuild (downloads the CI artifact from the triggering run),
  rollback-that-is-rehearsed (`strategy.runOnce.on.failure`), dev-only automation, deliberate promotion
  beyond dev via Environment approvals/checks.
- **Approximation:** GitHub `workflow_run` on a successful CI run → **`resources.pipelines`** completion
  trigger. A pipeline-resource completion trigger fires on a **successful** source run by default, so the
  job `condition` only pins the branch (`resources.pipeline.ci.sourceBranch == refs/heads/main`) rather
  than re-checking a conclusion field. If you want an explicit belt-and-suspenders success check, verify
  the run-result resource variable available in your Azure DevOps version and add it — I did not assert
  an unverified variable name here.
- **Placeholders:** every deploy/rollback/health step is a placeholder that intentionally fails until
  wired — identical posture to the GitHub starter.

### 6. Eval regression (`eval-regression.yml`) — blocks
- **Maps 1:1:** fast suite, per-metric scoring, baseline-vs-head trip-wire, fail-closed stub (`exit 1`
  until the runner is wired), the practitioner-figure maturity flag, untrusted-input handling.
- **Approximation:** GitHub `paths:` PR filter → the PR gate is scoped by the **build-validation policy's
  path filters** (Azure Repos ignores `paths:` for PR runs), which must be kept in sync with the
  pipeline's `paths` — documented in both files and in `branch-policies.json`.
- **Approximation:** `actions/upload-artifact` + "comment scorecard" → `PublishTestResults@2` (JUnit) +
  a placeholder that posts the metric table via `post-pr-thread.sh`.

### 7. Eval suite (`eval-suite.yml`) — advisory
- **Maps 1:1:** manual + scheduled, off-by-default via `EVAL_ENABLED`, JUnit + JSON outputs, untrusted
  `workflow_dispatch` inputs → typed pipeline `parameters` routed through env with the same validation.
- **Approximation:** `workflow_dispatch` inputs → runtime `parameters:`; the `schedule` cron + the
  `EVAL_ENABLED`-gated job condition reproduce "scheduled runs only when opted in; manual always
  available."

## Branch policy (`configure-branch-policies.sh` + `policies.json`)
- **Maps 1:1 in effect:** required checks → build validation; required non-author approval →
  approver-count with `creatorVoteCounts:false`; CODEOWNERS → required-reviewer with path filters; the
  "edit JSON, re-run the script, never hand-edit the UI" discipline; `--dry-run`; confirm-before-apply.
- **Approximation:** GitHub's single ruleset object → a **set** of Azure policies. There is no single
  atomic apply — the script realizes each policy independently and is idempotent per policy (matched by
  build-definition id / policy type), not by a single ruleset name.
- **Approximation:** GitHub ruleset `bypass_actors` with `bypass_mode: pull_request` → Azure's **"Bypass
  policies when completing pull requests"** repo permission (documented in RAILS.md's solo-repo section).
  Different surface, same "solo repo can still self-merge; CI still gates" outcome.
- **Could not fully reproduce here:** the ruleset's `deletion` / `non_fast_forward` rules have no direct
  single-policy equivalent — on Azure these are covered by requiring PRs (blocks direct pushes/force-push
  to the protected branch) plus branch security permissions, which this script does not set. Flagged as a
  documented gap: set branch "Force push" / "Delete" permissions to Deny for the protected branch
  manually, or extend the script.

## Things I could NOT fully reproduce (summary)
1. **Label-change re-trigger** (correctness override, `risk:high` escalation) — Azure does not re-queue a
   build validation on PR label change. Manual re-queue required. **Material.**
2. **Native line-anchored review comments** — shipped as textual `path:line` citations in a single
   thread; native `threadContext` anchoring is available but not wired.
3. **Explicit CI-success re-check in deploy-dev** — relies on the pipeline-resource trigger's default
   "fires on success," not an asserted run-result variable.
4. **`deletion` / `non_fast_forward` branch rules** — left to repo branch permissions, not scripted.
