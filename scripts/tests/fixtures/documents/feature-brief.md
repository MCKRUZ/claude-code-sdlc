# Feature Brief — FE-01: Online claim submission   (epic: EP-CLAIMS)
<!-- Phase 1 — Requirements | Optional artifact -->

A feature brief decomposes one epic into a coherent slice of user value, the **channels** it is
delivered through, and the **specs** that build it (one channel per spec; shared logic is
channel-agnostic). It sits **below** the epic — it reads `epics.md` and fans an epic into features +
specs. It does not replace the epic or the stories. Authored on every channel-bound feature; optional,
so gates never demand it.

Each `##` section below is **discipline-owned**. An unfilled section is an advisory flag; formal
acceptance happens at the Phase-1 gate, where each discipline signs its section (captured in
`.sdlc/state.yaml`).

---

## Outcome — owner: Bizreq · signs at gate

Cut the median time to submit a claim from 11 minutes to under 4, and stop duplicate submissions
from causing double payouts. Traces to N-01, FR-001, FR-002.

## Feature — owner: Product · signs at gate

A policyholder or an adjuster submits a claim end to end: enters the incident details, attaches
evidence, and receives a confirmation with a claim reference. The system rejects a repeat of an
already-submitted claim. Realizes FE-01 under EP-CLAIMS (story US-001).

## Channels × personas — owner: Product + Design · signs at gate

Two surfaces reach this feature, plus a shared decision core that no surface owns. The core is
channel-agnostic and uses `—`.

- web × Policyholder — submits a claim and attaches photos from a browser
- chat × Claims adjuster — files a claim on a customer's behalf during a phone call

## Per-channel experience — owner: Design · signs at gate

- web/Policyholder: open form → enter details → attach photos → review → confirm → on failure, keep
  the draft and show which field needs attention
- chat/Claims adjuster: describe incident → assistant asks for missing fields → adjuster confirms →
  on a duplicate, assistant shows the existing claim reference instead of creating a new one

## Data touchpoints — owner: Data · signs at gate

Reads the policy record (policy number, coverage dates) and writes one claim row plus attachment
metadata. Contains **PII**: claimant name, address, and photos of the incident. PII raises the risk
tier of every spec that touches the claim row.

## Spec decomposition — owner: Product · one channel per spec

The agent **proposes** the decomposition and tiers; a **named human confirms** them — it never assigns
risk. **One channel per spec.** Channel-agnostic rows — the shared "brain" the surfaces build on — are
first-class and use `—` for both channel and persona.

| Spec name          | Channel   | Persona   | Proposed risk         | Traces to |
|--------------------|-----------|-----------|-----------------------|-----------|
| duplicate-claim-check | —      | —         | HIGH                  | FR-001    |
| web-claim-form     | web       | Policyholder | MEDIUM             | US-001    |
| chat-claim-intake  | chat      | Claims adjuster | MEDIUM          | US-003    |

*Add one row per spec. Brains tend HIGH; in-pattern read-only surfaces can be MEDIUM. The chain closes
on each spec's existing `source:` field (FR → EP → feature-brief → US → spec).*
