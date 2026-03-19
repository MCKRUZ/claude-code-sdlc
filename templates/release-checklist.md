# Release Checklist

## Project
- **Name:** [Project Name]
- **Version:** [Version]
- **Date:** [Date]
- **Phase:** 8 — Deployment

## Pre-Release

### Code Quality
- [ ] All SDLC phases 0–7 completed
- [ ] No CRITICAL or HIGH issues in quality review
- [ ] Code coverage meets thresholds
- [ ] All E2E tests passing
- [ ] Security review completed

### Documentation
- [ ] README updated
- [ ] API documentation current
- [ ] CHANGELOG updated
- [ ] Migration guide written (if breaking changes)

### Compliance
- [ ] All compliance gate checks passed
- [ ] Audit trail complete in state.yaml
- [ ] Change approval obtained (per profile)

## Release Build
- [ ] Release branch created
- [ ] Version number updated
- [ ] Build succeeds with no warnings
- [ ] Release artifacts generated

## Staging Deployment
- [ ] Deployed to staging environment
- [ ] Smoke tests passing
- [ ] Performance acceptable
- [ ] No error spikes in monitoring

## Production Deployment
- [ ] Deployment approval obtained
- [ ] Deployed to production
- [ ] Production smoke tests passing
- [ ] Monitoring confirms healthy state
- [ ] Rollback plan documented and verified

## Post-Release
- [ ] Release notes published
- [ ] Stakeholders notified
- [ ] Release tagged in git
- [ ] SDLC state advanced to Phase 9 (Monitoring)

## Rollback Plan
**Trigger:** [Conditions that trigger rollback]
**Steps:**
1. [Rollback step 1]
2. [Rollback step 2]
3. [Verify rollback successful]
**Contact:** [Who to notify if rollback needed]
