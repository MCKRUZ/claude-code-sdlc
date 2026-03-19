# API Documentation
<!-- Phase 7 — Documentation | Required artifact -->

> This document reflects the API **as implemented**, not as designed. Diff against `api-contracts.md` from Phase 2 to identify deviations.

**Version:** [Semantic version]
**Last updated:** [YYYY-MM-DD]
**Base URL:** `[https://api.example.com/v1]`
**Auth:** [Bearer JWT / API Key / OAuth2 — brief description]

---

## Authentication
<!-- REQUIRED: authentication-section — auth scheme, how to obtain a token, token lifetime, and refresh procedure (or explicit "N/A — no auth") -->

**Scheme:** [JWT / API Key / OAuth2]

```http
Authorization: Bearer <token>
```

**Obtaining a token:** [Brief explanation or reference to auth endpoint]
**Token lifetime:** [Duration]
**Refresh:** [How to refresh if applicable]

---

## Endpoints

### `[METHOD] /[path]` — [Summary]
<!-- REQUIRED: endpoint-documentation — auth requirement, user story link, full request schema with parameters, 200 response example, and error table -->

**Auth required:** Yes / No
**User story:** [US-NNN]

**Request:**

```http
[METHOD] /[path]?[query-params]
Authorization: Bearer <token>
Content-Type: application/json

{
  "field": "string",
  "field2": 123
}
```

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|------|----------|-------------|
| `[param]` | path / query | string | Yes / No | [Description] |

**Response — 200:**

```json
{
  "field": "value",
  "items": [
    { "id": "uuid", "name": "string" }
  ]
}
```

**Errors:**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Request is malformed — see `errors` array |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 404 | `NOT_FOUND` | Resource does not exist |
| 500 | `INTERNAL_ERROR` | Contact support with request ID |

**Example:**

```bash
curl -X [METHOD] \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}' \
  "[BASE_URL]/[path]"
```

---

*Repeat endpoint section for each endpoint.*

---

## Error Catalog
<!-- REQUIRED: error-catalog — every error code the API returns listed with HTTP status, description, and resolution guidance -->

All errors follow this format:
```json
{
  "error": "MACHINE_READABLE_CODE",
  "message": "Human readable description",
  "requestId": "uuid-for-support",
  "details": { }
}
```

| Code | HTTP Status | Description | Resolution |
|------|------------|-------------|-----------|
| `VALIDATION_ERROR` | 400 | One or more fields failed validation | Check `details.fields` for specifics |
| `UNAUTHORIZED` | 401 | Auth token missing, expired, or invalid | Re-authenticate and retry |
| `FORBIDDEN` | 403 | Authenticated but lacks required permission | Contact admin to request access |
| `NOT_FOUND` | 404 | Requested resource doesn't exist | Verify the resource ID |
| `RATE_LIMITED` | 429 | Too many requests | Wait `Retry-After` seconds |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Retry once; if persists, file support ticket |

---

## Changelog (from Phase 2 API Contracts)

| Change | Type | Endpoint/Schema | Notes |
|--------|------|----------------|-------|
| [Change description] | Breaking / Non-breaking / Addition | [Endpoint] | [Why it changed] |
