# Releasing the plugin

Releases only happen from a green `master` — CI (`.github/workflows/ci.yml`) runs the same
checks listed here, so a red anywhere means stop.

1. **Sync the payload** from the kit source of truth and verify:
   ```bash
   uv run --project scripts scripts/sync_kit.py --kit <delivery-standard>/kit
   uv run --project scripts scripts/sync_kit.py --kit <delivery-standard>/kit --check
   ```
2. **Run the suite** — everything, including the golden-repo compose test and the
   payload completeness tripwire:
   ```bash
   uv run --project scripts pytest scripts/tests -q
   ```
   If the kit legitimately changed the installed tree, regenerate the snapshot
   (`GOLDEN_REGEN=1 uv run --project scripts pytest scripts/tests/test_golden_repo.py -q`),
   review the diff, and commit it deliberately.
3. **Bump the version** in `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`
   (they must match). Semver: new capability = minor, fixes only = patch.
4. **Write the CHANGELOG entry** — `CHANGELOG.md`, newest first, factual and short.
5. **Commit** (`feat:`/`fix:`/`chore:` as appropriate), **push**, and wait for CI green.
6. **Tag and push the tag**:
   ```bash
   git tag -a vX.Y.Z -m "X.Y.Z — <one-line summary>"
   git push origin vX.Y.Z
   ```
   Tags exist from `v0.4.0` onward; every release gets one — it is how an engagement can say
   which harness version it runs (see also `.claude/harness-manifest.json` in installed repos,
   which records the version at install time, and `/sdlc-upgrade` to move repos forward).
