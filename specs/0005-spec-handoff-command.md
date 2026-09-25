---
spec: "0005"
name: "spec-handoff-command"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §14"
channel: ""
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "scripts/new_spec.py — the existing spec-writing script and its frontmatter handling"
created: "2026-09-19"
---

# Spec 0005 — One command hands a spec to a developer

## Goal

A single command takes a ready spec and hands it off: it creates the spec's branch, records the
developer, assigns them on the code host, and opens Claude Code on that branch with the spec loaded.

## Why

Hand-off is the moment the loop's roles change hands, and today it is four manual steps that each get
skipped differently: the branch gets named ad hoc, the spec's status goes stale, nobody is assigned, and
the developer starts Claude Code without the spec in front of it. Making it one step is what lets the
board honestly say who is building what.

## Scope

### In scope
- A new hand-off command and the script behind it
- Branch creation using the playbook's naming rule
- Frontmatter updates: status and developer
- Assigning the developer on the code host
- Starting Claude Code on the branch in plan mode with the spec loaded
- Refusing a hand-off when the team is at its limit (spec 0003)
- `scripts/tests/`, and documentation in `phases/build-loop.md`

### Out of scope
- Anything the agent then does — plan mode, the build itself, the checks.
- `check_gates.py`, `phase_model.py`, `phase-registry.yaml`, `harness/**`
- Recording the developer's plan approval. Noted as a gap; a later spec.

## Acceptance Checks

- [ ] `handoff --spec specs/0007-name.md --developer @sam-k` refuses unless the spec passes the
      Definition of Ready, naming what is missing.
- [ ] It creates a branch named by the playbook's branch rule, with the spec's number and name
      (`spec/0007-reject-duplicate-claims` under the default rule).
- [ ] It sets the spec's `status` to in-flight and `developer` to the given handle, in one commit on
      that branch, and pushes the branch.
- [ ] It assigns that developer on the code host, and requests a review from the spec's checker when
      one is set.
- [ ] It refuses, changing nothing, when the developer's handle is absent from the roster, or the
      developer is also the spec's checker — a person cannot check their own build.
- [ ] It refuses, changing nothing, when the team is at its limit, naming the team, the count and the
      limit, unless `--over-limit` is given with a reason, which is written into the commit message.
- [ ] `--open` starts Claude Code on the branch with the spec loaded in plan mode; without it, the
      command prints the exact command to run.
- [ ] Run twice on the same spec, the second run reports it is already in flight and changes nothing.
- [ ] With no code-host access, it still does the local half — branch and frontmatter — and reports
      clearly that the assignment did not happen.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it writes to the repository and the code host on someone's behalf, but only on a new
branch, and every step is reversible. No auth, data or infrastructure changes.

## Delegation Plan
- **Scope (file patterns):** the new command and script, `scripts/tests/**`, `commands/**` for the
  command's own file, `phases/build-loop.md`
- **Context (pattern to reuse):** `new_spec.py` — the same frontmatter reading and writing, and the
  same standalone-or-workflow behaviour
- **Permissions:** build, tests, reads auto-allowed. Creating branches, pushing and assigning on the
  code host must be confirmed. Never force-push
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** grader plus a non-author approval. The reviewer should confirm every refusal path leaves
the repository untouched — a half-done hand-off is worse than none.

## Decision List
- **Can a spec be handed to its own owner?** Yes, written here: owner and developer are often the same
  person on a small team. Only owner-as-checker is refused. Owner: the Pod Lead; answered.
