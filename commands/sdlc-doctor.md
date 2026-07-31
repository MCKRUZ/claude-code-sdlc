# /sdlc-doctor — Day-1 Environment Check

Verify that the installed harness will actually run in this repo, and tell the developer exactly what to do about anything that won't.

The harness fails quietly. A hook registered with a missing interpreter, a rails script installed without its executable bit, a secret the gates read that nobody set — each leaves a repo that looks configured and has no working checking ladder. This command finds the failures that are invisible when they happen.

Run it after `/sdlc-setup`, when onboarding a second developer, and any time a gate behaves in a way nobody can explain.

## Instructions

1. **Run the check** from the repo root:
   ```bash
   uv run --project ${CLAUDE_PLUGIN_ROOT}/scripts ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.py
   ```
   Add `--offline` to skip the checks that need `gh` (repo secrets and branch protection). Add `--repo <path>` to check a repo other than the current directory.

2. **Report the results verbatim.** Each line is already `PASS` / `FAIL` / `WARN` with the fix attached. Do not summarise away the fix lines — they are the actionable part.

3. **Explain what each failure means, in plain terms**, before offering to act. What matters is the consequence, not the check name:
   - *missing `pwsh`* — the hooks are registered but can never run, so an agent can finish a turn on a red build and nothing objects
   - *script not executable* — the gate shells out and gets `Permission denied`; because the gates fail closed, this reads as a blocked merge with a confusing reason
   - *missing secret* — the named workflows fail closed on every PR
   - *no active ruleset* — the gates run and report, but a red PR can still merge

4. **Offer to fix what is safely fixable.** `chmod +x` on the installed scripts is safe and mechanical — offer it. Setting a repository secret is not: it needs a real credential value from the human, so tell them the exact `gh secret set` command and let them run it. Never invent a secret value.

5. **Treat `WARN` as information, not a problem.** A warning marks something that could not be determined (Windows cannot see POSIX permission bits; `gh` may not be authenticated) or setup a later phase is meant to finish (an unfilled `<<TOKEN>>` carries the phase that fills it). Do not push the user to "clear" warnings.

6. **If the harness is not installed at all**, stop and point at `/sdlc-setup`. The rest of the report is meaningless without it.

## Arguments

- `--offline` — skip the checks that need `gh` (secrets, branch protection)
- `--repo <path>` — check a different repo (default: current directory)

## Exit codes

`0` — no failures (warnings may be present). `1` — at least one failure; the harness is not fully working.

## Notes

Required secrets are read from **this repo's installed workflows**, not from a fixed list. A repo that has adapted `ANTHROPIC_API_KEY` to `CLAUDE_CODE_OAUTH_TOKEN`, or deleted the eval workflows, is checked against what it actually runs — the doctor must never tell someone to "fix" a working setup.

See `ONBOARDING.md` in the repo root for the day-1 checklist this command automates.
