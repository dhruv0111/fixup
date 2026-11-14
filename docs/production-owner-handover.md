# FIXUP production owner handover

Prepared 14 November 2026, Asia/Kolkata, from the existing implementation and Phase 1–8.1 reports. This is a handover and future approval procedure. No feature development, deployment, production configuration change, real payment or production-data modification was performed to prepare it. Do not copy the active local `.env` into hosting; no actual environment-file values are included here.

**Current decision: CONDITIONAL PASS for Phase 8.1 remediation. Owner verification and production deployment remain pending.** Local security fixes are complete; real identities and external infrastructure are not certified. Phase 8's original FAIL remains historical evidence, not a claim that remediation was never performed.

## 1. Development and audit status

| Phase   | Completed local scope                                                                                                                 | Source                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1 / 1.1 | Authentication, sessions/recovery, permissions, customer foundation, admin shell and hardening                                        | [Phase 1](phase-1-report.md), [hardening](phase-1.1-report.md)                  |
| 2 / 2.1 | Public catalogue, content/publication, enquiries, product pages and catalogue repairs                                                 | [Phase 2 final audit](phase-2-final-audit.md), [Phase 2.1](phase-2.1-report.md) |
| 3       | Customer/dealer management, dealer approval, variants, shared category pricing and protected management                               | [Phase 3](phase-3-report.md)                                                    |
| 4       | Suppliers, purchase orders, GRNs, ledger-derived inventory, batches/expiry and adjustments                                            | [Phase 4](phase-4-report.md)                                                    |
| 5       | Cart, reviewed checkout, immutable sales orders, reservations/expiry/cancellation, manual UPI/bank proof and independent verification | [Phase 5](phase-5-report.md)                                                    |
| 6       | Full-order dispatch, physical lot deductions, local/courier/AWB tracking, delivery and private evidence                               | [Phase 6](phase-6-report.md)                                                    |
| 7       | Owner dashboard, eleven reports, expenses/private receipts, protected CSV and recorded lot-cost valuation/profit estimates            | [Phase 7](phase-7-report.md), [metric definitions](phase-7-metrics.md)          |

Phases 1–7 are complete for their documented local scope. Local completion does not establish real business configuration, staff authority or production readiness. The application records manual bank verification; it does not initiate payments, infer cleared funds from screenshots or connect live courier tracking. Do not invent costs, taxes, prices, refunds or business transactions to complete setup.

**Phase 8:** [audit](phase-8-final-audit-report.md), [security](phase-8-security-audit.md), [checklist](phase-8-release-readiness-checklist.md), [results](phase-8-test-results.md). Outcome FAIL for production prerequisites SEC-01–03. Its final deduplicated observations were 331 passing unit/API/browser/smoke checks, with failures and focused reruns recorded separately. FIN-01 payment-method reporting was fixed and regression-tested. Restore verified 54 tables, four sequences and twelve migrations. A deliberately malformed synthetic order kept the raw integrity scan at exit 1.

**Phase 8.1:** [remediation](phase-8.1-security-remediation-report.md), [results](phase-8.1-test-results.md), [owner actions](phase-8.1-owner-actions.md). Outcome CONDITIONAL PASS: verified-email/TOTP/session gates, controlled promotion, production database privilege/TLS guards, recovery and replay/lockout fixes were implemented and locally exercised. Final unique coverage was **349 passed checks: 46 unit + 222 API + 30 desktop + 30 mobile + 21 smoke**. These are deduplicated observations: the final full suite was 281/282; the affected reporting suite then passed 40/40 with unchanged application security code. Build, lint, TypeScript, formatting, schema/migration checks and recovery passed. Restore verified **56 tables, four sequences and thirteen migrations**. Do not use the older twelve-migration checklist as the current schema inventory.

The Phase 8.1 strict raw integrity scan still exited 1: four preserved expected negative-test orders, zero unexpected findings, zero matching fixture IDs in development. Missing-cost synthetic lots stayed incomplete. No production DB was scanned. `audit:integrity`, `db:recovery-check`, `npm test` and `test:privileged-production` are guarded local-test tools, not commands to point at production. Do not delete fixtures or suppress findings to report a clean scan.

Evidence limitation: original Phase 8 reports, saved JSON/logs, malformed-order evidence and backup evidence remain, but early Phase 8.1 reruns overwrote some shared screenshots/failure attachments. They were not recovered. Subsequent runs preserve unique private before/after archives; current copy fidelity was checked across 154 files. See the results document for the precise limitation. Preserve remaining evidence; do not publish private dumps, mail links or screenshots containing credentials.

## 2. Verification boundary and unknown decisions

