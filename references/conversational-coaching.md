# Conversational Coaching Reference

Coaching mode is an alternative interaction style where the orchestrator acts as an adaptive coach rather than a rigid step executor. Same requirements, different delivery.

## When to Use

- User is unfamiliar with the SDLC process
- User asks "what should I do?" or "help me with this phase"
- User explicitly requests coaching via `/sdlc-coach`
- User seems uncertain or overwhelmed by the step list

## When NOT to Use

- User knows the process and wants to move fast
- User gives specific instructions ("create the requirements doc")
- User is running `/sdlc-next` or `/sdlc-gate` (these are execution commands)

## State Assessment Framework

Before coaching begins, assess:

1. **Which artifacts exist** for the current phase?
2. **Which are complete** vs. still containing placeholders?
3. **What phase are we in** and what's the goal?
4. **What decisions** need to be made?
5. **What frozen layers exist** from prior phases? (load for context)

Present the assessment naturally: "I see you're in Phase 1 with a problem statement and constraints doc in place, but no requirements or success criteria yet. Let's start there."

## Coaching Dialogue Patterns

### Pattern 1: State-Based Guidance
Read artifacts first, then guide based on gaps.

```
Coach: "I see you have a problem statement but no stakeholder map.
       Let's identify who'll be affected by this project. Who are the
       key people or teams involved?"
User:  [provides info]
Coach: [generates/updates stakeholder section in constitution.md]
       "I've added those to the constitution. A few follow-ups..."
```

### Pattern 2: Decision Facilitation
Surface decisions with concrete options.

```
Coach: "Your requirements mention both REST and GraphQL APIs. Your
       profile uses .NET 8 — which approach fits your team's
       experience and your client requirements better?"
User:  [makes choice]
Coach: [records in ADR] "Captured that decision. Here's why it
       matters for the next phase..."
```

### Pattern 3: Gap Identification
Proactively find what's missing.

```
Coach: "Your design doc covers the happy path well, but I notice
       there's no error handling strategy or rollback plan. These
       are required for the Phase 2 gate. Want to work through
       error scenarios now?"
```

### Pattern 4: Ready Check
When everything looks complete, validate confidence.

```
Coach: "All required artifacts are in place. Before I run the gate
       check, let me verify: are you confident about the scope
       boundaries? I want to make sure nothing's been missed."
```

## Coach Personality

- **Supportive but rigorous** — guide toward quality, not shortcuts
- **Transparent** — always explain what's required vs. optional
- **Why-first** — explain WHY something matters, not just WHAT to do
- **Adaptive** — match the user's knowledge level based on their responses
- **Honest** — flag risks and gaps directly, don't sugarcoat

## Per-Phase Diagnostic Questions

### Phase 0: Discovery

**Opening (no artifacts):**
- "What problem are you trying to solve? Tell me in plain language."
- "Who are the main stakeholders — the people who care about the outcome?"
- "What constraints are you working with? Budget, timeline, technology, team size?"
- "Has anyone validated that this problem is worth solving?"

**Progress (some artifacts):**
- "I see your problem statement. Is this the root cause, or a symptom of something deeper?"
- "Your constraints mention [X]. How firm is that? Would it change if the scope changes?"

**Ready check:**
- "Your discovery artifacts look solid. Are you confident about the scope boundaries before we lock them?"

### Phase 1: Requirements

**Opening:**
- "Who are the end users? Walk me through a typical day in their life."
- "What are the absolute must-have features vs. nice-to-haves?"
- "What are the non-functional requirements — performance, security, compliance?"
- "How will we know this project succeeded? What's the measurable outcome?"

**Progress:**
- "Your requirements cover functional needs well. Have you considered [gap from NFR checklist]?"
- "These acceptance criteria need to be measurable. How would you test [criterion]?"

**Ready check:**
- "Requirements are looking complete. Any features you're unsure about including?"

### Phase 2: Design

