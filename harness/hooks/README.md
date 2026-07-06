# Hooks + Permissions Layer

The mechanical safety gates for a Claude Code project: a permission policy plus
self-validating hooks. Everything here is **fail-closed for safety, fail-open for
"can't tell"** — a gate only blocks when it can prove a rule was broken, and gets out
of the way when it cannot compute an answer (so it never wedges a session).

## Install

Copy into the target repo so the layout is:

```
<repo>/.claude/settings.json              <- from kit/settings.json
<repo>/.claude/hooks/stop-gate.ps1
<repo>/.claude/hooks/stop-gate.sh
<repo>/.claude/hooks/review-gate.ps1
<repo>/.claude/hooks/review-gate.sh
<repo>/.claude/hooks/save-review-receipt.ps1
<repo>/.claude/hooks/save-review-receipt.sh
```

Add this to the repo `.gitignore` (receipts are per-clone evidence, never committed):

```
.claude/.review-receipts/
```

## Why these gates exist

A written instruction like "build before you stop" or "review before you push" is the
same class of thing an agent forgets. The only reliable enforcement is machinery the
agent runs *through*. These hooks turn "might forget" into "physically refused until the
evidence exists."

| File | Event | What it enforces |
| --- | --- | --- |
| `stop-gate.{ps1,sh}` | `Stop` | The build (optionally tests) is green before a turn ends. |
| `review-gate.{ps1,sh}` | `PreToolUse` (Bash) | `git push` / `gh pr create` is blocked until per-commit review receipts exist. |
| `save-review-receipt.{ps1,sh}` | (manual) | Writes a commit-bound receipt the review gate looks for. |

## Hook contracts (verified — do not "improve" these)

These are subtle and easy to get wrong. They are the load-bearing part of the kit.

- **Stop hook block:** write top-level JSON `{"decision":"block","reason":"..."}` to
  stdout **and `exit 2`**. `exit 1` is *silently ignored*. `hookSpecificOutput` is
  **invalid** on Stop hooks and silently drops the block. `reason` is the only text
  surfaced back to the model.