| Locally verified                                                                                                                                  | External verification still pending                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Actual dummy-account email tokens, TOTP enrollment/login, recovery codes, authorization/session gates and production-mode synthetic-request probe | Real staff authority/enrollment, real email delivery and actual browser/proxy behavior at the selected HTTPS origin |
| Restricted test DB role permissions, bootstrap rejection, TLS/target option enforcement                                                           | Production login/grants/ownership/network, certificate chain/hostname and rejected bad certificates                 |
| Local production build and 21 local smoke checks                                                                                                  | Selected Node 24 image, release artifact, domain/DNS/ingress/cache and real hosting access                          |
| Local snapshot/restore fidelity and fresh migration replay                                                                                        | Encrypted offsite backups, production-scale restore, recovery objectives, key custody and on-call rehearsal         |
| Synthetic business/report/CSV/privacy regressions                                                                                                 | Owner UAT, approved business data/settings, operating procedures and realistic staging load                         |

For every action below, record responsible person, date, target environment, result, approval reference and a restricted evidence location. A pending action becomes externally verified only after its verification steps execute successfully; a filled configuration field alone is insufficient.

**Requires owner confirmation:** hosting/region/service tier and budget; canonical domain and DNS control; runtime/process model; database provider/version/endpoint/private network/CA/authentication; SMTP provider/sender/domain/port/TLS/authentication; secret-store location; IAM operators and approvers; backup destination/encryption service/RPO/RTO/retention; monitoring/on-call destination; reservation-job cadence; business settings/data/policies; staging access; release date and rollback thresholds. No provider console paths, service names or purchased accounts are assumed. Record each actual console/project/resource identifier in the acceptance record before following the corresponding action.

## 3. Production environment configuration reference

Configuration contract: [`.env.example`](../.env.example), [`src/config/env.ts`](../src/config/env.ts), [`src/server/email/service.ts`](../src/server/email/service.ts), [`src/server/db/security.ts`](../src/server/db/security.ts). **Location:** the selected hosting service's protected runtime environment/secret store and its separately controlled build/job/operator environments; actual provider/project paths require confirmation. `.env.example` is documentation, not the place to save production secrets. Never expose credentials through `NEXT_PUBLIC_*`, Git, screenshots, command-line URLs, logs or this handover.

| Variable                            | Required production setting / handling                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                           | Explicitly `production`. Defaults to development; `next build`, `next start` and `NODE_ENV=production` do not substitute.                                                                                                                                                             |
| `DATABASE_URL`                      | Secret runtime PostgreSQL credential for intended database/least-privilege login. Remote URL requires `sslmode=verify-full`. Migration/operator/backup processes receive their own appropriate connection separately.                                                                 |
| `DATABASE_SSL_CA_FILE`              | Optional path to a mounted trusted PostgreSQL CA bundle when a private CA is required. Confirm actual CA/path/read permissions. Never disable certificate validation.                                                                                                                 |
| `BETTER_AUTH_SECRET`                | Unique high-entropy secret, at least 32 characters, not a `REPLACE_` placeholder. Generate/store through approved secret tooling. It protects encrypted MFA material; preserve versioned recovery custody and rehearse rotation before changing it.                                   |
| `BETTER_AUTH_URL`                   | Exact canonical `https://` application origin, confirmed domain. Used for trusted origin, cookies and account links; no QA/localhost origin.                                                                                                                                          |
| `MAIL_MODE`                         | `smtp`; `file` is local only and rejected in application production mode.                                                                                                                                                                                                             |
| `MAIL_FROM`                         | Explicit valid authorized mailbox, optionally display name plus mailbox. Must not use the example sender. Ownership/deliverability require external proof.                                                                                                                            |
| `SMTP_HOST`                         | Provider-confirmed SMTP endpoint, required.                                                                                                                                                                                                                                           |
| `SMTP_PORT`                         | Provider-confirmed port. Schema default 587 is not evidence of the provider's setting.                                                                                                                                                                                                |
| `SMTP_SECURE`                       | Literal `true` for provider-confirmed implicit TLS, or `false` for provider-confirmed STARTTLS. With false the implementation sets `requireTLS: true`; never weaken it for delivery.                                                                                                  |
| `SMTP_USER`, `SMTP_PASSWORD`        | Provider-confirmed credentials when authenticated SMTP is used; secret-managed. Code adds auth only when user is present. If the approved relay uses network-based authentication instead, document and verify its restricted access; do not assume an unauthenticated relay is safe. |
| `TRUSTED_IP_HEADER`                 | Optional header name only if the chosen ingress overwrites it and prevents client spoofing. Otherwise leave unset; confirm conservative throttling impact.                                                                                                                            |
| `NEXT_TELEMETRY_DISABLED`           | Optional `1` to disable Next telemetry, as used by local tooling.                                                                                                                                                                                                                     |
| `NODE_ENV`                          | Framework production process setting (`production`); separate from `APP_ENV`. Use approved build/start tooling.                                                                                                                                                                       |
| `FIXUP_ALLOW_PRIVILEGED_OPERATIONS` | **Absent from web runtime.** Literal `1` only for the reviewed one-shot promotion command below.                                                                                                                                                                                      |
| `FIXUP_PROCESS_ROLE`                | **Absent from web runtime.** Promotion CLI sets its own operator role after validating the request; do not persist or manually enable it in the service.                                                                                                                              |

