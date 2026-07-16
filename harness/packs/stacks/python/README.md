# Python / uv stack pack

Realizes the core kit's Python-shaped blanks so a `uv`-managed Python repo installs ready-to-adapt
instead of full of `{{TOKENS}}`. Pair it with a CI/CD pack (`packs/cicd/github` or
`packs/cicd/azure-devops`) — this pack supplies the *commands*; the CI/CD pack supplies the
*pipeline* that runs them.

Selected by a profile declaring `stack.backend.language: python` (the `creative-tooling` profile,
which pairs it with `framework: uv-scripts` and `testing: pytest`). It is authored for that reality:
**tooling and scripts built with uv, not a web service.** There is no HTTP layer, no ORM, and no
service-hosting convention in here, because that profile has none — the "API pattern" this pack
teaches is a module/CLI surface, not an endpoint.

## What it fills

| Core blank | This pack supplies |
|---|---|
| `CLAUDE.md` → `## Stack standards — {{STACK}} profile` | `claude/stack-standards.md` (lean; `@import`s the two rules below) |
| `CLAUDE.md` → `@./.claude/rules/project-structure.md` | `rules/project-structure.md` |
| `CLAUDE.md` → `@./.claude/rules/testing.md` | `rules/testing.md` |
| the generic `api-pattern` skill | `skills/api-pattern-python` (module/CLI surface, typing, domain errors) |
| `ci.yml` → `<<CI_RESTORE_CMD>> <<CI_BUILD_CMD>> <<CI_TEST_CMD>>` etc. | `ci-profile.yaml` (consumed by the CI/CD pack) |
| `settings.json` → Python tooling perms | `settings.fragment.json` (merged) |

No `mcp.fragment.json`: no Python-specific MCP server is worth pinning (the core's context7 already
covers version-specific library API reference). The key is omitted rather than shipped empty.

## Where each file lands in the repo

```
claude/stack-standards.md      → replaces the {{STACK}} section of CLAUDE.md
rules/project-structure.md     → .claude/rules/project-structure.md   (@imported)
rules/testing.md               → .claude/rules/testing.md             (@imported)
skills/api-pattern-python/     → .claude/skills/api-pattern-python/
settings.fragment.json         → merged into .claude/settings.json
ci-profile.yaml                → consumed by the CI/CD pack (not copied as-is)
```

## What it composes with

`toolchain.id: python` is mapped by **both** CI/CD packs, so either pairing installs closed:

| CI/CD pack | setup step | version input |
|---|---|---|
| `packs/cicd/github` | `actions/setup-python@v6` | `python-version` |
| `packs/cicd/azure-devops` | `UsePythonVersion@0` | `versionSpec` |

## What the repo must provide

The declared commands are real and runnable, but they assume the repo is a normal uv project:

- `pyproject.toml` + a committed `uv.lock` (CI runs `uv sync --locked` and fails on a stale lock).
- A `dev` dependency group containing **pytest, pytest-cov, ruff, and mypy**. `build` is the mypy
  type check — Python has no compile step, so the type check is what stands in for one. A repo that
  has genuinely not adopted typing yet swaps `commands.build` for the documented `compileall`
  fallback (still a real check: it exits non-zero on a syntax error). It must not become a no-op.
- Tool config in `pyproject.toml` (`[tool.mypy]`, `[tool.ruff]`, `[tool.pytest.ini_options]`) —
  strictness is the repo's to own; the commands carry no config flags.

## The repo-level blanks left

`ci-profile.yaml` and `stack-standards.md` still carry `{{SOLUTION_OR_PROJECT}}` and the
`{{LIST_NON_OBVIOUS_BEHAVIORS}}` gotchas line — those are genuinely per-repo and are filled during
Phase 3 repo adaptation, not by the pack. For a uv project `{{SOLUTION_OR_PROJECT}}` is the **source
root or importable package** (`src` in the src-layout this pack prescribes); it rides inside the
commands (`--cov={{SOLUTION_OR_PROJECT}}`) and passes through seam substitution untouched. It is the
same Phase-3 token the .NET pack uses — no new vocabulary was introduced.

