# Clean Architecture — .NET

Depth for the `## Stack standards` summary in `CLAUDE.md`. Imported so the always-loaded surface
stays small. This is the *how we build a surface here* reference the `api-pattern` skill leans on.

## Layering (dependencies point inward)

```
Api / Host        →  controllers, DI composition root, middleware
Application       →  MediatR commands/queries + handlers, validators, DTOs, interfaces
Domain            →  entities, value objects, domain rules — no framework references
Infrastructure    →  EF Core, external clients, MediatR-behavior implementations
```

- **The dependency rule:** inner layers never reference outer ones. Domain references nothing.
  Application references Domain. Infrastructure and Api reference inward only.
- **Type-organized, not feature-organized, within a layer:** `Exceptions/`, `Extensions/`,
  `Interfaces/`, `Models/`, `Services/`. One public class per file. Files under 150 lines (400 max).

## CQRS via MediatR

- Every use case is a `IRequest<Result<T>>` command or query with exactly one handler.
- The handler orchestrates; it does not contain cross-cutting concerns — those are pipeline behaviors.
- **Pipeline behavior order is load-bearing.** Register (and document) in this order:
  `ValidationBehavior → LoggingBehavior → handler`. Validation runs first so a bad request never
  reaches business logic.

## Validation at the boundary

- FluentValidation validators are **auto-discovered by assembly scan**, not hand-registered.
- Applied through the MediatR `ValidationBehavior`, never called manually inside a handler.
- Parallel validation with `Task.WhenAll` when a request has multiple validators.
- Validate at system boundaries only. Trust internal code.

## Error handling

- `Result<T>` for expected failures — validation, auth, business-rule violations. Factory methods:
  `Result<T>.Success(value)`, `Result<T>.Fail(message)`, `Result.ValidationFailure(errors)`.
- Exceptions only for the truly exceptional (a dependency is down, an invariant is impossible).
- Never swallow an error silently. Structured JSON logging on every failure path.

## Dependency injection

- Each layer exposes `DependencyInjection.cs` with an `Add<Layer>Dependencies(this IServiceCollection)`
  extension. The composition root calls each in order.
- **Keyed DI** (`AddKeyedSingleton/Transient`) for extensible registrations — tools, connectors,
  anything resolved by a key at runtime rather than by constructor injection.
- `IOptionsMonitor<T>` for strongly-typed config hierarchies.

## Immutability

- Public surfaces expose `IReadOnlyList<T>` / `IReadOnlyDictionary<K,V>`, never mutable collections.
- Private backing fields are `readonly` arrays.
- DTOs and config are `init`-only. `record` for simple value types; **classes with factory methods**
  for polymorphic hierarchies (records don't model inheritance cleanly).

## When the existing code contradicts this

Follow the most recent, most-tested example in the codebase and flag the divergence for cleanup.
Two contradictory patterns is a worse outcome than one imperfect-but-consistent one — do not
silently average them.
