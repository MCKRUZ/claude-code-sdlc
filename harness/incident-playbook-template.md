<!--
  Incident playbook template (kit). Copy to INCIDENT-PLAYBOOK.md at the repo root.

  This is a Phase 9 artifact: drafted by Claude, CORRECTED by the client's operations team, and
  owned by them afterwards (docs/phase-9-monitoring.md).

  ── THE DIVISION OF LABOUR, WHICH IS EASY TO BLUR ─────────────────────────────────────────
  The RUNBOOK **resolves**. This playbook **detects and communicates** (docs/glossary.md).

  So: how to restart the service, rotate the key, drain the queue — those are RUNBOOK
  procedures, and this file LINKS to them rather than copying them. Copying is how the two
  drift and how someone follows the stale one during an incident. What lives HERE is the part
  the RUNBOOK does not cover: which alert means what, what to check first, who to wake, and
  what to tell users while it is still happening.

  Written for a reader who is exhausted, stressed, and possibly seeing this system for the
  first time — the same reader the RUNBOOK is written for. Proven the same way: the client's
  on-call answers the Phase 9 drill FROM THIS FILE, with the pod silent.
-->

# INCIDENT PLAYBOOK — {{system name}}

- **Owner:** {{Pod Lead during the engagement → client operations at transfer}}
- **On-call rota:** {{where it lives}}
- **Status page / user comms channel:** {{where users are told}}
- **Related:** `ALERTS.md` (what fires) · `RUNBOOK.md` (how to fix) · `ROLLBACK.md` (how to undo)

---

## The first five minutes

<!-- The same for every incident, so nobody has to choose a path while adrenaline is high. -->

1. **Acknowledge** the page — {{how}}. This stops it escalating and tells everyone it is owned.
2. **Say you have it** — post in {{channel}}: *"Investigating {{alert}}. Next update in 15 min."*
3. **Assess severity** using the table below. When torn between two levels, take the higher one.
4. **Find the alert's entry** in this file and work it.
5. **Set a 15-minute update clock.** Silence during an incident reads as nothing happening.

**You are allowed to roll back before you understand the cause.** If a trigger in
`ROLLBACK.md` §1 is met, execute it — diagnosis can happen once service is restored. Understanding
the failure is not a prerequisite for stopping it.

---

## Severity

| Level | Looks like | Tell users? | Escalate |
| --- | --- | --- | --- |
| **SEV1** | {{users cannot do the core journey; data at risk}} | {{yes, immediately}} | {{who, straight away}} |
| **SEV2** | {{degraded — slow, partial, one feature down}} | {{yes if > N minutes}} | {{who, after N minutes}} |
| **SEV3** | {{noticeable internally, users unaffected}} | {{no}} | {{next working day}} |

---

## Playbook: {{alert name}}

<!-- Copy this block per alert in ALERTS.md. Every critical alert needs one — an alert with no
     entry is a page with no answer, which is where the drill will find you out. -->

**Detect** — {{what the responder actually sees: the alert text, and what it looks like on the
dashboard. Include what a FALSE positive looks like, if there is a known one.}}

**Diagnose** — first three checks, in order. Stop when one explains it.

1. {{check}} → `{{exact command or dashboard link}}` → {{what a normal answer looks like}}
2. {{check}} → `{{...}}` → {{...}}
3. {{check}} → `{{...}}` → {{...}}

*If none of these explain it:* {{where to look next, or who to wake — do not leave this blank,
"keep digging" is not a step}}

**Likely causes, most common first**

| Cause | Confirms it | Fix |
| --- | --- | --- |
| {{cause}} | {{the observation that confirms}} | `RUNBOOK.md` → {{procedure name}} |
| {{cause}} | {{...}} | {{`ROLLBACK.md` if the fix is to undo the release}} |

**Escalate** — to {{named role}} at {{contact}}. If no response in {{N}} minutes, {{second
contact}}. Escalating early is not a failure; a quiet incident that runs long is worse than a
noisy one that ends.

**Communicate** — {{which template below}} · audience {{who}} · cadence {{every N minutes}}

---

## What to tell users

<!--
  Written in advance because prose composed at 3 a.m. is where the reputational damage happens.
  Plain language, no internal jargon, no blame, no speculation about cause. Say what is broken,
  what they can do meanwhile, and when they will hear next — that last one matters most and is
  the one most often left out.
-->

**Initial (within {{N}} minutes of a SEV1/SEV2)**

> We're aware of an issue affecting {{plain-language description of what users cannot do}}.
> We're investigating and will update by {{time}}.
> {{Workaround, if there is one — otherwise delete this line rather than inventing one.}}

**Holding update (every {{N}} minutes, even with no news)**

> We're still working on {{issue}}. {{What is known, in plain terms.}} Next update by {{time}}.

**Resolved**

> {{Issue}} was resolved at {{time}}. {{What users should do now — re-submit, refresh, nothing.}}
> {{If data was affected, say so plainly and say what happens next. Do not bury it.}}

---

## After it ends

<!-- Feeds the Retro+ question the whole standard is built around: "which check should have
     caught it?" — answered with a harness change, not a resolution to be more careful. -->

- [ ] Timeline captured while it is fresh — detection time, response time, resolution time
- [ ] **Which check should have caught this?** → {{the concrete harness/alert/test change}}
- [ ] Was there an alert? {{yes — it worked \| yes — too late, threshold changed to X \| NO — new alert added to `ALERTS.md`}}
- [ ] Did this playbook entry hold up? {{gaps found → edit THIS file now, not later}}
- [ ] `RUNBOOK.md` procedure accurate? {{corrections applied}}
- [ ] Escaped-bug entry raised for Retro+ (docs/build-loop.md)
- [ ] User comms sent and accurate in hindsight

---

## Drill record

<!-- Week two of Phase 9. The client's on-call responds from this file, the pod silent. A drill
     the pod talked them through proves nothing — it tests the pod, not the playbook. -->

| Date | Alert drilled | Responder | Worked from this file alone? | What we rewrote |
| --- | --- | --- | --- | --- |
| {{YYYY-MM-DD}} | {{alert}} | {{name, client on-call}} | {{yes / no}} | {{the gap — a drill that found nothing usually means it was narrated}} |
