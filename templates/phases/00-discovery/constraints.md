# Constraints
<!-- Phase 0 — Discovery | Required artifact -->

## Constraint Register
<!-- REQUIRED: Minimum 3 constraints (C-01 through C-03+) each with type, rationale, impact on solution, and owner filled in -->

Every constraint limits the solution space. Document it with its rationale — an undocumented constraint is a surprise waiting to happen.

| # | Constraint | Type | Rationale | Impact on Solution | Owner |
|---|-----------|------|-----------|-------------------|-------|
| C-01 | [Description] | Technical / Business / Legal / Time / Resource | [Why this constraint exists] | [How it limits design choices] | [Who imposed it] |
| C-02 | | | | | |
| C-03 | | | | | |

**Constraint types:**
- **Technical** — platform, language, existing system, integration requirement
- **Business** — budget, timeline, process, organizational
- **Legal / Compliance** — regulatory, privacy, contractual
- **Resource** — team size, skills, availability

---

## Technical Constraints

### Must Use / Cannot Use

**Must use:**
- [Technology/platform/framework that is mandatory, and why]

**Cannot use:**
- [Technology/approach that is explicitly off the table, and why]

### Integration Requirements

| System | Integration Type | Constraint Details |
|--------|-----------------|-------------------|
| [System name] | [REST / event / file / DB / etc.] | [What the integration must or must not do] |

### Performance / Scale Envelope

| Dimension | Minimum Required | Notes |
|-----------|-----------------|-------|
| Throughput | [req/sec, events/sec, etc.] | |
| Latency | [p95 target] | |
| Availability | [uptime %] | |
| Data volume | [GB, rows, records] | |

---

## Business Constraints

### Timeline

| Milestone | Target Date | Flexibility | Rationale |
|-----------|------------|------------|-----------|
| [Milestone] | [Date] | Fixed / Flexible / Soft | [Why this date matters] |

### Budget

> [State budget constraint at the appropriate level of specificity. If confidential, note that it exists and who holds it.]

### Team / Resource

| Resource | Available | Notes |
|----------|-----------|-------|
| [Role] | [FTE / hours / people] | [Availability window, skill level] |

---

## Legal & Compliance Constraints

| Requirement | Regulation / Standard | How It Constrains the Solution |
|-------------|----------------------|-------------------------------|
| [Requirement] | [GDPR / SOC2 / HIPAA / etc.] | [Specific design impact] |

---

## Assumptions
<!-- REQUIRED: Minimum 2 assumptions (A-01 through A-02+) each with the risk if wrong and a validation plan -->

Assumptions are constraints we believe to be true but haven't verified. If an assumption turns out false, the constraint register must be updated.

| # | Assumption | Risk if Wrong | Validation Plan |
|---|-----------|--------------|----------------|
| A-01 | [What we're assuming] | [What breaks if this is false] | [How/when we'll verify] |
| A-02 | | | |

---

## Constraint Change Protocol

If a constraint changes during the project:
1. Update this document (version and date the change)
2. Assess impact on design decisions made under the old constraint
3. Flag to stakeholders if any previously approved decisions must be revisited
