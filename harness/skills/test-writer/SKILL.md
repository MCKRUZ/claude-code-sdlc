---
name: test-writer
description: >-
  Write tests that encode WHY behavior matters, mapped to a spec's acceptance checks. Use when
  adding tests for a feature or reproducing a bug. For bug fixes, write the failing test FIRST.
  Targets the team's coverage bar on new code.
allowed-tools: [Read, Grep, Glob, Write, Edit, Bash]
---

# Test writer

A test that can't fail when the underlying business logic changes is wrong. Each test encodes
**why** a behavior matters, not just what it does, and ties back to a spec acceptance check.

## Procedure
1. **Anchor to the spec.** Open `specs/NNNN-name.md`; each acceptance check should map to at least
   one test. Name tests so the mapping is legible (`MethodName_Scenario_ExpectedResult`).
2. **For a bug fix, reproduce first.** Write the test that fails because of the bug, watch it fail,
   then fix. The fix isn't done until that test passes.
3. **Prefer real implementations over mocks.** Use the project's integration harness
   ({{e.g. WebApplicationFactory + in-memory DB}}) for pipeline behavior. Mock only external
   services (HTTP, third-party APIs) and time. Never mock the thing under test or value objects.
4. **Cover the edges named in the spec** — the burst window, the null path, the boundary value —
   not just the happy path.
5. **Run the suite** (`{{TEST_CMD}}`) and confirm green before you consider it done. The Stop hook
   will block the turn anyway if it's red — beat it to the check.

## Done when
- Every acceptance check has a covering test, named to show the mapping.
- New code meets the coverage bar ({{e.g. 80%}}).
- For a bug fix: the reproducing test existed, failed, and now passes.
