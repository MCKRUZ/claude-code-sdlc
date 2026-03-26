# /sdlc-review — Multi-Perspective Artifact Review

Run a structured review of the current phase's artifacts from multiple perspectives.

## Instructions

1. **Read state:** Load `.sdlc/state.yaml` to determine the current phase.

2. **Read artifacts:** Load all artifacts in `.sdlc/artifacts/{NN}-{phase-name}/`.

3. **Determine mode** from arguments:
   - `--council` (default) — 4-viewpoint review (Architecture, Product, Quality, Security)
   - `--adversarial` — Cynical QA perspective, challenge every assumption
   - `--edge-cases` — Exhaustive path analysis, find unhandled conditions
   - `--all` — Run all 3 modes sequentially, produce a combined report

4. **Spawn the `multi-reviewer` agent** via the Agent tool:
   - Provide all artifact paths and the selected mode
   - Include profile context from `.sdlc/profile.yaml` for stack/quality awareness
   - Include frozen layers from `.sdlc/context/layers/` for cross-phase context

5. **Display findings summary:**
   ```
   Review Complete — Phase 2: Design (council mode)
   ================================================
   CRITICAL: 0 | HIGH: 2 | MEDIUM: 4 | LOW: 1

   Top findings:
   1. [HIGH] No rollback strategy defined for database migration (Architecture)
   2. [HIGH] Auth token refresh not specified for offline scenarios (Security)

   Full report: .sdlc/artifacts/02-design/review-report.md
   ```

6. **If CRITICAL or HIGH findings exist:** Recommend addressing them before running `/sdlc-gate`. These are likely to surface as gate failures.

## Arguments

- No arguments: run `--council` mode on current phase
- `--adversarial`: adversarial review mode
- `--edge-cases`: edge case hunting mode
- `--council`: multi-perspective council mode (default)
- `--all`: run all 3 modes, combined report
- `<phase-number>`: review a specific phase (e.g., `/sdlc-review --adversarial 2`)

## When to Use

- **Phase 2 (Design):** `--council` to validate architecture from multiple angles
- **Phase 3 (Planning):** `--edge-cases` to find gaps in section plans
- **Phase 5 (Quality):** `--adversarial` + `--edge-cases` for thorough quality review
- **Any phase:** before running `/sdlc-gate` to catch issues early

## Important

- Reviews are **advisory** — findings don't block gate checks directly
- The review report is written as an artifact that stakeholders can review
- Running `/sdlc-review --all` before `/sdlc-next` is recommended for design-heavy phases
