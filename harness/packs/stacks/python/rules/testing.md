# Testing — Python / pytest

Depth for the `## Stack standards` summary in `CLAUDE.md`. The testing bar the Stop hook, the
grader, and the CI coverage gate all assume.

## Philosophy

Tests encode **why** the behavior matters, not just **what** it does. A test that cannot fail when
the business logic changes is wrong — delete or rewrite it. `assert result is not None` after a call
that always returns an object is not a test.

## Framework and shape

- **pytest**, Arrange-Act-Assert, one logical assertion per test.
- Name `test_scenario_expected_result` — e.g. `test_load_registry_missing_file_raises_registry_error`.
  The name states the condition and the consequence; a reader who never opens the body knows what
  broke when it goes red.
- `tests/` mirrors `src/` one-for-one, so the test for a module is where you would guess.
- Coverage floor: **80% on new code**. Enforced in CI, not aspirational.

## Fixtures over setup methods

- Dependencies arrive as **fixtures**, not as `setUp`/class attributes — a fixture is explicit
  (the test names what it needs), composable, and scoped (`function` by default; widen only with a
  reason).
- Shared fixtures go in `conftest.py` at the narrowest scope that serves them. A fixture in the root
  `conftest.py` is a global — justify it.
- Use `tmp_path` for filesystem work and `monkeypatch` for environment/attribute patching, never
  a hand-rolled temp dir or a mutated global that leaks into the next test.
- A test must not depend on execution order or on another test's leftovers.

## Parametrize for variant cases

- The same assertion over different inputs is **one** `@pytest.mark.parametrize`, not five copied
  functions. Copies drift; a parametrized case list is read as a table of the behavior's contract.
- Give ids to non-obvious cases (`pytest.param(..., id="empty_registry")`) so a failure names itself.
- Parametrize the *inputs and expectations*, not the logic — a parametrized test with an `if` in the
  body is two tests wearing one coat.

## Mocking discipline

- **Prefer real implementations over mocks.** Real objects, `tmp_path`, and a real parse of a real
  fixture file catch what a mock's rehearsed answer cannot.
- Mock **only** external services (HTTP APIs, third-party SDKs, subprocesses that touch a network)
  and time/randomness (inject a clock or seed; freeze rather than sleep).
- Never mock the thing under test. Never mock your own dataclasses/value objects — construct them.
- Patch where the name is **used**, not where it is defined (`mypkg.service.requests`, not
  `requests`) — the most common reason a "passing" mocked test is testing nothing.

## Markers

- Register every marker in `pyproject.toml` `[tool.pytest.ini_options] markers` and run with
  `--strict-markers`, so a typo'd marker is an error rather than a silently empty selection.
- Markers name a *suite* (`eval_gate`, `integration`), not a mood. A marked suite that CI never runs
  is dead weight — wire it to a gate or delete it.

## Integration tests that actually run

- Provision the backing service the test needs so the test executes instead of silently skipping.
  Gate on an explicit env var and make its absence a **hard error, not a skip** — a green suite that
  skipped its integration tests is a lie.
- A conditional `pytest.skip` needs a reason a reviewer would accept. "Not configured on my machine"
  is not one.

## The bug-fix workflow (mandatory)

1. Write the regression test that reproduces the bug — watch it **fail** (proving the bug exists).
2. Fix the code.
3. Watch the test **pass**, and leave it in the permanent suite.

Never fix a bug without a test that would have caught it. The Stop hook enforces green; this rule
enforces that "green" means something.

## TDD (this profile requires it — `quality.require_tdd: true`)

Red → green → refactor. Write the failing test first, implement the minimum to pass, refactor while
it stays green. For bug fixes this is not optional (see above), regardless of profile.

## Commands

- `uv run pytest` — the suite.
- `uv run pytest --cov=src --cov-report=xml:coverage/coverage.cobertura.xml --cov-report=term` —
  what CI runs. The `xml:<path>` form is load-bearing: the pipeline's coverage gate only searches
  inside `coverage/`, and pytest-cov's bare default writes `coverage.xml` to the repo root — which
  the gate would not find, failing it closed.
- `uv run pytest -m "eval_gate"` — the optional eval suite (`ci-profile.eval_gate.test_filter`).
- The floor is enforced by the **pipeline's** gate step, not by `--cov-fail-under`: one threshold,
  in one place, uniform across every stack. Do not add a second one in the runner.
