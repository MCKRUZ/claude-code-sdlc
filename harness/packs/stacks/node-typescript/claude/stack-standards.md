<!--
  Node/TypeScript stack standards — the realized replacement for the "## Stack standards — {{STACK}}
  profile" section of the core CLAUDE.md.template. Kept lean, because CLAUDE.md is loaded every
  session; the depth lives in the two @imported rule files so the always-on surface stays small.
-->

## Stack standards — Node 24 LTS / TypeScript

- **Types are the contract:** `strict: true` in `tsconfig.json` — non-negotiable, and with it
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. `any` is a review failure; reach for
  `unknown` + a narrowing check instead. No `@ts-ignore` — `@ts-expect-error` with a reason comment,
  so it breaks loudly when the underlying issue is fixed. See `@./.claude/rules/project-structure.md`.
- **ESM only:** `"type": "module"`, `module`/`moduleResolution: nodenext`. Relative imports carry
  their extension (`./thing.js` — the *emitted* name, even from a `.ts` source). No `require`, no
  mixed CJS/ESM in one package.
- **Immutability first:** never mutate a parameter, an argument, or shared state — build a new value
  with spread (`{ ...obj, key }`, `[...arr, item]`). `readonly` on properties, `ReadonlyArray<T>` /
  `readonly T[]` on public surfaces. `as const` for literal tables. Prefer `map`/`filter`/`reduce`
  over the in-place `push`/`splice`/`sort` family (`sort` and `reverse` mutate — copy first, or use
  `toSorted`).
- **Error handling:** a `Result<T, E>` discriminated union (`{ ok: true, value }` / `{ ok: false,
  error }`) for *expected* failures — validation, auth, business rules. `throw` only for the
  genuinely exceptional. Narrow on `unknown` in `catch` (it is not an `Error`). Never swallow an
  error; never `console.log` — the injected logger, structured JSON, always.
- **Validate at the boundary, trust inside:** every external input (HTTP body/query/params, env vars,
  queue messages, third-party responses) is parsed by a schema validator at the edge, and the
  *inferred* type — never a hand-written interface asserted over unvalidated data — flows inward.
- **Layout & size:** `kebab-case.ts` filenames, `PascalCase` types/classes, `camelCase`
  values/functions, `UPPER_SNAKE_CASE` consts. Type-organized directories, one concern per file.
  Functions under 50 lines, files under 400. No default exports — named exports only, so a symbol has
  one greppable name.
- **Tests:** vitest, Arrange-Act-Assert, `describe`/`it('should ...')`. Prefer real implementations;
  mock only external services and time (`vi.useFakeTimers`). Co-locate `*.test.ts` beside the unit.
  80% coverage floor on new code, enforced in CI. See `@./.claude/rules/testing.md`.
- **Common gotchas (things the code won't tell you):** {{LIST_NON_OBVIOUS_BEHAVIORS — repo fills:
  e.g. "ESM import extensions are `.js` even in `.ts` files — a missing extension fails only at
  runtime, not at `tsc`", "the container resolves handlers by token, so a new handler is invisible
  until it is registered".}}
