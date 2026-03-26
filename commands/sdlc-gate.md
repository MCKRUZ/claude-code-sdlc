# /sdlc-gate — Run Exit Criteria Check

Run the 5-gate validation system for the current (or specified) SDLC phase without advancing.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not found, tell the user to run `/sdlc-setup` first.

2. **Read state:** Load `.sdlc/state.yaml` to determine the current phase.

3. **Run gate checks:** Execute the gate checker:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/check_gates.py --state .sdlc/state.yaml
   ```
   Optionally specify a phase: `--phase <N>`

4. **Display results:** Show each gate result with:
   - Gate name (G1-integrity, G2-completeness, G3-metrics, G4-compliance, G5-quality)
   - PASS / FAIL / MANUAL status
   - Severity (MUST / SHOULD / MAY)
   - Details on what passed or failed

5. **Generate phase report:** Always generate the HTML report after running gates, regardless of pass/fail status:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
     --state .sdlc/state.yaml --phase <phase-number>
   ```
   After generating, automatically open the report in the user's default browser:
   ```bash
   start .sdlc/reports/phaseNN-report.html   # Windows
   open .sdlc/reports/phaseNN-report.html    # macOS
   xdg-open .sdlc/reports/phaseNN-report.html # Linux
   ```
   This is the artifact stakeholders review before the manual gate sign-off.

6. **Summarize:** At the bottom:
   - Count of passed / failed / manual checks
   - If any MUST gates failed: **BLOCKED** — list specific blockers with remediation suggestions
   - If only manual checks remain: **REVIEW NEEDED** — list what needs human verification. Remind the user to share the HTML report for stakeholder sign-off.
   - If all pass: **READY** — suggest running `/sdlc-next` to advance

7. **Update state:** Record gate results in `.sdlc/state.yaml` under the current phase's `gate_results` field. Do NOT advance the phase — that's `/sdlc-next`'s job.

## Arguments
- No arguments: check current phase
- `<phase-number>`: check a specific phase (e.g., `/sdlc-gate 2`)

## Important
- This command is **read-only with respect to phase transitions** — it records gate results but never changes `current_phase`.
- Use `/sdlc-next` to actually advance after gates pass.
