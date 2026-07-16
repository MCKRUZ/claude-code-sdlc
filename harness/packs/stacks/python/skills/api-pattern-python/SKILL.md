---
name: api-pattern-python
description: >-
  Add a new module / CLI command / service function / loader the way this Python codebase already
  does it. Use when building a public surface, a command entry point, a data loader, a validator, or
  a new package module in a Python / uv repo. Finds the one canonical example and mirrors its
  layering, typing, error model, and test shape — so agents extend the codebase instead of inventing
  a second way to do something it already does. The Python realization of the core api-pattern skill.
allowed-tools: [Read, Grep, Glob]
---

# API pattern — Python

Consistency is the point: the same kind of work looks the same everywhere, so the reviewer and the
next agent read it without re-learning. You do not invent structure — you locate the codebase's
canonical example and replicate it. The depth is in `.claude/rules/project-structure.md`.

## Procedure

1. **Find the canonical example.** If the spec names one under "Reuse this pattern," read it.
   Otherwise `Grep` for the nearest sibling of the same shape and pick the **most recent,
   most-tested** one — not the oldest. Useful anchors:
   - the package's public surface: `src/*/__init__.py` (what the codebase chooses to export)
   - a CLI command: `Grep` for `argparse`, `add_parser(`, `@click.command`, or `@app.command`
   - a loader/parser of the same input kind: `Grep` for `yaml.safe_load`, `json.load`, `Path(`
   - the project's exception base: `Grep` for `class .*Error\(` / `Exception\)`
   - the entry-point wiring: `[project.scripts]` in `pyproject.toml`

2. **Extract the pattern, don't paraphrase it.** Note, from the example:
   - **Layering** — CLI/entry point (parses args, prints, sets the exit code) → service function
     (pure logic, returns values, raises domain errors) → I/O or client. Human output lives at the
     CLI layer only; the layer below it logs and returns.
   - **The signature** — fully annotated params and return. What typed object it returns (dataclass /
     `TypedDict` / model), not a raw `dict[str, Any]`.
   - **Validation** — where external input is parsed into that typed object, at the boundary, once.
   - **Error model** — which domain exception it raises and from which base; what it deliberately
     does *not* catch. Confirm it never swallows (`except: pass`) and never bare-excepts.
   - **Logging** — `logging.getLogger(__name__)`, structured, on failure paths.
   - **Naming and placement** — `snake_case` module under the right package, one concern per module.
   - **The test shape** — `tests/test_<module>.py`, `test_scenario_expected_result` names, fixtures
     (`tmp_path`, `monkeypatch`) over setup methods, `@pytest.mark.parametrize` for variant cases.

3. **Replicate exactly** for the new surface — same naming, same layering, same typing discipline,
   same error model. If it needs a dependency the project does not have, stop and ask: `uv add`
   changes `pyproject.toml` and `uv.lock`, which is a gated decision, not a side effect.

4. **Add the matching tests** in the same style as the example's tests, including the failing-first
   test if this is a bug fix (mandatory) or if the profile requires TDD (this one does). Hit the 80%
   floor on the new code.

5. **If the established pattern looks wrong,** do not silently diverge — follow it and flag it for
   cleanup, or escalate. Two contradictory patterns in one codebase is worse than one
   imperfect-but-consistent one.

## Done when

- The new surface is indistinguishable in shape from the canonical example.
- It is fully annotated and `uv run mypy` is clean — the type check is this stack's build gate.
- `uv run ruff check .` and `uv run ruff format --check .` pass.
- External input is validated at the boundary; errors raise a domain exception and nothing is
  swallowed.
- Tests mirror the example's style and cover the new behavior to the coverage floor.