There is no MFA-enable environment toggle: the privileged gate is always enforced. Business timezone is stored in `BusinessSettings.timezone` (default `Asia/Kolkata`); this is not a documented environment variable or editable timezone UI. Review the stored value through an authorized read-only database console. A required change needs an approved configuration procedure; do not invent a setting or shift historical timestamps. DB application sessions use UTC.

## 4. Owner action register

### A1 — Assign release authority and secure hosting/recovery access

**Required access/account:** owner approver; hosting, DNS/domain, database, SMTP, secret-store and backup account administrators. Actual providers/accounts require confirmation.

**Exact configuration location:** chosen providers' organization/project IAM, domain/DNS, billing/recovery and secret-store access controls; record actual locations in the acceptance record. Repository runbooks: [operations](operations.md) and this document. Application MFA does not configure provider-console MFA.

**Steps:** name primary/recovery operators and an independent approver; approve least-privilege duties; enable provider-supported MFA and secure recovery on each privileged console; prefer short-lived operator access, restrict shell/DB/backup access, remove unnecessary shared access; designate alternate recovery contacts and offline recovery custody. Record who can stop traffic/jobs and restore service. Rehearse console recovery on an approved acceptance account without bypassing MFA or exposing codes. Confirm ownership continuity and billing alerts.

**Verify success:** intended operators can reach the correct resources and recover access; unassigned accounts cannot change infrastructure or read secrets/backups; review effective IAM and access logs. Provider-specific recovery procedure must be documented and tested, not inferred from application login.

**Evidence to retain:** approval/role matrix, redacted IAM/MFA status, console recovery rehearsal outcome, custody/access review and operator/on-call contacts; no passwords, seeds or recovery codes.

### A2 — Configure secret-managed application environment

**Required access/account:** authorized hosting/build operator and secret-store administrator from A1.

**Exact configuration location:** protected build/runtime/job environments identified in section 3; `.env.example` and `src/config/env.ts` define supported names. The active local `.env` remains local.

**Steps:** confirm canonical origin and environments; generate new production credentials; populate section 3 values from approved sources; separate web runtime from migration/operator/backup credentials; restrict secret reads and audit changes. Mount CA file if needed. Keep production secrets out of test runners and ensure `.env.test` is a separate guarded loopback test database. Restart approved target processes after changes because configuration and clients are cached. Record secret version identifiers without values; escrow the auth-secret version separately from DB archives. Do not blindly rotate the auth secret while encrypted factors depend on it.

**Verify success:** approved production-mode staging starts with the intended runtime DB role, health/readiness passes and no local file-mail/default sender remains. Missing/invalid settings fail closed in isolated acceptance tests. Check the web service has neither privileged-operation flag and private values never enter client bundles/logs. Confirm key recovery/rotation in an isolated rehearsal before launch.

**Evidence to retain:** redacted variable-name inventory, secret version/access references, environment identity, validation result and key-custody/rotation rehearsal record.

### A3 — Configure SMTP and safely verify real mail

**Required access/account:** SMTP provider/sender-domain administrator, DNS control if required by provider, controlled acceptance mailbox and HTTPS acceptance environment. Actual provider configuration requires confirmation.

**Exact configuration location:** section 3 SMTP/mail/origin variables in hosting secrets; sender/domain controls at the chosen provider; implementation `src/server/email/service.ts`. App verification UI `/account/security`; recovery UI `/forgot-password` and mailed reset link. Confirm DNS records from the selected provider rather than guessing them.

**Steps:** approve sender and recipient; obtain exact endpoint/port/TLS/auth settings and provider-required sender/domain authorization; set `MAIL_MODE=smtp` and actual authorized `MAIL_FROM`. Verify outbound connectivity/TLS without logging authentication. In private, production-mode staging, have a controlled account sign in, visit `/account/security`, select **Send verification link**, and open the received link only at the intended HTTPS origin. Verification links expire after 30 minutes and do not automatically sign in. Separately request password recovery for an acceptance account, complete it privately, then check the previous session is revoked and an enrolled authenticator remains required. Test invalid/expired reset links and used reset-link rejection in staging. Do not forward links or deliberately lock out real staff to prove rejection.

**Verify success:** authorized mail reaches the controlled inbox with correct sender/origin and encrypted SMTP transport; the account page shows verified email and `EMAIL_VERIFIED` audit appears. Reset changes only the acceptance account, old session loses access, and password alone still cannot grant privileged access. File-mail fallback is unavailable. Investigate provider errors/redaction and spam placement rather than disabling TLS. Email verification is ownership evidence, not business-authority approval.

**Evidence to retain:** provider authorization/delivery ID, TLS confirmation, redacted sender/origin/timestamps, audit reference and recovery test results. Exclude full links, headers containing tokens, passwords and message bodies containing secrets.

