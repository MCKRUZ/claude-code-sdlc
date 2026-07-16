# Testing — Node / TypeScript

Depth for the `## Stack standards` summary in `CLAUDE.md`. The testing bar the Stop hook, the
grader, and the CI coverage gate all assume.

## Philosophy

Tests encode **why** the behavior matters, not just **what** it does. A test that cannot fail when
the business logic changes is wrong — delete or rewrite it. A test asserting that a mock was called
tests the mock.

## Framework and shape

- **vitest**, Arrange-Act-Assert, one logical assertion per test.
- `describe('<unit>')` + `it('should <expected> when <scenario>')` — the sentence names the scenario
  and the expectation, so a failure line reads as a bug report.
- Co-locate: `thing.test.ts` beside `thing.ts`. A test that is hard to find is a test that rots.
- Coverage floor: **80% on new code** (unit + integration). Enforced in CI, not aspirational.

## Mocking discipline

- **Prefer real implementations over mocks.** In-process HTTP (supertest against the real app),
  a real (in-memory or containerized) DB, the real validator — so the actual wiring executes.
- Mock **only** external services (third-party HTTP, queues) and time (`vi.useFakeTimers()`,
  `vi.setSystemTime()`).
- Never mock the thing under test. Never mock value objects, DTOs, or `Result<T, E>`.
- `vi.mock` is a blunt instrument — prefer injecting a hand-written fake through the port interface
  the unit already depends on. If a unit is hard to fake, that is a design signal, not a mocking
  problem.

## Integration tests that actually run

- Provision the backing service the test needs (DB, cache, broker) so the test executes instead of
  silently skipping. Set an explicit connection env var so a connectivity failure is a **hard error,
  not a skip** — a green suite that skipped its integration tests is a lie.
- Never `it.skip` a test to get a build green. A skipped test is a deleted test that still costs
  reading time; either fix it or remove it and say so.
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

- `npx vitest run` — one pass, no watch. Bare `vitest` enters watch mode in a TTY; in CI it does not,
  but write `run` explicitly rather than depending on TTY detection.
- `npx vitest run --coverage.enabled --coverage.reporter=cobertura --coverage.reportsDirectory=coverage`
  — the cobertura report the CI gate reads. Dot-notation coverage flags require `--coverage.enabled`;
  do not also pass a bare `--coverage`.
- Locally, wire `--coverage.thresholds.lines=80` into the repo's `npm test` script so a coverage miss
  is a **non-zero exit** on your machine, not a surprise in CI. CI enforces the same floor with its
  own gate — that gate, not the flag, is authoritative (`ci-profile.coverage.floor_percent`).
- `npx vitest run -t "<name pattern>"` — filter by test name. vitest has no xUnit-style trait system;
  tag the title (`describe('@owasp-agentic ...')`) when a suite needs to be selectable.
