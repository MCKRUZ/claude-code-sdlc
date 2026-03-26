# Phase 8: Deployment

## Purpose
Deploy the system to production safely, with documented rollback capability, verified smoke tests, and a release artifact that stakeholders can distribute. No surprises — every step is planned and verified.

## Project Type Adaptation

**Before starting Phase 8, read `project_type` from `state.yaml`.**

| project_type | Deployment Model | Staging | Rollback |
|--------------|-----------------|---------|---------|
| `service` / `app` | Container / cloud deploy. Run full staging environment. Execute smoke tests against live endpoints. | Required — must be a running environment, not a local copy | Redeploy previous image/version; reverse DB migrations |
| `library` / `cli` | Package registry publish (npm, PyPI, NuGet). Staging = local install test in a fresh environment. | Install the package in an isolated environment and run the public API smoke tests | Yank the package version from the registry; pin consumers to previous version |
| `skill` | File distribution (copy to `.claude/commands/`). No server, no process. Staging = fresh install on a clean project. | Install the skill files in a new project; run the minimum smoke test set | Delete the skill files; re-copy the previous version |

**For `skill` / `library` projects:** Skip steps that reference staging servers, database migrations, health checks, and monitoring dashboards — they do not apply. Focus on: (1) install verification, (2) smoke test execution, (3) rollback documentation (file deletion / version revert), and (4) release artifact creation (GitHub release / package publish).

## Entry Criteria
- Phase 7 exit gate passed and `phase8-handoff.md` reviewed
- Deployment environment provisioned
- Secrets and configuration ready

## Workflow

### Step 0: HITL Gate — Deployment Go/No-Go

> **HITL GATE (most critical gate in the lifecycle):** Before any deployment activity, read `phase8-handoff.md` and present the following to the human: (1) Deployment target and strategy — blue/green, rolling, canary, or direct replacement? (2) Rollback plan — what is the trigger condition, what is the exact procedure? (3) Who must be notified before, during, and after deployment? (4) Is this staging-only or staging + production? (5) Deployment window — when does it start, how long is the maintenance window? **Do NOT proceed to Step 1 without explicit human go/no-go.** A deployment without human approval is not a deployment — it is an incident.

### Step 1: Pre-Deployment Checklist
Verify all deployment prerequisites:
- All tests passing on the deployment candidate
- Configuration reviewed for target environment
- Database migrations tested on a copy of production data
- Rollback procedure documented and tested
- Stakeholders notified of deployment window

**Rollback verification:** Before deploying forward, verify the rollback procedure works. Deploy, then roll back, then redeploy. If you can't roll back in staging, you can't roll back in production.

### Step 2: Staging Deployment

Spawn `devops-automator` to execute the staging deployment:

```
Agent(devops-automator, "Configure and execute staging deployment using the procedure in RUNBOOK.md. Verify all services start without errors. Check health endpoints. Report any failures with full error context.")
```

**On build failure during deployment:** Spawn `build-error-resolver` immediately. Do not attempt manual fixes.

```
# Only if deployment build fails:
Agent(build-error-resolver, "Deployment build failed. Analyze the build output, identify root cause, and fix. Verify the fix compiles and passes tests before re-attempting deployment.")
```

### Step 3: Smoke Test Execution

Spawn `e2e-runner` to execute smoke tests against staging:

```
Agent(e2e-runner, "Execute smoke test suite against the staging environment. One test per P0 user story minimum. Capture screenshots as evidence. Report pass/fail per test with timestamps. All smoke tests must be non-destructive — read operations and harmless writes only.")
```

Verify:
- One test per P0 user story (minimum)
- Core integrations are live
- Monitoring and alerting are receiving data
- Document results — pass/fail per test

### Step 4: Production Deployment
Deploy to production following the same procedure:
- Execute pre-production gate checklist
- Deploy using the same `devops-automator` procedure validated in staging
- Run smoke tests against production (re-spawn `e2e-runner` with production target)
- Confirm monitoring dashboards show healthy state

**For `skill` / `library` projects:** Production deployment = package publish or file distribution. Verify install works in a clean environment.

### Step 5: Phase Handoff
Document the deployment state and what monitoring needs to cover.

### Step 6: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase08-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 8 (Deployment):**
- Deployment readiness checklist (items → pass/fail)
- Environment configuration status
- Release notes summary
- Rollback plan overview

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 7: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase08-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `release-notes.md` (REQUIRED)
Must contain ALL of:
- **Version** — semantic version and release date
- **Summary** — what this release delivers (2–3 sentences for stakeholders)
- **New features** — user-facing capabilities added
- **Bug fixes** — issues resolved
- **Breaking changes** — anything that requires consumer action
- **Known limitations** — things that don't work yet or have caveats
- **Upgrade path** — if applicable, how to upgrade from previous version

### `deployment-checklist.md` (REQUIRED)
Must contain ALL of:
- **Pre-deployment** — environment checks, configuration verification, notification steps
- **Deployment steps** — ordered, each with: action, expected outcome, how to verify
- **Post-deployment verification** — smoke tests, health checks, monitoring confirmation
- **Rollback procedure** — exact steps to revert, with decision criteria ("roll back if X")
- **Rollback verification** — evidence that rollback was tested in staging before production
- **Sign-off** — who approved and when

### `smoke-test-results.md` (REQUIRED)
Must contain ALL of:
- **Environment** — staging and production results (separate sections)
- **Test results table** — Test | P0 Story | Environment | Result | Notes
- **Issues found** — any failures, their severity, and resolution
- **Screenshot evidence** — references to captured screenshots per test
- **Deployment decision** — go/no-go with rationale

### `phase9-handoff.md` (REQUIRED)
Must contain ALL of:
- **Deployment summary** — what was deployed, when, where
- **Current system state** — what's running and how to verify it
- **Monitoring requirements** — what alerts and dashboards need to be set up
- **Known issues in production** — anything to watch post-deployment
- **Escalation contacts** — who to call if something goes wrong

## Exit Criteria
- [ ] Staging deployment successful
- [ ] All staging smoke tests passing
- [ ] Production deployment successful
- [ ] All production smoke tests passing
- [ ] Rollback procedure documented and tested
- [ ] Stakeholder sign-off received (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase08-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- Staging is not optional. "We'll test in production" is not a deployment strategy.
- The rollback procedure must be tested before the deployment, not written for the first time during an incident. Deploy → rollback → redeploy in staging before touching production.
- Smoke tests in production should be non-destructive — read operations and harmless writes only. If your smoke test can corrupt data, it's not a smoke test.
- The release notes are for people who didn't build the system. Write for that audience.
- The HITL Gate on this phase is the most critical in the entire lifecycle. A bad commit can be reverted. A bad deployment can take down production.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no deployment artifacts)
- "What's your deployment strategy — blue/green, canary, rolling?"
- "Do you have a rollback plan if something goes wrong?"
- "What environments need to be set up or updated?"

### Progress Check (some artifacts ready)
- "Release notes drafted. Does the changelog capture all user-facing changes?"
- "Rollback plan covers [scenarios]. Are there others to consider?"

### Ready Check (all artifacts ready)
- "Deployment artifacts are ready. Have all stakeholders signed off?"
- "Is there a smoke test plan for post-deployment verification?"
