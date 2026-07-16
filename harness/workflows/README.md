# Kit workflows — the rails layer

The five CI/CD workflows that implement the delivery standard's §6 rails. On install
they go to `.github/workflows/` in the client repo; their supporting rubrics,
CODEOWNERS, ruleset, and scripts come from `../profile/`. For the operator's guide —
go-live steps, the merge bar, and the **shakedown drill** that proves each rail fails
safely — read [`RAILS.md`](./RAILS.md).

## The five workflows (and the gates they carry)

`ci.yml` carries two blocking gates — `build-and-test` and `spec-gate` — so five
workflow files yield six gate rows here.

| Workflow | File | Fires on | Block or advise | Source |
| --- | --- | --- | --- | --- |
| **CI** | `ci.yml` | every PR + push to main | **BLOCKS** (secret scan/build/test + enforced coverage floor; optional eval-gate) | generalized from source `ci.yml` |
| **Spec Gate** | `ci.yml` (`spec-gate` job) | every PR | **BLOCKS** — a source change with no spec in the diff is a fact (`no-spec:chore` label = recorded escape) | built fresh for the kit |
| **Grader** | `grader.yml` | every PR | **ADVISES** — required to RUN, verdict never blocks | generalized from source `grader.yml` |
| **Correctness Review** | `correctness.yml` | every PR (reviews when source changed) | **BLOCKS** on a high-confidence defect (override label) | generalized from source `correctness-review.yml` |
| **Security Review** | `security.yml` | every PR (reviews on gated paths / `risk:high`) | **BLOCKS** on HIGH | generalized from source `security-review.yml` |
| **Deploy Dev** | `deploy-dev.yml` | successful CI on `main` (merge) | ships; **rolls back** on failure | **BUILT FRESH** — starter, adapt per client |

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
| `<<CI_WORKFLOW_NAME>>` | deploy-dev | must equal `ci.yml`'s `name:` |
| `<<ARTIFACT_NAME>>` | deploy-dev | the deployable artifact CI uploads (CI must upload it) |
| `<<DEPLOY_STEP>>` / `<<HEALTH_CHECK>>` | deploy-dev | real deploy + health probe (azure/webapps-deploy, `az deployment`, kubectl…) |
| `<<CAPTURE_LAST_GOOD>>` / `<<RESTORE_LAST_GOOD>>` | deploy-dev | record live version + rollback mechanism |
| `<<DEV_ENVIRONMENT>>` | deploy-dev | GitHub Environment name (reference: `dev`) |
| `<<CODE_OWNER>>` | CODEOWNERS | owning user/team handle |
| `<<RULESET_FILE>>` | apply-branch-protection.sh | ruleset JSON path if layout differs |

Required-status-check **context names** in `../profile/rulesets/branch-protection.json`
must match the workflow **job names**: `build-and-test`, `spec-gate`, `grader`,
`correctness-review`, `security-review` (and `eval-gate` if you keep that job). Rename
a job → rename its required-check context.

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

## Drift note — resolved

`GOLD-STANDARD.md` §6 previously listed four workflows and omitted `correctness.yml`.
**Reconciled 2026-06-30** — §6 and §10 now list all five (see `kit/README.md`,
"Drift this kit corrects"). `docs/the-rails.md` remains the authoritative rails
deep-dive.
