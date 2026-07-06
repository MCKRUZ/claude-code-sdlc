---
name: api-pattern
description: >-
  Add a new endpoint / handler / service the way this codebase already does it. Use when building
  an API surface, a CQRS handler, a controller, or a service registration. Finds the one canonical
  example and follows it exactly — so agents reuse the established pattern instead of inventing a
  new one each run.
allowed-tools: [Read, Grep, Glob]
---

# API pattern

The point of this skill is consistency: the same kind of work should look the same everywhere, so
reviewers and the next agent can read it without re-learning. You do not invent structure — you
locate the codebase's canonical example and mirror it.

## Procedure
1. **Find the canonical example.** If the spec names one under "Reuse this pattern", read it. Else
   grep for the nearest sibling (an existing endpoint/handler of the same shape) and pick the most
   recent, most-tested one — not the oldest.
2. **Extract the pattern, don't paraphrase it.** Note the layering (e.g. controller → MediatR
   command → handler → repository), the validation hook (e.g. FluentValidation auto-discovered),
   the error model (e.g. `Result<T>` vs exceptions), DI registration, and the test shape that
   covers it.
3. **Replicate exactly** for the new surface — same naming, same file organization (one class per
   file), same immutability and boundary-validation conventions. Wire DI the same way.
4. **Add the matching tests** in the same style as the example's tests.
5. **If the established pattern looks wrong**, do not silently diverge — follow it and flag it for
   cleanup, or escalate. Two contradictory patterns in one codebase is a worse outcome than one
   imperfect-but-consistent one.

## Done when
- The new surface is indistinguishable in shape from the canonical example.
- DI, validation, and error handling follow the same convention.
- Tests mirror the example's test style and cover the new behavior.
