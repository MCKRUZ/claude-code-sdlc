# Surface Layout
<!-- Phase 2 — Design | Optional artifact -->

> The channel-adaptive layout of the surface. One artifact, three shapes: **screens** for a visual
> channel (`ag-ui`), a **turn-by-turn script** for `voice`, a **message-flow** for `chat`. Fill the
> section that matches this surface's channel and delete the others. The in-repo markdown is
> authoritative; link any hi-fi design (prototype / Figma) rather than pasting it. Owned by Design.

## Surface identity

**Channel:** `ag-ui`, `voice`, `chat`
**Persona:** Claimant checking on an open auto claim
**Traces to:** FE-03 · Claim status lookup
**Hi-fi link:** https://www.figma.com/file/acme-claims-portal/status-lookup

---

## Visual channel (`ag-ui`) — screens

*Use this section for a visual/web surface. Every screen names its loading, empty, and error states.*

| Screen | Purpose | Key elements | States rendered |
|--------|---------|--------------|-----------------|
| Sign in | Prove who the claimant is | Email field, one-time code field, resend link | loading / error |
| Claim list | Pick the claim to look at | Masked claimant name, claim id, status chip | loading / empty / error |
| Status detail | See status and what happens next | Status banner, next-step text, adjuster contact | loading / error |

**Wireframe / layout sketch:**

```
+--------------------------------------------------+
| Acme Claims Portal                    [Sign out] |
+--------------------------------------------------+
| Claim CL-48213          Status: UNDER REVIEW     |
| Policy ending 4821      Loss date: 2026-08-14    |
|                                                  |
| What happens next                                |
| An adjuster is reviewing your photos.            |
|                                                  |
| [ Contact my adjuster ]                          |
+--------------------------------------------------+
```

**Navigation flow:**

```
Sign in → Claim list → Status detail
```

---

## Voice channel — turn-by-turn script

*Use this section for a voice surface — there are no screens, so the layout IS the turn script.*
`S:` = system, `C:` = caller; annotate turn behavior in `[brackets]`.

```
S: "Thanks for calling Acme Claims. What's your claim number?"      [yields]
C: "CL four eight two one three"                                    [ASR conf 0.91]
S: "I have claim CL-48213 for an auto loss on August 14th."
   ...lookup: claim status and caller verification...
S: "It is under review. Shall I text you the next steps?"           [readback + confirm]
C: "Yes please"                                                     → commit (recorded)
```

Barge-in is allowed on every prompt except the readback. Below 0.70 confidence the system reprompts once, then offers to transfer to a person.

---

## Chat channel — message flow

*Use this section for a text/chat surface.* `U:` = user, `A:` = agent.

```
U: Where is my claim?
A: I found claim CL-48213, currently under review.                  [typing cue if > 3 s]
U: When will it be done?
A: Reviews usually finish within 5 business days of photos arriving.
   ...escalation offered on request or repeated failure...
```

Replies stay in the same thread when the user returns within 24 hours; after that the agent restates the claim before answering. A typing cue appears after 3 seconds, and "Talk to a person" is offered after two failed answers.

---

## States & edge rendering

| State | What the persona sees | Notes |
|-------|-----------------------|-------|
| Loading / in-progress | Skeleton rows in the claim list | Appears after 300 ms so fast loads do not flash |
| Empty | "You have no open claims" | First-run copy also explains how to file a claim |
| Error | "We couldn't load your claim" with a Try again button | Shows the claims team phone number after two failures |
