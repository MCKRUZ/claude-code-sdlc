---
name: pr-writer
description: >-
  Open a spec's PR correctly: the right branch, a conventional-commit title, a body that maps the
  diff to the spec's acceptance checks with a test plan, and the spec file included in the diff.
  Use when a change is ready to push for review.
allowed-tools: [Read, Grep, Glob, Bash]
---

# PR writer

A PR is where intent and implementation are reviewed together, so it must carry both. This skill
produces the PR the merge bar and the grader expect.

## Preconditions (the harness enforces these — don't fight them)
- You push only to the branch you created (`spec/NNNN-name`), never to the default branch.
- The `review-gate` hook blocks the push until `/code-review` and `/simplify` have run for HEAD —
  run those first (see the kit's built-in dependencies).
- Tests and build are green (the Stop hook won't let you finish otherwise).

## Procedure
1. **Branch:** confirm you're on `spec/NNNN-name` (create it from the default branch if not).
2. **Commit:** stage the specific files (not `git add -A`). Title is a conventional commit —
   `type: description`, imperative, lowercase, under 72 chars (`feat:`, `fix:`, `refactor:`,
   `docs:`, `test:`, `chore:`, `perf:`, `ci:`). Every agent commit is **co-authored** for provenance.
3. **Confirm the spec is in the diff** — `specs/NNNN-name.md` must be part of the PR so the
   reviewer and grader see intent + implementation in one view.
4. **PR body:**
   - **Summary** — what changed and why (one short paragraph).
   - **Acceptance checks → evidence** — list each check from the spec and the test/line that
     satisfies it.
   - **Test plan** — what was run and the result (`dotnet test` etc.), not "should pass."
   - **Risk tier + gated paths touched** — so the right gates and reviewers are triggered; add the
     `risk:high` label if HIGH.
5. **Open the PR** (`gh pr create`) with that title and body. Do not approve or merge it — a
   non-author owns the verdict.

## Done when
- Branch, conventional-commit title, and co-authorship are correct.
- The spec file is in the diff and every acceptance check is mapped to evidence.
- The test plan reports real results; the risk tier/label is set.
