# Phase 1 API contracts

Later contracts: [Phase 7 reports, expenses and private attachments](phase-7-api.md), with [metric definitions and date bases](phase-7-metrics.md). These endpoints reuse the authentication, private caching and mutation guards below.

All application APIs run on Node.js. Protected reads return `Cache-Control: private, no-store`. JSON mutation requests require an exact matching Origin and application/json content type; bodies are limited to 16 KiB. API success uses `{ data }`; application errors use `{ error: { code, message } }`. Better Auth uses its documented library response shapes.

## Public health

- GET `/api/health`: process liveness, 200.
- GET `/api/health/ready`: PostgreSQL SELECT 1, 200 or 503. No infrastructure details or credentials.

## Authentication: `/api/auth`

- POST `/sign-up/email`: name, email, password. CUSTOMER only; strict input validation.
- POST `/sign-in/email`: email, password.
- POST `/sign-out`: revoke current session and clear its cookie.
- GET `/get-session`: library session contract.
- GET `/list-sessions`: library-owned session listing.
- POST `/revoke-session`: library session token; owner checked by Better Auth.
- POST `/revoke-sessions`: revoke all current user's sessions.
- POST `/revoke-other-sessions`: preserve current session, revoke others.
- POST `/request-password-reset`: email, redirectTo on the configured origin.
- GET `/reset-password/:token`: validate/redirect to reset UI.
- POST `/reset-password`: token, newPassword.

Other Better Auth endpoints are not exposed by the route allowlist. Registration accepts no role, active status or customer ID. The wrapper validates request limits/origin; Better Auth owns hashing, session creation, credential validation, recovery and cookie security.

If identity creation succeeds but customer provisioning fails, signup still returns its successful library response. Retrying signup cannot create a second identity. The next authenticated application request retries the idempotent provisioning transaction. If it still fails, the API returns `503` with `{ error: { code: "PROFILE_SETUP_PENDING", message } }`, `Retry-After: 5` and `Cache-Control: no-store`; retry that request after the delay or sign in again. Operators can also run `profiles:repair`. There is no public repair endpoint or user-ID override.

## Own customer data

- GET `/api/v1/me`: safe user DTO, current permissions and own customer profile.
- PATCH `/api/v1/me`: businessName and/or phone only; audited.
- GET `/api/v1/me/addresses`: own addresses.
- POST `/api/v1/me/addresses`: recipient, phone, line1, optional line2, city, state, postalCode, country=IN; audited.
- GET `/api/v1/me/addresses/:id`: owner-scoped lookup.
- PATCH `/api/v1/me/addresses/:id`: complete validated address; owner-scoped update and audit.

Another user's address is indistinguishable from a nonexistent address (404). Customer ownership is derived from the session and never accepted from a payload. There is no arbitrary user-ID customer endpoint.

## Permissions and administration

Later module contracts: [public catalogue/enquiries](phase-2-api.md), [customer/dealer/pricing](phase-3-api.md), [inventory/purchasing](phase-4-api.md), [sales/manual payments](phase-5-api.md), and [dispatch/delivery](phase-6-api.md). The foundation endpoints below remain available; later contracts describe their extensions.

- GET `/api/v1/dealer/access`: approval-gated capability check only; no pricing or dealer commerce.
- GET `/api/v1/admin/overview`: ADMIN/SUPER_ADMIN account counts, pending dealer count and unexpired session count.
- GET `/api/v1/admin/audit-logs?page=1`: ADMIN/SUPER_ADMIN, 25 records per page, bounded pagination.
- GET `/api/v1/admin/settings`: ADMIN/SUPER_ADMIN.
- PATCH `/api/v1/admin/settings`: SUPER_ADMIN; displayName and mandatory reason. Timezone/currency remain the agreed INR/Asia-Kolkata defaults.

Status codes: 400 malformed JSON, 401 missing/expired/revoked session, 403 permission/origin denial, 404 absent or non-owned resource, 409 profile removed between access checks, 413 oversized body, 415 incorrect media type, 422 invalid fields, 429 auth rate limit, 500 safe generic application error, 503 database readiness or profile recovery unavailable. JSON media type is matched exactly (with optional parameters); `application/jsonp` is rejected. All application error responses are marked `no-store`.