### A4 — Verify real privileged identities, enroll MFA and promote the owner

**Required access/account:** independently approved real owner/staff identity with controlled mailbox and authenticator; MFA-protected operator console, short-lived operator DB credential and approved promotion change record. A3 must work first.

**Exact configuration location:** `/register`, `/login`, `/account/security`, `/two-factor`; `scripts/promote-admin.ts`, `src/server/operations/admin-promotion.ts`, `src/server/auth/security.ts`. Factors are private DB records; do not set verification flags manually. No public promotion endpoint exists.

**Steps:** independently approve the person's authority and exact existing identity. Have that person register/sign in, verify their email through A3, open `/account/security`, enter their current password to start TOTP enrollment, enter the displayed setup key into their authenticator privately, save the ten recovery codes offline, then enter a real six-digit code to confirm. Setup alone is insufficient. Read the exact user ID using the approved DB console. In a one-shot **operator** environment with the intended production settings and operator DB credential, substitute real approved identifiers into this syntax (placeholders below are not identities):

```sh
FIXUP_ALLOW_PRIVILEGED_OPERATIONS=1 npm run admin:promote -- \
  --production --operator '<approved-operator-id>' --confirm-user '<confirmed-existing-user-id>' \
  '<approved-existing-account-email>' 'Approved owner bootstrap; <change-reference>'
```

This command grants **SUPER_ADMIN**, not an arbitrary staff role. Do not use it for every staff member. Confirm the existing authorized procedure for any additional role assignment; no provider IAM grant or new role-management UI is implied. Do not persist the flag or place a DB URL/password on the command line. After promotion, confirm session revocation, revoke the temporary operator access and have the owner log in again, complete `/two-factor`, and access the permitted admin workspace.

**Verify success:** production promotion refuses inactive, unverified-email or unconfirmed-factor accounts; approved account has `ROLE_CHANGED` and MFA/session audit evidence, receives only the intended permissions, and password-only/old sessions cannot access admin APIs/pages. Fresh privileged MFA assurance lasts at most 12 hours; sign-in challenges last five minutes. Ten failures lock verification for 15 minutes. Rehearse expired-assurance, denied wrong-role and password-only cases on isolated acceptance identities. TOTP replay and saved recovery-code single use were locally tested; avoid destructive lockout experiments on the sole real owner. Keep device clocks accurate. Device trust/email OTP are not substitutes.

**Evidence to retain:** independent authority approval, exact account-ID reference, redacted enrollment-confirmed status, operator console/IAM attribution and change reference, `ROLE_CHANGED`/`MFA_VERIFIED` event IDs and positive/negative acceptance outcomes. Never retain setup keys, screenshots of codes or tokens in the handover.

### A5 — Approve account and emergency recovery

**Required access/account:** owner/security approver, designated independently verified emergency operator, alternate authorized console access and acceptance account. No emergency identity is supplied by the application.

**Exact configuration location:** recovery procedures in [operations](operations.md) and [Phase 8.1 actions](phase-8.1-owner-actions.md); `/forgot-password`, `/two-factor`; private offline code/key custody. There is no automated public lost-all-factors reset command.

**Steps:** document access approval, incident contacts, independent identity re-verification and dual review appropriate to staff authority. Rehearse password plus one unused recovery code after the sign-in challenge on an acceptance account. Backup-code regeneration requires current password plus MFA no older than 15 minutes; it is an authenticated endpoint, not a promised extra UI. If all factors are lost, keep access locked: approve a controlled operator intervention that first removes privileged access, revokes sessions/challenges, preserves/audits evidence, then requires real email verification, confirmed replacement TOTP and approved promotion. Have the operator prepare/review the environment-specific maintenance transaction before approval; do not guess SQL or clear a factor while leaving privileged access usable.

**Verify success:** used code cannot be reused; reset does not remove MFA; unauthenticated/password-only recovery cannot grant admin access. Operator recovery restores only the approved identity after fresh proof, and temporary console/DB privileges are removed. Rehearse provider-console recovery separately under A1.

**Evidence to retain:** approved incident runbook, custodians, acceptance rehearsal/audit references, revocation and access-review outcomes; store recovery material separately under restricted custody.

### A6 — Provision least-privilege database access and verified TLS

**Required access/account:** hosting/database operator with permission to provision roles, ownership, networks and certificates; actual PostgreSQL endpoint/version/CA details.

**Exact configuration location:** DB role/grant/ownership/network controls; hosting `DATABASE_URL`/`DATABASE_SSL_CA_FILE`; [review template](production-database-roles.sql); `src/server/db/security.ts` and `src/server/db/client.ts`.

