# FIXUP Phase 5 execution report

Local implementation and critical-workflow verification complete, 13 November 2026. Business launch prerequisites remain below. No deployment or Phase 6 work was performed. Changes are present in the shared working tree; no commit or push was made.

## 1. Implementation summary

Flow: Customer/Dealer → variant cart → reviewed saved-address checkout → Sales Order with immutable snapshots → stock reservation → external direct UPI/bank payment → private screenshot submission → independent admin bank-record verification → full payment and resolved exceptions → Ready for Dispatch. The website never initiates a bank transfer or confirms payment from a screenshot. No dispatch or physical deduction occurs in this phase.

The [pre-implementation audit/plan](phase-5-plan.md) identified that Phase 4 “available” represented physical usable stock. Existing pricing, customers, dealers, addresses, catalogue visibility, authentication, inventory, audit and permissions were reused. Shared stock locks and database guards now account for reserved quantities without rewriting the physical ledger or earlier migrations.

## 2. Shopping cart

Authenticated active customer/dealer variant cart, maximum 50 lines with integer quantities 1–10,000. Supports quantity changes/removal, available approved images, pack size, unit/line prices and subtotal. All values come from server-resolved current shared-category pricing; unavailable/inactive/unpublished/unapproved variants cannot be checked out. Last-seen price/category changes are flagged. Final configured tax/delivery and payable amount appear in checkout review. Browser-supplied prices/category overrides are rejected.

## 3. Retail and dealer Sales Orders

Current approved dealer role, category and profile status are all required for dealer pricing; pending/rejected/suspended applications receive retail prices. Checkout selects an existing owned address and confirms stored name/email/mobile, variants, quantities, customer notes and UPI/BANK method. An HMAC review token binds current prices, amounts, category/list revisions, settings revision, customer and address. A price/rule/address change requires a new review. Human-readable FIX-SO sequence numbers, immutable customer/address/product/variant/pricing/charge/payment-instruction/cancellation-policy snapshots and timestamps preserve historical orders. No dealer credit account exists.

## 4. Stock reservation design

Usable on-hand = physical ledger sum; reserved = ACTIVE reservation quantities; available = on-hand minus reserved. Damaged units remain separate; total physical inventory is usable on-hand plus damaged. Reservations reference exact order lines and variants, with unique order/variant and line constraints. Checkout is one transaction under idempotency/cart/dealer/settings and sorted variant locks plus shared catalogue/pricing/account/address locks. Existing inventory adjustments and GRN reversal cannot remove reserved units. Reservation events are immutable and support as-of inventory reporting. Consumption is explicitly rejected in Phase 5. Physical stock remains unchanged at checkout, proof upload and verification.

## 5. Expiry and cancellation

Durations and near-expiry windows require explicit owner confirmation; none are seeded. Private admin cleanup and the guarded `npm run orders:expire -- --confirm-expire` command process up to 100 due orders per run. Expiry also applies safely on owned order detail/payment operations. Order locks and immutable reservation events prevent duplicate releases. Timely fully verified payment holds active stock without an expiry pending review/dispatch. Partial/unverified orders expire under configured timing. Near/after-expiry proof flags manual review and never restores stock. Explicit late resolution checks current free stock before re-reserving expired holds. Cancelled/released holds cannot be restored. Cancellation uses snapshotted configured policy; paid cancellation preserves receipts and flags a manual refund decision. No automatic refund occurs.

## 6. Manual payment workflow

Only UPI and bank transfer. Owner confirms payer-facing UPI/bank account/IFSC/holder/branch/instructions, tax mode/rate, delivery charge, timing and cancellation flags before enabling checkout. Explicit zero tax/delivery is allowed. There are no real payment settings or invented business policies in development. Transfer instructions and exact amount are shown during review and on the order. Declared UTR, payment date/method, remarks and proof are evidence pending bank review.

## 7. Screenshot security

Actual Sharp decoding accepts single PNG/JPEG/WebP files up to 5 MiB and 16 million pixels, strips metadata and re-encodes PNG; encoded output is also size-limited. Streaming multipart input is bounded, duplicate/unexpected fields are rejected, and metadata includes hash/size/dimensions/sanitized original name. Ownership is checked before accepting/decoding evidence. Private PNG bytes live transactionally in PostgreSQL; there are no public media paths or orphan filesystem uploads. Only the owner or payments.verify may stream proof, with no-store/nosniff/sandbox headers. Authenticated images bypass Next's public optimizer. Private proof is included in database backup/recovery verification. Retention and operational backup access still need owner approval.

