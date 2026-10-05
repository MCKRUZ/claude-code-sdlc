---
spike: "0003"
name: "carrier-api-idempotency"
status: closed           # open | closed
box: "1 working day"     # the agreed time or token box (e.g. "1 working day", "$40 of tokens")
opened_by: "Priya Nair"  # the named human who opened it — Pod Lead at triage, or the Architect
unblocks: "DL-12"        # decision-list item id, the story that can't be made ready, or ADR-NNNN
created: "2026-09-14"
---

# Spike 0003 — carrier-api-idempotency

<!--
  A spike is NOT a spec. It runs when the pod cannot yet write an acceptance check that passes
  the vague-line test, because nobody knows the answer. One spike = one question = one
  `spike/NNNN-name` branch.

  The code is throwaway and CANNOT merge: the `spike-guard` CI check fails any PR opened from a
  `spike/` branch, and there is no label escape. THIS FILE is the deliverable — commit it on its
  own, then delete the branch. If the work should ship, write a spec and rebuild it under the loop.

  See the Build loop, section 3a.
-->

## The unknown
Does the carrier claims API deduplicate on our idempotency key, or do retries create duplicate claims?

## Why it can't be specced yet
The acceptance check for "a retried submission creates exactly one claim" cannot be written until we know whether the carrier or our own service has to enforce that. Guessing would grade the spec against fiction.

## What was tried
<!-- Filled in as the spike runs. Enough detail that the next person doesn't repeat it. -->
- **Tested against:** Carrier sandbox environment, API v2.3 (the live API was not available to us)
- **Method:** Submitted the same claim 20 times with one idempotency key, then 20 times with a fresh key each time
- **Observed:** One claim was created for the repeated key, and 20 for the fresh keys; the response to every repeat carried the original claim id

## Finding
**The assumption:** The carrier API deduplicates on the idempotency key we send.

**Survived?** yes, in the sandbox

**What we now know:**
The sandbox returns the original claim for a repeated key for at least 24 hours. Our submission service does not need its own duplicate check for retries inside that window.

**What it would take to know more:** Confirmation from the carrier's team that production behaves like the sandbox and that the 24-hour window is guaranteed.

## Consequences
- **Decision-list item:** DL-12 answered as: rely on the carrier's deduplication within 24 hours
- **Spec(s) now writable:** The duplicate-claim 409 story can be made ready; its acceptance check is "a retry with the same key within 24 hours returns the original claim id and HTTP 200"
- **ADR impact:** none
- **New risk surfaced:** Retries after 24 hours would create a second claim; the carrier has not documented this window

## Disposal
- [x] Spike branch deleted; no spike code merged to the default branch
- [x] Anything worth keeping is described here, not carried over as code
- [x] This file committed; box respected (or the overrun recorded below with its reason)

<!--
  If the box was overrun: how far, and why. Two overruns in a month means triage is opening
  spikes on questions too big to be spikes.
-->
