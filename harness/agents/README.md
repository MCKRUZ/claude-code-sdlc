# Agents & skills — the harness surface

Deliberately lean. The standard's close-gate requires "no skill or hook only we understand," and
Anthropic's own guidance is that every installed agent/skill taxes the attention budget whether or
not it fires — so the kit ships the **loop- and gate-critical few** and pushes the long tail to
**install-on-demand**. Grow the shipped set through the harvest loop, not by bulk-installing a
marketplace.

## Shipped agents (`.claude/agents/`)
Model tiers follow the standard (§14: plan/design on the strongest model; implementation on the
standard model) and the convention of the best public kit (opus for design/security/review,
sonnet for build/test/debug).

| Agent | Model | Auto-spawn? | Role in the loop |
|---|---|---|---|
| `planner` | opus | On request (MEDIUM/HIGH, 5+ files) | Delegate — plan before code |
| `architect` | opus | On request (HIGH design) | Design decisions feeding a HIGH spec |
| `grader` | sonnet | No (run pre-PR / in CI) | Discern — grades code vs the spec (advisory) |
| `security-reviewer` | opus | **Auto** on auth/payments/identity/secrets | Discern — flags findings during the session; the CI security gate is what blocks a merge on HIGH |
| `build-error-resolver` | sonnet | **Auto** on build/lint failure | Clears the Stop hook's block |
| `debugger` | sonnet | On request (non-obvious failures) | Root-cause, returns a distilled diagnosis |

Only two auto-spawn (`security-reviewer`, `build-error-resolver`) — matching the discipline of
avoiding agent spam. The rest are invoked or suggested.

## Shipped skills (`.claude/skills/`)
| Skill | Use |
|---|---|
| `spec-writer` | Story → Definition-of-Ready spec (the vague-line test) |
| `test-writer` | Tests that encode *why*, mapped to acceptance checks |
| `api-pattern` | Add a surface the way the codebase already does it (§6-named) |
| `pr-writer` | Branch → conventional commit → spec-mapped PR with a test plan |
| `eval-builder` | Build a versioned golden set for an agentic spec (§11) |
| `diagnose` | The bug-fix procedure: failing test first, then fix, then prove |

## Built-in command dependencies (the kit relies on these — declare them)
These ship with current Claude Code; the kit assumes them rather than duplicating them:
- **`/code-review`** and **`/simplify`** — the `review-gate` hook **blocks a push until both have
  run** for HEAD (tune via `RAILS_REVIEW_KINDS`). If a client's Claude Code build lacks them,
  install equivalents before enabling the gate.
- **`/update-docs`** — pairs with a drift-check workflow that is **planned, not shipped** (a
  tracked harvest item — [intent-driven-development#5](https://github.com/MCKRUZ/intent-driven-development/issues/5));
  until it lands, run `/update-docs` on its own when docs drift.

## Install-on-demand menu (curated — NOT shipped)
Pull per project only when a spec needs it. Cherry-pick vetted components; **never bulk-install a
marketplace**, and every item installed must pass the close-gate ("nothing the team doesn't
understand").

| Need | Pull | From |
|---|---|---|
| Performance / query tuning | `performance-engineer`, `database-optimizer` | wshobson/agents · VoltAgent |
| Azure IaC / Bicep authoring | an infra/`bicep` agent | wshobson/agents (or author one in the agentic profile) |
| Language / domain specialist | `frontend-developer`, `python-pro`, etc. | wshobson/agents · VoltAgent |
| E2E browser tests | `e2e` (Playwright) | your global skill / anthropics `webapp-testing` |
| Enterprise documents | `docx`, `xlsx`, `pdf` | anthropics/skills (first-party) |
| Authoring new skills | `skill-creator`, `mcp-builder` | anthropics/skills |
| Vendor integrations (Atlassian, AWS, Stripe…) | the relevant plugin | Anthropic official plugin marketplace |

Sources worth standing on: `anthropics/skills` (first-party), the Anthropic official plugin
marketplace, `wshobson/agents` (model-tiered, eval-backed), `VoltAgent/awesome-claude-code-subagents`.
Treat the kitchen-sink catalogs as a *menu to browse*, not a bulk install.
