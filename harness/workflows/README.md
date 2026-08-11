# Kit workflows — the rails layer

Ten CI/CD workflow files that implement the delivery standard's §6 rails. On install
they go to `.github/workflows/` in the client repo; their supporting rubrics,
CODEOWNERS, ruleset, and scripts come from `../profile/`. For the operator's guide —
go-live steps, the merge bar, and the **shakedown drill** that proves each rail fails
safely — read [`RAILS.md`](./RAILS.md).

## The workflow files (and the gates they carry)

The rails started as five files (`ci`, `grader`, `correctness`, `security`,
`deploy-dev`) and grew by addition, never replacement, as the standard picked up new
concerns: dependency scanning and deploy promotion in 1.1.0, the eval-regression trip-wire
and periodic eval suite before that, fleet telemetry after. `ci.yml` alone carries three
blocking jobs — `build-and-test`, `spec-gate`, `dependency-gate` — so ten workflow files
yield the twelve gate rows below.

`deploy-promote.yml` is listed below but is **not a separate rail**: it is the second half of
the deploy rail. `deploy-dev` owns merge → dev (automatic, unattended); `deploy-promote`
owns everything beyond it (manual, human-gated). Neither carries a merge gate — they run
after the merge bar has already been cleared.

| Workflow | File | Fires on | Block or advise | Source |
| --- | --- | --- | --- | --- |
| **CI** | `ci.yml` | every PR + push to main | **BLOCKS** (secret scan/build/test + enforced coverage floor; optional eval-gate) | generalized from source `ci.yml` |
| **Dependency Gate** | `ci.yml` (`dependency-gate` job) | every PR | **BLOCKS** when the change INTRODUCES a package with a known High/Critical advisory (`accepted-risk:dependency` label = recorded override) | built fresh for the kit |
| **Dependency Scan** | `dependency-scan.yml` | weekly + manual | **ADVISES** — raises one self-closing issue for the standing stock; never blocks | built fresh for the kit |
| **Spec Gate** | `ci.yml` (`spec-gate` job) | every PR | **BLOCKS** — a source change with no spec in the diff is a fact (`no-spec:chore` label = recorded escape) | built fresh for the kit |
| **Grader** | `grader.yml` | every PR | **ADVISES** — required to RUN, verdict never blocks | generalized from source `grader.yml` |
| **Correctness Review** | `correctness.yml` | every PR (reviews when source changed) | **BLOCKS** on a high-confidence defect (override label) | generalized from source `correctness-review.yml` |
| **Security Review** | `security.yml` | every PR (reviews on gated paths / `risk:high`) | **BLOCKS** on HIGH | generalized from source `security-review.yml` |
| **Deploy Dev** | `deploy-dev.yml` | successful CI on `main` (merge) | ships; **rolls back** on failure | **BUILT FRESH** — starter, adapt per client |
| **Deploy Promote** | `deploy-promote.yml` | **manual only** (`workflow_dispatch`) | ships to test/prod after a named approver signs; **rolls back** on failure | **BUILT FRESH** — starter, adapt per client |
| **Eval Regression Gate** | `eval-regression.yml` | PRs touching the HIGH-risk agentic surface | **BLOCKS** on a metric regression past the trip-wire (§11) | built fresh for the kit |
| **Eval Suite** | `eval-suite.yml` | manual + scheduled | **ADVISES** — periodic full benchmark, off by default | built fresh for the kit |
| **Fleet Telemetry** | `rails-telemetry.yml` | weekly + manual | **REPORTS** — commits `.github/rails-telemetry.json` (what ran, every override, which checks branch protection actually requires); never blocks | built fresh for the kit |

Why each block-vs-advise choice exists (the-rails.md §3): mechanical truth (CI)
blocks; the grader **advises** because a confident AI verdict is exactly how an agent
talks a human into approving harm — "the grader ran" is required, *what it said* is the
human Checker's call; correctness and security **block** because a logic defect or a
HIGH vulnerability is a fact a machine can stand behind, with a human-recorded override
when consciously accepted.

## Placeholders — everything you must adapt

All client/repo-specific values are marked `<<LIKE_THIS>>` in the files (plus the
`@your-org/your-team` owner handle in CODEOWNERS). Replace them before go-live.
**Two marker styles exist:** the `<<DOUBLE_ANGLE>>` values below, and single-angle
`<PLACEHOLDER>` markers on the eval-runner wiring in `eval-suite.yml` /
`eval-regression.yml` and in `infra/main.bicep` — search for both styles when
adapting.

