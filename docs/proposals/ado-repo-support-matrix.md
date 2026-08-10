# ADO Repo Support — Fix Matrix (Folded)

**Goal:** make the plugin fully usable on projects whose repos live in Azure DevOps, not GitHub.

**Where we are:** the Azure Pipelines side already exists — `harness/packs/cicd/azure-devops/` is a
complete CI/CD pack, and setting `stack.ci_cd.platform: azure-devops` in a profile selects it. But
several parts of the core still assume GitHub regardless of that setting (the installer copies GitHub
files unconditionally, the doctor requires the `gh` CLI, the PR hooks/skills call `gh`, and much of the
command prose names only GitHub paths).

**This document:** the remaining work, folded into five packages (A–E). Planned as one spec = one
branch = one PR each; see Sequencing for how they actually landed. Effort is human-scale (**S** =
under half a day, **M** = 1–2 days); Claude-assisted, figure ≈ 1 session per fold plus your review.

| # | Fix | Effort | Priority | Fix description | GitHub functionality today (unchanged — kept as-is) | What it adds for ADO |
|---|-----|--------|----------|-----------------|----------------------------------|--------------------------|
| A | Installer platform-awareness (`scripts/install_harness.py`) | M | **P0** | Make `DIR_MAP`/`EXTRA_FILES` respect `stack.ci_cd.platform` — skip the GitHub payload when platform ≠ github-actions; install rubrics to the platform's expected dir (`.azuredevops/rails/rubrics/` for ADO); add an ADO golden install tree mirroring `enterprise-tree.txt` to prove both | Unconditionally copies `.github/workflows/` (10 Actions YAMLs), `rulesets/branch-protection.json`, `CODEOWNERS`, `apply-branch-protection.sh` into every target repo; rubrics hard-wired to `.github/profile/rubrics/` | A clean install — only `.azuredevops/pipelines/` lands, no dead GitHub workflows; the grader/security/correctness pipelines actually find their rubrics (today a live bug — the ADO rubric path points at nothing); regression-proofed by the golden tree |
| B | Pack-aware doctor (`scripts/doctor.py` + `test_doctor.py`) | M | **P1** | Branch on the installed pack (from `.claude/harness-manifest.json`): require `az` not `gh`, scan `.azuredevops/pipelines/` for variables, check `az repos policy list` instead of `gh api rulesets`; add test cases for the az branch | `gh` is a FAIL-level required tool; secrets via `gh secret list`; branch protection via `gh api repos/.../rulesets`; only scans `.github/workflows/` | `/sdlc-doctor` validates the real setup (az login, variable groups, branch policies) instead of failing you for not having GitHub tooling |
| C | PR-flow rails on ADO (`harness/settings.json`, `harness/hooks/review-gate.{sh,ps1}`, `harness/skills/pr-writer/SKILL.md`) | S | **P1** | Ship a pack-level settings fragment (merge machinery already exists): allow `az repos pr view/list` + `az pipelines runs`, gate `Edit/Write(./.azuredevops/**)`; add `az repos pr create` to both review-gate trigger regexes; parameterize pr-writer's open step (`az repos pr create`, risk as ADO tag / linked work item) | Allowlists `gh pr view/list/diff`, `gh run list/view`; gates edits to `./.github/**` only; review gate fires on `git push` or `gh pr create` only; pr-writer hard-codes `gh pr create` + `risk:high` label | Claude reads PRs/builds without permission prompts; pipeline definitions get the same tamper-protection as the GitHub rails; the human-review-before-PR rail holds when PRs open via az CLI (today silently bypassed); spec→PR traceability and risk flagging survive on ADO PRs. Verify with one live drill: open a real ADO PR, watch the gate fire |
| D | Prose sweep (commands, harness docs, phases, profiles) | S–M | **P2** | One editorial pass, rule = "name both platforms": `commands/sdlc-setup.md` Step 7 + confirmation, `sdlc-harness.md`, `sdlc-doctor.md`, `templates/phases/close/harness-audit.md`; harness `HARNESS.md`/`README.md`/`CLAUDE.md.template` tour; phases 03/08/09 wording (variable groups / Key Vault, Azure Artifacts release, ADO Boards triage); fix `microsoft-enterprise` profile's `platform: github-actions` claim (the `ado-enterprise` example profile was pulled forward — see Fold 0); document the **platform-switch runbook** in `sdlc-upgrade.md` (edit `stack.ci_cd.platform` in the frozen `.sdlc/profile.yaml` → `/sdlc-upgrade` dry-run + `--apply` → old pack files classify RETIRED, new pack lands as NEW → human deletes retired files → doctor + shakedown drills; clean only once Fold A stops core from emitting `.github/` on every platform) | Setup says branch protection "needs GitHub + `gh`"; deliverables/audit checklists enumerate `.github/...` paths; doctor doc advises `gh secret set`; docs tour `.github/` layout; phase prose says "GitHub secrets / release / Issues"; flagship enterprise profile ironically declares GitHub Actions | Commands are executable prose — the model does what the doc says, so `/sdlc-setup` and the close-phase audit actually walk the ADO path; client-facing `docs/harness.md` describes the repo they actually have; the command-contract lint (`test_command_contracts.py`) auto-validates the script/flag references |
| E | Keyless gate auth via Azure AI Foundry + RBAC (`harness/packs/cicd/azure-devops/`: `run-claude-review.sh`, pipeline YAMLs, `README.md`/`RAILS.md`; `scripts/doctor.py`) | M (incl. spike) | **P1** | Make gate auth a profile choice: `api-key` (today's path, kept as fallback) or `foundry-entra`. Foundry mode: pipelines authenticate via a **service connection with workload identity federation** (`AzureCLI@2` wrapper task); `run-claude-review.sh` accepts the keyless path (`CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_RESOURCE`, Azure default credential chain or `ANTHROPIC_FOUNDRY_AUTH_TOKEN`) **only when foundry mode is explicitly selected — with no foundry flag the script behaves exactly as today (`ANTHROPIC_API_KEY` required, exit 3 without)**; pin model deployments via `ANTHROPIC_DEFAULT_{SONNET,OPUS}_MODEL` (the rails' `--model sonnet\|opus` aliases map through these); doctor checks the service connection / `az account get-access-token` + `Azure AI User` role instead of the key variable. **Spike first**: Azure Pipelines + Foundry is not an officially documented Claude Code path (GitHub Actions is) — prove the WIF → credential-chain flow with one live drill before speccing the full fold | Gates authenticate with a static `ANTHROPIC_API_KEY` — the GitHub pack via the Claude GitHub App / repo secret, the ADO pack via a Key-Vault-backed variable group (`run-claude-review.sh` exits 3 without it) | No static Claude credential anywhere: the pipeline's managed identity gets the **`Azure AI User`** role scoped to the Foundry resource — revocable, auditable via Entra sign-in logs, rotation-free. Data residency option (Azure-hosted deployment). Strengthens the compliance story the profiles already sell (SOC 2 secret-management posture). Works because the ADO gates already run the real Claude Code CLI, which supports Foundry natively — this is config plumbing, not new machinery |

