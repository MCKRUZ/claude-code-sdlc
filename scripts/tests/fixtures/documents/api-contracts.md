# API Contracts
<!-- Phase 2 — Design | Required artifact -->

## Overview

This document is the authoritative contract for all interfaces this system exposes or consumes. Phase 7 (Documentation) will diff implementation against this document — deviations must be documented.

**Version:** 1.0 (Design-time)
**Date:** 2026-09-23
**Base URL:** `https://api.acme.example/v1`
**Auth scheme:** Bearer JWT

---

## Endpoints

### `POST /claims`
<!-- REQUIRED: endpoint-definition — summary, auth requirement, linked user story, full request schema with all parameters, 200 response schema, and all error response cases -->

**Summary:** Submit a new claim
**Auth required:** Yes
**Linked user story:** US-014

**Request:**
```http
POST /claims
Authorization: Bearer <token>
Content-Type: application/json

{
  "claim_id": "string — client-supplied idempotency key",
  "amount": "number — claim amount in cents"
}
```

**Request parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|------|----------|-------------|
| `claim_id` | body | string | Yes | Client-supplied idempotency key |

**Response — 200 OK:**
```json
{
  "id": "uuid",
  "status": "submitted"
}
```

**Response — Error cases:**

| Status | Code | When | Body |
|--------|------|------|------|
| 409 | `DUPLICATE_CLAIM` | claim_id already exists | `{ "error": "duplicate claim" }` |

---

*Repeat the endpoint section for each API endpoint.*

---

## Data Schemas

### Schema: `Claim`

```typescript
interface Claim {
  id: string;           // UUID, system-generated
  claimId: string;       // client-supplied idempotency key
  createdAt: string;    // ISO 8601 UTC
  updatedAt: string;    // ISO 8601 UTC
}
```

---

## Events (if applicable)

### Event: `claim.submitted`

**Published by:** Claims Service
**Consumed by:** Notification Service
**Trigger:** A claim is successfully persisted

**Payload:**
```json
{
  "eventId": "uuid",
  "eventType": "claim.submitted",
  "occurredAt": "ISO 8601",
  "data": {
    "claimId": "string — the idempotency key"
  }
}
```

---

## Error Catalog
<!-- REQUIRED: error-catalog — complete table of all error codes this API returns, with HTTP status, description, and how consumers should handle each -->

| Code | HTTP Status | When | Body Shape |
|------|------------|------|-----------|
| `DUPLICATE_CLAIM` | 409 | claim_id already exists | `{ "error": "duplicate claim" }` |
| `VALIDATION_ERROR` | 400 | Request body/params invalid | `{ "error": "...", "fields": [...] }` |

*Add application-specific error codes above as they are identified in design.*

---

## External APIs Consumed

| API | Provider | Auth | Rate Limit | Timeout | Fallback |
|-----|---------|------|-----------|---------|---------|
| None | — | — | — | — | — |

---

## Contract Versioning

**Strategy:** URL versioning
**Deprecation policy:** 6-month notice before retiring a version
**Breaking change definition:** Any removed field or changed type

---

## Change Log

| Version | Date | Change | Breaking? |
|---------|------|--------|-----------|
| 1.0 | 2026-09-23 | Initial design | N/A |
