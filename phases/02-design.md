# Phase 2: Design

## Purpose
Create a software architecture that satisfies the requirements, with explicit decisions recorded as ADRs, API contracts defined, and enough detail that implementation can proceed without architectural ambiguity. Stakeholders should be able to read the design and verify it solves the right problem the right way.

## Entry Criteria
- Phase 1 exit gate passed and `phase2-handoff.md` reviewed
- Architectural implications from NFRs understood

## Workflow

### Step 0: HITL Gate — Resolve Architectural Questions

> **HITL GATE:** Read `phase2-handoff.md`. Extract every AQ-NN (Architectural Question) listed in "What Design Must Address". For each AQ, present 2–3 concrete options with trade-offs to the human using `AskUserQuestion`. Collect human decisions for ALL AQs **before writing any artifact**. These human decisions become the ADRs — Claude encodes them, not invents them.

Do not proceed to Step 1 until all AQs are resolved.

### Step 1: Spec Synthesis

Run the spec synthesis script to combine Phase 0–1 artifacts into a single spec file that `/deep-plan` can consume:

```bash
uv run scripts/synthesize_spec.py --state .sdlc/state.yaml --output planning/spec.md
```

This reads `requirements.md`, `non-functional-requirements.md`, `epics.md`, `constraints.md`, and `phase2-handoff.md` and produces `planning/spec.md`.

### Step 2: Launch /deep-plan (Steps 1–15)

Invoke `/deep-plan` with the synthesized spec. This runs /deep-plan's full research-through-review workflow:

```
/deep-plan @planning/spec.md
```

**What /deep-plan does in this phase:**
1. **Research (steps 6–7):** Analyzes the existing codebase and searches the web for best practices relevant to the architecture. Produces `planning/claude-research.md`.
2. **Interview (steps 8–9):** Conducts a structured Q&A with the human to clarify technical decisions, constraints, and trade-offs. The AQ-NN answers from Step 0 above should be provided as context. Produces `planning/claude-interview.md`.
3. **Spec synthesis (step 10):** Combines all inputs into `planning/claude-spec.md`.
4. **Plan generation (step 11):** Writes the prose architecture blueprint — `planning/claude-plan.md`. This is the primary design artifact. It contains component architecture, data models, API designs, and cross-cutting concerns as prose (not full code — only type signatures, directory trees, and configuration keys).
5. **External review (step 13):** If external LLMs are configured (Gemini, OpenAI), runs a multi-LLM review of the plan. Otherwise, falls back to an Opus subagent review. Produces `planning/reviews/iteration-1-*.md`.
6. **Feedback integration (steps 14–15):** Integrates review feedback into the plan. The human reviews and approves `planning/claude-plan.md` before proceeding.

**Stop /deep-plan after step 15.** The remaining steps (TDD planning, section splitting) belong to Phase 3.

### Step 3: Map /deep-plan Outputs to SDLC Artifacts

Run the artifact mapping script to transform /deep-plan outputs into SDLC locations:

```bash
uv run scripts/map_deep_plan_artifacts.py --state .sdlc/state.yaml --phase 2 --planning-dir planning/
```

This produces:
- `.sdlc/artifacts/02-design/design-doc.md` — skeleton extracted from `claude-plan.md`
- `.sdlc/artifacts/02-design/api-contracts.md` — skeleton extracted from `claude-plan.md`
- `.sdlc/artifacts/02-design/phase3-handoff.md` — section boundaries from the plan
- `.sdlc/artifacts/02-design/research-notes.md` — copy of `claude-research.md`
- `.sdlc/artifacts/02-design/integration-notes.md` — copy of `claude-integration-notes.md`
- `.sdlc/artifacts/02-design/external-reviews/` — copy of review files
- `.sdlc/artifacts/02-design/deep-plan-checkpoint.yaml` — session state for Phase 3 resumption

### Step 4: Architecture Decision Records

Extract architectural decisions from `planning/claude-plan.md` and the human's AQ-NN answers from Step 0. For each significant decision:

1. Present the decision to the human with options (if not already decided in Step 0)
2. Write an ADR using the template at `templates/phases/02-design/adrs/ADR-template.md`
3. Number sequentially: ADR-001, ADR-002, etc.
4. Store in `adrs/ADR-NNN.md`
5. Register each ADR in `adr-registry.md`

**What warrants an ADR:** Technology selection, structural patterns, integration approach, data storage decisions, security model, API design choices. If the decision would cause significant rework if reversed, it needs an ADR.

### Step 5: Complete Design Artifacts

Review and complete the generated skeletons:

- **`design-doc.md`**: Fill any `<!-- FILL: -->` markers. Ensure it covers architecture overview, component descriptions, key data flows, cross-cutting concerns, and technology choices.
- **`api-contracts.md`**: Fill any gaps. Ensure it covers all endpoints, request/response schemas, authentication, error codes, and versioning strategy.

These skeletons are starting points — the human should review and enrich them.

### Step 6: Data Model
Define the data structures:
- Entities and their relationships
- Key fields and types
- Persistence strategy

