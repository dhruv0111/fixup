# FIXUP production infrastructure, performance and recovery readiness

15 November 2026, Asia/Kolkata. **Production verdict: NOT READY.** Local performance and restore blockers have been addressed with evidence. The owner confirmed **no hosted environment exists**; infrastructure validation, staging and owner acceptance remain blocked or unsigned. No deployment, paid service, production credential/data change or application schema definition change was performed. Existing committed migrations were replayed only into newly created isolated test databases.

## Status definitions

VERIFIED means the specified check has supporting evidence. NOT VERIFIED means relevant but not demonstrated/approved. BLOCKED means a required environment or authorization is absent. NOT APPLICABLE means the item is outside this execution, such as integrating an unselected paid service. A local result does not certify a hosted environment.

## 1. Work completed

- Batched report eligibility reads within each existing RepeatableRead transaction; retained the same eligibility predicate used by live dispatch confirmation. Confirmation still fetches/rechecks current records.
- Replaced repeated linear inventory/lot/reservation lookups with request-local indexes. All calculations, rounding, missing-cost handling, row order and role filtering remain unchanged.
- Reused bounded date formatter configurations. **No financial data, dates, report results, user permissions or eligibility decisions are cached across requests.**
- Ran a successful isolated backup/restore and fresh migration replay.
- Audited configuration/security/monitoring; prepared [infrastructure checklist](production-infrastructure-readiness.md), [recovery evidence/runbook](backup-recovery-readiness.md), and [staging plan and owner UAT](staging-and-owner-acceptance.md).

The previous Phase 6 report was read in full and preserved at `.local/phase7-readiness/previous-final-qa-report.md`. Its 52-unit/222-API/52-desktop/52-mobile/21-smoke results and measured zero customer CLS remain historical evidence; they are not presented as a newly repeated complete suite.

## 2. Performance baseline and improvement — VERIFIED

| Measure                                    | Before   | After            |
| ------------------------------------------ | -------- | ---------------- |
| Warm dashboard service p50                 | 3,911ms  | 930ms            |
| Empirical sample p95                       | 4,390ms  | 979ms            |
| Prisma model operations per dashboard      | 879      | 18               |
| Owner/admin dashboard/report output hashes | Baseline | All 23 identical |
| Inventory output hash                      | Baseline | Identical        |
| Fingerprinted business dataset             | Baseline | Identical        |

Median improvement: **76.2%**. The original waterfall included 288 individual order loads, 288 customer reads and 288 dispatch reads. Three transaction-local batch reads replace those repeated reads. Indexed array lookups and formatter reuse reduce repeated computation; financial formulas were not changed.

Method: **20 sequential warm samples per version**, same workstation/runtime, guarded loopback test database, read-only connections, fixed knowledge cutoff and benchmark-process clock, one warm-up per version. Dataset fingerprints were checked before/after measurement, with exact serialized outputs compared for owner and operational Admin. Roles are service benchmark fixtures; these timings exclude HTTP/authentication/browser rendering and are not field metrics or a hosted SLA. ORM timings include adapter/serialization work; raw SQL statement counts/plans were not measured. No schema/index change was made.

The sample p95 is an empirical nearest-rank statistic from only 20 observations and is not a reliable production tail guarantee. **p99: NOT VERIFIED**, insufficient tail samples. The earlier 5.9–8.5s browser observations motivated this work but are not directly comparable to service-only timings. New hosted load/HTTP percentile acceptance is BLOCKED pending staging.

Evidence: [performance summary](../.local/phase7-readiness/performance-summary.json), [before](../.local/phase7-readiness/before.json), [after](../.local/phase7-readiness/after.json), [model profile](../.local/phase7-readiness/model-profile.json). No aggregate inputs were paginated or truncated to make KPIs faster. Existing source limits remain strict.

## 3. Validation and regression results

| Check                         | Status   | Evidence/result                                                                                                                 |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                    | VERIFIED | `.local/phase7-readiness/typecheck.log`                                                                                         |
| Unit tests                    | VERIFIED | 53 passed, including new timezone/formatter equivalence coverage                                                                |
| ESLint                        | VERIFIED | Zero warnings, `lint.log`                                                                                                       |
| Affected API                  | VERIFIED | 66 passed on a fresh isolated test DB; includes suspended paid-customer eligibility, dispatch, finance, privacy and permissions |
| Desktop/mobile reporting      | VERIFIED | Four desktop and four mobile cases passed; complete affected run 74/74, zero failures/skips                                     |
| Optimized build/smoke/restart | VERIFIED | Final build passed; 21/21 smoke checks; local readiness 200 → 503 → 200, no-store headers and stored session survived restart   |
| Formatting                    | VERIFIED | Full Prettier check passed; final report formatting repeated before delivery                                                    |

The first affected run on retained test data was **59 passed / 15 failed** after the expense test pushed an existing 9,106 expenses beyond the intentional 10,000-source limit. Failures returned `REPORT_LIMIT`; no partial/invented totals were accepted. All failures and logs are retained in `regression-initial-results.json` and `regression.log`. The cap and assertions were not weakened and no old record was removed. A new guarded local test database was created with the unchanged committed migrations for the functional rerun. This is separate from the already completed same-dataset performance comparison.

The fresh affected run completed **74/74**: 66 API, four desktop, four mobile; no failures, skips or flaky results. The original failure artifacts remain retained.

Evidence directory: [Phase 7 private QA](../.local/phase7-readiness/). Test artifacts also have immutable before/after archives. No existing development/test DB was reset or overwritten.

Local restart evidence: `.local/phase7-readiness/restart.json`. Only owned test processes were restarted; a deliberately unreachable local DB endpoint was used for failure detection. This does not prove hosted supervision or automatic in-process DB failover. Build/smoke evidence: `build.log` and `smoke.log`.

