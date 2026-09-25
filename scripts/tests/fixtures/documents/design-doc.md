# Design Document
<!-- Phase 2 — Design | Required artifact -->

## Overview

**Project:** Acme Claims Portal
**Version:** 1.0
**Date:** 2026-09-23
**Status:** Draft
**Authors:** Priya N.

---

## Architecture Overview

### System Context
<!-- REQUIRED: architecture-overview — one paragraph describing what this system is, what it does, and what it connects to, written for someone who hasn't read the requirements -->

> The Claims Portal accepts claim submissions from adjusters, rejects duplicates, and persists the system of record in PostgreSQL. It connects to the Notification Service via an event bus.

### Architecture Diagram
<!-- REQUIRED: architecture-diagram — ASCII or text diagram showing all major components, data flows between them, external system integration points, and user entry points -->

```
Client -> API Gateway -> Claims Service -> PostgreSQL
                              |
                              v
                       Notification Service
```

---

## Component Design

### Component: Claims Service

**Responsibility:** Accept and validate claim submissions
**Technology:** C# / ASP.NET Core
**Deployment unit:** Container

**Interfaces exposed:**
| Interface | Type | Consumers |
|-----------|------|-----------|
| POST /claims | REST | Web client |

**Dependencies:**
| Dependency | Type | Rationale |
|-----------|------|-----------|
| PostgreSQL | Direct | System of record |

**Key design decisions:**
- Unique constraint on claim_id enforces dedup at the database layer

---

*Repeat Component section for each major component.*

---

## Data Model

### Core Entities
<!-- REQUIRED: data-model — entity definitions with all fields, types, and descriptions, plus the relationships between entities -->

```
Entity: Claim
  id: uuid — system-generated primary key
  claimId: string — client-supplied idempotency key

Relationships:
  Claim belongs to Adjuster
```

### Data Flow

```
Adjuster submits -> Claims Service -> validate -> PostgreSQL
                                          |
                                    claim.submitted event
```

### Storage Design

| Store | Technology | What It Holds | Access Pattern |
|-------|-----------|--------------|---------------|
| Postgres | PostgreSQL 16 | Claims | Write-heavy |

---

## Sequence Diagrams — P0 Flows
<!-- REQUIRED: sequence-diagrams — one sequence diagram per P0 user story showing the full actor-to-storage flow -->

### Flow: US-014 Submit claim

```
Adjuster      ClaimsService     Postgres
  |                |                |
  |-- submit ---->|                |
  |                |-- insert ---->|
  |                |<-- ok --------|
  |<-- 201 -------|                |
```

*Add one sequence diagram per P0 user story.*

---

## Cross-Cutting Concerns

### Authentication & Authorization

**Model:** JWT
**Flow:** Azure AD issues a JWT, validated on every request
**Authorization rules:** RBAC — adjuster role required for submission

### Error Handling

**Strategy:** Result<T> pattern
**User-facing errors:** Sanitized messages; full detail logged
**Retry logic:** None — client retries are idempotent via claim_id

### Observability

**Logging:** Structured JSON
**Metrics:** RED method
**Tracing:** OpenTelemetry

---

## Architecture Decision Records

ADRs for decisions made in this phase are in `adrs/`:

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Use PostgreSQL for claim storage | Accepted |

*Full ADR content is in individual files under `adrs/`.*

---

## Design Review Notes

| Reviewer | Date | Concern | Resolution |
|----------|------|---------|-----------|
| Sam K. | 2026-09-23 | None | Approved |
