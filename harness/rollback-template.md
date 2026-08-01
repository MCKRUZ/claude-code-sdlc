<!--
  Rollback template (kit). Copy to ROLLBACK.md at the repo root — one file per deployable,
  or one section per deployable if the repo ships several.

  This is a Phase 8 artifact: drafted by Claude from the real pipeline and infrastructure,
  OWNED by the Setup Owner, and proven by the client's own operators executing it in test —
  deploy, roll back, redeploy — during rehearsal week (docs/phase-8-deployment.md).

  It exists because of one rule: A ROLLBACK THAT HAS NEVER RUN IS A WISH (the-rails.md §5).
  The pipeline's automatic restore path (deploy-dev.yml / deploy-promote.yml) covers a deploy
  that fails DURING the deploy. This file covers the other case — the deploy succeeded, the
  health check passed, and it is now 2 a.m. and something is wrong. That decision is made by
  a human, under pressure, and the whole point of writing it down in advance is that the
  trigger is NOT invented at the moment it is needed.

  A section left as {{placeholder}} at the gate is a section nobody has answered. "We'd figure
  it out" is the answer this template exists to prevent.
-->

# ROLLBACK — {{system / deployable name}}

- **Environment(s) this covers:** {{prod | test + prod — list each, they may differ}}
- **Owner:** {{name}} — Setup Owner owns this file's truth
- **Last rehearsed:** {{YYYY-MM-DD}} by {{who actually typed the commands}}
- **Automatic restore:** {{yes — deploy-promote.yml restores on a failed deploy | no}}
- **Related:** `RUNBOOK.md` {{§ or heading}} · `docs/phase-9-monitoring.md` alerts that trigger this

---

## 1. The trigger — roll back if…

<!--
  THE LOAD-BEARING SECTION. Written in advance, in the cold light of day, so that the person
  on call at 2 a.m. is executing a decision rather than making one. Each line must be
  observable — something a human or a dashboard can actually SEE, not a judgement like
  "if it seems bad".

  If you can only write vague triggers, that is a finding: the system is not observable
  enough yet, and it belongs in the Phase 9 alert set (docs/phase-9-monitoring.md).
-->

Roll back **without further discussion** if any of these hold after {{N}} minutes:

- {{e.g. error rate above X% sustained for N minutes — the alert that fires is «alert name»}}
- {{e.g. the P95 latency of «journey» exceeds Nms}}
- {{e.g. «top-priority journey» fails its smoke check in production}}
- {{e.g. any data-integrity alarm, regardless of volume}}

Do **not** roll back for:

- {{e.g. a single failed request, a known-noisy alert, anything the ledger below records as accepted}}

**Who can call it:** {{named role — e.g. the on-call engineer, alone, at any hour}}. Explicitly
does NOT require {{e.g. waking the Pod Lead first}} — needing permission is how a two-minute
rollback becomes a forty-minute outage.

---

## 2. What "the last known-good version" means here

<!-- The pipeline captures this automatically before every deploy. State how a HUMAN finds it
     when they are doing this by hand, because that is the situation this file is for. -->

- **Identified by:** {{deployment slot | revision id | image tag | release number}}
- **Where to look it up:** {{exact command or exact UI path}}
- **How far back can we go:** {{how many prior versions are retained, and for how long}}

---

## 3. The procedure

<!--
  Numbered, copy-pasteable, with a CHECK after each step. Written for someone exhausted,
  stressed, and possibly seeing this system for the first time — the same reader the RUNBOOK
  is written for (docs/phase-7-documentation.md).

  No step may say "restore the previous version" without saying HOW.
-->

1. **{{Announce}}** — {{exact channel, exact message; see §6}}
   - *Check:* {{the message is visible in «channel»}}
2. **{{Capture the current broken state before destroying it}}** — {{exact command}}
   - *Check:* {{logs/snapshot saved where; you will need this for the incident review}}
3. **{{Execute the restore}}** — `{{exact command}}`
   - *Check:* {{what output confirms it ran}}
4. **{{Verify service}}** — `{{exact health/smoke command}}`
   - *Check:* {{what a healthy response looks like — the actual expected output}}
5. **{{Confirm the journeys}}** — {{the same smoke checks the promotion runs}}
   - *Check:* {{all green}}
6. **{{Stand down / escalate}}** — {{if the check at step 4 or 5 fails, go to §5}}

**Expected wall-clock:** {{measured in rehearsal, not estimated}}

---

## 4. What rolling back does NOT undo

<!--
  THE SECTION PEOPLE SKIP AND THEN REGRET. Code rolls back cleanly. State does not. If the
  release included a schema migration, a one-way data transform, an outbound webhook, a
  published message, or an email send, rolling back the CODE leaves those in place — and the
  restored version may not understand the data it now finds.

  If any answer here is "we don't know", the release is not ready to promote. That is a
  Phase 8 go/no-go finding, not a footnote.
-->

| Concern | This release | If it cannot be undone, the plan is |
| --- | --- | --- |
| Schema migration | {{none \| additive-only, backward compatible \| destructive}} | {{forward-fix only — say so explicitly}} |
| Data transformed in place | {{none \| describe}} | {{restore-from-backup procedure + RPO}} |
| Messages published / webhooks sent | {{none \| describe}} | {{consumer tolerance; replay or ignore}} |
| Third-party state changed | {{none \| describe}} | {{compensating action}} |

**Point of no return:** {{the step in the deploy after which rollback stops being possible, and
what to do instead. If there is none, write "none — rollback is safe at any point" and prove it
in rehearsal.}}

---

## 5. When the rollback itself fails

<!-- Rehearsal exists to find this. docs/journey.md records a rollback that FAILED in rehearsal
     and calls it the win, not the failure — because it failed in test on a Tuesday afternoon
     instead of in production at 2 a.m. -->

1. {{Immediate containment — e.g. take the service out of rotation, serve maintenance page}}
2. **Escalate to:** {{named person}} at {{contact}}, then {{second contact}} after {{N}} minutes
3. {{The break-glass path — restore from backup, redeploy from scratch, failover region}}

---

## 6. Communication

| When | Who is told | Where | What |
| --- | --- | --- | --- |
| Deciding to roll back | {{internal}} | {{channel}} | {{one line: what, when, expected duration}} |
| Rolled back, service restored | {{internal + client contact}} | {{channel}} | {{what happened, current state, what is NOT yet fixed}} |
| Users affected | {{who writes it}} | {{status page / in-app / email}} | {{the template message in `INCIDENT-PLAYBOOK.md`}} |

---

## 7. Rehearsal record

<!--
  The gate's teeth. Phase 8 does not close on a rollback that has only been READ. The client's
  own operators execute it in test, with their own permissions, with the pod beside them and
  not on the keyboard (docs/phase-8-deployment.md).
-->

| Date | Environment | Executed by (their hands) | Deploy → roll back → redeploy all green? | What broke / what we changed in this file |
| --- | --- | --- | --- | --- |
| {{YYYY-MM-DD}} | {{test}} | {{name, client ops}} | {{yes / no}} | {{the gaps found — a rehearsal that found nothing usually means it was watched, not run}} |

- [ ] Executed by the client's own operators, with their own permissions
- [ ] The trigger conditions in §1 are observable — each maps to something on a dashboard or an alert
- [ ] §4 answered for THIS release, not in general
- [ ] Wall-clock in §3 is a measured number
- [ ] Re-rehearsed after any change to the deploy pipeline or the restore mechanism
