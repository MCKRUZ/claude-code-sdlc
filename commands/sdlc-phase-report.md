# /sdlc-phase-report — Generate Phase HTML Report

Render all artifacts for the current (or specified) phase into a self-contained HTML report for stakeholder review.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not found, tell the user to run `/sdlc-setup` first.

2. **Determine target phase:**
   - No argument → use `current_phase` from state file
   - Numeric argument (e.g., `/sdlc-phase-report 2`) → use that phase number
   - Validate phase number is 0–9

3. **Run report generator:**

   For a single phase:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml \
     --phase <phase-number> \
     --output .sdlc/reports/phase<NN>-report.html
   ```

   For all phases (produces individual reports **and** `index.html`):
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml \
     --all
   ```

   Where `<plugin-root>` is the directory containing this plugin's files.

4. **Handle output:**
   - On success: automatically open the report in the user's default browser:
     ```bash
     start .sdlc/reports/phaseNN-report.html   # Windows
     open .sdlc/reports/phaseNN-report.html    # macOS
     xdg-open .sdlc/reports/phaseNN-report.html # Linux
     ```
   - On failure: display the error from the script and suggest checking that artifact files exist

5. **Show artifact inventory:** After generating, list what was included:
   - Which required artifacts were found and rendered
   - Which required artifacts were missing (shown as placeholder sections in the report)
   - Exit gate status (pass/fail/incomplete)

## Arguments

- No argument: generate report for current phase
- `<phase-number>`: generate report for a specific phase (0–9)
- `--all`: generate reports for all phases (0–9) and output an index HTML

## Output Location

Reports are written to `.sdlc/reports/` in the target project directory:
- `phaseNN-report.html` for individual phase reports
- `index.html` for the full project report (with `--all`)

## Notes

- Reports are self-contained single-file HTML (CSS and JS inlined)
- Stakeholders can open them directly in a browser — no server required
- Missing artifacts appear as labeled placeholder sections (not errors)
- The report includes exit gate status to show phase readiness