| Placeholder | Where | What to set |
| --- | --- | --- |
| `<<DEFAULT_BRANCH>>` | ci, diff-anchors.sh | base/protected branch (reference: `main`). grader.yml lists it for reference only — its body uses `github.base_ref` at runtime |
| `~DEFAULT_BRANCH` | ruleset JSON | resolves to the repo default branch on apply |
| `<<BUILD_TOOLCHAIN>>` | ci | setup-* action + version (reference: .NET 10) |
| `<<RESTORE_CMD>>` / `<<BUILD_CMD>>` / `<<TEST_CMD>>` | ci | your stack's commands |
| `<<SOLUTION_OR_PROJECT>>` | ci | solution / workspace / manifest path |
| `<<SERVICE_PROVISIONING>>` | ci | `services:` block + schema/seed (or delete) |
| `<<COVERAGE_THRESHOLD>>` | ci | the 80% floor — enforced by ci.yml's `Enforce coverage floor` step (`COVERAGE_FLOOR` env on the marked line) |
| `<<SPEC_GATE_SRC_RE>>` | ci | regex for what counts as source in the `spec-gate` job (reference: `^src/`) |
| `<<EVAL_GATE>>` / `<<EVAL_TEST_PROJECT>>` / `<<EVAL_FILTER>>` | ci | the optional eval-fixture hard gate (or delete the job) |
| `<<SPEC_DIR>>` | grader + grader rubric | committed-spec directory (reference: `specs/`) |
| `<<MODEL>>` | grader / security / correctness | reviewer model (sonnet / opus) |
| `<<GATED_PATHS>>` | security + CODEOWNERS header | slash-anchored guarded-dir regex — keep both, and the security rubric's prose path list, in sync |
| `<<SOURCE_PATHS>>` | correctness | source root pathspec (reference: `src/`) |
| `<<CI_WORKFLOW_NAME>>` | deploy-dev + deploy-promote | must equal `ci.yml`'s `name:` |
| `<<ARTIFACT_NAME>>` | deploy-dev + deploy-promote | the deployable artifact CI uploads (CI must upload it) |
| `<<DEPLOY_STEP>>` / `<<HEALTH_CHECK>>` | deploy-dev + deploy-promote | real deploy + health probe (azure/webapps-deploy, `az deployment`, kubectl…) |
| `<<CAPTURE_LAST_GOOD>>` / `<<RESTORE_LAST_GOOD>>` | deploy-dev + deploy-promote | record live version + rollback mechanism |
| `<<DEV_ENVIRONMENT>>` | deploy-dev | GitHub Environment name (reference: `dev`) |
| `<<SMOKE_TEST>>` | deploy-promote | one non-destructive check per top-priority journey — it runs against **prod** |
| `<<ENVIRONMENTS>>` | deploy-promote | the `choice` options for source/target (reference: `dev`, `test`, `prod`) — must match your GitHub Environment names |
| `<<CODE_OWNER>>` | CODEOWNERS | owning user/team handle |
| `<<RULESET_FILE>>` | apply-branch-protection.sh | ruleset JSON path if layout differs |

Required-status-check **context names** in `../profile/rulesets/branch-protection.json`
must match the workflow **job names**: `build-and-test`, `spike-guard`, `risk-signoff`,
`repro-gate`, `spec-gate`, `grader`, `correctness-review`, `security-review`,
`dependency-gate` (and `eval-gate` if you keep that job). Rename a job → rename its
required-check context. `check_standard.py` verifies this both ways: a required context
no job produces would block every PR forever, and a job calling itself a gate that the
ruleset does not require is decoration — it reports, and a red run merges anyway.

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
- **The dependency gate cannot prove itself green.** Every other gate here fails loudly
  when misconfigured. This one fails *silent and green*: a scan that cannot reach its
  vulnerability feed, or whose output parsing is wrong, reports no findings — which is
  indistinguishable from a clean repo. Both halves fail closed on a scan that ERRORS, but
  nothing can detect a scan that succeeds while seeing nothing. Only the shakedown drill
  (plant a known-vulnerable package) proves it is wired.

## Drift note — resolved

`GOLD-STANDARD.md` §6 previously listed four workflows and omitted `correctness.yml`.
**Reconciled 2026-06-30** — §6 and §10 now list all five (see `kit/README.md`,
"Drift this kit corrects"). `docs/the-rails.md` remains the authoritative rails
deep-dive.