- **PreToolUse block:** write
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`
  to stdout, then `exit 0`. (`hookSpecificOutput` *is* valid here — the opposite of Stop.)
- **Allow (either event):** emit nothing and `exit 0`.

## Permissions model (settings.json)

Claude Code evaluates permissions in the order **deny → ask → allow**, and **`deny`
cannot carry exceptions**. A user's local `settings.local.json` can *loosen* `allow`,
but it must not be able to loosen a team prohibition. **Therefore hard prohibitions live
in `deny` in this shared file** — `ask` is for "stop and confirm", `allow` is for
"never prompt me again".

- `allow` — auto-runs without a prompt: `dotnet build/test/restore/run/format`, and
  read-only `git`/`gh` (status, diff, log, show, branch, fetch, stash list, pr view/list/diff,
  run list/view, api repos/).
- `ask` — prompts every time: `git push`, `gh api` (write-capable), and edits/writes to
  sensitive trees (see placeholders below).
- `deny` — hard refusal, no exception: force-push (`--force` / `--force-with-lease` / `-f`),
  `git reset --hard`, piping a download straight into a shell (`curl|sh`, `wget|bash`), and
  reading secrets (`.env`, `.env.*`, `secrets/**`, `*.pfx`, `*.pem`).

### Placeholders to confirm / adapt per repo

`settings.json` cannot carry comments, so the repo-specific assumptions are documented
here. Review each against the target repo before shipping:

| In settings.json | Assumption | Change if… |
| --- | --- | --- |
| `Bash(dotnet …)` allow rules | Project is **.NET**. | Different stack — swap for `npm`/`ng`, `pytest`, `cargo`, etc. |
| `scripts/rails/apply-branch-protection.sh` (ask) | A branch-protection script lives at `scripts/rails/`. | Your tooling lives elsewhere or doesn't exist — remove or repoint. |
| `scripts/rails/**` (ask) | The kit's own scripts dir. | You keep automation under a different path. |
| `**/Auth/**`, `**/Identity/**`, `**/Security/**`, `**/SecurityAttributes/**` | Security-sensitive code is grouped under these folder names. | Your auth/identity code uses different folder names. |
| `**/Migrations/**` | EF Core-style migrations folder. | Different ORM / migrations layout. |
| `infra/**` | IaC (Bicep/Terraform) lives under `infra/`. | Your IaC lives elsewhere. |
| `.github/**` | GitHub Actions / repo config is gated. | Keep as-is for almost all repos. |

The hook scripts themselves hardcode **nothing** repo-specific — every assumption is an
env var (below) with a sensible .NET default.

## Environment knobs

All optional. Defaults assume a .NET solution under `src/`.

| Var | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `RAILS_SRC_GLOB` | stop-gate | `.cs/.csproj/.slnx/.sln/.props/.targets/.razor/.cshtml` under `src/**` | Git pathspecs whose dirty state arms the build gate. |
| `RAILS_SOLUTION` | stop-gate | first `*.slnx`/`*.sln` found | Explicit solution/project to build. |
| `RAILS_STOP_RUN_TESTS` | stop-gate | unset | `1` also runs the test suite after a green build. |
| `RAILS_REVIEW_BASE` | review-gate | `origin/main`, then `main` | Base ref the branch is diffed against. |
| `RAILS_REVIEW_SRC_REGEX` | review-gate | `^src/.*\.(cs\|csproj\|…\|ts\|html)$` | Which changed paths count as gated source. |
| `RAILS_REVIEW_KINDS` | review-gate, save-review-receipt | `code-review,simplify` | Which reviews must have receipts. |
| `RAILS_SKIP_REVIEW_GATE` | review-gate | unset | `1` = documented, auditable emergency bypass. |

`CLAUDE_PROJECT_DIR` is set by Claude Code and used to locate the repo root; scripts fall
back to the current directory if it is absent.

## OS dispatch (.ps1 vs .sh)

Each hook ships as a **PowerShell** script and a **faithful bash twin** with identical
logic and contract. `settings.json` registers the `.ps1` form via `pwsh`, which is
cross-platform — PowerShell 7 (`pwsh`) runs on Windows, Linux, and macOS, so a single
registration covers every host *that has `pwsh` installed*.

On a host **without `pwsh`**, point the hook commands at the `.sh` twins instead, e.g.:

```json
{ "type": "command", "command": "bash .claude/hooks/stop-gate.sh", "timeout": 600 }
{ "type": "command", "command": "bash .claude/hooks/review-gate.sh", "timeout": 60 }
```

The bash twins require **`jq`** (payload parsing) and `git`; the .NET gates also need
`dotnet`. Missing required tooling makes a gate **fail open** (allow) rather than wedge.

The Stop-hook command is intentionally written as a single string
(`pwsh -NoProfile -ExecutionPolicy Bypass -File …`) rather than the
`{"command":"pwsh","args":[…]}` array form. The single-string form works on all Claude
Code versions; the array form requires CLI v2.1.139+.

## Maturity

| Piece | Maturity | Notes |
| --- | --- | --- |
| Stop hook event + block contract | **Stable** | Documented, unlikely to churn. |
| PreToolUse deny contract | **Stable** | Documented. |
| `stop-gate` scripts | **Stable** | Logic depends only on git + dotnet. |
| `review-gate` scripts | **Stable machinery, policy-coupled** | Assumes the review workflow is `/code-review` + `/simplify` and that receipts come from `save-review-receipt`. Retune `RAILS_REVIEW_KINDS` for a different workflow. |
| `save-review-receipt` scripts | **Stable** | Binds + timestamps a receipt; it cannot judge review quality — that is on the reviewer. |
| Permission globs | **Template** | The deny/ask/allow *shape* is stable; the specific paths are placeholders to confirm per repo. |

## Coverage boundary (read this)

A Claude Code hook only fires for actions taken **through Claude Code**. A human running
`git push` in their own terminal is **not** gated. The server-side equivalent (a required
CI check / branch protection) is what stops every other path. These hooks stop the *agent*
from skipping the gate; they are not a substitute for CI enforcement.
