# Risk-Tier Map
<!-- Phase 3 — Foundation | Required artifact -->

> The HIGH/MEDIUM/LOW taxonomy this project's Build loop uses to route review depth. Lives in
> `CLAUDE.md` too so agents see it. Challenges to a tier escalate **up, never down**, without
> discussion. Tune the examples to this codebase; keep the triggers.

## HIGH
**What lands here:** auth/identity, payments, PII/client data handling, schema migrations, public
API contract changes, IaC/pipeline changes, prompt/model/tool-definition changes, anything hard to undo.
**Triggers:** tight agent permissions, full checking ladder, security-reviewer pass, named human sign-off in the PR.
**Project-specific examples:** [list the concrete files/areas]

## MEDIUM
**What lands here:** new business logic, external integrations, changes to shared internal services.
**Triggers:** standard permissions, grader + human Checker.
**Project-specific examples:** [...]

## LOW
**What lands here:** UI within existing patterns, copy, internal tooling, additive CRUD on established rails.
**Triggers:** lighter review; grader + mechanical gates still run.
**Project-specific examples:** [...]

## Gated paths (path-triggered security workflow)
List the repo paths that fire the security workflow on any PR that touches them, regardless of tier:
- [ ] [e.g. `src/Auth/**`]
- [ ] [e.g. `infra/**`]
- [ ] [e.g. `**/migrations/**`]