## 8. Admin verification

Protected queue/order detail shows order/customer/category/amount, references, dates, proof, submission history and verified receipts/refunds. Actions: Under Review, Verify, Reject, Request Resubmission, private notes and customer-visible messages. Verification requires explicit actual-bank-record attestation, confirmed actual received amount, actual reference, notes/reason and current submission revision. Flagged duplicate references/images require explicit acknowledgement; canonical actual bank references are globally unique, independent of method. Order locks and unique submission/payment keys prevent concurrent double credit. Even a promoted admin cannot review their own prior customer payment. Verified receipts/refunds and original submissions remain immutable. Rejected submissions are retained and new proofs can be submitted after review.

Partial verified funds show the remaining amount and cannot become ready. Excess funds leave the original order amount intact and require a recorded resolution or completed external refund. Refund entry records only an externally completed transfer checked by an admin, with amount/reference/verifier/time/audit and idempotency; it cannot exceed eligible verified net funds and never moves money.

## 9. Statuses and notifications

Order: PENDING_PAYMENT, PAYMENT_UNDER_REVIEW, PAYMENT_REJECTED, ADMIN_REVIEW, READY_FOR_DISPATCH, CANCELLED, RESERVATION_EXPIRED. Payment: UNPAID, PARTIALLY_PAID, PAID, OVERPAID, with verified net receipts/refunds and remaining funds separately visible. Proof: SUBMITTED, UNDER_REVIEW, VERIFIED, REJECTED, RESUBMISSION_REQUIRED; empty history displays Not submitted. Ready requires full net verified funds, active reservations, current buyer/dealer eligibility and cleared timing/refund/overpayment flags. No dispatched state exists. In-app immutable order events notify creation, submission, review, verification/rejection/resubmission, cancellation, expiry and decisions. No email/SMS/WhatsApp delivery is claimed.

## 10. Schema changes

Nine models: CartItem, SalesSettings, SalesOrder, SalesOrderLine, StockReservation, ReservationEvent, PaymentSubmission, PaymentRecord and SalesOrderEvent. Existing User/Customer/ProductVariant relations are extended. New SO sequence, compound/unique request/line/reference keys, bounded monetary/quantity checks, single pending-proof partial index, reservation/physical-ledger guards, immutable history/snapshot/proof triggers and restricted status transitions protect integrity. Inventory read/report APIs and dashboard distinguish on-hand, reserved and free stock. No customer/dealer/product/pricing/ledger module was recreated.

## 11. Migrations

Two additive transactional migrations:

- `20261113040000_sales_orders_manual_payments`: nine tables, SO numbering, indexes, bounds, reservation events/guards and forward replacement of the stock guard to protect reserved units.
- `20261113050000_sales_history_integrity`: financial snapshot, proof/review transition, payment/order state and settings integrity guards.

Nine total migrations. Existing seven migrations remain unchanged. Prisma's UUID default expression was normalized to PostgreSQL's canonical spelling; this changes no database behavior. Local deploy/status, schema drift and fresh replay/backup verification results are recorded in final verification below. No fake banking details, orders, suppliers or stock were seeded into development; synthetic fixtures exist only in the isolated test database.

## 12. APIs and frontend

[API contracts, fields and operator instructions](phase-5-api.md). Customer pages: `/account/cart`, `/account/checkout`, `/account/orders`, `/account/orders/[id]`. Admin pages: `/admin/sales/orders`, `/admin/sales/orders/[id]`, `/admin/sales/payments`, `/admin/sales/settings`. Public variant pricing adds cart controls. Existing account/admin/workspace navigation links these pages. Admin search supports SO number/customer/dealer, date, order and payment status. Lists show the latest 200 matches; filter to narrow results. Private proof/review/refund/settings/expiry endpoints are documented separately. No gateway callback or automatic reconciliation API exists.

## 13. Security findings and fixes

Verified protections include ownership isolation, current roles, JSON same-origin and bounded bodies, strict price/quantity input, private evidence access, no self-verification, immutable snapshots/proofs/receipts/history, globally unique bank references, exact-once checkout/release/refund/verification, stock lock sharing and rollback. Existing foundation authentication/session suspension protections remain intact. Historical snapshots survive address/list edits. Private admin notes and verifier identity never enter customer DTOs. There is no public reservation-expiry operation.

