---
spec: "0006"
name: "spec-pr-status"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §15"
channel: ""
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "the machine-readable `## Gate Results` block that /sdlc-review writes and scripts/record_findings.py parses"
created: "2026-09-19"
---

# Spec 0006 — A spec can report where it is, read from its pull request

## Goal

Given a spec, the plugin can report where that change has reached — checks, grader verdict, security
review, approvals and merge — read from its pull request, without anyone typing status anywhere.

## Why

Once a spec is handed off, the truth about it lives in the code host: the checks that ran, who approved,
what the grader said. Anyone wanting that today opens the pull request and interprets it. A read-only
report makes "where is this change, and who is it waiting on" answerable for a hundred specs at once,
and is what lets the spec's status stop drifting from reality.

## Scope

### In scope
- A status command that maps one spec to its pull request and reports its state
- A machine-readable verdict block in the grader's comment, in the style the review command already uses
- Setting `status: merged` on the spec when its pull request merges
- `scripts/tests/` with recorded host responses as fixtures
- `harness/workflows/grader.yml` — emit the verdict block

### Out of scope
- Changing what any gate decides. This reads; it never votes.
- The correctness and security reviews' own verdicts beyond reading their check result.
- Azure DevOps — a later spec, though the report shape must not assume GitHub wording.

## Acceptance Checks

- [ ] `spec-status --spec specs/0007-name.md` finds the pull request whose branch matches the spec's
      branch name, and reports: checks with their results, whether the grader ran and its verdict,
      whether a security review was required and its result, approvals with who gave them, and whether
      it merged.
- [ ] It reports who the change is waiting on, in one line, from the first unmet requirement — for
      example "waiting for a non-author approval; requested from @priya-n 2 days ago".
- [ ] With no pull request for the spec, it says so and exits zero — not an error.
- [ ] `--json` returns the same information as structured data, with every time as an absolute timestamp.
- [ ] The grader's comment carries a machine-readable block listing each acceptance check with covered
      or not-covered and a one-line reason, parseable without reading the prose around it.
- [ ] The existing human-readable grader comment is unchanged above that block, and the grader's
      advisory-only behaviour is unchanged — it still never blocks.
- [ ] When the pull request merges, the spec's `status` becomes merged, in a commit on the default
      branch, and running it again changes nothing.
- [ ] With no code-host access it reports what it read locally and says the rest is unavailable,
      rather than reporting a change as not started.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it changes a pipeline file — the grader workflow — which the risk rules call HIGH.
The change is limited to adding output to an advisory job that cannot block, and a gated path forces a
security review regardless of tier, so the extra pass runs. If the reviewer disagrees, raise it to HIGH.

## Delegation Plan
- **Scope (file patterns):** the new status script and command, `scripts/tests/**`,
  `harness/workflows/grader.yml`, and the equivalent pack copy of that workflow
- **Context (pattern to reuse):** the `## Gate Results` block and its parser — same shape, same
  discipline, a new producer
- **Permissions:** build, tests, reads auto-allowed. Network calls to the code host must be confirmed.
  Editing the workflow file is a gated path and needs a code-owner review
- **Gated paths touched:** the pipeline — `harness/workflows/grader.yml`

## Checking Plan

**Ladder depth:** MEDIUM plus a security pass, because a pipeline file changes
**Specifics:** grader, correctness, a security pass on the workflow change, and a non-author approval.
The reviewer must confirm the grader still cannot block and that no secret is read in the new step.

## Decision List
- **If the grader's block and its prose disagree, which wins?** Written here as the block, with the
  prose treated as explanation. Owner: the Pod Lead, before this spec is ready.
