# User Journey
<!-- Phase 2 — Design | Optional artifact -->

> The end-to-end path one **persona** takes through one **channel** to reach the outcome — including
> where they can fail, abandon, or drop out. Author one journey per `(channel × persona)`; a feature on
> N surfaces has N journeys. Failure and abandon paths are first-class: a dead-end with no owned answer
> opens a `decision-log.md` item rather than being silently guessed. Owned by Design; feeds the spec's
> Scope + Acceptance Checks.

## Journey identity

**Channel:** `<channel>`  <!-- e.g. ag-ui / voice / chat, or `—` for channel-agnostic -->
**Persona:** [who is travelling this journey]
**Entry point:** [where the persona starts — a call, a link, a message, a screen]
**Goal / outcome:** [what "done" looks like for the persona]
**Traces to:** [FE-NN feature-brief row · US-NN story · spec name]

---

## Happy path

The step-by-step route when nothing goes wrong.

| Step | Persona action | System response | Success signal |
|------|----------------|-----------------|----------------|
| 1 | [what the persona does] | [what the surface does back] | [how we know this step landed] |
| 2 | [...] | [...] | [...] |
| 3 | [...] | [...] | [...] |

---

## Failure & abandon paths

Every place the journey can break, stall, or be walked away from. Recovery keeps the persona moving;
an unresolved product question becomes a **decision-log** item.

| Branch point | What the persona experiences | Recovery / fallback | Where it goes |
|--------------|------------------------------|---------------------|---------------|
| [e.g. input not understood] | [...] | [reprompt / retry / clarify] | [stays in journey] |
| [e.g. persona abandons mid-flow] | [...] | [resume affordance / graceful exit] | [DL-NN if the answer is undecided] |
| [e.g. system error] | [...] | [fallback / escalation to a human] | [escalation path] |
| [e.g. edge the design does not yet cover] | [...] | [—] | [DL-NN — owner + clock] |

---

## Channel notes

Fill the note for this journey's channel; delete the rest.

- **Visual (`ag-ui`):** call out loading / empty / error states and the confidence + approval affordance.
- **Voice:** every turn must keep fallback-to-human reachable; name where readback + confirm happen.
- **Chat:** note threading across gaps and where escalation is offered.

---

## Open questions → decision-log

| Question | Owner | Decision-log ref |
|----------|-------|------------------|
| [what the journey cannot resolve without a human decision] | [name] | [DL-NN] |
