<!--
  Python stack standards — the realized replacement for the "## Stack standards — {{STACK}} profile"
  section of the core CLAUDE.md.template. Kept lean, because CLAUDE.md is loaded every session;
  the depth lives in the two @imported rule files so the always-on surface stays small.
-->

## Stack standards — Python 3.13 / uv

- **Project shape:** one `pyproject.toml` at the root; `uv` owns the environment. src-layout
  (`src/<package>/`, tests in `tests/`) so tests import the installed package, not a path
  accident. `uv.lock` is committed and authoritative — CI runs `uv sync --locked` and fails if the
  lock and `pyproject.toml` disagree. Never `pip install` into a uv project; `uv add` owns
  dependencies, dev tooling lives in the `dev` dependency group. Modules are small and
  single-purpose: functions under 50 lines, files under 400. See
  `@./.claude/rules/project-structure.md`.
- **Typing is the build gate.** Python has no compiler, so the type check *is* the build step
  (`uv run mypy src`) — a type error is a broken build, not a lint nit. Annotate every public
  function signature (params and return). Strictness is configured in `pyproject.toml`
  `[tool.mypy]`, not scattered across CLI flags or `# type: ignore` comments; an ignore needs a
  narrow code (`# type: ignore[arg-type]`) and a reason.
- **Error handling:** never `except:` or `except Exception:` without re-raising — catch the
  specific exception you can actually handle. Never swallow an error silently: no bare `pass` in an
  `except` block. Raise a domain-specific exception derived from one project base class rather than
  a bare `ValueError` from deep in the stack. Let unexpected errors propagate — a crash with a
  traceback beats a silent wrong answer.
- **Boundaries and trust:** validate at system boundaries (CLI args, file/YAML/JSON input, network
  and subprocess responses) and trust internal code after that. Parse external data into typed
  objects (dataclass / `TypedDict` / pydantic where already used) at the edge — do not pass raw
  `dict[str, Any]` inward. Never `eval`/`exec` on external input; `subprocess` takes a list, never
  `shell=True` with interpolated data.
- **Output vs logging:** `print` is legitimate in the CLI/entry-point layer — that is the tool's
  user interface. Library and module code logs (`logging.getLogger(__name__)`), structured, and
  never prints. No debug remnants (stray prints, commented-out code, `breakpoint()`) in committed
  work.
- **Naming:** `snake_case` for functions/variables/modules, `PascalCase` for classes,
  `UPPER_SNAKE_CASE` for constants. A leading underscore means private — respect it.
- **Tests:** pytest. Name `test_scenario_expected_result`. Fixtures over setup methods,
  `@pytest.mark.parametrize` for variant cases. Prefer real implementations; mock only external
  services and time. 80% coverage floor on new code, enforced in CI. See
  `@./.claude/rules/testing.md`.
- **Common gotchas (things the code won't tell you):** {{LIST_NON_OBVIOUS_BEHAVIORS — repo fills:
  e.g. "mutable default arguments are evaluated once at def time — use `None` + a guard", "the
  registry loader caches on first import; a test that mutates it must use the reset fixture".}}
