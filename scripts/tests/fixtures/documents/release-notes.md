# Release Notes
<!-- Phase 8 — Deployment | Required artifact -->

## v1.4.0 — 2026-09-23

### Summary
<!-- REQUIRED: release-summary — 2-3 sentences for non-technical stakeholders describing what this release delivers and what users can do that they couldn't before -->

> This release adds duplicate-claim rejection so adjusters can no longer accidentally double-pay a claim. Submitting the same claim twice now returns a clear error instead of silently creating a second payout.

---

### New Features

- **Duplicate claim rejection:** Submitting a claim_id that already exists now returns a 409 instead of creating a second row.

---

### Bug Fixes

- **Claim date validation:** Claims with a future submission date are now rejected instead of silently accepted.

---

### Breaking Changes
<!-- REQUIRED: breaking-changes — explicitly state "None" if there are no breaking changes, or list each change with what consumers must do to adapt -->

> ⚠ If there are no breaking changes, write "None" — don't omit this section.

None.

---

### Known Limitations

Things that don't work yet or have caveats in this release:

- **Bulk import:** Bulk claim import does not yet check for duplicates within the same batch.

---

### Upgrade Path

> If this is the first release, write "N/A — initial release."

**From version 1.3.0:**

1. Run the claim_id uniqueness backfill migration
2. Redeploy the claims API

**Database migrations:** Automatic
**Configuration changes required:** None

---

### Dependency Updates

| Package | Previous | New | Notes |
|---------|---------|-----|-------|
| Npgsql | 8.0.1 | 8.0.3 | Security fix |

---

### Checksums

| Artifact | SHA256 |
|----------|--------|
| claims-api-1.4.0.tar.gz | 9f2c...ab31 |
