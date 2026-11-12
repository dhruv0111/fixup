# FIXUP Phase 1.1 — hardening execution report

Date: 12 November 2026 (Asia/Kolkata). **Outcome: Phase 1.1 completed and verified locally.** Scope: existing foundation only. Repository source, installed authentication/framework implementation, database schema, migrations and tests were inspected directly. The Phase 1 execution report was treated as historical context, not verification evidence.

## 1. Issues discovered and fixes

| Finding                                                                                                                                               | Implemented correction                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer provisioning could fail after auth committed, leaving a valid identity without its profile and without a recovery path.                      | Durable completion marker; per-user row lock; unique-owner upsert; customer, registration audit and marker in one transaction; bounded retry of recognised conflicts; retry on protected access; bounded operator reconciliation. Successful identity creation is retained when provisioning fails. |
| Account suspension blocked application access but retained cookies' database sessions; reactivation could revive them.                                | Transactional suspension trigger deletes and audits sessions; session insertion locks/checks account state. A separate upgrade migration deletes and audits sessions belonging to already-inactive accounts.                                                                                        |
| Administrator CLI lacked explicit production safeguards.                                                                                              | Default production refusal; one-shot enablement, production flag, operator attribution, confirmed target ID and verified active identity. Promotion, session removal and audit are atomic. Existing SUPER_ADMIN is a no-op. No public promotion endpoint.                                           |
| JSON parsing accepted media types beginning with `application/json`, including `application/jsonp`.                                                   | Exact media-type comparison with optional parameters; regression coverage.                                                                                                                                                                                                                          |
| Some error paths did not explicitly disable caching.                                                                                                  | `no-store` on validation, JSON, provisioning and internal errors. Recovery errors use 503 and `Retry-After: 5`.                                                                                                                                                                                     |
| Test tools checked test-like database names but did not reject the development database if configured under different credentials/localhost spelling. | Shared guard compares canonical database identity, including URL decoding; rejects unsafe environment, remote host, wrong name and development/test aliases.                                                                                                                                        |
| Node 24, backup restoration and full migration replay had not been exercised.                                                                         | Actual Node 24 install/dependency validation, PostgreSQL archive/restore drill and fresh migration replay. No dependency version changes.                                                                                                                                                           |
| Existing browser assertion could select both its page alert and Next.js's route announcer.                                                            | Scoped that assertion to main content. All original tests remain; no assertion or test was removed to obtain a pass.                                                                                                                                                                                |

Provisioning failure logging excludes raw exceptions, SQL, connection strings, email, passwords and tokens. It records the internal user ID and bounded event/category only. Operator reconciliation also sanitizes failures before the per-account loop. Public navigation does not attempt provisioning, so a pending profile does not break the homepage or logout control.

## 2. Files changed

| Area               | Files                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema/migrations  | `prisma/schema.prisma`; `prisma/migrations/20261112090000_foundation_hardening/migration.sql`; `prisma/migrations/20261112110000_revoke_legacy_suspended_sessions/migration.sql` |
| Profile recovery   | `src/modules/identity/provisioning.ts`; `src/server/auth/config.ts`; `src/server/permissions/service.ts`; `src/components/layout/navigation.tsx`; `scripts/repair-profiles.ts`   |
| Request protection | `src/server/http/request.ts`; `src/server/http/errors.ts`                                                                                                                        |
| Operator security  | `src/server/operations/admin-promotion.ts`; `scripts/promote-admin.ts`                                                                                                           |
| Verification/tools | `scripts/lib/test-environment.mjs`; `scripts/run-tests.mjs`; `scripts/check-secure-cookies.ts`; `scripts/db-recovery-check.mjs`; `package.json` (two new script entries only)    |
| Tests              | `tests/integration/hardening.spec.ts` (new); `tests/e2e/pages.spec.ts` (one scoped locator, same assertion)                                                                      |
| Documentation      | `README.md`; `docs/architecture.md`; `docs/api.md`; `docs/operations.md`; `docs/phase-1-report.md` (historical-report cross-reference); this report                              |

`package-lock.json`, dependency versions, the original foundation migration and the 25 original integration tests are unchanged. Generated clients, runtime installation, databases, credentials, build outputs, browser reports and backup evidence remain ignored/private. No production environment file or seeded privileged account was added.

## 3. Node 24 compatibility

