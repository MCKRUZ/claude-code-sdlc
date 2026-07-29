<!--
  Spike template (kit). Copy to spikes/NNNN-name.md — NNNN is the next zero-padded number,
  name is kebab-case (e.g. spikes/0003-carrier-api-idempotency.md).

  A spike is NOT a spec. It runs when the pod cannot yet write acceptance criteria that pass
  the vague-line test, because the answer isn't known. One spike = one question = one
  `spike/NNNN-name` branch. The `spike-guard` CI check fails any PR opened from that branch,
  so spike code cannot reach main — there is no label escape.

  The code is thrown away. THIS FILE is the deliverable, and it is the only thing that leaves
  the branch — commit it to main by itself (or fold it into the spec it unblocks).
  See docs/build-loop.md section 3a.
-->

# SPIKE {{NNNN}} — {{the question, phrased as a question}}

- **Status:** {{open | closed}}
- **Opened by (human):** {{name}} — {{Pod Lead at triage | Architect on a design decision}}
- **Box:** {{e.g. 1 working day | 4 agent hours | $N of tokens}} <!-- agreed at triage; a spike with no box is unsupervised building -->
- **Unblocks:** {{decision-list item ID, the story that couldn't be made ready, or the ADR under review}}

## The unknown
{{The specific thing nobody knows, stated so an answer would be recognisable. Not "look into
the carrier API" — "does the carrier API deduplicate on our idempotency key, or do retries
create duplicate claims?"}}

## Why it can't be specced yet
{{One or two sentences. Which acceptance check cannot be written, and why guessing it is
worse than finding out. This is the justification for spending the box.}}

## What was tried
<!-- Filled in as the spike runs. Enough that the next person doesn't repeat it. -->
- **Tested against:** {{which system, which environment, which version/build — sandbox vs live matters}}
- **Method:** {{what was actually done — the call made, the load applied, the scenario driven}}
- **Observed:** {{what came back, including the boring parts. Raw enough to be checkable.}}

## Finding
<!--
  The result. Write this even when the answer is "we still don't know" — a negative result
  that records what was ruled out is a real finding and saves the next attempt.
-->
**The assumption:** {{what we believed going in}}

**Survived?** {{yes | no | partially | still unknown}}

**What we now know:**
{{The answer, in terms the spec author can use. If the assumption died, say what replaced it.}}

**What it would take to know more:** {{only if the answer is still unknown — access, an
environment, a conversation with the client's team, more box}}

## Consequences
- **Decision-list item {{ID}}:** {{answered as … | still open, escalated to the client}}
- **Spec(s) now writable:** {{which story can be made ready, and which acceptance check this
  finding supplies}}
- **ADR impact:** {{none | ADR-NNNN needs revision — raised as a HIGH-risk spec per
  docs/build-loop.md section 2}}
- **New risk surfaced:** {{anything the pod didn't know to worry about before}}

## Disposal
- [ ] Spike branch deleted; no spike code merged to `main`
- [ ] Anything worth keeping is described here, not carried over as code
- [ ] This file committed; box respected (or overrun recorded below with the reason)

{{If the box was overrun: how far, and why. Two overruns in a month means triage is opening
spikes on questions too big for a spike.}}
