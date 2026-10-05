# Risk-Tier Map
<!-- Phase 3 — Foundation | Required artifact -->

> The HIGH/MEDIUM/LOW taxonomy this project's Build loop uses to route review depth.

## HIGH
**What lands here:** auth/identity, payments, PII/client data handling, schema migrations, public API contract changes.
**Triggers:** tight agent permissions, full checking ladder, security-reviewer pass, named human sign-off in the PR.
**Project-specific examples:** src/Auth/**, the claims export endpoint, any change under infra/.

## MEDIUM
**What lands here:** new business logic, external integrations, changes to shared internal services.
**Triggers:** standard permissions, grader + human Checker.
**Project-specific examples:** the rate limiter, the usage ingest worker.

## LOW
**What lands here:** UI within existing patterns, copy, internal tooling.
**Triggers:** lighter review; grader + mechanical gates still run.
**Project-specific examples:** dashboard layout changes, README updates.

## Gated paths (path-triggered security workflow)
List the repo paths that fire the security workflow on any PR that touches them, regardless of tier:
- [x] `src/Auth/**`
- [x] `infra/**`
- [x] `**/migrations/**`
