# Phase 9: Monitoring

## Purpose
Establish production observability so the team knows about problems before users do. Configure dashboards, define alerts, write the incident response playbook, and capture a project retrospective so the next project starts smarter.

## Project Type Adaptation

**Before starting Phase 9, read `project_type` from `state.yaml`.**

| project_type | Monitoring Approach |
|--------------|-------------------|
| `service` / `app` | Full infrastructure monitoring: dashboards (RED metrics), alerting rules, on-call rotation, incident response runbook. |
| `library` / `cli` | Package health monitoring: download counts, open issues, version adoption. Alerts = GitHub issue triage criteria. No dashboards. |
| `skill` | Qualitative monitoring only. No server, no metrics pipeline. Monitoring = GitHub Issues + user feedback. Replace all dashboard / alerting / infrastructure content with: issue triage criteria, user feedback channels, and qualitative quality signals. |

**For `skill` / `library` projects:** The `monitoring-config.md`, `alert-definitions.md`, and `incident-response.md` artifacts should be reframed as: (1) feedback collection channels and issue triage criteria, (2) severity classification with response SLAs, and (3) escalation process. Do not spend time configuring Grafana dashboards or Prometheus rules that will never be used.

**The `project-retrospective.md` applies to all project types without modification.** It is the most important Phase 9 artifact regardless of project type.

## Entry Criteria
- Phase 8 exit gate passed and `phase9-handoff.md` reviewed
- System live in production
- Monitoring infrastructure available (profile-defined)

## Workflow

### Step 0: HITL Gate — Monitoring Scope

> **HITL GATE:** Before configuring any monitoring, read `phase9-handoff.md` and present the following to the human: (1) Top 3 things that could go wrong in production — what are the highest-risk failure modes? (2) Who gets paged, and at what threshold? (3) What existing monitoring infrastructure exists — are we adding to Grafana/Datadog/CloudWatch or starting from scratch? (4) For `skill`/`library` projects: confirm we are using the lightweight monitoring path (issue triage + feedback channels, not dashboards). Get explicit monitoring scope approval before proceeding to Step 1.

### Step 1: Monitoring Configuration

Spawn `performance-benchmarker` to establish the production baseline:

```
Agent(performance-benchmarker, "Establish production performance baseline. Measure response times, throughput, error rates, and resource usage against NFR targets from non-functional-requirements.md. Output baseline measurements for monitoring-config.md — these become the 'normal' values that alert thresholds are set against.")
```

Once the baseline is established, spawn `doc-updater` to write the monitoring configuration document:

```
Agent(doc-updater, "Write monitoring-config.md using the baseline measurements from performance-benchmarker. Include: dashboard inventory, metrics catalog, coverage assessment for P0 features, and baseline measurements. For skill/library projects, reframe as feedback channels and issue triage criteria.")
```

Set up dashboards and metrics collection:
- System health metrics (CPU, memory, disk, network)
- Application metrics (request rate, error rate, latency — RED method)
- Business metrics (what matters to stakeholders: active users, transactions, etc.)
- Dependency health (database, external APIs, queues)

**For `skill` / `library` projects:** Skip infrastructure metrics. Configure: GitHub issue monitoring, download/install tracking, user feedback channels.

### Step 2: Alert Definitions
Define alerts that require human response:
- For each alert: what triggers it, who gets paged, what the SLA is
- Avoid alert fatigue — every alert must be actionable
- Define: warning threshold (investigate) and critical threshold (wake someone up)
- Set thresholds relative to the baseline from Step 1 — not arbitrary round numbers

### Step 3: Incident Response Playbook
Write the runbook for common failure modes:
- What does each major alert mean?
- Initial diagnosis steps
- Escalation path
- Communication template

Cross-reference with the RUNBOOK.md failure scenarios from Phase 7. The incident response playbook should cover the same failure modes with a focus on detection and communication rather than resolution steps.

### Step 4: Project Retrospective

Spawn `feedback-synthesizer` in background to analyze any user feedback collected during deployment:

```
Agent(feedback-synthesizer, "Analyze any user feedback collected during and after deployment — GitHub issues, support requests, Slack messages, survey results. Identify patterns: what confused users, what delighted them, what broke. Output a feedback summary for the retrospective.", run_in_background=true)
```

Capture what worked, what didn't, and what to carry forward. The retrospective must address **both** the product and the process:

**Product retrospective:**
- Technical observations — what decisions aged well? Which created debt?
- Team observations — what collaboration patterns worked?

**SDLC process retrospective (required):**
- Which phases were most valuable for this project? Which felt like overhead?
- Which HITL gates caught real issues vs. which were rubber-stamped?
- Which artifacts were referenced later in the lifecycle? Which were written and never read?
- What would you skip next time? What would you add?
- Were the profile thresholds (coverage, file size, etc.) appropriate or should they be adjusted?

**Actionable improvements:**
- Concrete changes for the next project — not "communicate better" but "add a daily async standup in the Phase 4 handoff"
- Patterns to reuse and patterns to avoid

Incorporate findings from `feedback-synthesizer` when available.

### Step 5: Generate Visual Report

Generate an interactive HTML visual report at `.sdlc/reports/phase09-visual.html` using the `/visual-explainer` skill (or equivalent HTML generation). This report is the stakeholder review artifact.

**Required visualizations for Phase 9 (Monitoring):**
- Monitoring configuration status (health checks, alerts)
- Baseline metrics dashboard
- Alert routing overview
- Post-launch checklist

See the Visual Report Protocol in `SKILL.md` for rendering standards and fallback behavior.

### Step 6: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase09-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `monitoring-config.md` (REQUIRED)
Must contain ALL of:
- **Dashboard inventory** — what dashboards exist and what they show
- **Metrics catalog** — every metric being collected, its source, and its meaning
- **Coverage assessment** — is every P0 feature observable? What's the gap?
- **Baseline measurements** — what "normal" looks like for each key metric (from `performance-benchmarker` output, set within first 48h of production)

### `alert-definitions.md` (REQUIRED)
Must contain ALL of:
- **Alert table** — Alert Name | Condition | Severity | Recipient | SLA | Runbook link
- **Per-alert detail for all CRITICAL alerts**: trigger condition (exact query/threshold), why this threshold, what to do when it fires, how to resolve
- **Alert philosophy** — principles used to decide what to alert on vs. observe passively
- **Baseline reference** — how thresholds were derived from the production baseline

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
- **SDLC phase-by-phase review** — which phases added value, which gates caught issues, which artifacts were referenced later
- **Technical debt log** — known debt incurred, with priority and suggested resolution timing
- **Patterns to reuse** — decisions and approaches worth repeating
- **Patterns to avoid** — decisions that created problems
- **User feedback summary** — patterns from feedback-synthesizer analysis (if available)

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
- Alert fatigue kills observability. If an alert fires more than once a week non-critically, raise the threshold or eliminate it. The team that ignores alerts is the team that misses the real incident.
- Set alert thresholds from measured baselines, not intuition. "500ms feels like a good threshold" is not engineering — measure the p95 under normal load and alert at 2x.
- The retrospective is for the team, not management — write honestly or it has no value. "Everything went great" is never true and never useful.
- Technical debt logged now is managed; technical debt unlogged becomes a crisis.
