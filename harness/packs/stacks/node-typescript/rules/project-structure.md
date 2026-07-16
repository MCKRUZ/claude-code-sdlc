# Project structure — Node / TypeScript

Depth for the `## Stack standards` summary in `CLAUDE.md`. Imported so the always-loaded surface
stays small. This is the *how we build a surface here* reference the `api-pattern-node` skill leans on.

## Layering (dependencies point inward)

```
http/         →  routes, controllers, middleware, the composition root
application/  →  use cases, DTOs, port interfaces — orchestration, no I/O of its own
domain/       →  entities, value objects, business rules — imports nothing from the other layers
infrastructure/ →  DB clients, HTTP clients, queue adapters — implements application's ports
```

- **The dependency rule:** inner layers never import outer ones. `domain/` imports no framework —
  no express, no ORM decorators, nothing that would make a rule un-unit-testable.
- **Type-organized, not feature-organized, within a layer:** `errors/`, `interfaces/`, `models/`,
  `services/`. One concern per file. Files under 400 lines, functions under 50.
- **No default exports.** Named exports only: one symbol, one name, greppable everywhere it is used,
  and no rename-drift at import sites.

## TypeScript configuration (the non-negotiable core)

```jsonc
{
  "compilerOptions": {
    "strict": true,                    // the whole family, not a subset
    "noUncheckedIndexedAccess": true,  // arr[i] is T | undefined — because it is
    "exactOptionalPropertyTypes": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2023",
    "verbatimModuleSyntax": true       // `import type` stays a type import; no surprise runtime import
  }
}
```

- `any` is a review failure. `unknown` + narrowing is the honest version of "I don't know this type".
- Never `@ts-ignore`. `@ts-expect-error` **with a reason** — it errors once the underlying problem is
  gone, so suppressions cannot outlive their cause.
- A type assertion (`as`) is a claim you are overriding the compiler. Parse instead of asserting.

## ESM

- `"type": "module"` in package.json. Relative imports carry the **emitted** extension:
  `import { x } from './thing.js'` from inside `thing.ts`. This looks wrong and is correct.
- No `require`, no `__dirname` (`import.meta.dirname`), no mixed CJS/ESM in one package.

## Immutability

- Never mutate a parameter or shared state. Build a new value: `{ ...obj, key }`, `[...arr, item]`.
- `readonly` properties; `readonly T[]` / `ReadonlyArray<T>` on public surfaces. `as const` for
  literal lookup tables.
- `sort`, `reverse`, `splice`, `push` mutate in place. Copy first (`[...arr].sort()`) or use the
  non-mutating `toSorted` / `toReversed` / `with`.

## Validation at the boundary

- Every external input — HTTP body/query/params, env vars, queue messages, third-party responses —
  is parsed against a schema at the edge of the process.
- **Infer the type from the schema; do not hand-write an interface and assert it over unvalidated
  data.** The assertion is a lie the compiler cannot catch — it is exactly the check you skipped.
- Validate at boundaries **only**. Internal code is trusted; re-validating it is noise that implies
  the boundary cannot be relied on.

## Error handling

- `Result<T, E>` for expected failures:

  ```ts
  export type Result<T, E = Error> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };
  ```

  Validation, auth, and business-rule failures are ordinary outcomes — they belong in the return
  type where the caller must handle them, not in a control-flow jump they can forget.
- `throw` only for the genuinely exceptional (a dependency is down, an invariant is impossible).
- `catch (e)` binds `unknown`. Narrow before use (`e instanceof Error`) — do not assume `.message`.
- Never swallow an error silently. Never `console.log`/`console.error` — use the injected logger,
  structured JSON, on every failure path.

## Naming

- Files `kebab-case.ts`; test beside the unit as `thing.test.ts`.
- `PascalCase` types/classes/interfaces (no `I` prefix — this is not C#), `camelCase` values and
  functions, `UPPER_SNAKE_CASE` module-level constants.

## When the existing code contradicts this

Follow the most recent, most-tested example in the codebase and flag the divergence for cleanup.
Two contradictory patterns is a worse outcome than one imperfect-but-consistent one — do not
silently average them.
