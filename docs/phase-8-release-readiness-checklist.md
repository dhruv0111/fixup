# Phase 8 release readiness checklist

Date: 14 November 2026, Asia/Kolkata. **Release blocked. No deployment authorized or performed.** Local test success is not production approval. See [audit decision](phase-8-final-audit-report.md), [security findings](phase-8-security-audit.md) and [actual test results](phase-8-test-results.md).

## Local verification

- [x] Inspect Phase 1–7 implementation, metric definitions, operations, migrations and test isolation guards before changes.
- [x] Use only synthetic transactions, dummy payment details and guarded local test databases for workflow testing.
- [x] Preserve existing test/business records; do not reset development or test databases.
- [x] Record actual commands, failures, fixes, reruns and coverage limits in the test-results document.
- [x] Keep security validation and existing business rules enabled.
- [x] Stop at audit documentation; do not deploy or connect real payment services.

The test-results document is authoritative for executed check outcomes, including the initial failure and focused rerun. Checked audit-process items are not blanket approval of production configuration.

## Required owner decisions and business information

- [ ] Complete owner acceptance testing with representative customer, dealer, purchasing, verification and dispatch staff; record acceptance and open defects.
- [ ] Confirm actual SKUs, approved product/variant technical content, images/MRP and retail/dealer prices. Demo catalogue is excluded in application production mode.
- [ ] Supply actual supplier records, purchase rates, opening lots, batch/expiry information and expenses using controlled imports/forms; reconcile physical stock. Unsupported opening-stock costs remain explicitly missing.
- [ ] Confirm actual tax mode/rate, payment account/UPI details, delivery charges, reservation/late-review periods and cancellation/refund handling. Do not enable checkout using QA settings.
- [ ] Confirm approved policy content, opening days, shipping/returns terms and private financial-document retention/access policy.
- [ ] Assign staff permissions, payment bank-verification duties, physical dispatch/return procedures and reconciliation ownership.
- [ ] Accept the approved recorded-lot cost method and incomplete/return-review limitations in management estimates. Review any legacy timestamps written under non-UTC sessions; do not guess offsets or alter history wholesale.

## Security and hosting gates

- [ ] Close SEC-01: establish verified email ownership and privileged-user MFA controls. Production owner promotion must retain its verified-identity guard.
- [ ] Select hosting and a supported runtime; this audit executed under Node 26.4.0, while `.nvmrc`/operations specify Node 24. Repeat release checks on the selected Node 24 runtime/image before acceptance of the artifact.
- [ ] Explicitly set `APP_ENV=production`; `NODE_ENV=production`/`next start` alone is insufficient. Inject the canonical HTTPS auth URL and a new high-entropy auth secret through a protected secret store.
- [ ] Provision a least-privilege runtime database role and separate migration/operator roles. Verify schema/role/trigger changes are denied to runtime and privileged-operation flags are absent from the web environment.
- [ ] Restrict database networking and verify certificate-validating encryption for remote PostgreSQL. Confirm driver/pool behavior, timeouts, connection budget and UTC sessions in the chosen environment.
- [ ] Configure HTTPS termination, HTTP redirects, canonical hostname, secure cookies, no shared caching of private responses, appropriate HSTS/CSP and protected origin handling.
- [ ] Configure `TRUSTED_IP_HEADER` only when ingress overwrites it. Test anti-spoofing and auth throttling through that ingress. Configure image/body/request/concurrency limits without disabling application validation.
- [ ] Configure real SMTP and an explicitly authorized sender; verify TLS, domain ownership/delivery, recovery links, expiration/reuse and session revocation in a controlled acceptance account. Do not use local file-mail mode in production.
- [ ] Protect DB-stored payment/delivery/expense images, backups, logs and recovery secrets from public access. Verify database/backup access and encryption/retention rather than assuming filesystem modes suffice.
- [ ] Route sanitized errors, health/readiness, provisioning failures, database pressure, failed backup and reservation-cleanup alerts to an accountable operator. Test alert delivery and on-call access; no external notifications were sent by this audit.
- [ ] Configure a protected reservation-expiry job using the existing `orders:expire -- --confirm-expire` command; repeat batches until zero, monitor failures/backlog and prevent uncontrolled overlapping runs. Do not expose an unprotected cron endpoint.
- [ ] Exercise production-size reporting/upload load, storage growth and error recovery in staging. Source-row limits explicitly reject oversized reports; plan business usage within those limits.

## Database migration, backup and restore gates

- [ ] Review all twelve committed migrations, including SQL constraints/functions/triggers not expressible in Prisma schema. Record artifact commit and migration checksums.
- [ ] Before production changes, take an encrypted, access-controlled backup and verify its checksum, restore path and application/migration compatibility. Never use `db push`, reset, or destructive migration improvisation on business records.
- [ ] Run reviewed `prisma migrate deploy` with the migration role in the intended environment. Verify migration status, readiness and critical record counts before enabling writes.
- [ ] Assign backup owner, accepted RPO/RTO, frequency, offsite separation, key custody and retention. The proposed policy in operations is not an accepted SLA or configured service.
- [ ] Run a staging restore with production-scale representative data and separately recreated role grants. Revoke restored sessions/reset tokens before reopening traffic. The local recovery drill verifies fidelity, not a production recovery SLA.

## Deployment and rollback runbook for a later approved release

This is a reviewable procedure only; none of these production actions were executed.

1. Record owner approval, artifact/commit, runtime, secrets version, migration list, operators, maintenance window, acceptance criteria and rollback triggers. Keep the previous compatible application artifact and database connection version available.
2. Rehearse against an isolated staging database with outbound email controlled. Test the artifact with actual production-mode guards and ingress before approving the production change.
3. Stop or drain writes and background jobs as the approved maintenance plan requires. Capture a verified pre-change backup and reconciliation counts; preserve original database and logs.
4. Apply reviewed additive migrations once, deploy the approved artifact, then verify readiness, authentication/RBAC, a controlled dummy-account flow, private evidence boundaries, reports and reservation cleanup. Re-enable writes only after the release operator accepts these checks.
5. Roll back application code only when the previous artifact is proven compatible with the migrated schema. Stop writers/jobs before switching. Do not automatically reverse migrations or erase immutable business history.
6. If schema/data repair is necessary, prefer a reviewed forward repair. For restoration, restore to a new isolated database, validate fingerprints/constraints/critical records and role grants, revoke restored sessions/reset tokens, reconcile any post-backup orders/payments/stock with the owner, then switch the connection after explicit incident approval. Restoring a backup can lose later transactions; never treat it as a harmless code rollback.
7. Verify health and representative authorized/unauthorized flows after rollback; monitor errors, jobs and reconciliation. Retain both database versions and the incident record for the agreed window. Record actual recovery time/data loss.

## Acceptance status

High-severity identity and production-security gates remain open. The application may proceed to supervised local owner acceptance testing using isolated data; it must not be treated as approved for Internet deployment. Re-audit the changed controls and run the release checks on the chosen runtime/hosting setup before changing the final decision.
