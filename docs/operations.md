# FIXUP foundation operations

These procedures cover Phase 1.1 only. No production system, scheduler, offsite backup service or paid account was created. Commands must use Node 24 LTS and the intended environment's credentials. Never copy `.env`, recovery messages, database archives or credential-bearing test artifacts into tickets or Git.

## Recover pending registrations

`User.profileProvisionedAt IS NULL` is the durable pending signal. A missing customer is also recoverable. Normal protected access retries automatically; while the database remains unavailable the API returns `503 PROFILE_SETUP_PENDING` and a five-second retry hint. The account page uses the existing error/retry boundary. Public navigation and logout remain accessible.

For an authorised operator with the correct database environment:

```sh
npm run profiles:repair -- --limit 100
```

The limit is 1–1000, default 100. The command processes active pending users in ID order, preserves existing data, reports attempted/recovered/failed counts and exits 1 if any selected account failed. A successful empty batch is a no-op. Re-run after fixing a database problem; repeated failures in the first batch require investigation before later batches can progress. Do not manually insert duplicate profiles or mark a user complete to suppress an error.

Monitor `customer_provisioning_failed` events and pending counts. Logs contain an internal user ID, attempt and category only; do not add email, password, token, SQL or raw exception logging. Restrict log access and retention. Reconciliation is manual in this phase; a future inexpensive scheduled invocation can call the same command once hosting is chosen.

## Administrator promotion

There is no HTTP promotion endpoint. Registration cannot supply a role. The CLI and database credentials are privileged operational assets, not customer tools.

Local development/test use is restricted to loopback databases with the documented FIXUP names:

```sh
npm run admin:promote -- you@example.com "Initial local owner setup"
```

For a future production bootstrap:

1. Use an access-controlled operator console with MFA, an approved change record, and short-lived operator database credentials. Keep the production application's runtime role separate from migration/operator roles. Restrict access to source execution and secret injection.
2. Independently verify the existing account holder and their email ownership. Read the exact user ID using the controlled database console. The account must be active and `emailVerified=true`. Phase 1 has **no email-verification workflow**; this is a launch prerequisite, not a reason to blindly flip the flag or bypass the guard.
3. Inject the production environment and secrets through the operator environment. Confirm APP_ENV=production and the intended database identity. Set `FIXUP_ALLOW_PRIVILEGED_OPERATIONS=1` only for the one-shot operator process; do not persist it in the web environment or `.env.example`.
4. Invoke with an auditable operator identifier, exact user ID and non-secret reason/change reference:

```sh
FIXUP_ALLOW_PRIVILEGED_OPERATIONS=1 npm run admin:promote -- \
  --production --operator operator-id --confirm-user confirmed-user-id \
  owner@example.com "Approved owner bootstrap; change reference"
```

5. Confirm the `ROLE_CHANGED` audit entry and resulting role; the account must sign in again because existing sessions were deleted. Revoke the operator credential/session and retain the external console/change audit.

The account lock, role update, session removal and audit insertion share one transaction. A repeat for an existing SUPER_ADMIN changes nothing. Failed commands exit nonzero with a generic diagnostic. `actorId` is null for operator actions; the reason records operator attribution. The identifier is supplied by the operator, not cryptographic proof: host/IAM logs establish who actually invoked the command. Environment flags prevent accidents; an attacker who controls the database or shell can bypass application policy. Limit that access. No new user-management, approval or MFA workflow was built in this phase.

## Database changes and separation

Use reviewed migration SQL and `npm run db:migrate` (`prisma migrate deploy`). Never run reset or `db push` on business data. Custom SQL CHECKs, functions and triggers must be preserved in later migrations; they are not fully represented in Prisma's schema DSL. All three committed migrations are transactional. Take and verify a backup before production schema changes; prefer a reviewed forward repair to an improvised destructive rollback.

Tests load `.env.test`, require APP_ENV=test, a loopback `fixup_*test` database and the fixed test origin, and reject the database configured in `.env` even if credentials, URL encoding or localhost spelling differ. Only use disposable test data in `.env.test`; a name guard cannot prove data sensitivity. The backup drill uses this same guard. Other environment files are not a substitute for correctly separating credentials and database roles.

## Executable local recovery drill

Requirements: the local cluster running; separate `.env`/`.env.test`; `pg_dump` and `pg_restore` on PATH; a local operator role permitted to create databases. Run after the integration suite finishes, so its temporary fault-injection objects have been removed:

```sh
npm run db:local
npm run db:recovery-check
```

The script:

- Exports a consistent read-only snapshot of the test database and creates a PostgreSQL custom archive from the same snapshot.
- Restores into a newly generated database; never overwrites an existing database or uses `--clean`.
- Compares every table's row count and SHA-256 fingerprint, plus columns, enum values, constraints, indexes, functions and triggers.
- Creates another fresh database, applies all committed migrations, runs deploy again and compares the resulting schema.
- Drops only the two databases created by that invocation. On interruption, inspect before manually removing any leftover `fixup_restore_*_test` / `fixup_migration_*_test` databases.
- Leaves the archive and checksum/count manifest under ignored `.local/backup-checks/<random-id>/`, with directory mode 0700 and file mode 0600. Passwords are passed through the process environment, not command-line URLs. The archive contains dummy credential/session material: keep it private and delete it according to local retention policy.

This is a small local-data correctness drill, not a production-scale RTO benchmark. The script fingerprints rows in memory and requires local database-creation permissions; do not point it at a live business database.

## Proposed production backup policy

