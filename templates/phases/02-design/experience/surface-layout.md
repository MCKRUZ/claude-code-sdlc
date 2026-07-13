# Surface Layout
<!-- Phase 2 — Design | Optional artifact -->

> The channel-adaptive layout of the surface. One artifact, three shapes: **screens** for a visual
> channel (`ag-ui`), a **turn-by-turn script** for `voice`, a **message-flow** for `chat`. Fill the
> section that matches this surface's channel and delete the others. The in-repo markdown is
> authoritative; link any hi-fi design (prototype / Figma) rather than pasting it. Owned by Design.

## Surface identity

**Channel:** `<channel>`  <!-- ag-ui / voice / chat -->
**Persona:** [who uses this surface]
**Traces to:** [FE-NN feature-brief row · spec name]
**Hi-fi link:** [URL to prototype / Figma, or `none`]

---

## Visual channel (`ag-ui`) — screens

*Use this section for a visual/web surface. Every screen names its loading, empty, and error states.*

| Screen | Purpose | Key elements | States rendered |
|--------|---------|--------------|-----------------|
| [screen name] | [what the persona does here] | [primary controls / data shown] | loading / empty / error |
| [...] | [...] | [...] | [...] |

**Wireframe / layout sketch:**

```
[ASCII sketch of the primary screen — regions, primary action, confidence/approval affordance]
```

**Navigation flow:**

```
[screen A] → [screen B] → [screen C]
```

---

## Voice channel — turn-by-turn script

*Use this section for a voice surface — there are no screens, so the layout IS the turn script.*
`S:` = system, `C:` = caller; annotate turn behavior in `[brackets]`.

```
S: "[opening prompt]"                                    [yields]
C: "[caller utterance]"                                  [ASR conf 0.xx]
S: "[follow-up / clarification]"
   ...[internal step: entitlement / lookup / decision]...
S: "[state-changing action, read back] — shall I proceed?"   [readback + confirm]
C: "[confirmation]"                                      → commit (recorded)
```

Note where **barge-in**, **reprompt-on-low-confidence**, and **fallback-to-human** apply.

---

## Chat channel — message flow

*Use this section for a text/chat surface.* `U:` = user, `A:` = agent.

```
U: [user message]
A: [agent response]                                      [typing cue if > 3 s]
U: [follow-up — resolved against prior context]
A: [threaded reply]
   ...[escalation offered on request or repeated failure]...
```

Note **threading across gaps**, **typing/latency cues**, and the **escalation** hand-off point.

---

## States & edge rendering

| State | What the persona sees | Notes |
|-------|-----------------------|-------|
| Loading / in-progress | [...] | [latency cue] |
| Empty | [...] | [first-run / no-data copy] |
| Error | [...] | [recovery affordance] |
