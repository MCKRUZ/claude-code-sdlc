# Kit workflows — the rails layer

The five CI/CD workflows that implement the delivery standard's §6 rails. On install
they go to `.github/workflows/` in the client repo; their supporting rubrics,
CODEOWNERS, ruleset, and scripts come from `../profile/`. For the operator's guide —
go-live steps, the merge bar, and the **shakedown drill** that proves each rail fails
safely — read [`RAILS.md`](./RAILS.md).

## The five workflows

| Workflow | File | Fires on | Block or advise | Source |
| --- | --- | --- | --- | --- |
| **CI** | `ci.yml` | every PR + push to main | **BLOCKS** (build/test/coverage; optional eval-gate) | generalized from source `ci.yml` |
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

| Placeholder | Where | What to set |
| --- | --- | --- |
| `<<DEFAULT_BRANCH>>` | ci, grader, deploy-dev, diff-anchors.sh | base/protected branch (reference: `main`) |
| `~DEFAULT_BRANCH` | ruleset JSON | resolves to the repo default branch on apply |
| `<<BUILD_TOOLCHAIN>>` | ci | setup-* action + version (reference: .NET 10) |
| `<<RESTORE_CMD>>` / `<<BUILD_CMD>>` / `<<TEST_CMD>>` | ci | your stack's commands |
| `<<SOLUTION_OR_PROJECT>>` | ci | solution / workspace / manifest path |
| `<<SERVICE_PROVISIONING>>` | ci | `services:` block + schema/seed (or delete) |
| `<<COVERAGE_THRESHOLD>>` | ci | enforce the 80% floor in the test runner |
| `<<EVAL_GATE>>` / `<<EVAL_TEST_PROJECT>>` / `<<EVAL_FILTER>>` | ci | the optional eval-fixture hard gate (or delete the job) |
| `<<SPEC_DIR>>` | grader | committed-spec directory (reference: `specs/`) |
| `<<MODEL>>` | grader / security / correctness | reviewer model (sonnet / opus) |
| `<<GATED_PATHS>>` | security (+ CODEOWNERS, security rubric) | slash-anchored guarded-dir regex — keep all three in sync |
| `<<SOURCE_PATHS>>` | correctness | source root pathspec (reference: `src/`) |
| `<<CI_WORKFLOW_NAME>>` | deploy-dev | must equal `ci.yml`'s `name:` |
| `<<ARTIFACT_NAME>>` | deploy-dev | the deployable artifact CI uploads (CI must upload it) |
| `<<DEPLOY_STEP>>` / `<<HEALTH_CHECK>>` | deploy-dev | real deploy + health probe (azure/webapps-deploy, `az deployment`, kubectl…) |
| `<<CAPTURE_LAST_GOOD>>` / `<<RESTORE_LAST_GOOD>>` | deploy-dev | record live version + rollback mechanism |
| `<<DEV_ENVIRONMENT>>` | deploy-dev | GitHub Environment name (reference: `dev`) |
| `<<CODE_OWNER>>` | CODEOWNERS | owning user/team handle |
| `<<RULESET_FILE>>` | apply-branch-protection.sh | ruleset JSON path if layout differs |

Required-status-check **context names** in `../profile/rulesets/branch-protection.json`
must match the workflow **job names**: `build-and-test`, `grader`, `correctness-review`,
`security-review` (and `eval-gate` if you keep that job). Rename a job → rename its
required-check context.

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

## Known drift — flag for the standard's owner

`GOLD-STANDARD.md` §6 ("What a delivery repo contains") shows a `.github/workflows/`
tree listing only **four** workflows:

```
ci.yml · grader.yml · security.yml · deploy-dev.yml
```

It **omits `correctness.yml`**. But `docs/the-rails.md` is explicit and authoritative
that there are **five** rails — its §1 banner ("All five…"), its §3 gates table, and
its §4 merge bar all name **correctness** as a distinct, blocking rail separate from
the grader. This kit ships the **five-workflow** set, treating `the-rails.md` as the
source of truth.

**Action for the standard's owner:** update the GOLD-STANDARD §6 tree to include
`correctness.yml` (blocks on a high-confidence defect) so the two documents agree. This
is a documentation drift in the standard, not a defect in the kit.
