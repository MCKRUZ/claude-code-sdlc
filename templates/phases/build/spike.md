---
spike: "NNNN"
name: "short-kebab-name"
status: open             # open | closed
box: "—"                 # the agreed time or token box (e.g. "1 working day", "$40 of tokens")
opened_by: "—"           # the named human who opened it — Pod Lead at triage, or the Architect
unblocks: "—"            # decision-list item id, the story that can't be made ready, or ADR-NNNN
created: "YYYY-MM-DD"
---

# Spike NNNN — <the question, phrased as a question>

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
<!--
  The specific thing nobody knows, stated so that an answer would be recognisable.
  Not "look into the carrier API" — "does the carrier API deduplicate on our idempotency key,
  or do retries create duplicate claims?"
-->

## Why it can't be specced yet
<!--
  One or two sentences: which acceptance check cannot be written, and why guessing it is worse
  than finding out. This is the justification for spending the box.
-->

## What was tried
<!-- Filled in as the spike runs. Enough detail that the next person doesn't repeat it. -->
- **Tested against:** <which system, which environment, which version — sandbox vs live matters>
- **Method:** <what was actually done: the call made, the load applied, the scenario driven>
- **Observed:** <what came back, including the boring parts — raw enough to be checkable>

## Finding
<!--
  The result. Write this even when the answer is "we still don't know" — a negative result that
  records what was ruled out is a real finding and saves the next attempt.
-->
**The assumption:** <what we believed going in>

**Survived?** <yes | no | partially | still unknown>

**What we now know:**
<the answer, in terms the spec author can use. If the assumption died, say what replaced it.>

**What it would take to know more:** <only when still unknown — access, an environment, a
conversation with the client's team, more box>

## Consequences
- **Decision-list item:** <answered as … | still open, escalated to the client>
- **Spec(s) now writable:** <which story can be made ready, and which acceptance check this finding supplies>
- **ADR impact:** <none | ADR-NNNN needs revision — raised as a HIGH-risk spec, same bar as any other>
- **New risk surfaced:** <anything the pod didn't know to worry about before>

## Disposal
- [ ] Spike branch deleted; no spike code merged to the default branch
- [ ] Anything worth keeping is described here, not carried over as code
- [ ] This file committed; box respected (or the overrun recorded below with its reason)

<!--
  If the box was overrun: how far, and why. Two overruns in a month means triage is opening
  spikes on questions too big to be spikes.
-->
