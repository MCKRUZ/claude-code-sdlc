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

### Step 1: Pre-Deployment Checklist
Verify all deployment prerequisites:
- All tests passing on the deployment candidate
- Configuration reviewed for target environment
- Database migrations tested on a copy of production data
- Rollback procedure documented and tested
- Stakeholders notified of deployment window

### Step 2: Staging Deployment
Deploy to staging environment first:
- Run the deployment procedure from RUNBOOK.md
- Verify all services start without errors
- Run smoke tests against staging

### Step 3: Smoke Test Execution
Execute the smoke test suite against staging:
- One test per P0 user story (minimum)
- Verify core integrations are live
- Check monitoring and alerting are receiving data
- Document results — pass/fail per test

### Step 4: Production Deployment
Deploy to production following the same procedure:
- Execute pre-production gate checklist
- Deploy
- Run smoke tests against production
- Confirm monitoring dashboards show healthy state

### Step 5: Phase Handoff
Document the deployment state and what monitoring needs to cover.

### Step 6: Generate Phase Report
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
- **Sign-off** — who approved and when

### `smoke-test-results.md` (REQUIRED)
Must contain ALL of:
- **Environment** — staging and production results (separate sections)
- **Test results table** — Test | P0 Story | Environment | Result | Notes
- **Issues found** — any failures, their severity, and resolution
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
- The rollback procedure must be tested before the deployment, not written for the first time during an incident.
- Smoke tests in production should be non-destructive — read operations and harmless writes only.
- The release notes are for people who didn't build the system. Write for that audience.