**Steps:** review the SQL template against existing objects and provider limitations; it creates NOLOGIN groups, not login credentials, and must not be blindly rerun. Provision separate runtime, migrator/operator and backup login identities in the provider's approved manner. Make reviewed migration ownership/default grants consistent; runtime owns no public application objects/schema/database, has required DML/sequence use but no CREATE/role/replication/bypass-RLS or predefined `pg_*` capabilities/membership. Preserve audit update/delete and migration-table restrictions; re-review exceptions after each migration. Grant backup only approved reads. Restrict network ingress to authorized service/operator paths. Set actual remote hostname plus `sslmode=verify-full`; mount approved CA bundle when necessary. Do not use URL target/TLS override parameters. A genuine co-hosted loopback database is allowed only after verifying private bind/network access.

**Verify success:** with the intended runtime environment run `npm run db:health` and check `/api/health/ready`. Use the provider's secure DB console to inspect effective role flags, memberships, object ownership, schema/database CREATE and current TLS connection. In staging, prove runtime cannot create roles/tables/triggers or access server files, while normal approved operations work. Test wrong hostname/untrusted CA rejection against a disposable staging connection, never by disabling TLS on production. Confirm app sessions use UTC and capacity accounts for the hard-coded five-connection pool per process plus jobs/migration/backup connections. Confirm actual PostgreSQL version/client compatibility; local PG18 does not prove hosted compatibility.

**Evidence to retain:** redacted role/grant/ownership/network review, positive/negative privilege results, TLS chain/hostname/failure evidence, DB health result, version and connection-budget approval. Never record a connection URL with credentials.

### A7 — Validate hosting ingress, runtime and release artifact

**Required access/account:** hosting/DNS/ingress operator, approved staging environment and build/release account.

**Exact configuration location:** confirmed hosting build/start/runtime configuration, TLS/domain/reverse-proxy/cache/security-header rules; `.nvmrc` (24), `package.json`, `next.config.ts`, section 3 variables. Specific provider locations require confirmation.

**Steps:** select Node 24 release image and compatible DB/clients; install pinned dependencies via lockfile, build a fresh artifact with approved target configuration and record its identity. Do not deploy the audit's test-configured `.next`. `npm run start` binds loopback by default; confirm how the selected private proxy/process routing reaches it rather than exposing an arbitrary dev server. Configure actual domain/DNS/certificate, HTTPS redirects/canonical host, private-response no-store handling and secure cookie forwarding. Set `TRUSTED_IP_HEADER` only if ingress overwrites it; block client spoofing. Resolve SEC-04 with tested script CSP/HSTS appropriate to actual HTTPS/subdomains (existing CSP is limited and has no general script-src; application supplies no HSTS). Resolve SEC-05 with tested request/body/time/concurrency limits without breaking bounded image uploads or report processing. Review approved external image URLs against the current image allowlist; no new provider integration is assumed.

**Verify success:** stage the actual artifact behind the intended ingress; check redirects, certificate, Secure/HttpOnly/SameSite cookies, origin/CSRF denials, spoofed-IP throttling and absence of shared private caching. Run representative report/image/concurrent-use load and failure recovery with isolated representative data; source limits must reject oversize requests rather than truncate totals. No realistic load/failover result exists yet. Prove missing/unsafe production configuration fails closed. Do not weaken controls to pass.

**Evidence to retain:** artifact/commit/lockfile/runtime identifiers, redacted config, TLS/header/cache/IP results, load/error results and resolved SEC-04/05 review. Signing off the Node 26 local result does not replace Node 24 checks.

### A8 — Establish private storage, logging, monitoring and jobs

**Required access/account:** hosting/DB/log/backup administrators, scheduler access and accountable on-call recipient.

**Exact configuration location:** DB-stored payment/delivery/expense evidence and provider storage access; runtime/proxy/SMTP log destinations; external health/readiness monitors; hosting scheduler for `scripts/expire-reservations.ts`. No public cron endpoint exists.

**Steps:** restrict database, backup, mounted secret and diagnostic file access; keep `.local`, archives, test outputs and mail files outside public hosting. Uploaded proofs are DB-held private images, not a public storage-bucket setup task. Define document/log retention and deletion approval. Route sanitized auth/provisioning/role/MFA lockout, readiness/DB pressure, backup and expiry-job failure/backlog events to an accountable operator. Redact passwords, proof bytes, cookies, setup/recovery codes and reset/verification URL queries at all proxies/providers. Set a protected scheduler to run `npm run orders:expire -- --confirm-expire` with the intended least-privilege runtime DB credential and complete production environment; each invocation handles up to 100 orders, so repeat until zero. Approve frequency and non-overlap/backlog policy; monitor exit codes. This command releases expired reservations and is a business mutation: activate only with separate production approval, not as a read-only smoke test.

**Verify success:** staging private proof reads succeed only for authorized owner/reviewer and deny foreign/anonymous users; responses are no-store. Trigger safe acceptance alerts and confirm receipt/escalation. Check logs contain no tokens/proof payloads. Exercise staged expiry/repeat/no-op behavior and job failure alerting. Confirm external monitors and backup alerts remain functional when the app is unavailable.

