# User Journey
<!-- Phase 2 — Design | Optional artifact -->

> The end-to-end path one **persona** takes through one **channel** to reach the outcome — including
> where they can fail, abandon, or drop out. Author one journey per `(channel × persona)`; a feature on
> N surfaces has N journeys. Failure and abandon paths are first-class: a dead-end with no owned answer
> opens a `decision-log.md` item rather than being silently guessed. Owned by Design; feeds the spec's
> Scope + Acceptance Checks.

## Journey identity

**Channel:** `ag-ui`
**Persona:** Claimant checking on an open auto claim
**Entry point:** The "Check my claim" link in the claim-received email
**Goal / outcome:** The claimant sees the current status of their claim and knows what happens next
**Traces to:** FE-03 · US-12 · Claim status lookup

---

## Happy path

The step-by-step route when nothing goes wrong.

| Step | Persona action | System response | Success signal |
|------|----------------|-----------------|----------------|
| 1 | Opens the link from the email | Shows the sign-in screen | Sign-in form is visible within 2 seconds |
| 2 | Signs in with email and one-time code | Shows the claim list with masked names | Claim list renders with at least one claim |
| 3 | Selects their claim | Shows the status detail with next-step text | Status and next step are both on screen |

---

## Failure & abandon paths

Every place the journey can break, stall, or be walked away from. Recovery keeps the persona moving;
an unresolved product question becomes a **decision-log** item.

| Branch point | What the persona experiences | Recovery / fallback | Where it goes |
|--------------|------------------------------|---------------------|---------------|
| One-time code expired | An "expired code" message | Offer to send a new code | stays in journey |
| Claimant abandons at sign-in | Nothing; the page is left open | Email reminder after 24 hours with the same link | DL-10 if the reminder wording is undecided |
| Claims system unavailable | A "we can't load your claim" message | Show phone number for the claims team | escalation to the claims support line |
| Claimant has two open claims with the same name | List shows both with identical labels | none yet | DL-11 — owner Priya, due in 2 business days |

---

## Channel notes

Fill the note for this journey's channel; delete the rest.

- **Visual (`ag-ui`):** Loading shows a skeleton list, empty shows "No open claims", error shows the retry control. Status changes made by an adjuster carry an "updated by your adjuster" label.

---

## Open questions → decision-log

| Question | Owner | Decision-log ref |
|----------|-------|------------------|
| How do we label two claims that share a claimant name? | Priya Nair | DL-11 |
