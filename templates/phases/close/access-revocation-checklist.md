# Access-Revocation Checklist
<!-- Phase C — Close & Transfer | Required artifact -->

> Drafted in week 1 so week 3 is execution, not discovery. Every pod credential removed and
> **confirmed against the client's audit trail**. A clean exit is a revoked, audited exit.

## Repository / source control
- [ ] Pod contributor access removed (every member)
- [ ] Branch-protection admin returned to a client admin
- [ ] Any pod-owned service accounts / bot tokens revoked

## Cloud / infrastructure
- [ ] Pod IAM identities removed from the client tenant/subscription
- [ ] Any pod-held credentials rotated to values the pod never knew

## Secrets / keys
- [ ] Anthropic API key under the client's account only; pod seats deactivated
- [ ] Production secrets confirmed rotated (pod never held production values)

## CI/CD & monitoring
- [ ] Pipeline secrets owned by the client; pod access removed
- [ ] Dashboards / paging ownership transferred to the client

## Confirmation
- [ ] Every item above **verified against the client's own audit log** (not just "we think it's done")
- Confirmed by (client security): [name]    Date: [YYYY-MM-DD]

## Harvest (ours, after exit)
- [ ] Harvest PR opened against `delivery-standard` (client specifics stripped): [PR link]
- [ ] Retro file added recording what this engagement changed about the standard