### Step 7: Design-Level Threat Review

Threat modelling belongs here, not only in Phase 3. Phase 3 wires the build-time security gates
*from this review* — without it, that step has no input and the guarded paths get chosen by
whoever is wiring them, on the day, from memory. Phase 3 keeps its own pass: a confirmation that
the gates this review called for actually got wired.

Work from the components, data flows and trust boundaries just defined — a threat review before
there is a design to review is theatre.

For each trust boundary the design crosses:
- **What crosses it** — data, credentials, or control. Name the sensitivity: PII, payment,
  auth material, client-confidential.
- **What could go wrong** — spoofing, tampering, disclosure, denial, elevation. One line each,
  concrete to this system, not a checklist recital.
- **The mitigation** — the design change or control that addresses it, and where it lives.
- **The guarded path** — the file patterns that, once built, must trigger the security workflow
  on any PR touching them. This column is the handoff to Phase 3.

Record the result in `threat-model.md`. Its mitigation map is what Phase 3 registers as guarded
paths, and what the Build loop's HIGH-risk tier is calibrated against.

> **HITL GATE:** Present the trust boundaries and the proposed guarded paths to the human using
> the `AskUserQuestion` tool. Which paths are guarded is a risk decision with a named owner — the
> agent proposes the map, a human accepts it. An unreviewed guarded-path list means the security
> gate protects whatever Claude guessed was sensitive.

### Step 8: Generate Architecture Diagrams

Generate visual architecture diagrams using the `/visual-explainer` skill (or equivalent HTML diagram generation). Replace all ASCII art in `design-doc.md` with proper rendered diagrams. Output a self-contained HTML file at `.sdlc/reports/architecture-diagrams.html`.

**Required diagrams:**
1. **Architecture Layer Diagram** — All system layers with components, color-coded by layer, showing trust boundaries to external systems.
2. **Core Loop / Game Loop / Request Flow** — The primary data/control flow as a Mermaid flowchart showing the circular or sequential path through the system.
3. **Data Flow** — Step-by-step resolution of the primary use case, from input through processing to output. Use Mermaid with color-coded nodes by layer.
4. **Implementation Section Dependencies** — A DAG showing the implementation sections from `phase3-handoff.md` with their dependency relationships and parallelization opportunities.
5. **Trust Boundary / Security Diagram** — Security model showing trusted process boundary, external systems, and data flow across trust boundaries.

**Rendering approach:**
- Use **Mermaid.js** (CDN) for flowcharts, data flows, dependency graphs, and security diagrams. Use `theme: 'base'` with `themeVariables` matching the project's visual style.
- Use **CSS Grid cards** for architecture layer diagrams where card content (component lists, descriptions) matters more than connections.
- Include **zoom controls** (+/−/reset) on every Mermaid diagram container.
- Include a **sticky sidebar TOC** for navigation between diagrams.
- Match the visual style to the SDLC phase reports (dark theme: `#0f1117` background, `#6c8ef7` accent blue, `#4ade80` green).
- The HTML file must be **self-contained** — no external assets except CDN links for fonts and Mermaid.

**If `/visual-explainer` skill is available:** Invoke it with a prompt describing all 5 diagrams, the project's architecture details from `design-doc.md`, and the desired output path. The skill handles aesthetic choices, Mermaid theming, and responsive layout.

**If not available:** Generate the HTML directly using the Mermaid CDN patterns. The diagrams must still be proper rendered flowcharts — never fall back to ASCII art in the final artifacts.

### Step 9: Phase Handoff
Review and complete `phase3-handoff.md` (generated in Step 3). Ensure it contains:
- Design summary and key decisions
- Section breakdown for implementation (logical units of work)
- Recommended implementation order with dependency rationale
- Interface contracts between sections
- Open technical questions for implementation phase
- Risks identified during design

### Step 10: Generate Phase Report
Run `/sdlc-gate` to validate exit criteria and automatically generate the phase HTML report at `.sdlc/reports/phase02-report.html`. Share this report with stakeholders for review before requesting sign-off. The report includes artifact inventory and gate status.

## Artifact Specifications

### `design-doc.md` (REQUIRED)
Must contain ALL of:
- **Architecture overview** — component diagram and responsibilities
- **Component descriptions** — what each does and what it owns
- **Key data flows** — how data moves through the system for primary use cases
- **Cross-cutting concerns** — error handling, logging, security, configuration
- **Technology choices** — with rationale (reference the ADRs)

### `api-contracts.md` (REQUIRED)
Must contain ALL of:
- All endpoints / interfaces
- Request and response schemas (table or code block)
- Authentication requirements per endpoint
- Error response format and error codes
- Versioning strategy

### `adrs/` directory (REQUIRED — minimum one ADR)
Each ADR must contain:
- **Context** — the situation that forced a decision
- **Decision** — what was chosen
- **Alternatives considered** — what was rejected and why
- **Consequences** — positive and negative outcomes of the decision

