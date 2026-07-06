# /sdlc-harness — Install or update the delivery harness

Install (or refresh) the standard-aligned delivery harness in the current repo, independent of a
full `/sdlc-setup`. Use this to add the harness to a repo that already has `.sdlc/`, or to pull the
latest harness after a plugin update (the harvest loop).

## Instructions

### Step 1: Install the harness
Run the installer from the plugin's bundled payload. Idempotent by default — existing files are
left in place and reported as SKIPPED.
```bash
uv run --project <plugin-root>/scripts <plugin-root>/scripts/install_harness.py \
  --payload <plugin-root>/harness --target .
```
- To overwrite existing harness files with the plugin's current version (e.g. after an update),
  add `--force`. Review the diff before committing — `--force` will replace local edits.

### Step 2: Report
Summarize what was written vs skipped, then remind the user:
- Fill any remaining `{{PLACEHOLDER}}` tokens in `CLAUDE.md` and the workflows.
- **Prove the rails** before trusting them — the shakedown drills in `.github/RAILS.md`.
- Apply branch protection if on GitHub: `bash scripts/rails/apply-branch-protection.sh`.

## What it installs
`CLAUDE.md` (governance), `specs/spec-template.md`, `.claude/{settings.json,hooks,agents,skills}`,
`.github/workflows/` (ci, grader, correctness, security, deploy-dev, eval-regression, eval-suite)
+ `RAILS.md`, `.github/{profile/rubrics,rulesets,CODEOWNERS,eval-bypasses.md}`, `scripts/rails/`,
`eval-datasets/`, `prompts/`, and `infra/`. See `.claude/agents/README.md` for the agent/skill
catalog and the on-demand menu.

## Error Handling
- If uv is not installed: `pip install uv` or `brew install uv`.
- If the payload is missing: the plugin may be mid-update; retry, or run `/plugin update`.