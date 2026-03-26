# /sdlc — Phase Guidance

Show guidance for the current SDLC phase including what to do, which skills to use, and what artifacts to produce.

## Instructions

1. **Locate state file:** Look for `.sdlc/state.yaml` in the current project directory. If not found, tell the user to run `/sdlc-setup` first and exit.

2. **Read state:** Load `.sdlc/state.yaml` to get `current_phase`.

3. **Load phase definition:** Read the phase definition file from `phases/XX-phasename.md` (where XX is the zero-padded phase number).

4. **Load profile:** Read `.sdlc/profile.yaml` to get stack and quality configuration.

5. **Display phase context:** Present to the user:

   ### Header
   ```
   Phase {N}: {Name}
   Profile: {profile_id}
   ```

   ### Purpose
   One-line description of this phase's goal.

   ### Resolved Questions from Previous Phase
   Check the previous phase's handoff document (e.g., `phase1-handoff.md` when in Phase 1) for a "Resolved Questions" section. If it exists, list the resolved questions as context — these are confirmed inputs that MUST inform the current phase's artifacts. If no resolved questions section exists, note that and move on.

   ### What to Do Next
   Based on the phase workflow steps, current artifact state, and resolved questions:
   - List the next actionable step
   - Reference the specific skill/command to use
   - Note which resolved questions feed into which artifacts
   - Example: "Write `requirements.md` using resolved questions RQ-1 through RQ-3 as inputs"

   ### Required Artifacts
   List artifacts needed to pass exit gates, with status:
   - [x] artifact.md (exists, 1.2KB)
   - [ ] other-artifact.md (missing)

   ### Skills to Use
   List primary and secondary skills for this phase with brief description.

   ### Exit Criteria
   Summarize what must be true to advance (from phase definition's exit criteria).

   ### Quick Commands
   ```
   /sdlc-gate    — Check if exit criteria are met
   /sdlc-next    — Advance to next phase (runs gate check)
   /sdlc-status  — View full progress dashboard
   ```

6. **Compliance callout:** If the profile has compliance frameworks, note any compliance-specific requirements for this phase.

7. **Be concise.** The phase definition file has full details — this command shows the actionable summary, not the full document.

## Arguments
- No arguments: show guidance for current phase
- `<phase-number>`: show guidance for a specific phase (e.g., `/sdlc 3`)
