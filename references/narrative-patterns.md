# Narrative Patterns Reference

Guidelines for transforming technical SDLC artifacts into stakeholder-friendly narrative companions.

## Structure

Every `.narrative.md` follows this structure:

1. **Header** — Title, source artifact path, generation timestamp
2. **Executive Summary** — 2-3 sentences, the "read this if nothing else" section
3. **Detailed Narrative** — 500-1000 words of flowing prose covering the same ground
4. **Key Decisions** — Each decision explained in business terms
5. **Impact Assessment** — What this means for the project
6. **Footer** — Source reference and source-of-truth disclaimer

## Transformation Rules

### Tables → Prose with Context

**Source:**
| Risk | Severity | Mitigation |
|------|----------|------------|
| API rate limits | High | Implement caching layer |

**Narrative:**
"The most significant technical risk identified is API rate limiting, rated as high severity. The team plans to mitigate this by implementing a caching layer between the application and the external API, reducing direct calls by an estimated 80%."

### Metrics → Interpreted Meaning

**Source:** `Coverage: 87%`

**Narrative:** "Test coverage currently sits at 87%, comfortably exceeding the project's 80% minimum threshold. This provides a solid safety net for the upcoming refactoring work."

### Technical Terms → Business Language

| Technical | Business |
|-----------|----------|
| API endpoint | service connection point |
| Database migration | data structure update |
| Load balancer | traffic distributor |
| CI/CD pipeline | automated deployment process |
| Code coverage | automated test completeness |
| Technical debt | deferred maintenance |
| Microservice | independent service component |
| Rate limiting | usage throttling |

Preserve the technical term in parentheses when the audience may encounter it elsewhere: "The automated deployment process (CI/CD pipeline) runs on every code change."

### Bullet Lists → Flowing Narrative

**Source:**
- Support 1000 concurrent users
- Response time under 500ms
- 99.9% uptime

**Narrative:** "The system must handle 1000 users simultaneously while maintaining sub-500ms response times. The availability target of 99.9% uptime — roughly 8.7 hours of permissible downtime per year — aligns with industry standards for customer-facing applications."

## Per-Artifact-Type Guidance

### Problem Statement Narrative
- Lead with the business impact ("This costs the company X per month")
- Frame the problem from the user's perspective, not the engineer's
- Emphasize the "so what" — why solving this matters now

### Requirements Narrative
- Group by user value, not technical domain
- Translate acceptance criteria into user stories
- Highlight must-haves vs nice-to-haves in business terms

### Design Document Narrative
- Explain architectural choices as business trade-offs ("We chose X because it reduces operational cost by Y")
- Visualize data flow as user journeys, not system diagrams
- Frame security decisions as risk management

### Test Plan Narrative
- Focus on what confidence the testing provides ("After this phase, we'll know X works under Y conditions")
- Translate coverage metrics into risk language
- Highlight gaps as business risks, not technical gaps

## Tone Guidelines

- **Professional but approachable** — write for a smart person who isn't an engineer
- **Concrete over abstract** — "saves 3 hours per week" beats "improves efficiency"
- **Action-oriented** — tell the reader what they need to do or decide
- **Honest about uncertainty** — "we estimate" and "based on current data" are better than false precision
- **No AI-typical filler** — avoid "It's important to note", "Importantly", "In conclusion", "It's worth mentioning"

## Word Count Targets

| Section | Target |
|---------|--------|
| Executive Summary | 50-75 words |
| Detailed Narrative | 500-1000 words |
| Key Decisions | 100-200 words per decision |
| Impact Assessment | 100-200 words |
| Total | 750-1500 words |
