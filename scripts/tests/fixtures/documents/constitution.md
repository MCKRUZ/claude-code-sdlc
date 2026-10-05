# Project Constitution
<!-- Phase 0 — Discovery | Required artifact -->

## Project Identity
<!-- REQUIRED: Project Identity (name, profile, date) -->
- **Name:** Acme Claims Portal
- **Profile:** microsoft-enterprise
- **Created:** 2026-09-23

## Mission Statement
<!-- REQUIRED: Mission Statement - one paragraph describing what this project achieves and why -->
Acme Claims Portal lets claims adjusters submit and track insurance claims without duplicate processing, so customers are never double-paid or double-billed and adjusters spend their day resolving claims instead of reconciling ledgers.

## Governing Principles
<!-- REQUIRED: Governing Principles - at least 3 project-specific principles, not generic platitudes -->
Define 3-5 principles specific to this project. These should reflect real trade-offs you expect to face - not boilerplate values. Each principle should be actionable: a team member facing a hard decision should be able to apply it.

### 1. Correctness over speed
When a duplicate-claim check and a fast response time conflict, correctness wins every time - a wrong payout is far more expensive than a slow one.

### 2. One source of truth per claim
A claim's status lives in exactly one system; no shadow spreadsheets, no cached copies that can drift.

### 3. Auditability by default
Every claim state change is logged with who, what, and when - compliance review should never require reconstructing history from memory.

*Add principles 4 and 5 if meaningful for this project.*

## Decision Authority
<!-- REQUIRED: Decision Authority - who owns phase transitions, architecture decisions, scope changes -->

| Decision Type | Owner | Escalation Path | Notes |
|---------------|-------|-----------------|-------|
| Phase transitions | Priya N. | Matt K. | Gate checks must pass first |
| Architecture decisions | Sam K. | Priya N. | Documented via ADRs in Phase 2 |
| Scope changes | Priya N. | Matt K. | Requires re-evaluation from affected phase |
| Compliance overrides | Matt K. | Board | Must be documented with justification |

## Amendment Process
This constitution is a living document. It MAY be amended during any phase. Changes MUST be:
1. Documented with rationale in the Version History below
2. Reviewed by the decision authority for the affected area
3. Recorded in the SDLC state history

## Version History

| Version | Date | Author | Change Summary |
|---------|------|--------|----------------|
| 1.0 | 2026-09-23 | Priya N. | Initial constitution established |
