# Changelog

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