**Evidence to retain:** access/retention policy, redacted storage/log rules, monitor/alert delivery IDs, scheduler identity/cadence/configuration and staged job/no-overlap results. Keep evidence access restricted.

### A9 — Configure backups and prove restore/recovery

**Required access/account:** backup owner, separate read credential, encrypted offsite destination/key custodian, restore operator and isolated recovery DB with suitable administrative access. Owner-approved RPO/RTO and retention are required.

**Exact configuration location:** selected backup scheduler/destination/encryption/IAM controls; [operations backup and restore procedure](operations.md). No backup bucket, key service or production backup schedule is implemented by the local drill.

**Steps:** accept actual data-loss/recovery targets and schedule/retention; the operations proposal (daily/seven daily/four weekly copies and possible 24h loss) is only a starting proposal. Take a consistent backup using compatible PostgreSQL tooling, custom format and no owner/ACL dump; use secret-managed connection or private `PGPASSFILE`, never command-line passwords. Encrypt before offsite transfer; record checksum, time, schema/app versions, size and job outcome. Escrow the matching auth-secret/encryption-key version separately. Include DB-held proofs/authentication/MFA material; separately inventory global roles, grants, server config, app secrets and any external assets because DB dumps do not recover them.

Restore rehearsal: verify checksum/decryption and intended versions; restore to a **new isolated DB**, with writes/public traffic/email/jobs blocked, using reviewed `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` arguments and secure connection injection. Compare every table count/fingerprint and schema objects/constraints/indexes/functions/triggers, sequence states, migration history and critical orders/payments/stock. Recreate reviewed role grants. Before any access is reopened, revoke restored sessions and pending password-recovery/email/MFA challenge records using a reviewed maintenance transaction, require fresh MFA, and reconcile post-snapshot transactions with the owner. Never restore local test data into production or overwrite the only current DB. Preserve original DB/evidence. Measure elapsed time and data-loss window; record exceptions and retest.

**Verify success:** restore fidelity is demonstrated on isolated production-scale representative data, actual encrypted offsite/key recovery works, restored stale credentials/challenges do not authenticate, application readiness/RBAC/report checks pass, and accepted RPO/RTO is met. The local `npm run db:recovery-check` uses guarded dummy data and removes only its own temporary DBs; it is not the production restore tool or SLA proof. Do not run it against production.

**Evidence to retain:** redacted backup/job IDs, encrypted archive checksum, key-version/custody references, grants/schema/count/hash manifest, revocation/reconciliation sign-off, restore duration/loss assessment and periodic rehearsal schedule. Do not attach archives or keys to tickets.

### A10 — Approve business information and operating procedures

**Required access/account:** business owner, purchasing/stock/payment/dispatch leads, approved catalogue/finance records, MFA-ready owner account and isolated UAT accounts. Production changes require separate approval.

**Exact configuration location:** `/admin/products`, `/admin/price-lists`, `/admin/customers`, `/admin/dealers`; `/admin/operations/suppliers`, `/admin/operations/purchase-orders`, `/admin/operations/goods-receiving`, `/admin/operations/inventory`, `/admin/operations/stock-adjustments`; `/admin/sales/settings`, `/admin/content`, `/admin/expenses`; [metrics](phase-7-metrics.md), [operations](operations.md). Check stored `BusinessSettings.timezone` through the read-only DB console; do not assume a timezone editor exists.

**Steps:** approve actual SKUs/pack sizes/content/images/MRP and retail/dealer category prices; supply real supplier/rate/opening-lot/batch/expiry/expense source records and reconcile physical stock. Use existing approved forms/workflows only under a later authorized data plan; controlled import support must be confirmed before assuming a bulk importer exists. Preserve missing original costs as incomplete. Confirm actual payment account/UPI, tax treatment, delivery charges, reservation/late-review periods and cancellation/refund settings before enabling checkout. Approve public policies/contact/opening days. Assign least-privilege staff responsibilities and actual bank-record verification, dispatch/physical-return and reconciliation duties. Confirm Asia/Kolkata report expectations and review any legacy non-UTC timestamps without guessed offsets. Accept recorded net lot cost excluding separately recorded tax, report completeness/returns limitations and financial estimates rather than treating the app as an accounting ledger.

**Verify success:** in isolated UAT, business leads sign off customer and dealer purchases, approval/pricing, PO→GRN→inventory/ledger/batches, cancellation/expiry release, verified payment→dispatch→delivery, private documents, eleven reports and CSV reconciliation. Proof upload must not create cleared funds; only actual bank verification can do that in real operation. Use dummy payments in UAT. Review actual business setup separately before launch; no real transaction is required just to exercise a test.

**Evidence to retain:** approved data/settings inventory and source references, policy/retention approvals, physical reconciliation, responsibility matrix and per-workflow UAT outcomes/open defects. Keep account numbers/private business records in restricted owner records, not this document.

