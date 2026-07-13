# /sdlc-status — SDLC Progress Dashboard

Display the current SDLC progress for this project.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not found, tell the user to run `/sdlc-setup` first.

2. **Read state:** Load `.sdlc/state.yaml` to get current phase, phase statuses, and history.

3. **Generate dashboard:** Run the status generator:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_status.py --state .sdlc/state.yaml
   ```

4. **Display:** Show the generated dashboard to the user. Include:
   - Current phase name and number
   - Progress bar (completed phases / total)
   - Phase table with status, artifact count, timestamps
   - Recent transition history (if any)

5. **Channel rollup + decision-log:** Two additive reads that surface the multi-discipline layer
   without touching `generate_status.py`:

   - **By-channel spec backlog** — derive the per-channel rollup from spec frontmatter:
     ```bash
     uv run --project <plugin-root>/scripts <plugin-root>/scripts/track_specs.py --state .sdlc/state.yaml --json
     ```
     Render the `by_channel` block (spec counts per delivery surface; `channel-agnostic` and
     `unassigned` are first-class buckets). If the JSON has no `by_channel` key or every spec is
     `unassigned`, skip this — no project has bound a `channel:` yet.

   - **Open + overdue decisions** — surface the phase-spanning decision-log:
     ```bash
     uv run --project <plugin-root>/scripts <plugin-root>/scripts/track_decisions.py --state .sdlc/state.yaml --json
     ```
     List **open** decisions and flag those **overdue** past the 2-business-day clock (owner + due
     shown). If `track_decisions.py` or `.sdlc/decision-log.md` is absent, read `.sdlc/decision-log.md`
     directly for open items, or skip silently if neither exists. Advisory only (exit 0) — never blocks.

6. **Suggest next action:** Based on current phase status:
   - If phase is `active`: suggest running `/sdlc` for phase guidance
   - If all gates would pass: suggest running `/sdlc-next` to advance
   - If artifacts are missing: list what's needed

## Output Format

Use the markdown table format from `generate_status.py`. Keep it concise — the dashboard should fit in one screen.
