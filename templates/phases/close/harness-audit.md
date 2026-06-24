# Harness Audit
<!-- Phase C — Close & Transfer | Required artifact -->

> The test: "could the client's team operate this harness if we vanished tonight?" Every finding is
> fixed by a PR the **client** Setup Owner merges (building their real merge history).

## Audit scope
- [ ] `CLAUDE.md` — nothing only the pod understands; domain glossary current
- [ ] `.claude/skills/` — every skill documented and reproducible
- [ ] `.claude/agents/` — grader + security-reviewer behavior understood by the client
- [ ] `.claude/hooks/` — the Stop hook and any others explained
- [ ] `.github/workflows/` — all five rails; the client's DevOps can operate them
- [ ] `infra/` — IaC understood; client can provision/destroy environments
- [ ] `specs/` — convention clear; a client engineer can write a Ready spec

## Findings → fixes
| Finding (undocumented / pod-only knowledge) | Fix PR | Merged by (client) |
|---------------------------------------------|--------|--------------------|

## Setup Owner transfer
- Client Setup Owner named: [name]
- Has merged ≥1 harness change of their own: [PR link]
- Has named their own deputy (no role without a deputy): [name]