Before launch, assign a backup owner and confirm acceptable data loss/recovery time. A starting recommendation is daily encrypted backups retained for seven days, four weekly copies, and an offsite copy under a separately controlled credential. This implies a possible 24-hour data-loss window unless hosting provides more frequent snapshots or point-in-time recovery; it is not an accepted business SLA. Evaluate available hosting features within the approximately ₹2,500/month services budget. No service was purchased or configured.

Use a compatible PostgreSQL client and custom-format `pg_dump --format=custom --no-owner --no-privileges` via a secret-managed connection or private `PGPASSFILE`. Encrypt the archive before leaving the host, record its checksum and migration/application version, monitor job completion and retention, and protect encryption keys separately. Filesystem permissions alone do not encrypt a local dump. Database dumps do not include global roles, server configuration, application secrets or future image storage; maintain those recovery procedures separately. Do not back up authentication secrets into the same unprotected location as the database.

## Future production restoration procedure

1. Declare the incident, stop application writes and preserve evidence. Select a known-good backup and verify checksum/decryption, application version and expected migration history.
2. Restore to a **new isolated database**, with no public application traffic or outbound email. Use `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` against that new target. Never restore over the only copy of current data.
3. Compare row counts, constraints, indexes, functions/triggers and critical business records; apply only the reviewed migrations appropriate to the target application. Recreate least-privilege database grants separately because the archive excludes roles/ACLs.
4. Before reopening access, invalidate **all restored sessions and password-recovery verification records** through a controlled maintenance transaction, and rotate affected secrets if compromise is suspected. Restoring old auth state can otherwise revive revoked sessions or unused recovery links. The local fidelity drill intentionally preserves and compares these records in an isolated database; it never opens that database to the application.
5. Run health, authentication and RBAC smoke checks against the isolated target. Reconcile any identities with missing profiles using `profiles:repair`; review records lost since the snapshot with the business owner.
6. Switch the application's secret-managed database connection only after operational review, then monitor errors and retain the previous database for the agreed recovery window. Record actual data loss and elapsed restoration time. Perform a periodic restore drill (monthly is a starting recommendation) and after significant schema/hosting changes.

External SMTP, real TLS termination, hosted backup scheduling, retention, encryption and production restoration remain unverified until the chosen environment exists.

## Business reports and expenses

Apply the two Phase 7 migrations before restarting. Prisma database sessions explicitly use UTC; the business timezone still controls calendar filters and the April-based financial year. No stored timestamps are shifted. Review any real historical records written under a former non-UTC session before relying on historical analytics. Use fresh sessions after restarting if an older local session expires.

Super Admin can review `/admin/business` and all eleven reports. Admin receives operational reports and can manage expenses, but cannot access profitability or inventory cost values. Sales representatives have no new global financial permission. Enter actual expenses at `/admin/expenses/new`; edits and cancellations require reasons and preserve immutable revisions. Optional private image receipts are part of the database backup and require restricted retention/access. A cancellation is not deletion or a payment reversal.

The owner approved recorded net purchase cost, excluding separately recorded tax. Cost snapshots are immutable, cannot be edited through reports, and remain missing where the original lot lacks a purchase source. Keep actual lot allocations accurate. Profitability is an estimate based on confirmed dispatches, not an accounting ledger or cash balance. Review returned shipments and missing costs before interpreting totals. Business-wide expenses are not allocated arbitrarily to filtered products/customers. See [formula, date and completeness definitions](phase-7-metrics.md) and [API limits](phase-7-api.md). Narrow filters if the service refuses an oversized source set; it never silently truncates totals.

## Manual dispatch and delivery

Use `/admin/dispatch` with an authorized ADMIN or SUPER_ADMIN account. The ready queue shows only currently eligible orders; blocked orders have reasons. Before confirming, check the actual bank-verified amount, customer eligibility, package count, delivery address, actual local assignee or courier/AWB/booking date, and every variant's selected physical lot quantities. Do not treat a payment screenshot as bank verification. Saving a draft or entering an AWB does not deduct stock.

Confirmation commits full-order dispatch, reservation consumption and lot ledger deductions together. If a request loses its response, refresh the shipment or retry the same request; never create a replacement order or manually deduct again. Stale revisions require refresh. If actual selected lots no longer contain enough usable stock, revise draft allocations. No partial shipments are supported.

Local staff/courier events are entered manually. Explicit delivered confirmation needs the actual date/time, recipient and confirmation source. Photographs/scanned PNG/JPEG/WebP documents are optional, private and bounded to 5 MiB/16 megapixels; PDFs are not supported. Share evidence with the relevant customer only when appropriate using the explicit upload-time checkbox. Upload does not confirm delivery. Preserve private proof access/backup/retention controls and restrict database/backup permissions.

After a failed delivery, record the reason, correct assignment/courier arrangements, and explicitly reschedule with a supplied expected date. Return-to-sender requires a reference and never restores stock. Super Admin may record a correction note without changing balances, or record a separately inspected physical return with quantity, condition, receipt time/reference and reason. Good/damaged returns append to the original lot and cannot exceed the original dispatched allocation. No automatic refund, credit or order reopening occurs; full returns/refunds remain outside this module.

Courier names/AWBs are manual, with duplicate checks per normalized courier. Use consistent carrier names. Configure a tracking URL only after confirming the courier's actual HTTPS format with one `{awb}` placeholder; no API/live tracking is connected. Customer order timelines are the notification channel, so do not claim email/SMS/WhatsApp delivery. See [dispatch API/limits](phase-6-api.md) and [execution report](phase-6-report.md).
