# Foundation Report
<!-- Phase 3 — Foundation | Required artifact -->

> Evidence that the factory is built and one part is already moving through it.

**Project:** Claims Portal
**Dev environment URL:** https://claims-dev.example.com
**Date:** 2026-09-30

---

## Harness installed & adapted

- [x] `CLAUDE.md` adapted to the client (domain glossary in their words, stack standards, risk taxonomy, gated paths, Definition of Checked)
- [x] `.claude/` (skills, agents: grader + security-reviewer, hooks: Stop hook)
- [x] `specs/` directory established with the spec template
- [x] Reviewed by the Setup Owner's deputy (Setup Owner is never sole approver): Priya N.

## The rails (CI/CD pipeline)

| Workflow | Fires on | Blocks? | Proven by forced failure? |
|----------|----------|---------|---------------------------|
| ci (build/test/lint/coverage) | every PR | hard block | [x] |
| grader | every PR | required-to-run, advisory | [x] |
| correctness | source changes | blocks on high-confidence defect | [x] |
| security | risk:high / gated paths | blocks on HIGH | [x] |
| deploy-dev | merge to main | ships + rolls back | [x] |

- [x] Branch protection enforces: CI green + grader-ran + correctness-passed + non-author approval
- [x] The Stop hook actually blocks a finish with red tests (demonstrated)

## Infrastructure

- [x] Dev environment provisioned from code (IaC), HIGH-risk reviewed
- [x] Secrets in the client's vault — never in code, CLAUDE.md, or specs

## Walking skeleton

- [x] Definition met (from Phase 2): exercises every ADR's chosen mechanism at least once
- [x] Deployed to the client dev environment **through the real pipeline** (not a laptop)
- [x] At least one HIGH-risk spec ran the full Build loop
- [x] The outcome metric is measurable in dev (the metric slice exists and ticks)

## Sign-off

Named human (each side): Sam K. (pod) / Dana R. (client)
