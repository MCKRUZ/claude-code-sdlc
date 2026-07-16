# Changelog

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
