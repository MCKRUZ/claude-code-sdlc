---
name: spec-writer
description: >-
  Turn a backlog story into a Definition-of-Ready spec at specs/NNNN-name.md. Use when the
  user wants to "write a spec", "make this story ready", or start a feature. Enforces the
  vague-line test on every acceptance check and assigns a risk tier. Use BEFORE delegating
  any build — no spec, no build.
allowed-tools: [Read, Grep, Glob, Write]
---

# Spec writer

Produce a spec the team can build against without guessing. A spec is ready only when its
acceptance checks survive the **vague-line test**: *could two people build different things from
this line?* If yes, the line is a wish — rewrite it until it's a check.

## Procedure
1. **Find the next number.** Glob `specs/*.md`; the new file is `specs/NNNN-name.md` with `NNNN`
   zero-padded and `name` kebab-case.
2. **Start from `spec-template.md`.** Fill all seven parts: Goal · Why · Scope in/out ·
   Acceptance checks · Risk tier · Delegation plan · Checking plan.
3. **Assign the risk tier** from CLAUDE.md's risk taxonomy. When unsure, escalate up — never down.
   The tier sets the gates and the checking-ladder climb.
4. **Write acceptance checks as observable statements** (Given/When/Then where it fits). Each must
   name what is true and testable, not an intention. Run each past the vague-line test out loud.
5. **Set the delegation bounds:** which file globs the agent may touch, which paths are gated, and
   the one canonical pattern in the codebase to reuse. Grep for that pattern and cite it.
6. **If the deliverable is LLM-powered,** add the evals block: golden-set path, threshold, and what
   the grader checks differently (behavior distribution, not just code).

## Done when
- The file exists at `specs/NNNN-name.md`, all seven parts filled.
- Every acceptance check passes the vague-line test.
- A risk tier is set and the gated paths it touches are listed.
- No open product decision remains for this story (otherwise it's not Ready — flag it for the
  decision list with a named owner, don't paper over it).
