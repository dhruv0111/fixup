# FIXUP Phase 8 final audit report

Date: 14 November 2026, Asia/Kolkata.

**Decision: FAIL — critical production security prerequisites remain unresolved.** This is a release-readiness decision. The application can undergo supervised local owner acceptance testing with isolated data, but is not approved for Internet deployment. Passing local business regressions cannot establish verified staff identity, MFA, least-privilege hosting or recoverability of an environment that has not been configured.

Companion deliverables: [security audit](phase-8-security-audit.md), [release checklist and rollback procedure](phase-8-release-readiness-checklist.md), [executed tests, failures and reruns](phase-8-test-results.md).

## Executed results

Final unique passing observations: **42 unit, 212 API/integration, 29 desktop, 29 mobile and 19 production-build smoke cases (331 total)**. The full Playwright run was 268 passed/one catalogue-fixture failure; the post-fix catalogue/reporting rerun was 63/63 passed, including one newly added finance regression. These are deduplicated observations, not a claim of a single clean full run. Production build, lint, regenerated-client typecheck, schema validation/migration status and the npm advisory query passed; the advisory query reported zero known vulnerabilities. Backup/restore verified 54 tables, four sequences and all twelve migrations.

The independent raw integrity scan **exited 1** for one deliberately malformed synthetic order retained by a negative dispatch test. Read-only diagnosis confirmed its `QA unreserved line`; no real business data was repaired or removed. Four other ledger/reservation/dispatch invariant checks returned zero violations. Missing-cost synthetic lots remain explicitly incomplete. The test-results document preserves the failed scan, diagnostic regression failure, individual exit codes, reruns and environment limits.

## Scope and method

Reviewed README, architecture, Phase 1–7 reports/API documents, approved Phase 7 metric/cost definitions, operational procedures, schema and twelve migration files; traced authentication, permissions, route validation, catalogue/pricing, purchasing/stock, orders/reservations/payments, dispatch, reporting and private evidence code. Read the installed Next.js data-security/deployment guides before editing. Existing reports were treated as context, not current passing evidence.

Executed checks use the existing guarded loopback test environment. The runner rejects development/test database aliases and non-test/non-loopback targets, applies committed migrations without reset, and creates unique synthetic identities. Payment details, images, delivery confirmations and financial examples are dummy fixtures. No real payment credentials, transfer, production promotion, deployment, hosting purchase or modification of real inventory/business records was performed. Existing test records were not deleted or reset; the existing suite removes its temporary fault-injection objects, and the recovery drill cleans up only databases created by that drill.

## Modules audited and regression mapping

