---
name: diagnose
description: >-
  The team's bug-fix procedure: reproduce with a FAILING TEST first, then fix, then prove the test
  passes. Use whenever a bug is reported. Do not start by patching — start by reproducing. For deep
  root-cause hunts, invoke the debugger agent from inside this procedure.
allowed-tools: [Read, Grep, Glob, Bash, Edit, Write]
---

# Diagnose (bug-fix procedure)

A fix isn't done when the code changes — it's done when a test that failed because of the bug now
passes. This procedure is mandatory for bug fixes; it makes the fix provable, not asserted.

## Procedure
1. **Reproduce as a failing test FIRST.** Write the smallest test that fails *because of the bug*,
   and watch it fail. Do not touch the production code yet. A bug you can't reproduce, you can't
   prove you fixed.
2. **Find the root cause.** If it's obvious, name it. If it isn't, hand off to the **debugger
   agent** — it works in an isolated context, eliminates hypotheses, and returns the root cause +
   repro without burning your main context.
3. **Fix the cause, minimally.** The smallest change that addresses the root cause — not the
   symptom, not a refactor the bug didn't require. If the real fix needs a gated path, stop and
   escalate (it's a new spec).
4. **Prove it.** Run the failing test — it must now pass. Run the surrounding suite — nothing else
   went red. The Stop hook will block the turn on red tests anyway; beat it to the check.
5. **Guard against recurrence.** Keep the reproducing test in the suite so the bug can't silently
   return; if the bug class is broad, add the obvious sibling cases.

## Done when
- A test existed that failed because of the bug, and now passes.
- The fix is the minimal change at the root cause, inside the spec's bounds.
- The full suite is green and the reproducing test is committed.
