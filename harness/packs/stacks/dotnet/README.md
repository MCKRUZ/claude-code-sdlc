# .NET stack pack

Realizes the core kit's `.NET`-shaped blanks so a .NET / Microsoft Agent Framework repo installs
ready-to-adapt instead of full of `{{TOKENS}}`. Pair it with a CI/CD pack (`packs/cicd/github` or
`packs/cicd/azure-devops`) — this pack supplies the *commands*; the CI/CD pack supplies the
*pipeline* that runs them.

## What it fills

| Core blank | This pack supplies |
|---|---|
| `CLAUDE.md` → `## Stack standards — {{STACK}} profile` | `claude/stack-standards.md` (lean; `@import`s the two rules below) |
| `CLAUDE.md` → `@./.claude/rules/clean-architecture.md` | `rules/clean-architecture.md` |
| `CLAUDE.md` → `@./.claude/rules/testing.md` | `rules/testing.md` |
| the generic `api-pattern` skill | `skills/api-pattern-dotnet` (CQRS/MediatR/`Result<T>`) |
| `ci.yml` → `<<RESTORE_CMD>> <<BUILD_CMD>> <<TEST_CMD>>` etc. | `ci-profile.yaml` (consumed by the CI/CD pack) |
| `settings.json` → .NET tooling perms | `settings.fragment.json` (merged) |

## Where each file lands in the repo

```
claude/stack-standards.md    → replaces the {{STACK}} section of CLAUDE.md
rules/clean-architecture.md  → .claude/rules/clean-architecture.md   (@imported)
rules/testing.md             → .claude/rules/testing.md              (@imported)
skills/api-pattern-dotnet/   → .claude/skills/api-pattern-dotnet/
settings.fragment.json       → merged into .claude/settings.json
ci-profile.yaml              → consumed by the CI/CD pack (not copied as-is)
```

## The one repo-level blank left

`ci-profile.yaml` and `stack-standards.md` still carry `{{SOLUTION_OR_PROJECT}}` and the
`{{LIST_NON_OBVIOUS_BEHAVIORS}}` gotchas line — those are genuinely per-repo (the solution path and
this codebase's surprises) and are filled during Phase 3 repo adaptation, not by the pack.

## Standards source

The conventions (immutability, `Result<T>`, FluentValidation via MediatR pipeline, keyed DI,
`WebApplicationFactory` + in-memory DB, `MethodName_Scenario_ExpectedResult`) are the delivery
standard's own .NET conventions crystallized into harness form — see `HARVEST.md` for provenance.
