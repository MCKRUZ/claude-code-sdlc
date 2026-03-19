# /sdlc-next — Advance to Next Phase

Run exit gate checks for the current phase and advance to the next phase if all gates pass.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not found, tell the user to run `/sdlc-setup` first.

2. **Read state:** Load `.sdlc/state.yaml` to determine the current phase.

3. **Run gate checks:** Execute the gate checker for the current phase:
   ```bash
   uv run --project <plugin-root>/scripts <plugin-root>/scripts/check_gates.py --state .sdlc/state.yaml
   ```

4. **Evaluate results:**

   **If ANY MUST gate fails:**
   - Display the failure report
   - List specific blockers with remediation suggestions
   - Do NOT advance the phase
   - Generate and display the phase HTML report anyway (shows what's missing): `uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py --state .sdlc/state.yaml --phase <phase-number>`
   - Suggest actions: create missing artifacts, fix incomplete content, etc.

   **If all MUST gates pass (SHOULD/MAY may still have warnings):**
   - Display success message
   - Show any SHOULD/MAY warnings
   - Generate the final phase HTML report before advancing:
     ```bash
     uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
       --state .sdlc/state.yaml --phase <phase-number>
     ```
   - Tell the user the report path and confirm it represents the completed phase state
   - **HITL GATE — Ask for explicit sign-off before advancing:** Present the phase summary (what was produced, key decisions made) and ask: "Does this look correct? Shall I advance to Phase N?" Do NOT call `advance_phase.py` until the human explicitly confirms.

5. **Advance phase:** Update `.sdlc/state.yaml`:
   - Set current phase status to `completed` with `completed_at` timestamp
   - Set next phase status to `active` with `entered_at` timestamp
   - Increment `current_phase`
   - Update `phase_name`
   - Append transition to `history` array:
     ```yaml
     - from: <current_phase_id>
       to: <next_phase_id>
       at: "<ISO 8601 timestamp>"
       gate_results: { <summary of pass/fail> }
     ```

6. **Show next phase guidance:** After advancing, display:
   - New phase name and description
   - Primary skills to use
   - Required artifacts to produce
   - Entry criteria (already met by advancing)
   - Reference to phase definition file for full details

7. **HITL Gate — Surface open questions for the new phase:** Read the handoff document that was just produced (e.g., `phase2-handoff.md` when entering Phase 2). Extract any Q-NN or AQ-NN items listed under "Open Questions" or "What X Must Address". Display them prominently:
   > **Open questions to resolve before writing artifacts:**
   > - AQ-01: [question] — needed by: [who]
   > - AQ-02: [question] — needed by: [who]

   Remind the human that the HITL gate in the phase definition requires these to be resolved before artifact writing begins. Do not immediately start writing artifacts.

8. **Edge case — Phase 9:** If already at Phase 9 (Monitoring) and gates pass, mark the project as complete. Congratulate the user and mention the post-SDLC re-entry points for future work.

## Important
- This command modifies state — it advances `current_phase` in state.yaml.
- Gate checks are mandatory — there is no `--force` flag. Use the override protocol documented in `references/validation-rules.md` for exceptional cases.