## Additive guarantee (design rule for every fold)

Nothing is replaced. The GitHub path and the API-key auth path keep working exactly as they do
today; all new behavior is opt-in via existing selectors (`stack.ci_cd.platform`, the installed
pack manifest, or an explicit foundry auth mode).

- **Invariant:** a `github-actions`-profile install and an API-key gate run are byte/behavior-identical
  before and after each fold. The only behavior that changes is on the `azure-devops` path — which is
  broken today, so there is nothing working there to preserve.
- **Enforcement:** the existing test suite must pass **unmodified** — in particular the golden install
  tree (`scripts/tests/golden/enterprise-tree.txt`) pins the GitHub layout, and `test_doctor.py` pins
  the `gh` checks. New ADO/Foundry tests are additions beside them, never edits to them. A fold that
  needs to change an existing test to pass has broken the guarantee.

## Fold 0 (pulled forward): `ado-enterprise` profile — DONE + VERIFIED on this branch

Verified by a 4-lens pass (full pytest suite; fresh-repo e2e drill incl. gate check, artifact
snapshot, and an idempotent upgrade dry-run — 0 CONFLICT / 0 RETIRED; byte-level content audit
vs the sibling profile; repo-wide integration-gap sweep). Fixes applied from the audit: stale
`profile_id` in the copied `switchboard-rules.json` + one prose line in `references/azure-patterns.md`;
the profile added to all five curated profile lists (`commands/sdlc-setup.md`, `README.md`,
`SKILL.md`, `docs/commands.md`, `docs/profiles.md`, `docs/architecture.md` tree). New guard:
`test_validate_profile.py::TestOnDiskProfiles` validates every `profiles/*/profile.yaml` against
the real schema and pins `profile_id == directory name` (the compliance-gate lookup contract) —
future profiles get CI coverage the moment the directory exists. Suite: 818 passed.

