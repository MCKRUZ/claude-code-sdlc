# Software Design Document

## Project
- **Name:** [Project Name]
- **Phase:** 2 — Design
- **Date:** [Date]
- **Author:** [Author]

## 1. Overview
[High-level description of the system being designed. What does it do? Who uses it?]

## 2. Architecture

### 2.1 System Context
[How the system fits into the broader ecosystem. External systems, users, integrations.]

### 2.2 Component Architecture
[Major components/services and their responsibilities. Include a diagram description.]

### 2.3 Data Model
[Key entities, relationships, storage strategy.]

### 2.4 API Design
[External and internal API contracts. Endpoints, request/response schemas.]

## 3. Security Architecture

### 3.1 Authentication
[How users authenticate. OAuth, JWT, session-based, etc.]

### 3.2 Authorization
[How permissions are enforced. RBAC, ABAC, policy engine, etc.]

### 3.3 Trust Boundaries
[Where trust boundaries exist. What is trusted vs. untrusted input.]

### 3.4 Data Protection
[Encryption in transit and at rest. Key management. PII handling.]

## 4. Infrastructure

### 4.1 Deployment Architecture
[Cloud services, containers, serverless, etc.]

### 4.2 Scaling Strategy
[Horizontal/vertical scaling. Auto-scaling triggers.]

### 4.3 Monitoring & Observability
[Logging, metrics, tracing, alerting strategy.]

## 5. Cross-Cutting Concerns

### 5.1 Error Handling
[Global error handling strategy. User-facing vs. internal errors.]

### 5.2 Logging
[Structured logging approach. What to log, retention policy.]

### 5.3 Configuration
[How configuration is managed. Environment variables, key vault, etc.]

## 6. Architectural Decision Records

### ADR-001: [Decision Title]
- **Status:** Proposed
- **Context:** [Why this decision needed to be made]
- **Decision:** [What was decided]
- **Consequences:** [Trade-offs, risks, follow-up actions]

## 7. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| [Risk] | High/Medium/Low | High/Medium/Low | [Strategy] |
