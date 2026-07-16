# Azure DevOps CI/CD pack

The Azure Pipelines realization of the delivery standard's §6 rails — the peer of the GitHub Actions
pack. It takes one axis of the two-axis pack model (see [`../../README.md`](../../README.md)): the
**CI/CD** axis answers *which pipeline platform runs the rails?* The other axis — the **stack** — answers
*how do we build in this technology?* This pack pairs with any stack pack; `dotnet + github` and
`dotnet + azure-devops` reuse the *same* stack pack.

## What this pack is

Seven pipelines that implement the five rails plus the two eval gates, the branch-policy-as-code tooling
that replaces GitHub branch protection, and the scripts that stand in for GitHub-only building blocks
(the Claude action, PR-comment posting).

| Rail / gate | File | Fires on | Block or advise |
| --- | --- | --- | --- |
| **CI** | `azure-pipelines/ci.yml` | every PR + push to main | **BLOCKS** (build/test/lint/coverage; optional eval-gate stage) |
| **Grader** | `azure-pipelines/grader.yml` | every PR | **ADVISES** — required to RUN, verdict never blocks |
| **Correctness** | `azure-pipelines/correctness.yml` | every PR (reviews when source changed) | **BLOCKS** on a high-confidence defect (label override) |
| **Security** | `azure-pipelines/security.yml` | every PR (reviews on gated paths / `risk:high`) | **BLOCKS** on HIGH |
| **Deploy Dev** | `azure-pipelines/deploy-dev.yml` | successful CI on main (merge) | ships; **rolls back** on failure — **STARTER** |
| **Eval regression** | `azure-pipelines/eval-regression.yml` | PRs touching the agentic surface | **BLOCKS** on degradation |
| **Eval suite** | `azure-pipelines/eval-suite.yml` | manual + scheduled | **ADVISORY** — never gates PRs |

## The seam — how it consumes the stack pack

The stack pack **declares** its commands in `ci-profile.yaml` (`toolchain`, `solution`,
`commands.{restore,build,test,lint}`, `coverage.floor_percent`, `eval_gate.test_filter`,
`session_health.command`). This pack **realizes** them in Azure Pipelines syntax, so the two axes stay
independent — add a stack and every CI/CD pack can run it; add a CI platform and every stack works on it.

The realization lives in two step templates, each slot marked with a `# «stack pack: ci-profile.…»`
comment carrying the .NET reference value as its default:

- `templates/use-dotnet.yml` — `actions/setup-dotnet` → **`UseDotNet@2`** (consumes `ci-profile.toolchain`).
- `templates/dotnet-restore-build-test.yml` — the `dotnet restore/build/test/lint` script steps
  (consumes `ci-profile.commands` + `ci-profile.coverage.floor_percent`, enforced in the runner via
  coverlet threshold args so a coverage miss is a non-zero exit).

`ci.yml` includes these templates; it hard-codes no stack commands as policy. A repo on a different stack
swaps the two templates for its own (`UseNode@1` + `npm` steps, etc.) — the interface it consumes is
`ci-profile.yaml`, not this file.

## Install map

On install, the overlays in `pack.yaml` land in an Azure DevOps repo as:

| Pack source | Repo destination |
| --- | --- |
| `azure-pipelines/*.yml` | `.azuredevops/pipelines/*.yml` |
| `azure-pipelines/templates/*.yml` | `.azuredevops/pipelines/templates/*.yml` |
| `scripts/*.sh` | `scripts/rails/*.sh` |
| `branch-policies/policies.json` | `.azuredevops/rails/branch-policies.json` |

Two **neutral, platform-agnostic** governance assets are **not shipped by this pack** — they are shared
verbatim with the github pack and installed by the core/profile layer (declared in `pack.yaml` under
`consumes`):

| Neutral asset (core/profile) | Installed path this pack references |
| --- | --- |
| `kit/profile/scripts/diff-anchors.sh` | `scripts/rails/diff-anchors.sh` |
| `kit/profile/rubrics/{grader,correctness,security}.md` | `.azuredevops/rails/rubrics/*.md` |