### A11 — Approve schema migration and release/rollback plan

**Required access/account:** owner release approver, migration operator, build/release operator and incident/backup owner. A1–A10 verification or formally accepted noncritical residuals must be recorded first; no bypass of critical gates.

**Exact configuration location:** `prisma/migrations/` (13 migration directories, latest `20261114030000_privileged_identity_mfa`), `prisma/schema.prisma`, package scripts, chosen release console and change record. No automatic deployment configuration is asserted here.

**Steps:** identify a reproducible reviewed commit/artifact including all intended security files; record checksum/history and resolve uncommitted workspace contents before release. Rehearse all reviewed migrations with the migration credential in staging; retain SQL constraints/triggers that Prisma DSL alone does not describe. Use `npm run db:migrate` (`prisma migrate deploy`) and `npm run db:status` in the intended separately authorized migration environment, never reset/db push. Only the test DB was migrated during Phase 8.1. Verify all thirteen migrations where appropriate; the new additive migration leaves old sessions without MFA assurance and does not enroll staff automatically. Take verified pre-change backup; record previous compatible artifact/config/key versions, maintenance window, rollback triggers and owner acceptance. Test rollback compatibility; an older artifact that lacks MFA is not an acceptable public rollback target merely because its schema runs.

**Verify success:** staged migration/deploy repeat is safe, schema/history match expected versions, data/audit invariants hold and new privileged access gates work. A migration-only credential is not inherited by runtime. Release approver signs checklist and explicitly authorizes the later deployment separately. Use sections 5–7 for that later controlled operation.

**Evidence to retain:** reviewed commit/artifact/migration checksums, staging results, verified backup reference, compatibility/security decision, rollback rehearsal and dated approval/operator record. This handover supplies no deployment approval.

## 5. Pre-deployment checklist — pending owner execution

Each item refers to action steps, access, verification and evidence above. None is checked as externally complete here.

- [ ] A1: actual resources, approvers, least-privilege IAM, console MFA and emergency access confirmed.
- [ ] A2/A3: protected production environment, key custody, real SMTP sender/TLS/delivery and recovery verified; local/test credentials excluded.
- [ ] A4/A5: real owner authority/email/TOTP confirmed, audited controlled promotion and recovery rehearsed; additional staff-role procedure confirmed.
- [ ] A6: actual runtime/migration/backup separation, grants, remote certificate validation/network restrictions, UTC and connection budget verified.
- [ ] A7: chosen Node 24 artifact/ingress/domain, CSP/HSTS, cookie/cache/IP handling and representative load approved.
- [ ] A8: private storage/log redaction, external monitoring/on-call, retention and protected expiry-job plan tested.
- [ ] A9: encrypted offsite backup/key recovery, isolated restore and accepted RPO/RTO proved.
- [ ] A10: owner UAT, policies, real business setup, report/cost limitations and no QA checkout instructions approved.
- [ ] A11: reproducible artifact and thirteen migrations reviewed; pre-change backup, rollback/security compatibility and maintenance approval recorded.
- [ ] Repeat `npm ci`, `npm run test:unit`, `npm test`, build, TypeScript, lint, formatting, dependency audit, local smoke, privileged production-mode probe and local recovery checks on the selected Node 24 QA/release environment. Use guarded isolated test configuration for test commands; never pass live production DB credentials. Preserve failures and actual affected reruns. Classify retained raw integrity findings without suppressing exit 1; investigate any unexpected finding.
- [ ] Record a separate deployment authorization, target/version and named operator. Keep checkout/traffic/jobs gated according to the approved plan until verification completes. No deployment is authorized by this checklist's existence.

## 6. Post-deployment smoke-test checklist — future, not executed here

**Required access/account:** separately authorized release/on-call operator, actual HTTPS origin, read-only monitors, approved MFA staff account and private acceptance environment. **Configuration location:** actual application domain, provider release/monitor console and named API/page paths below. These checks apply only after a later approved deployment; they do not authorize data changes.

