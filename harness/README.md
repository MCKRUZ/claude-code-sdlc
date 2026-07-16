# The Kit — a standard-aligned Claude Code harness

The engagement starter from GOLD-STANDARD **§6 (the harness standard)** and **§10 (the kit)**.
Phase 3 of every engagement installs this into the client repo and adapts it **in the open** —
the adaptation PRs are the client team's first look at how we work.

The design rationale, the research behind every choice, and the maturity tiers are in
[`../docs/harness-kit/RESEARCH.md`](../docs/harness-kit/RESEARCH.md). Read it once before your
first install.

> **This is a template, not a finished config.** Every `{{TOKEN}}` and `<<PLACEHOLDER>>` must be
> replaced. An unadapted kit will not pass its own gates — by design.

---

## Install (recommended: via the plugin)

This kit is the canonical source, but the easy path for a team is the **`claude-code-sdlc`
plugin**, which bundles a synced copy and lays it down for you:

```
/plugin marketplace add MCKRUZ/claude-code-sdlc
/plugin install claude-code-sdlc@mckruz
# then, per repo:
/sdlc-setup        # initializes .sdlc/ AND installs this harness
# or, to (re)install just the harness:
/sdlc-harness
```

The install map below is what the plugin's installer applies (and what you'd copy by hand if
installing manually). `delivery-standard/kit/` stays the source of truth; the plugin's copy is
regenerated from it via `scripts/sync_kit.py` — don't hand-edit the plugin's `harness/`.

---

## Maturity legend
Each piece is tagged so you adopt deliberately:
- 🟢 **STABLE** — depend on it freely (CLAUDE.md, settings/permissions, hooks, subagents).
- 🟡 **NEWER** — GA but evolving; expect minor churn (skills, plugins, `claude-code-action`, eval CI).
- 🔴 **BLEEDING-EDGE** — emerging; pin versions, treat as opt-in (agent-authored IaC, remote MCP).

---

## Install map (authoritative)
Where each kit file goes in the client repo. The workflows and hooks reference these exact paths,
so install here unless you also repoint the references.

| Kit path | Install to | Notes |
|---|---|---|
| `CLAUDE.md.template` | `./CLAUDE.md` | Replace every `{{TOKEN}}`; delete guidance comments. |
| `spec-template.md` | `./specs/spec-template.md` | Copy per feature to `specs/NNNN-name.md`. |
| `settings.json` | `./.claude/settings.json` | Shared, committed. Leans on `deny` (see below). |
| `mcp.json` | `./.mcp.json` | Team MCP servers (context7, sequential-thinking, playwright); packs merge additions (dotnet → microsoft-learn, github → github, azure-devops → azure-devops). Versions pinned; no secrets — auth is always per-developer. Each developer approves the set once on first open. |
| `HARNESS.md` | `./docs/harness.md` | The developer-facing tour: what each installed piece does and why, per layer. Point new team members here first. |
| `hooks/*` | `./.claude/hooks/` | `stop-gate`, `review-gate`, `save-review-receipt` (`.ps1` + `.sh`). |
| `agents/*` | `./.claude/agents/` | `planner`, `architect`, `grader`, `security-reviewer`, `build-error-resolver`, `debugger` — model-tiered; see `agents/README.md`. |
| `skills/*` | `./.claude/skills/` | `spec-writer`, `test-writer`, `api-pattern`, `pr-writer`, `eval-builder`, `diagnose`. |
| `workflows/{ci,grader,correctness,security,deploy-dev,eval-regression,eval-suite}.yml` | `./.github/workflows/` | The five rails + the two eval workflows. |
| `workflows/RAILS.md` | `./.github/RAILS.md` | Operator's guide + shakedown drills. |
| `profile/rubrics/*` | `./.github/profile/rubrics/` | Workflows read these by this path. |
| `profile/eval-bypasses.md` | `./.github/eval-bypasses.md` | Override/bypass ledger. |
| `profile/CODEOWNERS` | `./.github/CODEOWNERS` | |
| `profile/scripts/*` | `./scripts/rails/` | Workflows call `scripts/rails/diff-anchors.sh`. |
| `profile/rulesets/branch-protection.json` | *applied, not copied* | Run `scripts/rails/apply-branch-protection.sh`. |
| `eval-datasets/*` | `./eval-datasets/` | Golden-set template + how-to (§11 work only). |
| `prompts/*` | `./prompts/` | Versioned judge prompts (§11 work only). |
| `infra/*` | `./infra/` | Bicep dev-env **starter** — adapt to the client landing zone. |

**Add to `.gitignore`:**
```
.claude/.review-receipts/
.claude/settings.local.json
```

