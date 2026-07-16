# Changelog

## 0.8.0 — 2026-07-16

- **Angular frontend pack.** The flagship microsoft-enterprise profile declares `angular-17`, which
  until now degraded to the framework-agnostic UX reviewer plus a warning. It now composes an
  Angular-aware `ux-reviewer` over the generic one — checks for the states the async pipe swallows,
  `OnPush` subtrees that never repaint after an in-place mutation, NG0100 (dev-only, so it goes
  silent rather than away in production), resolver-blocked navigation, `[disabled]` vs `disable()`,
  subscription teardown, and focus management on navigation. Version-gated: the reviewer reads
  `@angular/core` from `package.json` before citing syntax, because a v17 repo should not be
  reviewed against v20 features.
- **`angularjs` is explicitly unsupported** rather than merely unlisted — AngularJS 1.x is a
  different framework, and it degrades with a warning instead of quietly pulling the Angular pack
  (the same distinction that keeps `react-native` off the React web pack).
- **Every axis the flagship profile declares now has a pack**: a warning-free install is now pinned
  by a test, so any future axis that silently degrades fails the suite.

## 0.7.0 — 2026-07-16

- **Two new stack packs: `node-typescript` and `python`.** Every shipped profile now composes a
  realized stack instead of degrading to the neutral core: starter (typescript/node) and
  creative-tooling (python/uv) join microsoft-enterprise (csharp). Each pack brings its stack
  standards (spliced into `CLAUDE.md`), deep rules, an `api-pattern` skill, tooling permissions
  merged into `settings.json`, and a `ci-profile.yaml` — so its pipeline is realized through the
  mechanical seam rather than hand-adapted. Both are authored, not harvested; each README says so.
- **starter and creative-tooling now declare `ci_cd.platform: github-actions`.** Without it the
  CI/CD axis degraded and those repos kept the core's placeholder pipelines — which carry .NET
  reference commands. The core installs the same workflow files either way; declaring the platform
  replaces placeholders with realized ones.
- **The customer profile's `quality.coverage_minimum` now sets the CI coverage floor**, overriding
  the stack pack's declared default (the profile is the later, more specific layer). starter states
  60; its gate now enforces 60, where the pack's default would have imposed 80.
- The coverage gate accepts any cobertura report under `coverage/` (`coverage.cobertura.xml`,
  `cobertura-coverage.xml`, `coverage.xml`) — report names differ per stack and none is wrong, so
  the platform adapts instead of each stack renaming its output.

## 0.6.0 — 2026-07-16

- **The stack↔CI/CD seam is now mechanical.** It was documentation-only: the CI/CD packs hardcoded
  .NET commands with comments naming where a human had copied them from `ci-profile.yaml`, a file
  the installer never read and that never reached a repo. Composing a non-.NET stack with either
  CI/CD pack would have installed a .NET pipeline. The packs' workflows now carry a closed
  vocabulary of nine `<<CI_*>>` seam tokens which the installer fills at compose time from the
  resolved stack pack's `ci-profile.yaml` (commands, toolchain version, coverage floor) and the
  CI/CD pack's own `toolchain_map` (platform knowledge: which setup action installs a toolchain and
  what its version input is called). Adding a stack is now one `ci-profile.yaml`, not a per-stack
  copy of every pipeline.
- Fail-closed: an unmapped `toolchain.id`, a missing ci-profile value, a multi-line command, or a
  residual seam token in an installed file each fail the install with a clean error — a literal
  token can never reach a client repo. Phase-3 repo blanks (`{{SOLUTION_OR_PROJECT}}`,
  `<<CI_WORKFLOW_NAME>>`, …) pass through untouched.
- Degrade-independent: a CI/CD pack composed without a stack pack keeps its seam tokens and prints a
  warning naming the files to hand-adapt, rather than failing.
- Azure DevOps templates generalized: `use-dotnet.yml` → `setup-toolchain.yml`,
  `dotnet-restore-build-test.yml` → `restore-build-test.yml`.

## 0.5.0 — 2026-07-16

- **spec-gate** (harness): a deterministic blocking check — a pull request that changes source
  without a committed `specs/NNNN-*.md` in the diff is refused. "No spec, no build" was previously
  a grader warning; it is now mechanical. Recorded escape: the `no-spec:chore` label plus a reason
  in the PR description. Added to the required-status-check set on both CI platforms (the merge bar
  is now five blocking checks).
- **Coverage floor enforced** (harness): the GitHub CI rail gained the cobertura-parsing floor step
  the Azure DevOps pack already had — a sub-threshold run now exits non-zero instead of uploading a
  low number to a report nobody reads. Fails closed when no coverage report is produced.
- **Stop hook runs tests by default**: `RAILS_STOP_RUN_TESTS=0` opts out (was opt-in). The AI can no
  longer end a turn on red tests in a default install.
- Shakedown drills added for both new gates in the core and both CI/CD packs.

## 0.4.0 — 2026-07-16

- Install manifest: `install_harness.py` writes `.claude/harness-manifest.json` — plugin version,
  composed packs, and a sha256 of every file *as installed* (the pristine baseline that makes
  adaptation detectable later).
- `/sdlc-upgrade` + `scripts/upgrade_harness.py`: safe upgrades for installed harnesses. Files
  still factory-original are replaced with the new version; repo-adapted files are left alone;
  files changed on both sides are written beside the original as `<file>.harness-new` for a
  deliberate merge. Dry-run by default; `--apply` to execute. Legacy installs (no manifest) are
  adopted on first apply.

## 0.3.0 — 2026-07-16

- Profile-aware pack composition: the harness installer composes packs along four axes — stack
  (`stack.backend.language`), CI/CD (`stack.ci_cd.platform`), frontend (`stack.frontend`), and
  tools (`tools: [...]`) — on top of the neutral core; each axis degrades independently with a
  WARNING when no pack exists.
- Team `.mcp.json` composition: the installer writes the team's shared MCP server set at the repo
  root (core servers plus pack additions), re-merged on every run.
- CLAUDE.md splice data-loss fix: installing the harness no longer loses locally edited content in
  the governance `CLAUDE.md` sections it manages.
- Commands reference plugin files via `${CLAUDE_PLUGIN_ROOT}` instead of hardcoded install paths.
- Secret-scan gate added to the harness payload.
- Stop-gate hook fixed to the exit-0 + JSON block contract, so the block reason reaches Claude.

## 0.2.0

- SDLC lifecycle + initial harness payload.
