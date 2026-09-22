---
spec: "0001"
name: "spec-people-fields"
status: draft
type: feature
risk: MEDIUM
source: "docs/proposals/studio-plugin-work.md §10"
channel: ""
owner: "@MCKRUZ"
developer: ""
checker: ""
team: "core"
harness_context: "the existing spec frontmatter contract in templates/phases/build/spec.md, read by scripts/track_specs.py"
created: "2026-09-19"
---

# Spec 0001 — A spec records who owns it, who builds it and who checks it

## Goal

Every spec names its owner, developer, checker and team in its frontmatter, and the project carries
a roster mapping those people to their code-host accounts.

## Why

The Build loop already separates three roles — the person who owns the intent, the person who drives
the agent, and the person who approves work they did not build — but a spec records none of them. The
result is that nobody can answer "what is waiting on me?" without reading every pull request. Studio's
Build board, hand-off and status screens all depend on this being recorded in the spec itself, so it
survives sessions and stays true in the repository rather than in an app's memory.

## Scope

### In scope
- `templates/phases/build/spec.md` — four new frontmatter fields
- `scripts/new_spec.py` — accept and write the new fields
- `scripts/check_spec.py` — Definition-of-Ready rule for `owner`
- `scripts/track_specs.py` — expose the fields in its output
- A new roster file and its validator, following the style of `profiles/_schema.yaml`
- `scripts/tests/` — tests for all of the above
- `references/team-model.md` and `phases/build-loop.md` — document the fields

### Out of scope
- Any change to `check_gates.py`, `phase_model.py`, `phase-registry.yaml` or `harness/**` — the
  protected core stays byte-for-byte unchanged. Stop and ask if something there appears to need it.
- Enforcing who may approve. That stays with branch protection on the code host.
- Any user interface.

## Acceptance Checks

- [ ] A spec's frontmatter accepts `owner`, `developer`, `checker` and `team`; each holds a code-host
      handle (`owner: "@priya-n"`) or is empty.
- [ ] `new_spec.py --owner @priya-n --team claims` writes those values; omitted fields are written empty.
- [ ] `check_spec.py` reports a spec with an empty `owner` as NOT READY, naming the missing field, and
      exits non-zero — the same way it already treats a missing risk tier.
- [ ] `check_spec.py` treats empty `developer` and `checker` as ready: they are filled at hand-off.
- [ ] A roster file at `.sdlc/team.yaml` lists people, each with a handle, display name, team, the roles
      they may hold (`owner`, `developer`, `checker`, `lead`, `security`) and the stages they sign off.
- [ ] A roster validator rejects: a duplicate handle, a team with no lead, and a role name outside that
      list — each with the offending line.
- [ ] `check_spec.py` reports a spec whose `owner` or `team` is absent from the roster as NOT READY.
      With no roster file present, it skips that check and says so, so a standalone repository still works.
- [ ] `track_specs.py --json` includes `owner`, `developer`, `checker` and `team` for every spec.
- [ ] `track_specs.py` grouped by team reports counts per team, using the roster's team list.
- [ ] Running `check_spec.py` against every spec written before this change (no new fields present)
      reports the missing `owner` and nothing else — no crash, no other new failure.

## Risk Tier

**Tier:** MEDIUM
**Why this tier:** it changes a shared internal contract — the spec frontmatter that several scripts
read — but touches no auth, data or infrastructure, and is easy to undo.

## Delegation Plan
- **Scope (file patterns):** `templates/phases/build/spec.md`, `scripts/new_spec.py`,
  `scripts/check_spec.py`, `scripts/track_specs.py`, `scripts/tests/**`, the new roster schema and
  validator, `references/team-model.md`, `phases/build-loop.md`
- **Context (pattern to reuse):** the existing frontmatter contract and its readers — add fields the
  same way `risk` and `channel` are handled today; validate the roster the way profiles are validated
- **Permissions:** build, tests and reads auto-allowed; no package installs; ask before touching
  anything outside the scope above
- **Gated paths touched:** none

## Checking Plan

**Ladder depth:** MEDIUM
**Specifics:** mechanical checks plus the grader, and a non-author approval. The backward-compatibility
check — old specs still parse — is the one a reviewer should re-run by hand.

## Decision List
- **Is `checker` required before a spec is ready, or filled at hand-off?** Written here as filled at
  hand-off, because the checker is often chosen by who has capacity. Owner: the Pod Lead, by the next
  intent triage.
