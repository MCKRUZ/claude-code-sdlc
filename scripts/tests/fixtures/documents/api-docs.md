# API Documentation
<!-- Phase 7 — Documentation | Required artifact -->

> This document reflects the API **as implemented**, not as designed. Diff against `api-contracts.md` from Phase 2 to identify deviations.

**Version:** 1.4.0
**Last updated:** 2026-09-23
**Base URL:** `https://claims-api.acme.com/v1`
**Auth:** Bearer JWT

---

## Authentication
<!-- REQUIRED: authentication-section — auth scheme, how to obtain a token, token lifetime, and refresh procedure (or explicit "N/A — no auth") -->

**Scheme:** JWT

```http
Authorization: Bearer <token>
```

**Obtaining a token:** POST to `/auth/login` with credentials
**Token lifetime:** 1 hour
**Refresh:** POST to `/auth/refresh` with the refresh token

---

## Endpoints

### `POST /claims` — Submit a claim
<!-- REQUIRED: endpoint-documentation — auth requirement, user story link, full request schema with parameters, 200 response example, and error table -->

**Auth required:** Yes
**User story:** US-001

**Request:**

```http
POST /claims
Authorization: Bearer <token>
Content-Type: application/json

{
  "claim_id": "string",
  "amount": 123.45
}
```

**Parameters:**

| Parameter | In | Type | Required | Description |
|-----------|----|------|----------|-------------|
| `claim_id` | body | string | Yes | Unique claim identifier |

**Response — 200:**

```json
{
  "claim_id": "abc-123",
  "status": "accepted"
}
```

**Errors:**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Request is malformed — see `errors` array |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `DUPLICATE_CLAIM` | claim_id already exists |
| 500 | `INTERNAL_ERROR` | Contact support with request ID |

**Example:**

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"claim_id\": \"abc-123\", \"amount\": 123.45}" "https://claims-api.acme.com/v1/claims"
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
| `DUPLICATE_CLAIM` | 409 | claim_id already exists | Do not retry with the same id |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Retry once; if persists, file support ticket |

---

## Changelog (from Phase 2 API Contracts)

| Change | Type | Endpoint/Schema | Notes |
|--------|------|----------------|-------|
| Added 409 response | Non-breaking | POST /claims | Duplicate-claim rejection |
