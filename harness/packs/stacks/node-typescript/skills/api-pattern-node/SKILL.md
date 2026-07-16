---
name: api-pattern-node
description: >-
  Add a new endpoint / route / use case / service the way this Node + TypeScript codebase already
  does it. Use when building an API surface, a request handler, a validator, a port/adapter, or a
  container registration in a Node/TypeScript repo. Finds the one canonical example and mirrors its
  layering, validation, error model, and test shape — so agents extend the codebase instead of
  inventing a second way to do something it already does. The Node realization of the core
  api-pattern skill.
allowed-tools: [Read, Grep, Glob]
---

# API pattern — Node / TypeScript

Consistency is the point: the same kind of work looks the same everywhere, so the reviewer and the
next agent read it without re-learning. You do not invent structure — you locate the codebase's
canonical example and replicate it. The layering, type, and error conventions behind this skill are
in `.claude/rules/project-structure.md`.

Node has no single blessed framework, so **this skill has no framework opinion to impose**. Whether
this repo is express, fastify, hono, or nest is a question you ANSWER BY READING IT, never one you
answer from habit. If you catch yourself writing an express handler because express is what you have
seen most, stop — you skipped step 1.

## Procedure

1. **Find the canonical example.** If the spec names one under "Reuse this pattern," read it.
   Otherwise grep for the nearest sibling of the same shape and pick the **most recent, most-tested**
   one — not the oldest. Useful anchors:
   - the router/registration surface: `Grep` for `\.(get|post|put|patch|delete)\(` or `route(`
   - the app's composition root: `Grep` for `createApp`, `buildServer`, `register(`
   - a validator: `Grep` for the schema library the repo actually imports (`zod`, `valibot`,
     `typebox`, `@sinclair/…`) — `Grep` `package.json` first to learn which one exists here
   - a use case + its port interfaces, and the adapter implementing them
   - the sibling `*.test.ts` — the test IS part of the pattern

2. **Extract the pattern, don't paraphrase it.** Note, from the example:
   - **Layering** — route/controller → use case → port → adapter. Which file each piece lives in.
   - **Request/response types** — inferred from the schema, or hand-written? Readonly surfaces?
   - **Validation** — where the parse happens (middleware vs the handler's first lines) and how the
     inferred type flows inward. It happens at the boundary, exactly once.
   - **Error model** — `Result<T, E>` returned, or thrown-and-caught by an error middleware? Which
     one this repo does, not which one you prefer.
   - **Wiring** — how the new surface becomes reachable: a container registration, a route table, a
     barrel file, a plugin. This is the step that is easiest to forget and silently does nothing.
   - **Logging** — the injected logger, its name, its structured fields.

3. **Replicate exactly** for the new surface — same naming (`kebab-case.ts`, named exports, no
   default export), same file organization under the right layer, same immutability (spread, never
   mutate) and boundary-validation conventions. Strict-mode clean: no `any`, no `@ts-ignore`, ESM
   imports carry their `.js` extension.

4. **Add the matching tests** in the same style as the example's tests, including the failing-first
   test if this is a bug fix. Hit the 80% floor on the new code.

5. **If the established pattern looks wrong,** do not silently diverge — follow it and flag it for
   cleanup, or escalate. Two contradictory patterns in one codebase is worse than one
   imperfect-but-consistent one.

## Done when

- The new surface is indistinguishable in shape from the canonical example.
- Validation happens once at the boundary; the error model matches the example's; the wiring is done
  and the surface is actually reachable.
- Tests mirror the example's style and cover the new behavior to the coverage floor.
