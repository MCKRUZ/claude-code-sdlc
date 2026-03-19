# Design Document
<!-- Phase 2 — Design | Required artifact -->

## Overview

**Project:** [Project name]
**Version:** 1.0
**Date:** [YYYY-MM-DD]
**Status:** Draft / Under Review / Approved
**Authors:** [Names]

---

## Architecture Overview

### System Context
<!-- REQUIRED: architecture-overview — one paragraph describing what this system is, what it does, and what it connects to, written for someone who hasn't read the requirements -->

> One paragraph: what this system is, what it does, and what it connects to. Written for someone who hasn't read the requirements.

### Architecture Diagram
<!-- REQUIRED: architecture-diagram — ASCII or text diagram showing all major components, data flows between them, external system integration points, and user entry points -->

```
[ASCII or text architecture diagram showing:
 - Major components/services
 - Data flows between them
 - External systems and integration points
 - User entry points]

Example:
┌─────────────────────────────────────────────┐
│                  Client                      │
│  (Browser / CLI / Mobile)                    │
└───────────────────┬─────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────┐
│               API Gateway                    │
│  Auth | Rate Limit | Routing                 │
└──────────┬──────────────────┬───────────────┘
           │                  │
┌──────────▼────────┐  ┌──────▼──────────────┐
│   Service A        │  │   Service B          │
│  [Responsibility] │  │  [Responsibility]    │
└──────────┬────────┘  └──────┬──────────────┘
           │                  │
┌──────────▼──────────────────▼──────────────┐
│              Data Layer                     │
│  [Database type] | [Cache] | [Storage]      │
└────────────────────────────────────────────┘
```

---

## Component Design

### Component: [Name]

**Responsibility:** [One sentence — what this component owns]
**Technology:** [Language, framework, runtime]
**Deployment unit:** [Service / library / function / container]

**Interfaces exposed:**
| Interface | Type | Consumers |
|-----------|------|-----------|
| [API/event/file] | [REST/gRPC/Kafka/S3] | [Who calls it] |

**Dependencies:**
| Dependency | Type | Rationale |
|-----------|------|-----------|
| [Component/service] | [Direct / async / data] | [Why this dependency exists] |

**Key design decisions:**
- [Decision and rationale]

---

*Repeat Component section for each major component.*

---

## Data Model

### Core Entities
<!-- REQUIRED: data-model — entity definitions with all fields, types, and descriptions, plus the relationships between entities -->

```
[Entity relationship or type definitions]

Entity: [Name]
  id: [type] — [description]
  [field]: [type] — [description]

Relationships:
  [Entity A] has many [Entity B]
  [Entity A] belongs to [Entity B]
```

### Data Flow

```
[Trace data from user input to storage and back]

User action → [Component] → [Transform] → [Storage]
                                ↓
                          [Side effects: events, notifications]
```

### Storage Design

| Store | Technology | What It Holds | Access Pattern |
|-------|-----------|--------------|---------------|
| [Store name] | [Postgres / Redis / S3 / etc.] | [Data type] | [Read-heavy / write-heavy / mixed] |

---

## Sequence Diagrams — P0 Flows
<!-- REQUIRED: sequence-diagrams — one sequence diagram per P0 user story showing the full actor-to-storage flow -->

### Flow: [US-001 Story Title]

```
Actor         Component A      Component B       Storage
  │                │                │               │
  │── [action] ──►│                │               │
  │                │── [call] ────►│               │
  │                │                │── [query] ──►│
  │                │                │◄── [data] ───│
  │                │◄── [response] ─│               │
  │◄── [result] ──│                │               │
```

*Add one sequence diagram per P0 user story.*

---

## Cross-Cutting Concerns

### Authentication & Authorization

**Model:** [JWT / session / API key / OAuth2]
**Flow:** [How auth works end-to-end]
**Authorization rules:** [RBAC / ABAC / scope-based — key rules]

### Error Handling

**Strategy:** [How errors propagate — Result<T>, exceptions, error events]
**User-facing errors:** [What users see vs. what gets logged]
**Retry logic:** [Where retries happen and with what policy]

### Observability

**Logging:** [Structured / what gets logged at each level]
**Metrics:** [What gets measured — RED method: Rate, Errors, Duration]
**Tracing:** [Distributed trace approach if applicable]

---

## Architecture Decision Records

ADRs for decisions made in this phase are in `adrs/`:

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | [Title] | Accepted |

*Full ADR content is in individual files under `adrs/`.*

---

## Design Review Notes

| Reviewer | Date | Concern | Resolution |
|----------|------|---------|-----------|
| [Name] | [Date] | [What they flagged] | [How resolved] |