**Agents & skills:** the kit ships a lean, model-tiered set (6 agents, 6 skills) and a curated
install-on-demand menu — see [`agents/README.md`](agents/README.md). It also **depends on the
built-in commands `/code-review`, `/simplify`** (the `review-gate` hook blocks a push until both
have run) **and `/update-docs`** — declared there, not duplicated here.

---

## The five rails (CI), at a glance
| Workflow | Job/check name | Blocks? | Job |
|---|---|---|---|
| `ci.yml` | `build-and-test` | **Blocks** | Build + test + coverage floor. |
| `grader.yml` | `grader` | **Advises** (required to *run*) | Fresh agent grades the spec **file in the diff**, line-anchored. |
| `correctness.yml` | `correctness-review` | **Blocks** on a high-confidence defect | Named override label clears it. |
| `security.yml` | `security-review` | **Blocks** on HIGH | Gated-path / `risk:high` triggered; self-passes otherwise. |
| `deploy-dev.yml` | — | ships | Merge → dev; restores last good on failure; promotes the artifact. |

Plus `eval-regression.yml` (per-PR gate when prompts/models/tools/agent-behavior change) and
`eval-suite.yml` (periodic full benchmark) for §11 agentic deliverables.

The merge bar (in `branch-protection.json`): **CI green + grader ran + correctness passed (or
recorded override) + a non-author approval**; HIGH adds security pass + a named sign-off in the PR.

---

## Adapt in this order
1. **`CLAUDE.md`** — fill the project, stack, glossary, risk taxonomy, gated paths. This is what
   every agent reads first; a stale one means agents guess.
2. **`settings.json`** — confirm the gated-path globs match the repo's folders; the shared file
   leans on `deny` (a user's `settings.local.json` can loosen `allow` but never `deny`).
3. **Hooks** — pick `.ps1` (needs `pwsh`) or `.sh` (needs `jq`) per host; set `RAILS_*` env knobs.
   See `hooks/README.md`.
4. **Workflows + profile** — set the `<<PLACEHOLDER>>` build/test/deploy commands and gated-path
   regex. See `workflows/README.md`.
5. **Branch protection** — run `scripts/rails/apply-branch-protection.sh` once GitHub Actions is on.
6. **§11 only** — wire the eval runner behind the `eval-*` workflows; calibrate thresholds.

## Then prove the rails — do not assume them
Run the **shakedown drills** in [`workflows/RAILS.md`](workflows/RAILS.md) before Foundation
closes: force a failing test (Stop hook blocks), plant a spec-mismatch (grader posts the miss),
plant a logic defect (correctness blocks, override clears), break a deploy (it restores), probe a
guarded path (security fires). *A rail that has only ever seen green has not been tested.*

---

## Placeholder index
Search-and-replace targets across the kit:
- `{{TOKEN}}` — in `CLAUDE.md.template`, `spec-template.md`, the skills, and rubrics (human prose).
- `<<PLACEHOLDER>>` — in workflows and `infra/` (build/test/deploy commands, runners, gated paths).
- `RAILS_*` env vars — hook knobs (`RAILS_SRC_GLOB`, `RAILS_SOLUTION`, `RAILS_STOP_RUN_TESTS`,
  `RAILS_REVIEW_BASE`, `RAILS_REVIEW_SRC_REGEX`, `RAILS_REVIEW_KINDS`, `RAILS_SKIP_REVIEW_GATE`).
- `@your-org/your-team` — in `profile/CODEOWNERS`.

## Known starters & follow-ups (flagged honestly)
- **`infra/` + `deploy-dev.yml` are starters**, not turn-key. IaC is HIGH risk every time; adapt to
  the client's Azure landing zone before use. `deploy-dev.yml` needs CI to upload a *deployable*
  artifact (the shipped `ci.yml` uploads coverage only — add the package upload).
- **`ci.yml` has an optional `eval-gate` job** (a deterministic per-PR security/OWASP gate); it is
  distinct from `eval-regression.yml` (behavior regression) and `eval-suite.yml` (periodic
  benchmark). Keep only what you wire; delete the rest to avoid confusion.
- **Eval thresholds** (~±3% trip-wire, etc.) are practitioner starting points — calibrate to your
  measured variance before marking the eval gate a required check. See `eval-datasets/README.md`.
- **Plugin packaging is done (2026-07-01):** the kit installs via the `claude-code-sdlc` plugin's
  `/sdlc-setup` (see "Install" above). Manual copy per the install map still works.

## Drift this kit corrects in the standard's prose (for the harvest deputy)
GOLD-STANDARD §6/§10's trees previously listed **four** workflows and omitted `correctness.yml`;
`docs/the-rails.md` (five rails) is authoritative. **Reconciled 2026-06-30** — §6 and §10 now list
five, and §10 points to the eval workflows for §11. (Details in `workflows/README.md` and
`RESEARCH.md §7`.)
