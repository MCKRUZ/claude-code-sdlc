# API Contracts
<!-- Phase 2 — Design | Required artifact -->

## Overview

This document is the authoritative contract for all interfaces this system exposes or consumes. Phase 7 (Documentation) will diff implementation against this document — deviations must be documented.

**Version:** 1.0 (Design-time)
**Date:** [YYYY-MM-DD]
**Base URL:** `[https://api.example.com/v1]`
**Auth scheme:** [Bearer JWT / API Key / OAuth2 / None]

---

## Endpoints

### `[METHOD] /[path]`
<!-- REQUIRED: endpoint-definition — summary, auth requirement, linked user story, full request schema with all parameters, 200 response schema, and all error response cases -->

**Summary:** [One-line description]
**Auth required:** Yes / No
**Linked user story:** [US-NNN]

**Request:**
```http
[METHOD] /[path]
Authorization: Bearer <token>
Content-Type: application/json

{
  "field": "type — description",
  "field2": "type — description"
}
```

**Request parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|------|----------|-------------|
| `[param]` | path / query / header / body | string / int / bool | Yes / No | [Description] |

**Response — 200 OK:**
```json
{
  "field": "type — description",
  "nested": {
    "field": "type"
  }
}
```

**Response — Error cases:**

| Status | Code | When | Body |
|--------|------|------|------|
| 400 | `VALIDATION_ERROR` | Request body invalid | `{ "error": "...", "fields": [...] }` |
| 401 | `UNAUTHORIZED` | Missing/invalid token | `{ "error": "..." }` |
| 403 | `FORBIDDEN` | Authenticated but lacks permission | `{ "error": "..." }` |
| 404 | `NOT_FOUND` | Resource doesn't exist | `{ "error": "..." }` |
| 500 | `INTERNAL_ERROR` | Unhandled server error | `{ "error": "Internal server error" }` |

---

*Repeat the endpoint section for each API endpoint.*

---

## Data Schemas

### Schema: `[EntityName]`

```typescript
interface [EntityName] {
  id: string;           // UUID, system-generated
  [field]: [type];      // [description]
  createdAt: string;    // ISO 8601 UTC
  updatedAt: string;    // ISO 8601 UTC
}
```

---

## Events (if applicable)

### Event: `[event.name]`

**Published by:** [Component]
**Consumed by:** [Component(s)]
**Trigger:** [When this event fires]

**Payload:**
```json
{
  "eventId": "uuid",
  "eventType": "event.name",
  "occurredAt": "ISO 8601",
  "data": {
    "field": "type — description"
  }
}
```

---

## Error Catalog
<!-- REQUIRED: error-catalog — complete table of all error codes this API returns, with HTTP status, description, and how consumers should handle each -->

| Code | HTTP Status | When | Body Shape |
|------|------------|------|-----------|
| `VALIDATION_ERROR` | 400 | Request body/params invalid | `{ "error": "...", "fields": [...] }` |
| `UNAUTHORIZED` | 401 | Missing/invalid token | `{ "error": "..." }` |
| `FORBIDDEN` | 403 | Authenticated but lacks permission | `{ "error": "..." }` |
| `NOT_FOUND` | 404 | Resource doesn't exist | `{ "error": "..." }` |
| `INTERNAL_ERROR` | 500 | Unhandled server error | `{ "error": "Internal server error" }` |

*Add application-specific error codes above as they are identified in design.*

---

## External APIs Consumed

| API | Provider | Auth | Rate Limit | Timeout | Fallback |
|-----|---------|------|-----------|---------|---------|
| [API name] | [Provider] | [Auth method] | [Limit] | [ms] | [What happens if unavailable] |

---

## Contract Versioning

**Strategy:** [URL versioning / header versioning / content negotiation]
**Deprecation policy:** [How old versions are retired]
**Breaking change definition:** [What constitutes a breaking change for this API]

---

## Change Log

| Version | Date | Change | Breaking? |
|---------|------|--------|-----------|
| 1.0 | [Date] | Initial design | N/A |