- [ ] Confirm correct artifact/runtime/config versions and no development server/test assets exposed. Check `/api/health` and DB-backed `/api/health/ready` return 200; readiness is no-store. Investigate 503 before admitting traffic.
- [ ] Visit `/`, `/login`, `/two-factor`, catalogue and approved public policies at canonical HTTPS; verify certificate/redirects/security headers and approved real content. No demo catalogue or QA payment instructions.
- [ ] In an anonymous browser, `/account/security` reaches `/login`. Next streaming redirects must be checked in a browser; fetch may observe a streamed 200. Anonymous `/api/v1/me`, `/api/v1/admin/overview` and `/api/v1/admin/reports/dashboard` return 401.
- [ ] Existing approved staff sign in with actual password plus authenticator privately; verify intended admin pages and audit event. Inspect Secure/HttpOnly/SameSite cookies without retaining cookie values. Use staging acceptance identities for wrong-role, expired assurance, deliberate lockout, reset and recovery-code negative tests; do not consume the sole owner's recovery access as a routine live smoke test.
- [ ] Confirm anonymous private endpoints such as `/api/v1/payments/unknown/proof`, `/api/v1/delivery-proofs/unknown` and `/api/v1/expense-attachments/unknown` deny access. In staging, verify real dummy proof owner/reviewer success, foreign-user denial, CSV permissions/formula protection and no-store. Never copy a real customer's private image to evidence just to prove access.
- [ ] Inspect existing authorized order/inventory/report views read-only and compare approved baseline counts/totals/date boundaries; record any incomplete cost flags. Do not create orders, payments, stock adjustments, uploads or dispatches in production for smoke testing without a separate scoped data approval. Complete transaction chains belong in isolated staging/UAT with dummy payment information.
- [ ] Confirm prior SMTP acceptance and monitoring/backup/job status at the real environment. Sending a production test email or manually invoking expiry is a separate approved action; check status read-only here. Observe error/latency/DB-pool/expiry backlog and alert routing for the agreed window.
- [ ] Release approver records smoke outcomes and enables broader traffic/writes only under the separate approved plan; any failed critical check invokes section 7.

**Verify success:** every required check has an actual pass/result, no secrets/private evidence leaked, expected role/data boundaries hold and no critical error is unresolved. **Evidence to retain:** sanitized status/URL/timestamp and artifact references, selected read-only reconciliation, audit IDs, monitor/job/backup health and operator acceptance. Do not count unavailable/unexecuted checks as passed. `npm run test:production` starts a separate local server on loopback port 3200; it is not a remote production-domain smoke runner.

## 7. Rollback and incident procedure — future, requires approval

**Required access/account:** incident commander/owner approver, MFA-protected release and DB operators, backup/key custodian and monitoring/reconciliation lead. **Configuration location:** confirmed deployment/artifact/version controls, secret-managed DB target, scheduler/traffic controls, isolated restore DB and incident record. Actual provider switch/maintenance commands require confirmation and rehearsal under A11.

1. Declare incident when agreed triggers occur (authentication/authorization failure, private-data exposure, broken readiness, migration/data-integrity defect or unacceptable failure/latency). Record observed facts, artifact and time; escalate to the owner. Stop/drain writes, traffic and scheduled writers as the incident plan requires. Preserve logs, both DB states and evidence; do not delete test/audit records to make monitoring green.
2. Capture a secure current-state snapshot where safe. Identify last known-good **security-compatible** artifact/configuration and schema. Do not automatically roll back to pre-8.1 code that lacks privileged MFA/runtime guards. If no safe previous artifact exists, keep access restricted and prepare a reviewed forward repair.
3. For application-only rollback, prove compatibility with the already-migrated schema, unchanged data and auth-secret version; select the approved artifact/config through the actual release control, then restart/recheck under controlled traffic. Do not auto-reverse migrations, reset the DB, disable security or clear MFA. Restore key versions only through the rehearsed encryption recovery plan.
4. If data recovery is necessary, obtain explicit incident approval for possible loss; follow A9 to restore a known-good encrypted backup into a new isolated DB. Validate schema/records/roles and app compatibility, revoke restored sessions and all pending reset/verification/MFA challenges, retain required factor-encryption keys, and reconcile post-backup orders, bank receipts, dispatch/stock and expenses with the owner. Do not replay external payments or infer missing figures.
5. Switch only the reviewed secret-managed DB connection after acceptance, restart dependent processes and re-run applicable section 6 checks. Keep previous database/artifact and evidence for the approved retention window. Re-enable writers/jobs gradually with explicit approval; ensure jobs target the correct DB and do not overlap.
6. Confirm least privilege, fresh staff MFA, private proofs, health, reconciliation, backups and alerts. Record actual recovery duration/data loss against RPO/RTO, outstanding issues and preventive actions. Unexpected integrity findings require investigation, not an exception label.

**Verify success:** approved service/security boundaries restored, critical smoke checks pass, business reconciliation and owner sign-off complete, jobs/backups/alerts operate on the correct target and no stale auth state is revived. **Evidence to retain:** incident/change approvals, selected artifact/schema/secret-version identifiers, secure snapshot/restore manifest references, compatibility checks, session/challenge revocation audit, reconciliation and measured RPO/RTO. Never store live keys, URLs with credentials or private document contents in the incident summary.

## 8. Final handover status

- **Locally verified:** Phase 1–7 implementation and documented Phase 8/8.1 local regression, security remediation, build/static and recovery evidence. Historical failures, expected fixture findings and screenshot-retention limitation remain disclosed.
- **Owner verification pending:** A1–A11, real identities/MFA/mail, actual database/hosting/recovery/security controls, business acceptance and selected-runtime evidence. No external action is marked complete without actual retained evidence.
- **Production deployment pending:** no deployment performed or authorized. Owner review, completed release gates and separate deployment approval are required.
