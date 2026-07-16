# /sdlc-upgrade — Bring an installed harness forward safely

Upgrade a repo's installed delivery harness to the plugin's current version using the install
receipt (`.claude/harness-manifest.json`). Unlike `install_harness.py --force`, this never
clobbers a repo's adaptations: files still factory-original are brought forward, adapted files
are left alone, and files changed on both sides are surfaced for a deliberate merge.

## Instructions

### Step 1: Dry-run the upgrade
Always dry-run first. Pass the same profile that was used at install (`.sdlc/profile.yaml` for
repos set up via `/sdlc-setup`; omit `--profile` only for core-only installs) — a different
profile makes that profile's pack files misreport as RETIRED.
```bash
uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/upgrade_harness.py \
  --payload ${CLAUDE_PLUGIN_ROOT}/harness --target . --profile .sdlc/profile.yaml
```

### Step 2: Read the report to the user
Explain the classification groups in plain terms before touching anything:

| Label | Meaning | On `--apply` |
|---|---|---|
| `IDENTICAL` | already matches the new version | manifest entry refreshed |
| `UPDATE` | factory-original here, improved upstream | replaced with the new version |
| `ADAPTED` | this repo changed it, upstream didn't | left alone |
| `CONFLICT` | changed on BOTH sides | current kept; new version written beside it as `<file>.harness-new` |
| `NEW` | new in this harness version | installed |
| `ADOPT` / `CONFLICT-UNTRACKED` | file predates the manifest (legacy) | adopted into the manifest / `.harness-new` sibling |
| `DELETED-LOCALLY` | repo deleted it on purpose | respected, report-only (its manifest entry persists — even if later retired upstream) |
| `RETIRED` | dropped from the kit | file left in place; manifest entry dropped — deleting the file is the human's call |

If the report shows a `LEGACY INSTALL` banner, this repo predates manifests: the first `--apply`
adopts it (writes a fresh manifest); expect `ADOPT`/`CONFLICT-UNTRACKED` instead of the usual groups.

### Step 3: Ask, then apply
Upgrading changes committed guardrail files — confirm with the user before applying:
```bash
uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/upgrade_harness.py \
  --payload ${CLAUDE_PLUGIN_ROOT}/harness --target . --profile .sdlc/profile.yaml --apply
```

### Step 4: Resolve every `.harness-new` sibling
For each CONFLICT, merge deliberately: read the current file and its `.harness-new` sibling,
carry the upstream improvement into the repo's adapted version (never wholesale-replace), show
the user the merged result, then DELETE the `.harness-new` file. A leftover `.harness-new` is an
unfinished upgrade.

**CLAUDE.md is the expected special case:** it carries the appended SDLC section and repo edits,
so it typically reports ADAPTED or CONFLICT. Merge only the stack-standards section from the new
version; never replace the whole file.

### Step 5: Verify and commit
- Re-run the dry-run: it should now report only IDENTICAL/ADAPTED, no conflicts.
- If hooks or workflows changed, remind the user to re-prove them (shakedown drills in
  `.github/RAILS.md`).
- Stage the upgraded files + `.claude/harness-manifest.json` and commit, e.g.
  `chore: upgrade delivery harness to <new plugin version>`.

## Error Handling
- If uv is not installed: `pip install uv` or `brew install uv`.
- Exit 2 with `ERROR:` means a bad payload/profile or corrupt manifest — fix and re-run; nothing
  was changed.
- Conflicts are NOT errors (exit 0) — they are the report doing its job.
