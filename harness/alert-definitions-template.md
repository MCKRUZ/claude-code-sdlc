<!--
  Alert definitions template (kit). Copy to ALERTS.md at the repo root (or monitoring/alerts.md
  if the repo keeps monitoring config together). One entry per alert.

  This is a Phase 9 artifact: drafted by Claude, wired by the Setup Owner, CONFIRMED by the
  people who will be paged, and owned after transfer by the client's operations team
  (docs/phase-9-monitoring.md). It is the durable form of the what-healthy-means session.

  Two rules govern every entry, and both are easy to write around — don't:

    1. EVERY THRESHOLD COMES FROM A MEASURED BASELINE. Not intuition, not a round number that
       feels right. If the baseline has not been measured from real production traffic yet,
       record it as modeled WITH a revisit date rather than dressing a guess as a number.

    2. EVERY ALERT IS ACTIONABLE. A notification nobody acts on is noise wearing an alert's
       badge, and it teaches the team to ignore the whole channel — including the real one.
       The standing rule: fires more than once a week without action, raise the threshold or
       DELETE THE ALERT. Deleting is a legitimate, encouraged outcome of the fatigue review.

  An alert that has never fired is a wish — the same rule the rollback rehearsal enforces in
  Phase 8. Each critical alert is deliberately triggered in the drill and answered by the
  client's on-call from `INCIDENT-PLAYBOOK.md`.
-->

# ALERTS — {{system name}}

- **Owner:** {{Setup Owner during the engagement → client operations at transfer}}
- **Where these live:** {{Azure Monitor / Grafana / the client's tooling — and the config path}}
- **Paging channel:** {{how a critical alert reaches a human at 3 a.m.}}
- **Last fatigue review:** {{YYYY-MM-DD}} — see §Fatigue review
- **Related:** `INCIDENT-PLAYBOOK.md` (what to DO) · `RUNBOOK.md` (how to FIX) · `ROLLBACK.md`

---

## Severity, and what it means for a human

| Level | Means | Response |
| --- | --- | --- |
| **Critical** | {{someone is woken, now}} | {{acknowledge within N minutes, from the playbook}} |
| **Warning** | {{investigate during working hours}} | {{picked up next working day at the latest}} |

The difference is **who suffers if it waits until morning** — not how alarming the number looks.

---

## Coverage check

<!-- Quality Engineer owns this: every top-priority feature has at least one metric someone
     actually watches. A feature with no alert is a feature whose failure a user reports to
     you, which is the situation this phase exists to end. -->

| Top-priority feature / journey | Alert(s) covering it | Gap? |
| --- | --- | --- |
| {{journey}} | {{alert name(s)}} | {{none \| named gap + owner + date}} |

---

## Alert: {{name}}

<!-- Copy this block per alert. Keep the headings — the drill record and the fatigue review
     both read them. -->

- **Failure mode it detects:** {{the thing that is actually going wrong, in plain words —
  "the claims API is rejecting valid submissions", not "HTTP 500 rate elevated"}}
- **Who is woken:** {{named rota, not a team alias — an alias is how everyone assumes someone
  else has it}}
- **Signal:** {{the metric/query, exactly as configured}}
- **Evaluation window:** {{e.g. 5 minutes, 3 consecutive periods — the window is half the
  threshold; a spiky metric with a short window is a pager that cries wolf}}

| | Value | Where it came from |
| --- | --- | --- |
| **Baseline (normal)** | {{value}} | {{measured {{period}} of real production traffic \| MODELED — revisit by {{date}}}} |
| **Warning threshold** | {{value}} | {{how derived from the baseline}} |
| **Critical threshold** | {{value}} | {{how derived from the baseline}} |

- **First response:** `INCIDENT-PLAYBOOK.md` → {{entry name}}
- **Does this trigger a rollback?** {{no \| yes — it is trigger «N» in `ROLLBACK.md` §1}}
- **Known false-positive causes:** {{e.g. the nightly batch window — and what was done about
  it, because "we know it fires then" is not a mitigation}}

### Drill record

<!-- Week two of Phase 9. Fired deliberately, in a controlled way, and answered by the client's
     on-call FROM THE PLAYBOOK — not from memory and not with the pod prompting. -->

| Date | Fired how | Answered by | From the playbook alone? | What we fixed afterwards |
| --- | --- | --- | --- | --- |
| {{YYYY-MM-DD}} | {{how it was triggered}} | {{name, client on-call}} | {{yes / no}} | {{playbook gap, threshold change, or alert deleted}} |

---

## Fatigue review

<!--
  Run this on a standing cadence, not once. An alert set decays: thresholds that were right at
  launch fire constantly at ten times the traffic. Reviewing is how the channel keeps meaning
  something.

  "Fires often, nobody acts" is not a tuning problem to defer. It is either a threshold that is
  wrong or an alert that should not exist, and both are fixed by editing this file.
-->

- **Cadence:** {{e.g. monthly, at the operations review}}
- **Rule applied:** fires more than once a week without action → raise the threshold or delete it.

| Alert | Fires / week | Acted on? | Decision | Date |
| --- | --- | --- | --- | --- |
| {{name}} | {{n}} | {{yes / no}} | {{kept \| threshold raised to X \| DELETED}} | {{YYYY-MM-DD}} |

---

## Gate checklist

- [ ] Every critical failure mode from the RUNBOOK's failure scenarios has an alert here
- [ ] Every threshold is derived from a baseline, and every modeled value carries a revisit date
- [ ] Every alert names a **person or rota**, confirmed by the people actually being paged
- [ ] Every critical alert has been fired in the drill and answered from the playbook
- [ ] Every alert has a first-response entry in `INCIDENT-PLAYBOOK.md`
- [ ] No alert on this list fires routinely without anyone acting on it
