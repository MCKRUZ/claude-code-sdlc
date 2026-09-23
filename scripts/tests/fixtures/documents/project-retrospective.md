# Project Retrospective
<!-- Phase 9 — Monitoring | Required artifact -->

> The retrospective is for the team, not management.

**Project:** Acme Claims Portal
**Date:** 2026-09-23
**Participants:** Priya N., Sam K.
**Facilitator:** Priya N.
**Duration of project:** 2026-06-01 - 2026-09-20

---

## What Went Well
<!-- REQUIRED: what-went-well — at least one specific observation each under Process, Technical, and Team/Collaboration with impact noted — no platitudes -->

### Process

- **Daily flow check:** kept the WIP cap enforced; queue never grew past 2 specs.

### Technical

- **Span-based document writes:** made byte-for-byte fidelity trivial to prove.

### Team / Collaboration

- **Shared Slack channel per spec:** meant no blocked PRs sat for more than 4 hours.

---

## What Didn't Work
<!-- REQUIRED: what-didnt-work — at least one specific observation each under Process, Technical, and Team/Collaboration; frame as system critique, not blame -->

### Process

- **Late risk-tier confirmation:** two specs started before the Pod Lead confirmed the tier, causing rework.

### Technical

- **CRLF line endings:** cost real debugging time before the round-trip tests caught it.

### Team / Collaboration

- **Time zone overlap:** only 2 hours of daily overlap slowed review turnaround.

---

## Process Improvements
<!-- REQUIRED: process-improvements-table — at least one concrete, actionable improvement with current state, proposed change, affected phase, and owner — "communicate more" is not acceptable -->

| Improvement | Current State | Proposed Change | Phase Affected | Owner |
|-------------|--------------|----------------|---------------|-------|
| Risk tier confirmed before hand-off | Confirmed sometimes after work starts | Block hand-off until tier is confirmed | Build | Priya N. |

---

## Technical Debt Log
<!-- REQUIRED: technical-debt-log — every known debt item listed with location, reason incurred, priority, and suggested fix timing; P0 debt count must be stated explicitly -->

| # | Description | Location | Why It Was Incurred | Priority | Suggested Fix Timing |
|---|-------------|----------|-------------------|---------|---------------------|
| TD-01 | No Azure DevOps equivalent for spec status | scripts/spec_status.py | Time pressure - GitHub shipped first | P1 | Next release |

**P0 debt (must address immediately):** 0
**P1 debt (next release):** 1
**P2 debt (backlog):** 0

---

## Patterns to Reuse

| Pattern | Description | Why It Worked | When to Apply |
|---------|-------------|--------------|--------------|
| Span-based document edits | Never regenerate a file, only splice spans | Guarantees byte fidelity | Any structured-document library |

---

## Patterns to Avoid

| Pattern | Description | What Went Wrong | What to Do Instead |
|---------|-------------|----------------|-------------------|
| Guessing placeholder vs. real content | Tried to detect "still a placeholder" | Too fragile, false positives | Only check for literal emptiness |

---

## Metrics Snapshot

| Metric | Value |
|--------|-------|
| Total phases completed | 10 (0-9) |
| Sprint velocity (avg) | not tracked |
| Total P0 stories delivered | 12/12 |
| Test coverage at release | 92% |
| Defects found in testing | 4 |
| Defects found in production | 0 |
| Time from discovery to production | 12 weeks |

---

## Recommendations for Next Project

1. Confirm risk tier before hand-off, not after.
2. Write round-trip tests before authoring the 3rd shape, not the 28th.
3. Budget explicit overlap hours for cross-timezone review.