| Module                      | Review and executed coverage source                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication / users      | Foundation and hardening API suites; registration/login/logout, password hashing/recovery, sessions, escalation rejection, suspension/demotion, current role matrix, browser account/admin flows. |
| Customers / dealers         | Phase 3 API and desktop/mobile suites; profiles, foreign-address isolation, dealer application, approval/rejection/suspension/reactivation and account eligibility.                               |
| Category pricing            | Phase 3/5 suites; active assigned shared price lists, retail/dealer eligibility, absent prices, stale checkout review and historical price/category snapshots.                                    |
| Products / variants         | Catalogue/Phase 3 suites; publication/content approval, unique SKU/pack sizes, price/MRP integrity, demo suppression and four independent pack variants.                                          |
| Suppliers                   | Phase 4 supplier creation/edit/search, variant links and protected operations.                                                                                                                    |
| Purchase orders / GRNs      | Phase 4 draft/submission/partial/full receipt/reversal; rate/discount/tax math, over-receipt rejection, transactional rollback and immutable original records.                                    |
| Inventory / ledger          | Phase 4–7 suites; movement-derived stock, no draft stock, concurrency, immutable postings, insufficient/reserved stock protection and report reconciliation.                                      |
| Batch / expiry              | GRN lot/batch/manufacturing/expiry validation, lot traceability, expired dispatch allocation rejection and Phase 8 received-batch chain.                                                          |
| Stock adjustments           | Phase 4/5/6 suites; authorized reasoned corrections, damage separation, reservation protection and bounded inspected returns.                                                                     |
| Cart / sales orders         | Phase 5 and Phase 8 chains; cart edits, server prices, review tokens, immutable address/totals, idempotent checkout and competing buyers.                                                         |
| Reservations / cancellation | Phase 5/6; reservation without physical deduction, rollback, cancellation/expiry release exactly once, late re-reservation and expiry rechecks after blocking locks.                              |
| Manual payments             | Phase 5/7; proof does not credit funds, explicit actual bank attestation, full/partial/late/duplicate/excess payments, self-review denial, refund recording without transfers.                    |
| Payment proof privacy       | Owner/reviewer reads, anonymous/foreign denials, no-store streaming and unsafe/spoofed/oversized/repeated upload rejection.                                                                       |
| Dispatch / delivery         | Phase 6 plus Phase 8 chains; eligibility, actual lot allocations, one-time stock deduction, local/courier/AWB, failed/rebooked/returned/delivered tracking and scoped customer views.             |
| Business dashboard          | Phase 7; actual source totals, current eligibility, financial permission boundaries, charts and business-date filtering on desktop/mobile.                                                        |
| All eleven reports          | Sales, payments, purchases, suppliers, inventory, expenses, profitability, deliveries, customers, dealers and products: Phase 7 API and both viewport report loops.                               |
| Expenses                    | Create/revise/cancel, concurrent/stale edits, immutable audited revision chain, private receipts, filters and knowledge-cutoff reproduction.                                                      |
| CSV exports                 | Permission parity, selected filters, full matched rows, 1,000-expense aggregation/export, formula escaping, genuine negative monetary values and private-field exclusion.                         |
| Lot cost / valuation        | Original net purchase-cost snapshots, tax exclusion, actual allocated dispatch COGS, missing versus supported zero cost, rounding, remaining owned stock and return-review incompleteness.        |

## Complete business workflows

| Workflow                 | Executed evidence / assertions                                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Customer purchase     | Phase 8 retail chain registers and logs in, reads catalogue/current prices, uses cart/reviewed checkout, creates/reserves an order, uploads dummy proof, checks no receipt exists before verification, records bank-verification attestation, dispatches local stock and confirms delivery. Phase 5/6 browser suites exercise these screens. |
| B. Dealer purchase       | Phase 8 dealer chain registers/applies, receives admin approval, logs in again, asserts dealer pricing and a 50-unit order, verifies dummy payment, confirms courier dispatch and delivery, and reconciles profit/remaining stock. No transfer is initiated.                                                                                 |
| C. Procurement           | Both Phase 8 purchase chains create isolated supplier/product/variant/PO/GRN data through existing fixtures/APIs, assert ledger/batch/expiry and inventory valuation; Phase 4 tests separately cover partial receiving and reversals.                                                                                                        |
| D. Cancellation / expiry | Phase 5 tests assert physical stock stays unchanged at reservation and release occurs once on cancellation/expiry, including concurrent cleanup. Late payment resolution checks fresh available stock rather than silently reviving reservations.                                                                                            |
| E. Dispatch              | Phase 6 tests enforce full verified funds, current eligibility and usable allocated lots; confirmation consumes reservations and posts immutable deductions once. Local and courier/AWB flows, delivery proof/privacy, explicit recipient/source/time and delivery confirmation are exercised.                                               |

The new chain tests use real local HTTP requests and PostgreSQL, with test fixture setup for isolated products/settings. They are not a claim that one browser session traversed every screen from registration through delivery. Desktop/mobile suites supply complementary UI coverage. None substitutes for owner UAT or real bank/courier operating verification.

## Financial and data-integrity conclusions