## 4. Infrastructure readiness

| Item                                                                      | Status         | Finding/evidence                                                                                                                        |
| ------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Environment, origin/session/MFA, role/TLS/pool safeguards                 | VERIFIED       | Current source/local checks; detailed source paths in infrastructure checklist                                                          |
| Actual host/domain, HTTPS ingress, secret store and DB credentials/grants | BLOCKED        | Owner confirms no hosted environment                                                                                                    |
| Actual pool capacity, monitoring, log retention and alerts                | NOT VERIFIED   | Five DB connections per app process; actual process/connection budgets and alert routing not configured                                 |
| Migration procedure                                                       | VERIFIED       | All 13 migrations replayed into a new DB; second deploy idempotent; restricted runtime and separate migration roles required in hosting |
| Hosted process supervisor/restart/drain/failover                          | BLOCKED        | No host or deployed restart policy                                                                                                      |
| External monitoring service integration                                   | NOT APPLICABLE | None selected/created; use existing provider capabilities first                                                                         |

See [infrastructure/operations readiness](production-infrastructure-readiness.md) for the full checklist, monitoring proposal and rollback prerequisites. Health distinguishes liveness from DB-backed readiness. Successful financial/dispatch changes are audited, and unexpected API failures have sanitized request IDs. **Confirmed observability gaps:** no deployed alert delivery, backup/expiry-job monitoring or failed-operation trend metrics. Expected validation/conflict failures are not automatically unexpected-error logs.

## 5. Backup and recovery

| Item                                                                     | Status       | Result                                                                                     |
| ------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------ |
| Isolated backup/restore fidelity                                         | VERIFIED     | 56 tables: all row counts/data fingerprints match; four sequences and schema objects match |
| Fresh migration replay                                                   | VERIFIED     | 13 migrations, idempotent second deploy, matching schema                                   |
| Local drill duration                                                     | VERIFIED     | 12,865ms total; not hosted RTO or restore-only time                                        |
| Local archive permissions/retention                                      | VERIFIED     | New archive retained, folder 0700/dump 0600; no previous backups deleted                   |
| Automated schedule, encryption/offsite storage and retention enforcement | NOT VERIFIED | Local dump is unencrypted; documented policies are proposals, not executing services       |
| Hosted restore, key recovery and traffic switch                          | BLOCKED      | No hosted environment/backup target                                                        |
| Owner RPO/RTO acceptance                                                 | NOT VERIFIED | Proposed RPO ≤1 hour, RTO ≤4 hours; owner must approve and provision/test capability       |

A daily-only backup may lose up to 24 hours and cannot satisfy the proposed one-hour RPO. Local fidelity preserved auth rows in an isolated, unserved DB; a real recovery must revoke restored sessions/challenges, preserve the correct factor-encryption key, reconcile later business events, and require fresh privileged MFA before traffic. Never replay bank transfers or overwrite the sole live DB. [Detailed recovery evidence and procedure](backup-recovery-readiness.md).

## 6. Security review

**VERIFIED, scoped implementation review:** current server-side roles/session-MFA assurance, customer ownership, private proof reads, actual bank-record attestation, normalized duplicate references, transactional stock/dispatch checks, decoded/bounded image handling, same-origin/body guards and allowlisted audit/error output remain in place. Dispatch/reporting API regressions and exact operational-Admin output parity support this review. No new confirmed authorization or financial-integrity exploit was found in the reviewed scope; this is not an Internet penetration-test certification.

**NOT VERIFIED / potential deployment risks:** actual staff identity/email/TOTP and emergency recovery, trusted proxy IP handling, remote TLS/role grants, secret/key custody, real SMTP, script CSP/HSTS and ingress request/load limits. App CSP currently restricts frames/base/objects but does not supply a general `script-src` or HSTS; those require a tested ingress policy. No security rule was disabled and no credentials were exposed.

## 7. Staging and owner acceptance

**Staging: BLOCKED. Owner UAT: NOT VERIFIED.** No host exists and no acceptance signature was provided. The local test server is not a hosted staging environment.

The [staging/UAT checklist](staging-and-owner-acceptance.md) defines the minimum separate HTTPS app/database/secrets/mail/backup/monitoring setup and controlled registration → dealer/pricing → receiving/stock → ordering/reservation → dummy payment verification → dispatch/delivery → cancellation/refund → reports validation. Its ten owner tasks include expected outcomes and blank Pass/Fail/evidence/approval fields. Use only test accounts, inventory and payments; no live transfer or production business record is needed.

## 8. Exact owner actions and release verdict

1. Name the release approver, technical operator and recovery contact; approve the selected staging/production design and costs before any resource creation.
2. Approve or amend RPO/RTO/retention targets. Provision separate runtime/migration/backup access, HTTPS/proxy policy, protected secrets/key custody, controlled SMTP, encrypted offsite backups and a fresh restore target under a separately authorized plan.
3. Prove health/alerts/backup and expiry-job operation, restart/failure handling, actual staff identity/MFA recovery and representative HTTP/load targets on the selected release runtime. Keep test/prod identities and data separate.
4. Execute the staged business workflows and sign the completed owner checklist. Review remaining physical-device/screen-reader acceptance from Phase 6.
5. Review all intended uncommitted changes into an immutable release artifact; rehearse migrations, pre-release backup, security-compatible rollback and reconciliation. Then give separate explicit deployment authorization identifying target/version/operator.

**NOT READY for production deployment.** Local performance and recovery evidence are substantially improved; they do not close the absent infrastructure and unsigned acceptance gates. No deployment, real email delivery, live payment, paid service or production-data change was performed or authorized by this report.