## How to adapt it

- **Different Python version:** change `toolchain.version` in `ci-profile.yaml`. One line, no CI/CD
  pack edit — that is the seam working. Keep it on a bugfix-status line (see Provenance).
- **Flat layout instead of src-layout:** set `{{SOLUTION_OR_PROJECT}}` to the package dir and adjust
  `rules/project-structure.md`. The src-layout rationale is in that file — read it before dropping it.
- **A different linter/type checker:** change `commands.lint` / `commands.build` and the matching
  claims in `stack-standards.md` and the skill's "Done when". Keep both halves of lint (`ruff check`
  **and** `ruff format --check`) or say plainly that formatting is unenforced.
- **Enabling the eval gate:** set `eval_gate.enabled: true` **and** rewrite the eval job's runner
  invocation in your CI/CD pack — it is still written in .NET's vocabulary (`dotnet test --filter`).
  Only the filter is bound to this pack; see `ci-profile.yaml`'s note and `packs/README.md`'s
  "Known gap".

## Provenance

**Authored 2026-07-16 against the `creative-tooling` profile. Not harvested from a live repo** —
there is no Python reference pipeline in this org to lift from, so this pack ships no `HARVEST.md`
rather than a fabricated lineage. Shape mirrors the `.NET` reference pack
(`packs/stacks/dotnet/`); the conventions crystallize the delivery standard's own Python
conventions (uv/py/pytest, snake_case/PascalCase/UPPER_SNAKE, fixtures over setup, parametrize for
variants, validate at boundaries, never swallow errors, functions <50 lines, files <400, 80% floor).

Every command was **executed end-to-end against a throwaway uv project before being written here**,
not inferred from docs:

- `uv 0.9.30` — `uv sync --help` / `uv run --help` confirm `--locked` ("Assert that the `uv.lock`
  will remain unchanged"), `--frozen`, and `--no-sync`. `--locked` is why CI cannot silently
  re-resolve dependencies.
- **Python version status** — python.org devguide "Status of Python versions" (checked 2026-07-16):
  **3.13 and 3.14 are `bugfix`; 3.12 and older are `security`-only**; 3.15 is prerelease. Hence
  `3.13` — a fully supported line, chosen over `3.14` for wheel-ecosystem maturity, not for age.
- **pytest-cov 7.1.0 / coverage.py 7.15.2** — `--cov-report=xml:<path>` writes Cobertura-schema XML
  to the exact path given; the root element carries `line-rate="0.75"` on one line, which is what the
  gate's `sed` reads. The bare default (`--cov-report=xml` → `coverage.xml` in the **repo root**)
  would **not** be found: the gate searches inside `coverage/` only, so the directory is the
  mismatch. Hence the explicit path.
- **The coverage seam was verified against the gate's own shell**, copied verbatim from
  `packs/cicd/github/workflows/ci.yml` "Enforce coverage floor": at 75% it printed
  `Coverage 75.00% is below the 80% floor` and exited 1; at 100% it printed
  `Coverage 100.00% >= 80% floor` and exited 0. The ADO twin
  (`templates/restore-build-test.yml`) uses the identical glob and parser.
- `ruff 0.15.22` — `ruff check .` and `ruff format --check .` both run clean and are non-writing.
- `mypy` — `uv run mypy src` reports `Success: no issues found`; `python -m compileall` exits 1 on a
  syntax error (verified), which is what makes the fallback and the session-health check honest.

**Not yet exercised on a real Python repo.** The commands are proven against a synthetic project;
the first real repo to install this pack should expect to tune `{{SOLUTION_OR_PROJECT}}` and the
`[tool.mypy]` strictness, and is the point at which this file gains a real harvest section.
