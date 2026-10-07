---
issue: "ISS-NNNN"
title: ""
status: new                  # new | needs-info | triaged | prioritized | promoted | fixed | wont-fix | duplicate
channel: ""                  # web | api | voice | chat | data | mobile | other — where in the product
environment: ""              # local | dev | test | staging | production
product_version: ""          # the build, tag or commit under test
severity: ""                 # blocks | degraded | cosmetic
frequency: ""                # always | sometimes | once
data_impact: ""              # none | wrong-shown | wrong-written | exposed
persona: ""                  # the type of user the reporter was acting as, in the product's terms
reporter_role: ""            # builder | checker | owner | product | data | design | steering | client | end-user | other
spec: ""                     # optional — the spec this part of the product was built under (NNNN)
reported_by: ""              # the named human who saw it
reported_at: ""
screenshots: 0
priority: ""                 # P1 | P2 | P3 — set by `prioritize`, confirming or changing the report's proposal
target_sprint: ""            # the sprint the fix should land in (an open sprint.py record)
triaged_by: ""               # the reviewer — someone other than the reporter
triage_verdict: ""           # confirmed | needs-info | duplicate | wont-fix
prioritized_by: ""
duplicate_of: ""             # ISS-NNNN when the verdict is duplicate
bugfix_spec: ""              # the type: bugfix spec `promote` scaffolded (NNNN) — the Build loop's unit
filed_host: ""               # github | azure-devops, once `file` has run (orthogonal to status)
filed_url: ""
filed_id: ""
escaped_from: ""             # optional — the check that should have caught it (also recorded on the scorecard)
---

# ISS-NNNN — <title>

<!--
  Written by `report_issue.py new` from the answers /sdlc-report-issue (or the SDLC Studio app) collected.
  The frontmatter is the record the fixer and the code host read; the sections below are the
  reporter's own words, kept verbatim. The lifecycle verbs — triage, prioritize, promote, note,
  reopen, sync, file, set-status — append to ## History and update the frontmatter; nothing else
  edits this file.
-->

## What happened

<!-- {{what_happened}} -->

## What you expected

<!-- {{expected}} -->

## Steps to reproduce

<!-- {{steps}} -->

## Where

<!-- {{where}} -->

## Environment

<!-- {{environment}} -->

## Screenshots

<!-- {{screenshots}} -->

## Privacy check

<!-- {{privacy}} -->

## History

<!-- {{history}} -->