- Executed with **Node.js 24.22.3 LTS**, bundled **npm 11.19.1**, on this macOS x64 environment; PostgreSQL **18.6**.
- Downloaded the official Node archive and verified its SHA-256 against the official release checksum before extraction. Private runtime: `.local/runtimes/node-v24.22.3-darwin-x64/`; system Node installation was not changed.
- `npm ci --ignore-scripts --cache .local/npm-cache` installed the exact locked dependency tree under Node 24. Prisma generation was then run explicitly. Installation reported **0 dependency vulnerabilities**; this is an advisory result, not a penetration-test claim.
- `npm ls --depth=0` completed successfully. Next 16.4.6, React 19.3.1, Prisma/client/adapter 7.10.1, Better Auth 1.7.21, TypeScript 6.0.3 and all other versions remain pinned as before.
- Prisma client generation, driver-backed PostgreSQL access and migrations executed under Node 24. Actual Better Auth registration, scrypt credentials, sign-in, sessions and recovery were exercised through the test application under that same runtime.
- The existing `@types/node` 26.6.6 was retained to avoid unnecessary dependency churn. Runtime checks establish compatibility for exercised paths, not every API admitted by those type definitions or every operating system.

To reproduce in this workspace, prepend the verified runtime for the current shell:

```sh
export PATH="$PWD/.local/runtimes/node-v24.22.3-darwin-x64/bin:$PATH"
node --version
```

For other machines, install Node 24 LTS using the existing `.nvmrc` and run the commands below normally.

## 4. Authentication and authorization review

| Requirement                      | Actual coverage/result                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session expiration               | Seven-day lifetime, daily refresh and database lookup; expired database session rejected despite retained cookie.                                                                                                         |
| Session revocation               | Logout, all-device revocation, password reset and administrator promotion invalidate sessions; another user cannot revoke a session they do not own.                                                                      |
| Recovery expiration / single use | Actual expired token rejected, hashed identifiers verified, sequential reuse rejected and existing sessions revoked on successful reset. The installed library's reset path consumes verification within its transaction. |
| Login / registration throttling  | Persistent database-backed limits exercised: login rejects after ten attempts and signup rejects the sixth request within the configured minute. Spoofing the internal client-IP header cannot bypass the wrapper.        |
| CSRF / request handling          | Exact Origin required on mutations; missing/foreign origins, wrong media type, oversized body and injected signup privileges rejected.                                                                                    |
| Cookies                          | HttpOnly/SameSite=Lax checked locally; isolated HTTPS-origin handler probe verifies Secure-prefixed session cookie, Secure, HttpOnly, SameSite and path. This is not a test of a deployed TLS proxy.                      |
| Account suspension               | Access and new login denied; sessions deleted; inactive session insertion rejected; reactivation cannot revive the old cookie; upgrade reconciliation covers pre-existing inactive accounts.                              |
| Dealer suspension                | Missing, pending, suspended and rejected profiles denied dealer capability. Ordinary account access is retained.                                                                                                          |
| Server-side roles / ownership    | All five roles exercised; role demotion and changed dealer approval take effect on existing sessions; cross-user address access rejected; privileged settings writes require SUPER_ADMIN.                                 |

Production administrator policy was tested against dummy accounts in the isolated test database, including default refusal, unverified identity, wrong target ID, successful audited promotion, session removal and repeat no-op. No real production promotion was performed. The [operator procedure](operations.md) explains shell/IAM protection and the remaining email-verification prerequisite.

## 5. Database migrations and backup results

- All three migrations applied successfully to the separate local `fixup_dev` and `fixup_test` databases. The original migration was preserved; Phase 1.1 added two forward migrations without rewriting applied history.
- Fresh replay applied the complete chain to a newly created scratch database. A second deploy succeeded without pending changes. Columns, enum values, constraints, indexes, functions and triggers matched the current test schema.
- Integration checks rejected duplicate customer owners, orphan customer/address records, noncanonical email, invalid PIN and deletion that would violate restricted relationships. Dedicated guard tests verified development/test isolation and alias rejection.
- Legacy-suspension regression recreated the pre-hardening condition in the isolated test database, ran the cleanup SQL twice, confirmed exactly one audit per revoked session, then proved reactivation did not revive its cookie. Its fixture temporarily disables only the relevant trigger within a transaction and restores it; there is no runtime bypass flag or endpoint.
- **Local backup and restoration passed:** consistent PostgreSQL snapshot, custom-format archive, restore into a new database, and exact data fingerprints/counts for **11 tables / 1,730 rows** including migration history. Schema objects also matched. Temporary restore/replay databases were removed; development data was not restored over or reset.
- Final backup/replay drill duration: **3.457 seconds** on this small local dataset, not a production RTO estimate. Private evidence: `.local/backup-checks/c76065bc1a503eea/manifest.json` and `test-database.dump` (0700 directory / 0600 files). Archive SHA-256: `e9d1061532589af6e6abe99de9e1e0f8e16cebe855baf9f5128edd0191f64dbd`.

