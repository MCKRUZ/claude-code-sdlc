# Constraints
<!-- Phase 0 -- Discovery | Required artifact -->

## Constraint Register
<!-- REQUIRED: Minimum 3 constraints (C-01 through C-03+) each with type, rationale, impact on solution, and owner filled in -->

Every constraint limits the solution space. Document it with its rationale - an undocumented constraint is a surprise waiting to happen.

| # | Constraint | Type | Rationale | Impact on Solution | Owner |
|---|-----------|------|-----------|-------------------|-------|
| C-01 | Must run on Azure | Technical | Existing enterprise agreement | Rules out AWS-native services | Matt K. |
| C-02 | Launch by Q1 | Business | Contractual go-live date | Limits scope to must-haves | Priya N. |
| C-03 | SOC 2 Type II | Legal | Client compliance requirement | Requires audit logging from day one | Matt K. |

**Constraint types:**
- **Technical** - platform, language, existing system, integration requirement
- **Business** - budget, timeline, process, organizational
- **Legal / Compliance** - regulatory, privacy, contractual
- **Resource** - team size, skills, availability

---

## Technical Constraints

### Must Use / Cannot Use

**Must use:**
- PostgreSQL, since the on-call rotation already operates it

**Cannot use:**
- DynamoDB, since it can't give the consistency the duplicate-claim check needs

### Integration Requirements

| System | Integration Type | Constraint Details |
|--------|-----------------|-------------------|
| Legacy claims mainframe | REST (via adapter) | Must not require mainframe changes |

### Performance / Scale Envelope

| Dimension | Minimum Required | Notes |
|-----------|-----------------|-------|
| Throughput | 200 req/sec | Peak enrollment season |
| Latency | p95 under 300ms | Claim submission endpoint |
| Availability | 99.9% | Business hours weighted |
| Data volume | 5M rows/year | Claims table |

---

## Business Constraints

### Timeline

| Milestone | Target Date | Flexibility | Rationale |
|-----------|------------|------------|-----------|
| Go-live | 2027-01-15 | Fixed | Contractual date |

### Budget

> Confidential - held by Matt K.

### Team / Resource

| Resource | Available | Notes |
|----------|-----------|-------|
| Backend engineer | 2 FTE | Full engagement |

---

## Legal & Compliance Constraints

| Requirement | Regulation / Standard | How It Constrains the Solution |
|-------------|----------------------|-------------------------------|
| Audit trail | SOC 2 | Every state change logged with actor and timestamp |

---

## Assumptions
<!-- REQUIRED: Minimum 2 assumptions (A-01 through A-02+) each with the risk if wrong and a validation plan -->

Assumptions are constraints we believe to be true but haven't verified. If an assumption turns out false, the constraint register must be updated.

| # | Assumption | Risk if Wrong | Validation Plan |
|---|-----------|--------------|----------------|
| A-01 | Claim volume stays under 1M/year | Throughput targets would need revisiting | Confirm with Product by Phase 1 exit |
| A-02 | Legacy mainframe API stays stable | Integration adapter would need rework | Spike against the sandbox environment |

---

## Constraint Change Protocol

If a constraint changes during the project:
1. Update this document (version and date the change)
2. Assess impact on design decisions made under the old constraint
3. Flag to stakeholders if any previously approved decisions must be revisited
