<!--
  .NET stack standards — the realized replacement for the "## Stack standards — {{STACK}} profile"
  section of the core CLAUDE.md.template. Kept lean, because CLAUDE.md is loaded every session;
  the depth lives in the two @imported rule files so the always-on surface stays small.
-->

## Stack standards — .NET 10 / Microsoft Agent Framework

- **Architecture:** Clean Architecture, dependencies point inward. CQRS via MediatR; FluentValidation
  at boundaries (auto-discovered by assembly scan, applied through a MediatR pipeline behavior).
  Layers are type-organized (Exceptions, Extensions, Interfaces, Models, Services), one class per
  file, files under 150 lines (400 max). See `@./.claude/rules/clean-architecture.md`.
- **Immutability first:** `IReadOnlyList<T>` / `IReadOnlyDictionary<K,V>` on public surfaces,
  `readonly` arrays for private backing fields, `init`-only properties on DTOs/config. `record` for
  value types — **not** for polymorphic hierarchies (use classes + factory methods there).
- **Error handling:** `Result<T>` for expected failures (validation, auth, business rules) via
  `Result<T>.Success(v)` / `Result<T>.Fail(msg)` / `Result.ValidationFailure(errors)`. Exceptions
  only for the genuinely exceptional. Never swallow errors; structured JSON logging.
- **DI & config:** each layer ships a `DependencyInjection.cs` with `Add*Dependencies()`. Keyed DI
  (`AddKeyed*`) for extensible registrations (tools, connectors). `IOptionsMonitor<T>` for config.
  MediatR pipeline-behavior order matters — document it where it's registered.
- **Project defaults:** `<ImplicitUsings>enable</ImplicitUsings>` and `<Nullable>enable</Nullable>`
  in every `.csproj`.
- **Tests:** xUnit, Arrange-Act-Assert. Prefer real implementations; `WebApplicationFactory<Program>`
  + in-memory DB for pipeline tests. Mock only external services and time (`TimeProvider`). 80%
  coverage floor on new code. Name `MethodName_Scenario_ExpectedResult`. See
  `@./.claude/rules/testing.md`.
- **Common gotchas (things the code won't tell you):** {{LIST_NON_OBVIOUS_BEHAVIORS — repo fills:
  e.g. "the MediatR pipeline order is validation → logging → handler; reordering breaks parallel
  validation", "keyed tool registrations are resolved by the switchboard, not constructor-injected".}}
