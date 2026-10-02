# Channel Interaction Spec
<!-- Phase 2 — Design | Optional artifact -->

> The contract that turns a channel's acceptance dimensions into the spec's acceptance checks.

## Spec identity

**Channel:** `voice`
**Descriptor:** `channels/voice.yaml`
**Persona:** Claimant on a landline
**Traces to:** FE-02 · voice-claim-intake

---

## The contract

| `voice` descriptor dimension | Interaction-spec contract | → Acceptance check on the spec |
|------------------------------|---------------------------|--------------------------------|
| turn-taking | The agent finishes each prompt, then waits for the caller. | "The agent never speaks while the caller is speaking; it waits 1.5 s of silence before re-prompting." |
| barge-in | The caller may interrupt any prompt. | "When the caller speaks during a prompt, the prompt stops within 200 ms." |
| readback-confirmation | The claim details are read back before saving. | "The claim is saved only after the caller says yes to the read-back of name, date and claim type." |
| latency-budget | [the concrete behavior for this surface] | [the graded check] |

*Cover every `acceptance_dimension` in the descriptor.*