During verification, fixture publication approval and pack ordering were corrected; select controls received explicit accessible names; empty cart-button status regions were removed to preserve the existing pricing accessibility contract. The supplier variant selector now uses the supported 10,000-choice bound with deterministic ordering; repeated retained QA fixtures exposed its old silent 1,000-choice cutoff. Closed/expired order screens explicitly warn against a new transfer and accept only evidence of an already completed payment for review. A reproduced verification race that crossed the reservation deadline while waiting on a stock lock was fixed by rechecking expiry after all blocking stock/reference locks and recording the approval timestamp at that check.

The original Phase 3 placeholder order API/page assertions now expect available, empty owned history because Phase 5 implements those features. Those two intentional expectation changes retain authentication/ownership checks. A GRN reversal precheck now rejects reserved stock as a normal validation error before any writes, with the database guard as the final protection.

## 14. Exact test execution results

Final coverage contains **220 unique passing automated cases/checks**, with **0 unresolved failing cases, 0 skipped cases and 0 unexecuted cases in the required local suite**. This total is deduplicated across the full run and focused reruns; it is not the result of a single 220-test command.

| Final unique coverage               | Passed | Unresolved failed | Skipped |
| ----------------------------------- | -----: | ----------------: | ------: |
| Unit tests                          |     24 |                 0 |       0 |
| API/integration (Phases 1–5)        |    144 |                 0 |       0 |
| Desktop Chromium                    |     21 |                 0 |       0 |
| Mobile Chromium/iPhone viewport     |     21 |                 0 |       0 |
| Local production-build smoke checks |     10 |                 0 |       0 |
| Total unique                        |    220 |                 0 |       0 |

The complete `npm test` run executed 185 cases: **183 passed, 2 failed, 0 skipped, 0 flaky**. Both failures were supplier browser selection timeouts caused by the retained fixture catalogue exceeding the old 1,000-option limit. After the fix, all affected Phase 4/5 desktop/mobile tests executed: **16 passed, 0 failed, 0 skipped**. An additional lock/expiry race test was then added and reproduced the bug (**0 passed, 1 failed**); after correction the complete Phase 5 API suite executed: **34 passed, 0 failed, 0 skipped**. Combining the latest observed result for each unique case yields **186 passing Playwright cases**: 144 API, 21 desktop and 21 mobile. Payment timing changed only the server verification path; its complete API suite was rerun after that fix. Unit and production smoke results are additional unique checks, not inflated by repeated attempts.

Earlier diagnostic attempts are retained privately and are not described as successful runs:

| Diagnostic log / selected cases                            | Passed | Failed | Skipped |
| ---------------------------------------------------------- | -----: | -----: | ------: |
| `api-first.log` (fixture publication guard)                |      0 |     28 |       0 |
| `api-second.log`                                           |     28 |      0 |       0 |
| `browser-first.log`                                        |      5 |      3 |       0 |
| `phase5-final.log` (41 cases)                              |     39 |      2 |       0 |
| `regression-final.log` (185 cases)                         |    182 |      3 |       0 |
| `regression-clean.log` (185 cases, full result used above) |    183 |      2 |       0 |
| `affected-browser-final.log`                               |     16 |      0 |       0 |
| `expiry-race-reproduction.log`                             |      0 |      1 |       0 |
| `api-final.log`                                            |     34 |      0 |       0 |

Corrections included required fixture publication references, deterministic fixture pack/price ordering, accessible select names, empty status regions, the actual supplier option cutoff and the reproduced expiry race. Final test evidence, full/focused Playwright JSON and the deduplicated `verification-summary.json` are in ignored `.local/phase5-audit/`. No retries or skips hide a failing case. Real-bank transfers, production deployment and physical-device Safari checks were not performed and are not included in the passing count.

## 15. Phase 1–4 regressions

All existing suites are retained; no tests were removed or skipped. Two future-order placeholder expectations are intentionally updated as described above. Final verified previous-phase coverage is **144 Playwright cases** (110 API + 17 desktop + 17 mobile), **19 prior unit tests**, and the **5 prior production smoke checks**, all executed. The Phase 5 additions are 34 API + 4 desktop + 4 mobile + 5 unit + 5 smoke cases. The supplier selector regressions were fixed and all affected cases rerun successfully; historical failures remain visible above.

