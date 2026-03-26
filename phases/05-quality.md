# Phase 5: Quality

## Purpose
Systematically review the implementation for correctness, security, and maintainability. Every CRITICAL and HIGH finding must be resolved before testing begins. Phase 5 is a gate, not a formality.

## Project Type Adaptation

**Before starting Phase 5, read `project_type` from `state.yaml`.**

| project_type | Quality Focus |
|--------------|--------------|
| `service` / `app` | Full OWASP scan, coverage instrumentation, file/function size metrics. All security categories apply. |
| `library` / `cli` | Focus on public API surface, backwards compatibility, and dependency audit. Skip infrastructure security checks (CSRF, server config, etc.). |
| `skill` | No compiled code to instrument for coverage. Quality = instruction clarity, edge case handling, prompt injection resistance. Replace code coverage metrics with requirement coverage review. Security review focuses on prompt safety (injection, jailbreak, data leakage), not OWASP infrastructure categories. |

## Entry Criteria
- Phase 4 exit gate passed and `phase5-handoff.md` reviewed
- All unit tests passing, no compilation errors

## Workflow

### Step 0: HITL Gate — Scope the Review

> **HITL GATE:** Before launching reviewers, read `phase5-handoff.md`. Present the following to the human: (1) Which areas of the implementation got the most deviation from the original plan? These deserve deeper review. (2) Are there any known risk areas from implementation — complex logic, concurrency, external integrations? (3) Are there compliance-specific checks needed beyond the standard code and security review? (4) For `skill` projects: confirm that the review will focus on instruction quality and prompt safety rather than traditional code metrics. Get human confirmation of the review scope before spawning agents.

### Step 1: Parallel Review Launch

Spawn `code-reviewer` and `security-reviewer` in a **single message** with two Agent tool calls. They operate independently on different concerns. Never run them sequentially.

```
# Single message — both agents spawn simultaneously:
Agent(code-reviewer, "Review implementation for correctness, maintainability, and profile conventions. Use phase5-handoff.md for focus areas. Produce code-review-report.md with findings by severity (CRITICAL/HIGH/MEDIUM/LOW).")
Agent(security-reviewer, "Review implementation against OWASP Top 10 and profile security requirements. Check input validation, auth, secrets, injection, XSS, CSRF, error messages. Produce security-review-report.md with findings by severity.")
```

Simultaneously, spawn `refactor-cleaner` in the background:
```
Agent(refactor-cleaner, "Scan for dead code, unused imports, and unused dependencies. Report findings without making changes.", run_in_background=true)
```

If the Phase 4 gate check failed unexpectedly, first spawn `Explore` to investigate root cause before proceeding with reviews.

### Step 2: Review Triage

**Code review severity:**
- **CRITICAL** — logic error, data loss risk, incorrect behavior: MUST fix before Phase 6
- **HIGH** — significant maintainability issue, missing test coverage for core path: MUST fix
- **MEDIUM** — code style, minor refactor opportunity: SHOULD fix
- **LOW** — preference, cosmetic: MAY fix

**Security review** — check against OWASP Top 10 and profile requirements:
- Input validation at all system boundaries
- Authentication and authorization
- Secrets handling (no hardcoded values)
- SQL/injection vulnerabilities
- XSS, CSRF
- Error messages (no sensitive data leakage)

All HIGH and CRITICAL security findings: MUST fix before advancing.

**If `security-reviewer` finds CRITICAL or HIGH issues: STOP.** Do not proceed with any other work. Fix security issues first, then re-run `security-reviewer` to verify resolution.

### Step 3: Quality Metrics
Measure against profile thresholds:
- File size (lines): must be within `max_file_lines`
- Function size (lines): must be within `max_function_lines`
- Test coverage: must meet `coverage_minimum`

### Step 4: Remediation
Fix all CRITICAL and HIGH findings. Re-verify after fixes. Document what was changed.

For remediation, use domain-specific agents:
- Backend fixes → `backend-architect`
- Frontend fixes → `frontend-developer`
- Security fixes → fix inline, then re-run `security-reviewer` to confirm resolution

If build breaks during remediation, spawn `build-error-resolver` immediately.

### Step 5: Phase Handoff
Summarize findings, fixes applied, and anything testing should specifically validate.

Incorporate `refactor-cleaner` findings into the handoff — note which cleanup items were addressed and which are deferred.

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase05-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 5 (Quality):**
- Code review findings by severity (bar chart or table)
- Security review findings (critical/high/medium/low)
- Quality metrics vs profile thresholds
- Remediation status tracker

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase05-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `code-review-report.md` (REQUIRED)
Must contain ALL of:
- **Executive summary** — total findings by severity
- **Findings table** — ID | File | Line | Severity | Description | Status (open/fixed)
- **All CRITICAL and HIGH findings** — expanded with: what the issue is, why it matters, how it was resolved
- **Test quality observations** — coverage gaps, missing edge cases, test design issues
- **Positive observations** — what was done well (important for calibration)

### `security-review-report.md` (REQUIRED)
Must contain ALL of:
- **OWASP category coverage** — table showing which categories were checked
- **Findings table** — ID | Category | Severity | Description | Location | Status
- **All HIGH findings** — expanded with CVSS-style impact description and remediation
- **Verification notes** — how each finding was validated and confirmed fixed

### `quality-metrics.md` (REQUIRED)
Must contain ALL of:
- **Profile thresholds** — what the profile requires
- **Actual measurements** — file sizes, function sizes, coverage per module
- **Violations** — any files/functions outside thresholds with remediation notes
- **Coverage breakdown** — by module, with critical paths highlighted

### `phase6-handoff.md` (REQUIRED)
Must contain ALL of:
- **Quality summary** — what was found, what was fixed, what remains
- **Testing focus areas** — where test scenarios should concentrate based on review findings
- **Deferred items** — MEDIUM/LOW findings not fixed, with rationale
- **Known risks entering testing** — what reviewers were uncertain about
- **Refactor-cleaner findings** — dead code and cleanup items: addressed vs deferred

## Exit Criteria
- [ ] No CRITICAL findings open in code review report
- [ ] No HIGH findings open in security review report
- [ ] All files within `max_file_lines` profile threshold
- [ ] All functions within `max_function_lines` profile threshold
- [ ] Stakeholder reviewed and approved (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase05-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- CRITICAL findings are blockers — no exceptions without documented stakeholder override.
- Security review is not optional for any profile. "We'll do security later" means never.
- The quality report is evidence for the team, not a checkbox for the process.
- Positive observations matter — the review is calibration, not just criticism.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no reviews started)
- "What areas are you most concerned about? Where did you cut corners?"
- "Any known technical debt we should surface in the review?"
- "Are there security-sensitive areas that need extra attention?"

### Progress Check (some reviews complete)
- "Code review found [N] issues. Want to tackle the critical ones first?"
- "Security review flagged [X]. This needs to be resolved before we proceed."

### Ready Check (all reviews complete)
- "All review findings addressed. Coverage is at [X]%. Ready for testing?"
- "Any findings you disagree with? We can document the rationale."
