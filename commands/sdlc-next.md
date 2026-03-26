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
   - Generate the phase HTML report anyway (shows what's missing): `uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py --state .sdlc/state.yaml --phase <phase-number>`
   - Automatically open the report in the user's default browser (`start` on Windows, `open` on macOS, `xdg-open` on Linux)
   - Suggest actions: create missing artifacts, fix incomplete content, etc.

   **If all MUST gates pass (SHOULD/MAY may still have warnings):**
   - Display success message
   - Show any SHOULD/MAY warnings
   - Generate the final phase HTML report before advancing:
     ```bash
     uv run --project <plugin-root>/scripts <plugin-root>/scripts/generate_phase_report.py \
       --state .sdlc/state.yaml --phase <phase-number>
     ```
   - Automatically open the report in the user's default browser (`start` on Windows, `open` on macOS, `xdg-open` on Linux)
   - **HITL GATE — Ask for explicit sign-off before advancing:** Present the phase summary (what was produced, key decisions made) and ask: "Does this look correct? Shall I advance to Phase N?" Do NOT call `advance_phase.py` until the human explicitly confirms.

5. **Generate Frozen Layer:** After HITL sign-off, before advancing state:
   1. Read ALL artifacts in `.sdlc/artifacts/{NN}-{phase-name}/`
   2. Read the frozen layer template from `<plugin-root>/templates/frozen-layer.md`
   3. Condense all artifact content into the template structure, targeting 1500–2000 tokens:
      - Extract locked metrics (budget, timeline, scope, stakeholders) with explicit values
      - Summarize constraints, risks, and key outcomes
      - Fill the traceability footer mapping each source artifact to sections extracted
      - Fill YAML frontmatter with phase metadata and estimated token count (word_count × 1.3)
   4. If a frozen layer already exists for this phase (from a prior completion), rename it to `{name}.superseded` before writing the new one
   5. Write the frozen layer to `.sdlc/context/layers/phase{N}-{name}.md`
   6. Validate:
      ```bash
      uv run --project <plugin-root>/scripts <plugin-root>/scripts/validate_frozen_layer.py \
        --state .sdlc/state.yaml --phase <phase-number>
      ```
   7. If validation fails, fix issues and re-validate before proceeding
   8. See `references/frozen-layers.md` for format details and condensation strategy

6. **Advance phase:** Update `.sdlc/state.yaml`:
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

7. **BLOCKING HITL GATE — Surface and resolve open questions before ANY new-phase work:**

   This gate is **MANDATORY** and **BLOCKING**. You MUST complete it before proceeding to step 8 or writing any artifacts for the new phase. There are NO exceptions.

   **Procedure:**
   1. Read the handoff document that was just produced (e.g., `phase2-handoff.md` when entering Phase 2).
   2. Extract ALL Q-NN or AQ-NN items listed under "Open Questions", "What X Must Address", or any similar heading.
   3. Display them in a prominent, impossible-to-miss block:

      > ---
      > **BLOCKING: OPEN QUESTIONS MUST BE RESOLVED BEFORE PHASE N BEGINS**
      >
      > The following questions were raised during the previous phase. You MUST answer or confirm defaults for every item below. No artifacts will be written until all are resolved.
      >
      > | ID | Question | Needed by | Proposed default |
      > |----|----------|-----------|------------------|
      > | AQ-01 | [question text] | [who/what needs it] | [your proposed default based on project context] |
      > | AQ-02 | [question text] | [who/what needs it] | [your proposed default based on project context] |
      >
      > For each question: confirm the proposed default, adjust it, or provide your own answer.
      > ---

   4. For each open question, you MUST propose a reasonable default answer based on everything you know about the project (state.yaml, previous handoffs, artifacts, profile). NEVER leave a question without a proposed default.
   5. **WAIT for the user to respond.** Do NOT continue to step 8. Do NOT begin writing any artifacts. Do NOT summarize next steps as if work can begin.
   6. If the user confirms or provides answers, record the resolutions in the handoff document under a "Resolved Questions" section with timestamps.
   7. Only after EVERY open question has a confirmed resolution may you proceed to step 8.

   **If there are no open questions** in the handoff document, explicitly state: "No open questions found in the handoff. Proceeding to phase guidance." Then continue to step 8.

   **NEVER skip this gate.** NEVER start Phase N artifacts while open questions remain unresolved. Violating this gate undermines the entire HITL workflow.

8. **Show next phase guidance:** After advancing AND after the HITL gate in step 7 is fully resolved, display:
   - New phase name and description
   - Primary skills to use
   - Required artifacts to produce
   - Entry criteria (already met by advancing)
   - Reference to phase definition file for full details

   **Reminder: Do NOT begin writing any of these artifacts until the HITL gate (step 7) is fully resolved.** If you skipped step 7 or the user has not confirmed answers to all open questions, STOP and go back to step 7 now.

9. **Edge case — Phase 9:** If already at Phase 9 (Monitoring) and gates pass, mark the project as complete. Congratulate the user and mention the post-SDLC re-entry points for future work.

## Important
- This command modifies state — it advances `current_phase` in state.yaml.
- Gate checks are mandatory — there is no `--force` flag. Use the override protocol documented in `references/validation-rules.md` for exceptional cases.
- The HITL gate in step 7 is **non-negotiable**. Open questions MUST be surfaced with proposed defaults and resolved with user confirmation before any new-phase artifact work begins.
