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

5. **Suggest next action:** Based on current phase status:
   - If phase is `active`: suggest running `/sdlc` for phase guidance
   - If all gates would pass: suggest running `/sdlc-next` to advance
   - If artifacts are missing: list what's needed

## Output Format

Use the markdown table format from `generate_status.py`. Keep it concise — the dashboard should fit in one screen.