A copy of `microsoft-enterprise` with `platform: azure-devops` (plus profile_id and CLAUDE-md
template wording). Pure addition, auto-discovered by `/sdlc-setup`, zero code touched. Ships
first because (1) it unblocks ADO projects today (with the known Fold-A warts), and (2) Fold A's
ADO golden-tree test installs *from* it. Verified: `validate_profile.py` PASS; a scratch install
composes the ADO pack (`.azuredevops/pipelines/` ×10, `configure-branch-policies.sh`,
`run-claude-review.sh`, `post-pr-thread.sh`, ADO MCP fragment merged) — and reproduces both
Fold-A warts exactly as predicted (10 GitHub workflows + ruleset + CODEOWNERS installed anyway;
rubrics at `.github/profile/rubrics/` while `.azuredevops/rails/rubrics/` is missing).

## Folds A–D — DONE on this branch (consolidated; see Sequencing)

- **Fold A — DONE** (landed `7a9b999`): platform-aware core install — `stack.ci_cd.platform` gates the GitHub payload and rubrics land in the pack's expected dir; verified by the new ADO golden install tree, with the GitHub golden tree byte-identical.
- **Fold B — DONE** (landed `9c2d4ed`): pack-aware doctor — `az` login / variable-group / branch-policy checks on ADO installs; GitHub doctor output byte-identical (the `gh` pins in `test_doctor.py` unmodified).
- **Fold C — DONE** (landed `84f4702`): PR-flow rails on ADO — `az repos pr create` added to both review-gate trigger regexes, pack-level settings fragment (az allowlist + `.azuredevops/**` edit gate), pr-writer's open step parameterized.
  - **Live drill — PASSED** (real ADO repo `RheemDevOps/Expedition_One/test-repo`, 2026-08-09): harness installed from this branch with the `ado-enterprise` profile; installed hook carried the az trigger and the merged az settings fragment. With a `src/` change committed and **no** review receipts, the installed `review-gate.sh` returned `deny` for both `az repos pr create` and `git push`; after writing `code-review`+`simplify` receipts for HEAD, both flipped to allow. End-to-end confirmed: pushed the branch and `az repos pr create` opened a real PR (#36931), then abandoned it and deleted the branch — client project left clean.
- **Fold D — DONE (this commit)**: the prose sweep — commands, harness docs, phases, and profiles name both platforms; the platform-switch runbook documented in `commands/sdlc-upgrade.md`.

## Sequencing — as planned vs. as landed

- **Fold 0 first** (done): the profile is the fixture everything else tests against.
- **Planned:** one spec = one branch = one PR per fold; B, C, D, E independent of A and each other, parallelizable across worktrees, review bandwidth the only serialization.
- **Landed:** Folds 0/A/B/C/D consolidated into **PR #47** — one branch, one commit per fold (`383b606` → this commit), reviewed as a unit. Review bandwidth *was* the serialization, and one consolidated review cost less than five; the additive guarantee was still checked commit-by-commit (suite green, GitHub goldens byte-identical at every fold), so the per-fold audit trail survives inside the single PR.
- **A was still the gate** and landed first after Fold 0: until it, every ADO install was polluted with GitHub artifacts and had broken rubric paths.
- **E stays separate, spike-first** (live drill: one rail pipeline authenticating to Foundry via workload identity federation on a real ADO project + Foundry resource) — its own branch and PR, spec'd only after the drill passes.
- Acceptance for any fold: existing test suite green + new ADO golden tree + one real `--profile <ado>` install into a scratch repo, eyeball the tree. Held for A–D.

## Fold E spike — PASSED with one administrative prerequisite (2026-08-09)

Ran against a live sandbox Foundry deployment (`arjunm-claude-anthropic`, eastus2, deployments
named identically to model ids: claude-sonnet-5 / claude-opus-4-8 / claude-haiku-4-5 / claude-fable-5),
using the exact rail invocation (`npx @anthropic-ai/claude-code -p ... --output-format text`):

- **End-to-end completion through Foundry: PROVEN** (`FOUNDRY-SPIKE-OK`) with
  `CLAUDE_CODE_USE_FOUNDRY=1` + `ANTHROPIC_FOUNDRY_RESOURCE` + `ANTHROPIC_DEFAULT_*_MODEL` pins.
- **Entra credential chain: PROVEN to authenticate** — with no key set, the CLI walked the Azure
  chain off the `az login` context and got `401 Principal does not have access to API/Operation`,
  an authorization (not authentication) failure: the token minted and was presented.
- **The keyless gap is exactly one RBAC grant**: the principal needs a data-plane role on the
  resource. **Tenant nuance: the role "Azure AI User" does not exist in this tenant — the real
  role is `Cognitive Services User`.** Sandbox principal was Contributor-not-Owner, so could not
  self-grant (`roleAssignments/write` denied). In the pipeline scenario the grant goes to the
  service connection's identity at provisioning time — document it as a provisioning step.
- **Local-testing gotcha for the docs**: a Claude Code *desktop* session exports
  `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` (+ `ANTHROPIC_FOUNDRY_*`), and any child CLI inherits it
  and defers to the app ("Foundry credentials are managed by the desktop app"). Spike runs must
  scrub the env (`env -i`); CI agents are clean by nature and unaffected.
- Pipeline WIF leg deferred to implementation: the deterministic pattern is `AzureCLI@2` →
  `az account get-access-token --resource https://cognitiveservices.azure.com` →
  `ANTHROPIC_FOUNDRY_AUTH_TOKEN` (pre-issued token accepted per CLI docs, v2.1.203+).

**Verdict: GO** — Fold E's implementation proceeds on proven facts; the RBAC grant and role-name
nuance land in the provisioning docs.

## Fold E references

- Claude Code on Microsoft Foundry: https://code.claude.com/docs/en/microsoft-foundry.md (env vars, Entra ID default credential chain, RBAC roles)
- Feature availability by provider: https://code.claude.com/docs/en/feature-availability.md (nothing the rails use is Foundry-gated; web search unavailable on Azure-hosted deployments)
- Foundry requires explicit model deployments + version pinning — no auto-resolution of `sonnet`/`opus` aliases without `ANTHROPIC_DEFAULT_*_MODEL`.

## Out of scope

`scripts/specs_to_ado_csv.py` (work-item export) is already ADO-native but has client-specific
area-path heuristics (EPR/CCaaS/Rheem) hard-coded in `classify()` — generalize to config before
it ships in the plugin. Not a GitHub-dependency fix, tracked separately.