Use the template at `templates/phases/02-design/adrs/ADR-template.md`. Name files `ADR-NNN.md` with sequential three-digit numbering.

### `adr-registry.md` (REQUIRED)
Must contain ALL of:
- **Active ADRs table** — ADR number, title, status, date, and what it decides
- **Superseded ADRs table** — historical record of replaced decisions
- **Proposed ADRs table** — decisions under review

Use the template at `templates/phases/02-design/adr-registry.md`. Every ADR in the `adrs/` directory must have a corresponding entry in this registry.

### `phase3-handoff.md` (REQUIRED)
Must contain ALL of:
- Design summary and key decisions
- Section breakdown for implementation (logical units of work)
- Recommended implementation order with dependency rationale
- Interface contracts between sections (what each section needs from others)
- Open technical questions for implementation phase
- Risks identified during design

### `architecture-diagrams.html` (RECOMMENDED)
A self-contained HTML page with rendered architecture diagrams (Mermaid + CSS). Must include:
- Architecture layer diagram (components by layer)
- Primary flow diagram (core loop or request path)
- Data flow diagram (step-by-step processing)
- Implementation section dependency graph (DAG)
- Trust boundary / security model diagram

Generated via `/visual-explainer` skill or equivalent HTML generation. Stored at `.sdlc/reports/architecture-diagrams.html`. Share with stakeholders as a visual companion to `design-doc.md`.

### `threat-model.md` (RECOMMENDED — required for any system handling auth, payments or PII)

The output of Step 7, and the input Phase 3 wires its security gates from.

Must contain ALL of:
- **Trust boundaries** — every boundary the design crosses, and what crosses it
- **Threats per boundary** — concrete to this system; a recital of STRIDE with no system in it is
  not a threat model
- **Mitigations** — the design change or control for each, and where it lives
- **The guarded-path map** — file patterns that must trigger the security workflow once built.
  This is the handoff to Phase 3, which registers them and confirms they fire.
- **Accepted risks** — anything knowingly not mitigated, with the named human who accepted it

> Not yet a hard artifact gate: promoting it would newly block any engagement already past Phase 2,
> so it is raised to the approver at sign-off instead. Promote it to `required` on a major version
> with a migration note.

### Optional Artifacts (from /deep-plan)
- `research-notes.md` — codebase and web research findings
- `integration-notes.md` — cross-system integration concerns
- `external-reviews/` — multi-LLM review outputs (Gemini, OpenAI, Opus)
- `deep-plan-checkpoint.yaml` — session state for Phase 3 resumption

## Exit Criteria
- [ ] `design-doc.md` covers all major components and cross-cutting concerns
- [ ] At least one ADR exists for each significant technology/pattern decision
- [ ] `adr-registry.md` lists all ADRs with correct statuses
- [ ] `api-contracts.md` covers all system interfaces
- [ ] Design reviewed and approved by stakeholder (manual gate)
- [ ] Implementation sections are clearly defined in the handoff
- [ ] *(recommended)* Architecture diagrams rendered as HTML, not ASCII art, at
      `.sdlc/reports/architecture-diagrams.html` — see the RECOMMENDED artifact spec above.
      Raised to the approver at sign-off; not a hard block.
- [ ] *(only if `/deep-plan` was used)* `deep-plan-checkpoint.yaml` exists — Phase 3 reads it as
      the source of the walking skeleton's slices. A Phase 2 done without `/deep-plan` has no
      checkpoint to produce, so this is conditional rather than required.

## HTML Report
The phase report is generated automatically when you run `/sdlc-gate` or `/sdlc-next`. It is written to `.sdlc/reports/phase02-report.html` and is fully self-contained — share it with stakeholders as the review artifact for the manual sign-off gate.

To regenerate at any time: `/sdlc-phase-report`

## Guidance
- A good design doc lets a new developer understand the system without asking questions.
- ADRs are most valuable for decisions that seem obvious — document WHY, not just WHAT.
- API contracts should be defined before implementation begins, not inferred from it.
- Over-specified design is better than under-specified — wrong designs get caught in review.
- `/deep-plan`'s external review (multi-LLM) adds independent architecture critique — review the findings in `external-reviews/` before finalizing.
- The `planning/` directory is preserved alongside `.sdlc/artifacts/` for /deep-plan's internal session continuity and any future re-runs.

## Coaching Prompts

When operating in coaching mode (`/sdlc-coach`) for this phase:

### Opening (no artifacts yet)
- "What are the key architectural drivers — what matters most: performance, maintainability, time-to-market?"
- "What existing systems does this need to integrate with?"
- "Where are the trust boundaries? What's inside your control vs. external?"
- "What technology choices have already been made vs. what's still open?"

### Progress Check (some artifacts exist)
- "Your architecture covers the core flow. Have you considered the failure modes?"
- "I see [N] ADRs. Are there any decisions you're still uncertain about?"

### Ready Check (all artifacts present)
- "Design looks comprehensive. Are the security boundaries clearly defined?"
- "Any areas where the design feels over-engineered or under-specified?"