The [operations runbook](operations.md) documents backup ownership, proposed retention/encryption, restoration into a fresh isolated database, session/reset-token invalidation after a production restore, and validation before switching traffic. No cloud backup service was created.

## 6. Automated tests and build results

| Check under Node 24.22.3   | Final result                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original Phase 1 suite     | **31 passed**, all retained: 25 integration/API + 3 desktop + 3 mobile                                                                                                                                                                                                                     |
| New hardening tests        | **16 passed**: recovery/rollback/concurrency/reconciliation, safe logs, legacy recovery, signup/login throttling, suspension and upgrade cleanup, current RBAC, session ownership, request validation, secure cookie probe, operator safeguards, DB constraints and environment separation |
| Complete Playwright suite  | **47 passed, 0 failed, 0 skipped, 0 flaky**, 30.275 seconds                                                                                                                                                                                                                                |
| Production smoke           | **5 passed, 0 failed**: home/login/readiness 200; anonymous account/admin APIs 401                                                                                                                                                                                                         |
| Production build           | **Passed**, Prisma generation + `next build --webpack`; all 17 static-generation steps completed                                                                                                                                                                                           |
| TypeScript                 | **Passed**, `tsc --noEmit`                                                                                                                                                                                                                                                                 |
| ESLint                     | **Passed**, zero warnings/errors                                                                                                                                                                                                                                                           |
| Formatting                 | **Passed**, Prettier check                                                                                                                                                                                                                                                                 |
| Dependency tree / lockfile | Exact `npm ci` and `npm ls` passed; no version/lockfile changes                                                                                                                                                                                                                            |
| Database                   | Development connection and migrations passed; complete fresh replay, repeat deploy and backup restoration passed                                                                                                                                                                           |
| Diff hygiene               | `git diff --check` passed                                                                                                                                                                                                                                                                  |

Playwright evidence: `test-results/results.json`, final start `2026-11-12T10:51:30.108Z`; browser report: `playwright-report/index.html`. Both are ignored and contain dummy test data. Final totals are **52 successful test/smoke outcomes**, plus the separate migration/backup/build/static checks above. Builds used the existing supported Webpack configuration; no bundler/dependency change was introduced.

Earlier diagnostic runs are not added to final passing totals. One initial new HTTPS-cookie test failed because the tsx CLI child did not inherit the required `react-server` import condition; the probe now runs directly with Node's `--conditions=react-server --import tsx`. A subsequent browser run exposed the ambiguous existing alert locator described above. Neither failure was hidden with a skipped test or weakened application policy.

## 7. Remaining security and operational limitations

1. Email ownership verification and privileged-user MFA are not implemented. Production promotion deliberately requires a verified identity; do not bypass that requirement by blindly editing its database flag.
2. Real production TLS/ingress, trusted proxy header behavior, external SMTP delivery and hosted database credentials are not configured or exercised. Without a correctly enforced proxy header, rate limiting uses a conservative shared bucket. Distributed/load behavior has not been benchmarked.
3. Authentication lifecycle audit hooks other than the new transactional provisioning path remain post-commit library hooks. They are not claimed to be atomic with authentication changes. Operator promotions and suspension session revocations are transactional; database owners can still modify audit rows.
4. The local bootstrap database role is a superuser. Production needs separate least-privilege runtime, migration and operator roles, protected secret injection and external operational audit. CLI flags are safeguards, not a substitute for that access control.
5. Local backup fidelity was tested; encrypted offsite backups, scheduling, retention, alerting and a production restore have not been provisioned. The private local archive is permission-restricted, not encrypted. RPO/RTO and retention suggestions in the runbook are recommendations awaiting business/hosting decisions.
6. Provisioning reconciliation is available through protected access and an operator CLI, not an installed scheduler. A persistent database outage still prevents customer access until service is restored; failures are recoverable, not silently treated as completed profiles.
7. Chromium desktop/mobile emulation was tested. Real devices, Firefox/Safari, production-scale performance, failover and an independent penetration test remain outside this local hardening pass.

## 8. Production readiness assessment

This is a locally hardened application foundation, not an Internet-launch approval. The remaining identity, MFA, production infrastructure, monitoring and backup controls above must be resolved before public use. No deployment, paid service creation or Phase 2 implementation was performed.

## 9. Repeatable verification

Run sequentially because the dev/test and build commands share generated Next.js files:

```sh
npm run db:local
npm run db:migrate
npm test
npm run db:recovery-check
npm run build
npm run test:production
npm run typecheck
npm run lint
npm run format:check
```

The test and production-smoke servers terminate after verification. The workspace-owned PostgreSQL cluster remains available; `npm run db:stop` stops it. Operational recovery details are in [operations.md](operations.md).
