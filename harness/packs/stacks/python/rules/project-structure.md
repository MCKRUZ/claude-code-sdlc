# Project structure — Python / uv

Depth for the `## Stack standards` summary in `CLAUDE.md`. Imported so the always-loaded surface
stays small. This is the *how we build a surface here* reference the `api-pattern` skill leans on.

## Layout

```
pyproject.toml        →  the single source of truth: deps, dev group, tool config (ruff, mypy, pytest)
uv.lock               →  committed, authoritative, machine-owned — never hand-edited
src/<package>/        →  the importable package (src-layout)
  __init__.py         →  the public surface: what callers may import
  cli.py              →  entry point — argument parsing and human output live HERE, nowhere else
  <module>.py         →  one concern per module
tests/                →  mirrors src/ one-for-one: src/<pkg>/foo.py -> tests/test_foo.py
```

- **src-layout is deliberate.** Tests import the *installed* package (`uv sync` installs the project
  into `.venv`), so a test can never pass by accidentally importing from the working directory —
  the way it will actually be imported in production is the way it is tested.
- **Module size.** Functions under 50 lines, files under 400. A module that has grown two unrelated
  reasons to change is two modules.
- **Import discipline.** Absolute imports within the package (`from mypkg.registry import load`),
  never implicit relative. No import-time side effects: importing a module must not read a file,
  hit the network, or mutate global state — put that behind a function so tests can control it.

## Dependencies — uv owns the environment

- `uv add <pkg>` / `uv add --dev <pkg>`. Never `pip install` into a uv project and never hand-edit
  `uv.lock`: the lock is generated, and a hand-edit is a merge conflict waiting to be resolved wrong.
- Runtime deps in `[project.dependencies]`; pytest/ruff/mypy and friends in the `dev` dependency
  group. A dev tool that leaks into runtime deps ships test code to users.
- **CI runs `uv sync --locked`**, which asserts the lock is already consistent with `pyproject.toml`
  and fails if it would change. So the rule is: change a dependency → commit the regenerated
  `uv.lock` in the same PR. A stale lock is a red build, by design — CI must never resolve a
  dependency set nobody reviewed.
- Pin major versions; read the changelog before an upgrade. Before adding a dependency, check
  whether the standard library already does it — a 20-line helper beats a transitive dependency tree.

## Typing

- Annotate every public function: parameters and return type. Internal helpers should be annotated
  too; the type checker is only as good as its inputs.
- `mypy` config lives in `pyproject.toml` `[tool.mypy]` — one place, versioned, reviewed. Raise
  strictness there as the codebase allows rather than sprinkling flags.
- `# type: ignore` is a last resort: it must carry the narrow code (`# type: ignore[arg-type]`) and
  a comment saying why. A bare `# type: ignore` hides the next real bug on that line.
- Prefer precise types over `Any`. `dict[str, Any]` at an internal boundary is a design smell —
  parse it into a dataclass or `TypedDict` at the edge and pass that inward.

## Error handling

- **Catch what you can handle, and nothing else.** `except:` and bare `except Exception:` are
  banned unless the handler re-raises (or is a documented top-level CLI boundary that logs the
  traceback and exits non-zero).
- **Never swallow.** `except X: pass` is never acceptable. If a failure is genuinely ignorable, log
  it at debug and say why in a comment.
- Define one project base exception and derive domain errors from it, so callers can catch the
  project's failures without catching everything.
- Let unexpected exceptions propagate. A traceback is diagnosable; a silently wrong result is not.
- `logging.getLogger(__name__)` in library code, structured, on every failure path. `print` belongs
  to the CLI layer only — that is the tool's UI, not its logging.

## Validation at the boundary

- Validate at system boundaries — CLI arguments, file/YAML/JSON input, network responses,
  subprocess output. Trust internal code after that; re-validating in every function is noise.
- Parse, don't validate-and-pass-along: turn external data into a typed object once, at the edge.
- Never `eval`/`exec` external input. `subprocess` takes an argument list, never `shell=True` with
  interpolated data. Secrets come from the environment or a secret store, never a literal in source.

## When the existing code contradicts this

Follow the most recent, most-tested example in the codebase and flag the divergence for cleanup.
Two contradictory patterns is a worse outcome than one imperfect-but-consistent one — do not
silently average them.
