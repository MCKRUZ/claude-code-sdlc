---
name: api-pattern-dotnet
description: >-
  Add a new endpoint / MediatR command or query / handler / service the way this .NET codebase
  already does it. Use when building an API surface, a CQRS handler, a controller, a validator, or
  a DI registration in a .NET / Clean Architecture repo. Finds the one canonical example and mirrors
  its layering, validation, error model, and test shape — so agents extend the codebase instead of
  inventing a second way to do something it already does. The .NET realization of the core
  api-pattern skill.
allowed-tools: [Read, Grep, Glob]
---

# API pattern — .NET

Consistency is the point: the same kind of work looks the same everywhere, so the reviewer and the
next agent read it without re-learning. You do not invent structure — you locate the codebase's
canonical example and replicate it. This skill assumes Clean Architecture + CQRS via MediatR; the
depth is in `.claude/rules/clean-architecture.md`.

## Procedure

1. **Find the canonical example.** If the spec names one under "Reuse this pattern," read it.
   Otherwise grep for the nearest sibling of the same shape and pick the **most recent, most-tested**
   one — not the oldest. Useful anchors:
   - a command: `Grep` for `: IRequest<Result<` and `IRequestHandler<`
   - a validator: `Grep` for `: AbstractValidator<`
   - a controller action / minimal-API endpoint of the same verb
   - the layer's `DependencyInjection.cs`

2. **Extract the pattern, don't paraphrase it.** Note, from the example:
   - **Layering** — controller/endpoint → MediatR command → handler → repository/service.
   - **The request/response types** — `IRequest<Result<TResponse>>`; DTOs `init`-only; collections
     `IReadOnlyList<T>` on the surface.
   - **Validation** — a `AbstractValidator<TRequest>` discovered by assembly scan, run by the
     `ValidationBehavior` (never called inside the handler).
   - **Error model** — `Result<T>.Success/Fail/ValidationFailure`, not thrown exceptions, for
     expected failures.
   - **DI** — how it's registered (keyed vs standard) in `DependencyInjection.cs`.
   - **The test shape** — xUnit `MethodName_Scenario_ExpectedResult`, `WebApplicationFactory` +
     in-memory DB for the pipeline test.

3. **Replicate exactly** for the new surface — same naming, same file organization (one class per
   file, under the right layer), same immutability and boundary-validation conventions. Wire DI the
   same way. `<ImplicitUsings>` and `<Nullable>` are already enabled — write nullable-clean code.

4. **Add the matching tests** in the same style as the example's tests, including the failing-first
   test if this is a bug fix. Hit the 80% floor on the new code.

5. **If the established pattern looks wrong,** do not silently diverge — follow it and flag it for
   cleanup, or escalate. Two contradictory patterns in one codebase is worse than one
   imperfect-but-consistent one.

## Done when

- The new surface is indistinguishable in shape from the canonical example.
- Validation runs through the pipeline behavior; the error model is `Result<T>`; DI matches.
- Tests mirror the example's style and cover the new behavior to the coverage floor.
