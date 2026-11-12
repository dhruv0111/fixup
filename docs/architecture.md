# FIXUP Phase 1 architecture

Scope: one Next.js App Router application, Node.js runtime, TypeScript, Tailwind, PostgreSQL and Prisma. No products, prices, checkout, orders, inventory, quotations, payments or delivery modules are implemented.

## Boundaries

- `src/app`: pages and thin HTTP adapters.
- `src/modules/customers`: validated, owner-scoped profile/address operations.
- `src/modules/identity`: recoverable, idempotent customer provisioning.
- `src/modules/settings`: the owner-only business settings operation.
- `src/server/auth`: maintained-library authentication, not custom password/session cryptography.
- `src/server/permissions`: current database role/status evaluation and explicit permissions.
- `src/server/audit`: allowlisted events; no arbitrary payload logging.
- `src/server/db`: one pooled Prisma client per Node process, reused across development hot reloads.
- `src/server/email`: private local outbox or SMTP transport.
- `src/server/http`: safe errors, bounded JSON parsing and same-origin mutation checks.
- `tests`: real PostgreSQL/API integration and browser tests.

Future business modules will be introduced when authorised. Their folders contain only `.gitkeep` files, with no services, routes or premature database tables: catalogue, pricing, enquiries, quotations, checkout, orders, procurement, inventory, payments, delivery, returns, reporting and content.

## Authentication decision

Better Auth supplies scrypt password hashing, verification tokens, signed HttpOnly cookies, database sessions, password recovery, revocation and authentication rate limiting. There is no handwritten password hashing, JWT issuance or session-token generation in this application.

Prisma is deliberately pinned to 7.10.1: the current Better Auth Prisma adapter does not support Prisma 8's different client API. Review compatibility before any major upgrade.

- https://better-auth.com/docs/adapters/prisma
- https://better-auth.com/docs/authentication/email-password
- https://better-auth.com/docs/concepts/session-management
- https://nextjs.org/docs/app/guides/authentication

Email/password is a Phase 1 implementation default. Emails are normalised and unique. Registration cannot set role, active status or a different customer owner. New users are CUSTOMER; dealer access is never self-granted. Passwords are 12–128 characters. Email ownership verification and privileged-user MFA are not implemented in this bounded foundation and must be addressed before an Internet-facing launch.

Sessions expire after seven days, refresh after one day, and require database lookup (cookie caching disabled). HTTPS enables Secure cookies; HttpOnly and SameSite=Lax apply locally too. Revocation removes database sessions. Account suspension atomically revokes its sessions with system audit entries; a database trigger serializes new session insertion against account updates and rejects inactive users. Reactivation cannot revive removed sessions. Permission checks fetch current role, active status and dealer approval from PostgreSQL on each protected operation. Dealer suspension removes dealer capabilities while retaining ordinary account access. Password reset expires after 30 minutes, is single use, and revokes existing sessions.

Better Auth stores its session credentials in its supported database schema. Treat database contents and backups as sensitive; do not export tokens into logs or API DTOs. Auth-library session endpoints have the library's own contracts; application `/api/v1` responses never expose session credentials.

## Database

Foundation entities: User, Session, Customer, Address, DealerProfile, AuditLog, BusinessSettings. Better Auth also requires Account (credential hashes), Verification (recovery tokens), and RateLimit (persistent throttling).

- User → many Sessions and Accounts; User → one Customer.
- Customer → many Addresses and at most one DealerProfile.
- DealerProfile optionally references its reviewing User.
- AuditLog optionally references its actor; actor deletion does not delete audit history.
- BusinessSettings is a singleton enforced by a SQL CHECK, initially FIXUP / INR / Asia/Kolkata.
- Unique email, session token, provider/account identity, customer user, dealer customer and optional GSTIN.
- Foreign keys, timestamptz timestamps, lookup/expiry/audit indexes.
- SQL CHECKs enforce normalised email and Indian address PIN structure. These are documented custom migration constraints not represented by Prisma's schema DSL.

The initial migration is transactional and includes non-sensitive singleton settings, not users or credentials. Phase 1.1 adds a nullable `User.profileProvisionedAt` completion marker and suspension/session triggers in a second transactional migration. Existing accounts are marked complete only if both customer and registration audit exist. A third transactional migration revokes and audits sessions retained by accounts suspended before hardening, so the upgrade also protects existing inactive accounts.

Customer creation, registration audit and the completion marker commit atomically after the auth-library transaction. The shared provisioner locks the user row, upserts the unique customer owner and preserves existing data/audits. It retries recognised database conflicts up to three attempts. Failure leaves a durable pending marker, logs only an event, internal user ID and bounded error category, and preserves the successfully committed registration response. Protected requests retry provisioning; unavailable recovery returns `503 PROFILE_SETUP_PENDING` with `Retry-After: 5`. Public navigation skips repair so logout remains accessible. `profiles:repair` reconciles active pending accounts in bounded operator-run batches. No background scheduler or paid queue was added. Authentication and customer provisioning remain separate transactions; failure recovery is explicit rather than pretending they are atomic.

## Permission map

All active roles: own account read/update. CUSTOMER has no administrative rights. DEALER receives dealer.access only with an APPROVED DealerProfile. SALES_REP receives leads.assigned (reserved permission, no CRM API yet). ADMIN can read dashboard, audits and settings. SUPER_ADMIN additionally changes settings. Business settings mutations require a reason and write their audit event in the same database transaction.

There is no dealer approval UI or role-editing API in Phase 1. A controlled operator CLI can promote an existing active account to SUPER_ADMIN with a reason, audit the promotion and revoke all its sessions in one transaction. Production requires explicit operational enablement, operator attribution, exact target ID confirmation and verified email. Repeating an already-completed promotion is a no-op. These safeguards are not a substitute for protecting shell access and database credentials. No default admin account or password is supplied. See [the operator procedure](operations.md).

## Operational limits

No paid service was provisioned and no deployment is part of this phase. Configure production HTTPS, SMTP, trusted-proxy headers, least-privilege database users, backups and monitored recovery before launch. Local database setup uses a workspace-owned PostgreSQL cluster and never connects to an existing business database.

Rate limiting defaults to one conservative shared bucket when no trusted proxy header is configured. In production select only a header the ingress overwrites. The application always replaces its internal x-fixup-client-ip header. An arbitrary forwarded header supplied by a browser must never be configured as trusted without an enforcing proxy.

Audit records are append-only through the application. A database owner can still modify them; external tamper-evident storage is outside Phase 1. Reasons must not contain secrets.
