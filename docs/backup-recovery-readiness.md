# FIXUP backup and recovery evidence

15 November 2026. **VERIFIED: isolated local backup/restore fidelity. BLOCKED: hosted recovery readiness**, because the owner confirms no hosted environment exists.

## Executed drill

Command: `npm run db:recovery-check`, using the existing guarded local test environment. Evidence: `.local/phase7-readiness/recovery.log` and `.local/backup-checks/51b8ba5de2ea09bb/manifest.json`.

- A consistent exported, read-only PostgreSQL snapshot was fingerprinted and dumped using custom-format `pg_dump --no-owner --no-privileges` from the same snapshot.
- The archive was restored with `--exit-on-error --single-transaction` into a new randomly named database, without `--clean` or overwriting any existing DB.
- **56 tables:** every row count and SHA-256 data fingerprint matched. **Four sequences** matched. Columns/enums/constraints/indexes/functions/triggers matched.
- All **13 migrations** replayed into a second new DB; a second deploy was idempotent and its schema matched.
- Total local drill duration was **12,865ms**. This includes local fingerprint/dump/restore/migration checks, not hosted incident detection, transfer, key recovery, auth revocation, reconciliation or traffic switching. It is not a production RTO claim.
- Cleanup dropped only the two databases created by that invocation. The source/test/development DBs and all existing backups were preserved. The new archive remains retained privately.

No schema source was changed and no production DB was accessed. The isolated restore is never served to application users.

## Current policy versus evidence

| Question                | Status           | Actual finding                                                                                                                                                  |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How created?            | VERIFIED         | Existing local drill and documented `pg_dump`/`pg_restore` procedure.                                                                                           |
| Where stored?           | VERIFIED locally | Ignored `.local/backup-checks/<run>/`; directory 0700, dump 0600. This is workstation storage.                                                                  |
| Frequency               | NOT VERIFIED     | Ad hoc local drills; no automated hosted backup schedule exists.                                                                                                |
| Encryption              | NOT VERIFIED     | Local dump is not encrypted. Permissions/compression are not encryption. No encrypted offsite destination/key recovery was proven.                              |
| Retention               | NOT VERIFIED     | Existing operations document proposes seven daily and four weekly copies; no executing retention job or offsite policy was verified. No old backup was deleted. |
| Restore fidelity        | VERIFIED locally | Successful drill above, including private proof bytes and auth/MFA records in the snapshot.                                                                     |
| Hosted restore/failover | BLOCKED          | No hosting, remote DB, backup role/key store or recovery target.                                                                                                |
| RPO/RTO acceptance      | NOT VERIFIED     | Targets below are proposals, not owner-approved commitments.                                                                                                    |

## Proposed targets for owner approval

Start with **RPO ≤1 hour** (maximum acceptable lost updates) and **RTO ≤4 hours** (time to restore usable, reconciled service). The owner must approve or amend both based on operational needs and available hosting. Meeting a one-hour RPO needs suitably frequent recoverable backups or PITR; a daily-only dump can lose up to 24 hours and does not meet it. Do not advertise either target before testing the selected system.

Proposed retention: seven daily and four weekly encrypted recovery points, offsite custody separate from runtime, monthly isolated restore rehearsals and a rehearsal after material schema/hosting changes. Verify actual provider recovery granularity, key custody, permissions, retention, costs and alert delivery before approval or integration.

## Safe recovery procedure

1. Owner declares incident and gates writes/traffic/jobs. Preserve the current DB and logs; choose a verified recovery point and compatible artifact/migrations.
2. Retrieve/decrypt using separately controlled keys. Verify checksums and manifest. Restore into a **new isolated DB**, without public traffic or outbound mail. Never overwrite the only live copy.
3. Verify counts/hashes, constraints, indexes, triggers, sequences and critical orders/payment/stock/expense records. Recreate restricted runtime/migration/backup grants; dumps omit global roles, ACLs and server settings.
4. Before admitting users, revoke restored sessions and pending reset/email/MFA challenges, require fresh privileged MFA, and preserve the encryption-key version needed to read enrolled factors. Restoring old authentication state must not revive revoked access. The fidelity drill intentionally compares original auth rows and does not perform this live maintenance operation.
5. Reconcile updates since the backup with the owner, particularly bank receipts/refunds, reservations and physical dispatch/stock. Do not infer missing amounts or replay transfers.
6. With separate incident authorization, switch the secret-managed DB connection, restart/drain safely, run health/RBAC/private-file/business smoke checks, then enable traffic/jobs gradually. Retain the old DB and evidence for the approved incident window.
7. Record actual data loss and total recovery time, sign reconciliation and fix the cause. Validate backups/alerts/expiry processing after recovery.

Hosted access is not required to complete the safe local drill and was not requested as a secret. Actual hosting, backup destination, operators and recovery approval are still required before any external restore test.