The pipeline prompts reference those installed rubric paths, and the LLM gates call
`scripts/rails/diff-anchors.sh` — the same deterministic changed-line scaffolding the GitHub rails use.
Nothing platform-specific is duplicated; only the platform realization (pipelines, branch policies, the
Claude-CLI + REST-thread scripts) is new here.

## How branch policies replace GitHub branch protection

GitHub encodes protection as a single **ruleset** (`branch-protection.json`) pushed with `gh api`. Azure
DevOps has no single ruleset object — protection is a **set of branch policies**. `branch-policies.json`
is the desired-state file, and `scripts/configure-branch-policies.sh` (the analogue of GitHub's
`apply-branch-protection.sh`) realizes each entry with the `az repos policy` CLI:

| GitHub mechanism | Azure DevOps mechanism |
| --- | --- |
| Required status check (`build-and-test`, `grader`, `correctness-review`, `security-review`) | **Build validation** policy per gate pipeline (`az repos policy build`), `isBlocking: true` |
| Required *non-author* approval | **Minimum approver count** policy with `creatorVoteCounts: false` (`az repos policy approver-count`) |
| CODEOWNERS review on gated paths | **Required reviewers** policy with path filters (`az repos policy required-reviewer`) |
| `pull_request` YAML trigger | **Build validation runs the pipeline on PRs** — Azure Repos ignores `pr:` in YAML; the policy is what schedules PR runs |
| Ruleset `deletion` / `non_fast_forward` rules | Azure branch policies + branch permissions (branch is protected by requiring PRs; direct pushes are blocked by policy) |

**Contexts must match:** the build-validation `displayName`s in `branch-policies.json` must equal the gate
pipelines' names in the project — `build-and-test`, `grader`, `correctness-review`, `security-review`,
`eval-regression` (and `eval-gate` if you keep that as a separate pipeline).

## Go-live

Full operator steps, the merge bar, the solo-repo accommodation, gate-integrity notes, and the shakedown
drills are in [`RAILS.md`](./RAILS.md). In short:

1. Adapt every `<<...>>` placeholder (build/test commands + service provisioning in `ci.yml`, gated-path
   regex in `security.yml`, source pathspec in `correctness.yml`, spec dir in `grader.yml`, every
   deploy/rollback step in `deploy-dev.yml`, and the org/project/repo/reviewer values in
   `branch-policies.json`).
2. Create the gate pipelines in Azure DevOps, each pointed at its `.azuredevops/pipelines/<gate>.yml`.
3. Add `ANTHROPIC_API_KEY` (and `EVAL_LLM_API_KEY` if you keep the eval gates) as a **variable group** —
   ideally Key-Vault-backed — and reference it from the gate pipelines.
4. Grant the build service identity **"Contribute to pull requests"** so the rails can post threads.
5. `scripts/rails/configure-branch-policies.sh --dry-run`, review, then run it to apply.
6. Wire and **rehearse** `deploy-dev` against a real dev Environment before trusting it.

## Fail-safe semantics (do not weaken)

- **Blocking gates fail CLOSED.** A gated change whose review can't complete (missing key, API hiccup)
  BLOCKS, never passes. The grader is the one exception — it advises, so it fails SOFT (the pipeline
  always concludes success).
- **Anti-tamper.** Correctness and security write/read their verdict file OUTSIDE the working tree
  (`$(Agent.TempDirectory)`) and delete any committed copy first, so a planted `PASS` can't satisfy the
  gate. The enforce step matches the verdict token as an **exact first-line prefix**.
- **Promote, never rebuild.** `deploy-dev` ships the exact artifact CI built for the commit (via a
  `resources.pipelines` trigger + `download`), and restores the last known-good version on a failed
  deploy or health check (the deployment strategy's `on.failure`).
