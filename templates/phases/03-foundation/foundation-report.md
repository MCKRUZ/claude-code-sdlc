# Foundation Report
<!-- Phase 3 — Foundation | Required artifact -->

> Evidence that the factory is built and one part is already moving through it. The walking
> skeleton must be running in the client dev environment through the real pipeline before this
> phase can close.

**Project:** [name]
**Dev environment URL:** [where the skeleton is running]
**Date:** [YYYY-MM-DD]

---

## Harness installed & adapted

- [ ] `CLAUDE.md` adapted to the client (domain glossary in their words, stack standards, risk taxonomy, gated paths, Definition of Checked)
- [ ] `.claude/` (skills, agents: grader + security-reviewer, hooks: Stop hook)
- [ ] `specs/` directory established with the spec template
- [ ] Reviewed by the Setup Owner's deputy (Setup Owner is never sole approver): [name]

## The rails (CI/CD pipeline)

| Workflow | Fires on | Blocks? | Proven by forced failure? |
|----------|----------|---------|---------------------------|
| ci (build/test/lint/coverage) | every PR | hard block | [ ] |
| grader | every PR | required-to-run, advisory | [ ] |
| correctness | source changes | blocks on high-confidence defect | [ ] |
| security | risk:high / gated paths | blocks on HIGH | [ ] |
| deploy-dev | merge to main | ships + rolls back | [ ] |

- [ ] Branch protection enforces: CI green + grader-ran + correctness-passed + non-author approval
- [ ] The Stop hook actually blocks a finish with red tests (demonstrated)

## Infrastructure

- [ ] Dev environment provisioned from code (IaC), HIGH-risk reviewed
- [ ] Secrets in the client's vault — never in code, CLAUDE.md, or specs

## Walking skeleton

- [ ] Definition met (from Phase 2): exercises every ADR's chosen mechanism at least once
- [ ] Deployed to the client dev environment **through the real pipeline** (not a laptop)
- [ ] At least one HIGH-risk spec ran the full Build loop
- [ ] The outcome metric is measurable in dev (the metric slice exists and ticks)

## Sign-off

Named human (each side): [pod] / [client]
