# Phase 9: Monitoring

## Purpose
Establish production observability so the team knows about problems before users do. Configure dashboards, define alerts, write the incident response playbook, and capture a project retrospective so the next project starts smarter.

## Entry Criteria
- Phase 8 exit gate passed and `phase9-handoff.md` reviewed
- System live in production
- Monitoring infrastructure available (profile-defined)

## Workflow

### Step 1: Monitoring Configuration
Set up dashboards and metrics collection:
- System health metrics (CPU, memory, disk, network)
- Application metrics (request rate, error rate, latency — RED method)
- Business metrics (what matters to stakeholders: active users, transactions, etc.)
- Dependency health (database, external APIs, queues)

### Step 2: Alert Definitions
Define alerts that require human response:
- For each alert: what triggers it, who gets paged, what the SLA is
- Avoid alert fatigue — every alert must be actionable
- Define: warning threshold (investigate) and critical threshold (wake someone up)

### Step 3: Incident Response Playbook
Write the runbook for common failure modes:
- What does each major alert mean?
- Initial diagnosis steps
- Escalation path
- Communication template

### Step 4: Project Retrospective
Capture what worked, what didn't, and what to carry forward:
- Process observations (what phases were most valuable? most painful?)
- Technical observations (what decisions aged well? which created debt?)
- Team observations (what collaboration patterns worked?)
- Actionable improvements for the next project

### Step 5: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase09-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `monitoring-config.md` (REQUIRED)
Must contain ALL of:
- **Dashboard inventory** — what dashboards exist and what they show
- **Metrics catalog** — every metric being collected, its source, and its meaning
- **Coverage assessment** — is every P0 feature observable? What's the gap?
- **Baseline measurements** — what "normal" looks like for each key metric (set within first 48h of production)

### `alert-definitions.md` (REQUIRED)
Must contain ALL of:
- **Alert table** — Alert Name | Condition | Severity | Recipient | SLA | Runbook link
- **Per-alert detail for all CRITICAL alerts**: trigger condition (exact query/threshold), why this threshold, what to do when it fires, how to resolve
- **Alert philosophy** — principles used to decide what to alert on vs. observe passively

### `incident-response.md` (REQUIRED)
Must contain ALL of:
- **Incident classification** — P1/P2/P3 with definitions
- **Response procedures** — per alert type: detect → diagnose → resolve → communicate
- **Escalation matrix** — who to contact at each severity level
- **Communication templates** — what to send users/stakeholders during an incident
- **Post-incident process** — how to write a post-mortem

### `project-retrospective.md` (REQUIRED)
Must contain ALL of:
- **What went well** — with specifics, not platitudes
- **What didn't** — honest assessment, no blame
- **Process improvements** — concrete changes to make to the SDLC for the next project
- **Technical debt log** — known debt incurred, with priority and suggested resolution timing
- **Patterns to reuse** — decisions and approaches worth repeating
- **Patterns to avoid** — decisions that created problems

## Exit Criteria
- [ ] All P0 features have at least one observable metric
- [ ] At least one alert exists for each CRITICAL failure mode
- [ ] Incident response playbook covers top 5 alert types
- [ ] Project retrospective completed with actionable improvements
- [ ] Stakeholder reviewed and approved (manual gate)

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase09-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- A metric no one watches is noise. Every dashboard must have an owner who reviews it.
- Alert fatigue kills observability. If an alert fires more than once a week non-critically, raise the threshold.
- The retrospective is for the team, not management — write honestly or it has no value.
- Technical debt logged now is managed; technical debt unlogged becomes a crisis.