- Order value, verified collections, dispatched revenue and delivery are separate measures. Cancelled orders do not become successful sales. Screenshots/review workload never enter receipt totals; actual recorded refunds remain separate immutable records.
- Purchase commitments and signed received purchase value use original recorded PO lines. Inventory cost uses the approved rational net purchase amount after line discount, excluding separately recorded tax. Dispatch cost freezes the actually allocated lot cost; later selling-price/list changes do not rewrite history.
- Missing original costs remain null/incomplete; documented fully discounted zero cost remains a valid recorded zero. Damaged stock is separate; reserved usable stock remains owned inventory. Return events mark estimates for review without invented accounting reversals.
- Gross profit uses dispatched merchandise revenue excluding separately recorded charges and inclusive tax, less known complete COGS. Active expenses reduce business-wide operating estimates; filtered subsets do not receive invented expense allocation. Direct database/history guard tests reject unaudited expense edits and fictitious revisions.
- UTC database sessions preserve actual instants. Report ranges, grouping and April financial-year boundaries use the configured business timezone, default Asia/Kolkata. CSV instants are explicit UTC; date-only expense values remain business dates.
- Report sources use repeatable-read transactions and refuse oversized sources rather than returning partial totals. Current status/eligibility fields are labelled current; reporting is not a full historical accounting warehouse.

Synthetic expected amounts in tests establish calculation correctness only; they are not FIXUP financial figures. See test-results for the independent read-only ledger/order/reservation/dispatch integrity checks and recovery evidence. Existing historical timestamps written under a former non-UTC session still require owner/operator review if real records exist. No timestamps or missing costs were fabricated or backfilled by this audit.

## Failures, fixes and changes

The first test run could not reach PostgreSQL inside the sandbox and executed no Playwright cases. Retried with authorized local access. The initial TypeScript check read a stale generated Prisma client; generation restored the schema types and the rerun passed without changing application code or weakening types.

One catalogue regression subprocess entered application production mode without the explicit valid sender now required by existing environment validation. Updated only its dummy environment with `FIXUP QA <recovery@fixup.test>` and added an assertion that the successful production catalogue probe actually completed. No SMTP message is sent by that read-only probe. The test-results document records the affected rerun separately from the original full run.

Corrected stale operations wording from Phase 1.1-only/three migrations to the implemented Phase 1–7 scope/twelve migrations and linked the release gates. Added the four audit deliverables. No new product feature, permission relaxation, schema change or dependency change was introduced.

The production build regenerated `next-env.d.ts` to reference production build types instead of development types; no framework behavior was customized.

**FIN-01 — High data-integrity impact, fixed:** payment-method filtering reused an order filter containing the checkout method for actual PaymentRecord and PaymentSubmission queries. A bank payment/refund on an originally UPI order could disappear from bank cashflow/workload. A new isolated regression first failed with a real pending BANK submission reported as zero. The source now retains entity filters while applying method to the actual payment/submission record. The regression also checks bank receipts, a bank refund against an original UPI receipt, net bank collections and separate UPI totals. Created-order cohort metrics retain their documented checkout-method basis. Updated the metric definitions; no stored transaction was changed by the fix. See affected rerun results in the test-results document.

## Production blockers and owner information

High-severity open findings SEC-01–03 require verified privileged identity/MFA, separate least-privilege database access, and an explicitly configured/verified production environment. SMTP delivery, ingress TLS/cookies/cache/IP trust, private backup encryption/restore, monitoring/alerts and reservation scheduling must be proved in the chosen hosting environment. A local build and smoke test do not close these gates. Repeat release checks on the project's selected Node 24 runtime; this machine executed Node 26.4.0.

Owner must supply/confirm actual product prices/SKUs/content, original purchasing/opening lots/costs, tax/payment/shipping/cancellation settings, expenses, approved policies/opening days, staff bank-verification/dispatch procedures, evidence-retention policy and accepted recovery objectives. Approve and record owner acceptance results. Keep checkout disabled until its real settings are confirmed; never carry QA payment/account settings into production.

Detailed responsibilities, backup/restore prerequisites and a future controlled deployment/rollback runbook are in the [release checklist](phase-8-release-readiness-checklist.md). No hosted configuration, load/failover, external email/bank/courier, physical device, independent penetration test or production-scale restore was counted as passed.

## Stopping point

Phase 8 audit artifacts are complete for owner review. Release remains **FAIL** while critical security gates remain open. Resolve the named gates through separately approved work, rerun affected regressions and staging release checks, and obtain owner acceptance before revising that decision. No deployment was performed.