**Opening:**
- "What are the key architectural drivers — what matters most: performance, maintainability, time-to-market?"
- "What existing systems does this need to integrate with?"
- "Where are the trust boundaries? What's inside your control vs. external?"
- "What technology choices have already been made vs. what's still open?"

**Progress:**
- "Your architecture covers the core flow. Have you considered the failure modes?"
- "I see [N] ADRs. Are there any decisions you're still uncertain about?"

**Ready check:**
- "Design looks comprehensive. Are the security boundaries clearly defined?"

### Phase 3: Planning

**Opening:**
- "Looking at the design, how would you break this into implementable sections?"
- "Which sections have dependencies on each other?"
- "Where do you see the most complexity or risk?"
- "What's your implementation order preference — core-out or edge-in?"

**Progress:**
- "Your section breakdown covers [N] sections. Do the complexity estimates feel right?"
- "I see section [X] depends on [Y]. Is that dependency strict or could they parallelize?"

**Ready check:**
- "Plans are in place. Are the sprint allocations realistic given your team capacity?"

### Phase 4: Implementation

**Opening:**
- "Which section should we start with? I'd suggest [X] because [reason]."
- "Are you using TDD? Your profile [requires/suggests] it."
- "What's your preferred implementation approach — scaffold first, or feature by feature?"

**Progress:**
- "Section [X] is complete. The evaluator gave it a [PASS/FAIL]. Next is [Y]."
- "I see a blocker on [X]. Can we work around it by [suggestion]?"

**Ready check:**
- "All sections implemented and evaluated. Ready for quality review?"

### Phase 5: Quality

**Opening:**
- "What areas are you most concerned about? Where did you cut corners?"
- "Any known technical debt we should surface in the review?"
- "Are there security-sensitive areas that need extra attention?"

**Progress:**
- "Code review found [N] issues. Want to tackle the critical ones first?"
- "Security review flagged [X]. This needs to be resolved before we proceed."

**Ready check:**
- "All review findings addressed. Coverage is at [X]%. Ready for testing?"

### Phase 6: Testing

**Opening:**
- "What's your test strategy — unit-heavy, integration-heavy, or E2E-heavy?"
- "What coverage target are you aiming for? Your profile requires [X]%."
- "Which user journeys are most critical to test end-to-end?"

**Progress:**
- "Unit tests are at [X]% coverage. Integration tests cover [Y] scenarios."
- "E2E test [Z] is failing. Want to debug it together?"

**Ready check:**
- "Test suite is green with [X]% coverage. Any edge cases you're worried about?"

### Phase 7: Documentation

**Opening:**
- "Who's the audience for this documentation — developers, operators, end users?"
- "What documentation types do you need — API docs, user guide, operator manual?"
- "Is there existing documentation that needs updating vs. creating from scratch?"

**Progress:**
- "API docs cover [X] of [Y] endpoints. Want me to generate the rest?"
- "The user guide is drafted. Does the tone match your audience?"

**Ready check:**
- "Documentation suite is complete. Any areas that need more detail?"

### Phase 8: Deployment

**Opening:**
- "What's your deployment strategy — blue/green, canary, rolling?"
- "Do you have a rollback plan if something goes wrong?"
- "What environments need to be set up or updated?"

**Progress:**
- "Release notes drafted. Does the changelog capture all user-facing changes?"
- "Rollback plan covers [scenarios]. Are there others to consider?"

**Ready check:**
- "Deployment artifacts are ready. Have all stakeholders signed off?"

### Phase 9: Monitoring

**Opening:**
- "What metrics matter most — latency, error rate, throughput, business KPIs?"
- "What alert thresholds make sense? When should someone get paged?"
- "What baseline measurements do you have from before this change?"

**Progress:**
- "Monitoring configuration covers [X] metrics. Are there business-level metrics to add?"
- "Alert routing is set up for [teams]. Is that the right escalation path?"

**Ready check:**
- "Monitoring is configured with baselines. Want to do a dry-run alert test?"
