# Testing — .NET

Depth for the `## Stack standards` summary in `CLAUDE.md`. The testing bar the Stop hook, the
grader, and the CI coverage gate all assume.

## Philosophy

Tests encode **why** the behavior matters, not just **what** it does. A test that cannot fail when
the business logic changes is wrong — delete or rewrite it.

## Framework and shape

- **xUnit**, Arrange-Act-Assert, one logical assertion per test.
- Name `MethodName_Scenario_ExpectedResult` — e.g. `Handle_InvalidRequest_ReturnsValidationFailure`.
- Coverage floor: **80% on new code** (unit + integration). Enforced in CI, not aspirational.

## Mocking discipline

- **Prefer real implementations over mocks.** Use `WebApplicationFactory<Program>` + an in-memory
  (or containerized) DB for pipeline/integration tests, so the MediatR pipeline, validators, and DI
  actually execute.
- Mock **only** external services (HTTP clients, third-party APIs) and time (`TimeProvider`).
- Never mock the thing under test. Never mock value objects, DTOs, or `Result<T>`.
- Moq, used sparingly — reach for a real fake before a configured mock.

## Integration tests that actually run

- Provision the backing service the test needs (DB, cache, broker) so the test executes instead of
  silently skipping. Set an explicit connection env var so a connectivity failure is a **hard error,
  not a skip** — a green suite that skipped its integration tests is a lie.
- GitHub Actions / Azure Pipelines service containers do **not** run an image's init scripts — apply
  schema/seed explicitly once the service is healthy (the CI/CD pack handles this).

## The bug-fix workflow (mandatory)

1. Write the regression test that reproduces the bug — watch it **fail** (proving the bug exists).
2. Fix the code.
3. Watch the test **pass**, and leave it in the permanent suite.

Never fix a bug without a test that would have caught it. The Stop hook enforces green; this rule
enforces that "green" means something.

## TDD (when the profile or spec requires it)

Red → green → refactor. Write the failing test first, implement the minimum to pass, refactor while
it stays green. For bug fixes this is not optional (see above), regardless of profile.

## Commands

- `dotnet test <solution> --collect:"XPlat Code Coverage"` — the coverage collector the CI gate reads.
- Enforce the 80% floor in the runner (coverlet threshold args) so a miss is a **non-zero exit**,
  not a passing run with a low number in a report.
