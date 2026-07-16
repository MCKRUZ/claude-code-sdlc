# GitNexus setup (guided — run once per repo, per machine)

GitNexus is a code-intelligence tool that gives agents a real call graph: *"what breaks if I change
this symbol?"* (blast radius), *"where does this concept flow?"* (execution paths), and call-graph-aware
rename. It is **MCP-native and self-installing** — this harness pack does not (and should not) carry its
skills or hooks, because the tool generates and refreshes them itself. This guide is the manual step.

Upstream: <https://github.com/abhigyanpatwari/GitNexus>. Runs via `npx` — no global install required.

## Prerequisites
- Node.js (for `npx`) and a git repo (GitNexus indexes from the git root).
- Run everything from the **repository root**.

## Steps

**1. Register the MCP server** (writes the *global* Claude Code MCP config — once per machine):
```bash
npx gitnexus setup -c claude
```
Manual equivalent, if you prefer to wire it yourself:
```bash
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
```

**2. Build the index** (also installs the agent skills + hooks and generates the `CLAUDE.md` /
`AGENTS.md` context blocks — all in one command):
```bash
npx gitnexus analyze
```

**3. Reload the MCP server.** Restart Claude Code so the `gitnexus` MCP tools load, then verify:
```bash
npx gitnexus status
```
You should see the index exists with symbol/relationship counts. Read `gitnexus://repo/{name}/context`
to confirm it loaded.

## What GitNexus writes (and why the pack doesn't carry it)
`analyze` generates, and keeps refreshing, all of the following — a PostToolUse hook re-runs `analyze`
after `git commit`/`git merge`, so they never go stale:
- `.claude/skills/gitnexus/*` — the tool's own agent skills
- PreToolUse hooks that enrich grep/glob/bash with graph context; PostToolUse stale-index detection
- the `<!-- gitnexus:start -->…<!-- gitnexus:end -->` blocks in `CLAUDE.md` / `AGENTS.md`
- `.gitnexus/` — the index itself (machine-local, **gitignored**; can be hundreds of MB)

Copying any of these into the harness would ship stale content and another repo's index counts — so the
pack ships only `.gitnexusignore` (which *you* curate) and this guide.

## Housekeeping
- `.gitnexus/` is machine-local — keep it gitignored (the tool adds a `.gitnexus/.gitignore`).
- Tune `.gitnexusignore` (shipped by this pack) to exclude build output and vendored code.
- Re-index after large changes: `npx gitnexus analyze --force`. Remove entirely: `npx gitnexus clean`.

## What it buys the harness
GitNexus gives the agent graph-accurate answers where the kit otherwise relies on `Grep`/`Glob` + the
Explore agent: prefer `gitnexus_impact` (blast radius before an edit) and `gitnexus_query` (find execution
flows for a concept) when the MCP server is present. It is strictly additive — nothing in the kit depends
on it, and a repo that skips this pack loses no baseline capability.