| Existing API suite    | Passing cases |
| --------------------- | ------------: |
| Foundation            |            25 |
| Hardening             |            16 |
| Catalogue             |            13 |
| Phase 3               |            27 |
| Phase 4               |            29 |
| Existing API subtotal |           110 |

Existing desktop/mobile suites pass 5 catalogue + 3 account/public pages + 5 Phase 3 + 4 Phase 4 cases per project. No prior scenario was removed.

## 16. Build, lint, types and recovery

Prisma schema validation passes; local development migration status reports all **9 applied**, and the final datasource-to-schema diff is empty. TypeScript passes. ESLint passes with **0 warnings**. Prettier and `git diff --check` pass. The final `npm run build` succeeds with Next 16.4.6 webpack, Prisma 7.10.1 and Node 26.4.0. The local development server was restored at `http://127.0.0.1:3000/`; homepage and database readiness both return HTTP 200, with no original undefined Prisma-delegate errors. The local production server passed **10/10 read-only smoke checks**, including homepage/readiness and unauthenticated protection of cart/orders/private proof/admin sales/settings; no data was created or modified.

The guarded recovery check passes: **43 tables** have matching row counts and data fingerprints, including private proof bytes; constraints/indexes/functions/triggers match; all **3 PO/GRN/SO sequences** match; all **9 migrations** replay on a fresh temporary database and a second deploy is clean. Temporary verification databases are cleaned by the script. Private manifest: `.local/backup-checks/4202f992ec632d06/manifest.json`.

The expiry CLI refuses execution without `--confirm-expire`; a flagged run on the verified empty development database returns `{expired:0,batchLimit:100}`. Read-only development checks confirm **0 Sales Orders, 0 proofs, 0 payment records, 0 reservations, 0 physical stock movements**, checkout disabled and no confirmed payment settings. No synthetic commerce data escaped the isolated test database. The npm lockfile was reconciled offline and Sharp 0.35.5 is explicitly required; no package version was upgraded during this step.

## 17. Desktop/mobile screenshots

[22 screenshot links](phase-5-screenshots.md): cart, checkout, proof pending review, admin verification, ready order, order history, order search, payment queue, settings, rejected proof and paid cancellation, each on desktop and mobile. Screenshots contain synthetic QA identities/payment details only. Capture checks reject horizontal overflow. Artifacts are private local files, with no external upload/publication.

## 18. Known limitations

No automated expiry scheduler is configured; trusted operators must schedule the documented guarded command or use private admin batches. Full-payment holds require admin follow-up until future dispatch exists. No automatic UPI/bank reconciliation, money movement, gateway, credit account, courier, dispatch, multi-warehouse or automatic refund is implemented. In-app timelines are the notification channel; no external delivery provider was added. Order/payment lists are bounded to 200 matches, timelines to 500 events and inventory variant choices to 10,000. Quantities are packs/units, not fractional weights. Private proof storage increases database/backup size. Existing pg emits a deprecation warning for queued queries on transaction clients; the installed version works, and a future pg 9 upgrade needs compatibility review. Mobile verification used Chromium with iPhone viewport emulation, not real-device Safari. No real bank transfer or production environment transaction was executed. Earlier Node 24 results are historical; these checks use installed Node 26.4.0.

## 19. Business information still required

Owner-confirmed real UPI/bank/holder/IFSC/instructions; approved retail/dealer selling prices for 8g/20g/40g/50g; actual SKUs/MRP where published; tax mode/rate and billing treatment, explicit delivery charge rules, reservation duration/near-expiry window, customer/admin unpaid/paid cancellation policies, overpayment/refund handling, proof retention/access rules, real opening inventory/supplier/GRN data and owner acceptance of customer-facing policies. Checkout remains disabled until required settings are explicitly confirmed.

## 20. Production readiness blockers

Owner business/settings/policy approval and controlled manual bank-record acceptance testing; real stock/pricing data; private scheduled expiry operation and monitoring; least-privilege database/storage/backup access with retention and recovery operations; launch environment/HTTPS/domain/trusted proxy/SMTP setup and previous-phase launch approvals. No production deployment has occurred. Phase 6 is not started. Approval is required before any later phase or deployment.
