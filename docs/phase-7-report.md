# FIXUP Phase 7 execution report

14 November 2026, India time. Local implementation of the supplied Phase 7 brief. No production deployment, paid service, Phase 8, real bank transfer or invented business transaction.

## 1. Completion summary

Implemented and locally verified the owner business dashboard, eleven centralized reports, protected CSV exports, auditable expenses/private receipt images, and approved immutable purchase/dispatch cost snapshots. **Phase 7 local implementation: complete for the supplied scope**, subject to the explicit operational limitations and production prerequisites below. Existing auth, permissions, order/payment snapshots, inventory ledger, reservations and dispatch services remain the sources. The [pre-implementation plan](phase-7-plan.md), [metric definitions](phase-7-metrics.md) and [API contracts](phase-7-api.md) record decisions and boundaries.

## 2. Dashboard KPIs and definitions

Owner cards: today's selected order value, this month's selected order value, orders created, pending payment for the created-order cohort, verified receipts, committed PO value, complete usable inventory value, low-stock variants, currently eligible ready orders in the creation cohort, delivered shipments, active business expenses and estimated gross profit. Admin receives ten cards, excluding inventory valuation and gross profit. Additional stock cards show usable, reserved, available and damaged packs. Daily/monthly orders, retail/dealer and status distributions and actual collection trends are rendered without a third-party chart subscription.

Each card includes its calculation definition. The [metric table](phase-7-metrics.md) specifies source models, exact formulas, included/excluded statuses, date basis and limitations for every important financial measure. Orders, verified money, dispatched revenue and delivery are distinct. Today/month cards intersect the active selection. As-of stock includes earlier history; current eligibility/status/configuration fields are explicitly labelled current.

## 3. Sales analytics

Created-order count, cancelled count, non-cancelled value, average order value, historical retail/dealer category, pending verified balance, daily/weekly/monthly trends and status/payment distributions. Product/variant filters use matching immutable merchandise lines. Cancelled orders are excluded from successful value; unpaid and undispatched orders never imply collections or realized dispatch profit. Current selling-price changes do not reprice historical orders.

## 4. Payment reports

Actual immutable PaymentRecord receipts and externally recorded refunds, net collections, method filters and trends. Payment dates are independent of order creation dates. Partial/full coverage is separately calculated for the selected created-order cohort. Submission/review/rejection workload is distinct from money; screenshots never create collections. No bank reconciliation, payment gateway or transfer is introduced.

## 5. Purchase and supplier reports

Draft, committed, partially received and completed POs remain distinguishable. Actual signed receiving/reversal movements determine received purchase value and outstanding packs, using original PO line amounts. Supplier and variant filters use actual lines. Receipt value includes recorded purchase tax, whereas approved inventory cost excludes separately recorded tax. No supplier payment/payable balance is fabricated.

## 6. Inventory and valuation

StockMovement and ReservationEvent aggregates produce as-of usable/damaged/reserved/available quantities. Current configured low-stock thresholds are respected; missing minimums are not invented. Movement exports and product/variant comparisons preserve independent 8g, 20g, 40g and 50g packs.

The user explicitly approved recorded lot cost: original purchase subtotal after line discount, divided by ordered quantity, excluding separately recorded tax. Receipt-linked lots capture this immutable rational source. Supported historical receipt lots are backfilled from immutable purchase records and marked legacy. Reserved usable stock remains owned inventory; damaged stock is excluded from usable valuation. Unsupported opening/correction stock has missing cost, never a selling-price or zero fallback. Supported zero cost is distinguishable from missing cost. Rounding is half-up per lot/allocation; a combined rational calculation can differ by a paisa.

## 7. Expense management

Admins/owners can create, edit and cancel actual dated/category/payment-method expenses, with optional reference/description. Reason, request key, actor, timestamps and optimistic version protect changes. Every header change requires a matching immutable revision and audit event; deletion, terminal edits, ghost revisions and unaudited changes are rejected. Idempotent retries do not duplicate expenses. Reports use the latest revision known at their returned knowledge cutoff, so a retained cutoff reproduces figures before later corrections. Cancelled records/history remain visible but are excluded from active totals.

Optional private PNG/JPEG/WebP receipts reuse bounded decoding/re-encoding, maximum five images per expense, 5 MiB/16 megapixels each. Bytes stay in PostgreSQL and never enter public directories, normal report DTOs or CSV. PDFs/SVG/HTML are unsupported.

## 8. Profitability estimates

Confirmed dispatches in the selected period contribute original merchandise revenue; inclusive tax is removed and separately identified tax/delivery charges are excluded. Actual allocated lots contribute frozen DispatchCost amounts captured with the dispatch movement. Gross profit is revenue minus complete COGS; operating surplus subtracts active business-wide expenses. Missing costs or returned-shipment review make complete estimates unavailable, with known components separately disclosed. Undispatched paid/cancelled orders are excluded.

No arbitrary expense allocation is invented: customer/product/shipment subsets return unavailable operating surplus because expenses are business-wide. Original revenue and cost snapshots survive later price/cost configuration changes. Existing physical return events are flagged for review, not treated as automatic financial reversals. This is a management estimate, not statutory accounting.

Known-record tests establish revenue ₹200, COGS ₹100, gross profit ₹100, remaining usable inventory ₹1,900 and tax-inclusive receipts ₹2,360 for the standard four-variant fixture. Inclusive-tax sales revenue is ₹169.49 with gross profit ₹69.49. Separate tests cover a ₹40 loss, supported zero cost, unknown opening costs and undispatched stock reservations. Fixtures use the real isolated test APIs/database, never development business data.

## 9. Dispatch and delivery reports

Actual preparation/confirmation/delivery events, local/courier split, delivered/failed/returned states, date/entity/courier filters and operational trends. A shipment confirmed earlier remains visible when a delivery event occurs in the selected period. Ready count reuses Phase 6's current full eligibility service, including active account, verified money and matching unexpired reservations. It is scoped to the selected order creation cohort, not a lifetime backlog or fictional historical eligibility reconstruction. Internal shipment remarks are excluded from report exports.

## 10. Customer, dealer and product analytics

Actual customer/dealer creation, current eligibility/configuration, historical non-cancelled orders, top customers/dealers, repeat orders, average order frequency and optional history exports. Historical RETAIL/APPROVED_DEALER snapshots remain stable after approval/price changes. Products/variants report individual quantities/value/averages; actual zero-activity QWIK variants appear without invented transactions or prices. No global financial permission was granted to sales representatives.

## 11. CSV exports

Same report source, filters, cutoff and authorization as JSON/UI. Complete matched rows export independently of the 25-row UI page. INR monetary columns use rupee units; actual numeric losses remain numeric and text formula prefixes are neutralized. Dates/timestamps are date-only or ISO UTC. No bank references, payment proof bytes, private receipt bytes or internal delivery remarks are exported. Empty reports contain a no-records header, not fake business rows. Oversized source queries fail explicitly rather than export partial totals.

## 12. Database schema

Five new models: LotCost, DispatchCost, BusinessExpense, ExpenseRevision and ExpenseAttachment. Two existing relation additions link actual lots and dispatch allocations to immutable costs. Cost uses rational integer paise/units with frozen rounded dispatch amounts; no mutable stock balance or editable historical cost field is introduced. Expense header/history/attachment relationships retain actors and audit provenance.

## 13. Migrations and recovery

Two additive transactional migrations, `20261114010000_business_reports_expenses_cost` and `20261114020000_reporting_history_guards`, bring the total to twelve. Constraints/triggers validate original purchase sources and actual dispatch movements, freeze cost history, require matching expense revisions and reject ghost/noncontiguous history. Prior migrations and business rows are preserved. No reset was used.

Recovery verification passed all three groups. Evidence: `.local/backup-checks/db355b4feffa05b3/manifest.json`. All 54 tables match restored counts/fingerprints, all four number sequences match, and constraints/indexes/functions/triggers match. All twelve migrations replay on an isolated fresh database; a second deploy is clean. The guarded drill removed only its newly created temporary databases. Duration 12.108 seconds. Source is the isolated test database, including private evidence bytes; no production database was used.

## 14. APIs and frontend

GET `/api/v1/admin/reports/[kind]` serves dashboard/options and eleven reports with JSON or safe CSV. Expense create/list context uses the expenses report; POST `/api/v1/admin/expenses`, GET/PATCH/POST `/api/v1/admin/expenses/[id]`, POST `/api/v1/admin/expenses/[id]/attachments`, and GET `/api/v1/expense-attachments/[id]` provide guarded mutations/details/private streams. Exact payloads, filters, permissions and bounds are in the [API contract](phase-7-api.md).

Pages: `/admin/business`, `/admin/reports`, report detail routes, `/admin/expenses/new` and expense detail. Existing admin navigation links them. Shared responsive forms, server totals, loading/empty/error states, accessible filter labels and lightweight charts reuse FIXUP styling. No dependency was added.

## 15. Roles and permissions

ADMIN and SUPER_ADMIN receive `reports.read` and `expenses.manage`. Only SUPER_ADMIN receives `reports.financial`; inventory valuation and profitability are checked on the server before data selection/serialization and CSV export. Customers, dealers and sales representatives are denied global reports/expenses/private receipt files. Existing personal account/order flows remain unchanged in scope.

## 16. Security findings and corrections

Validated same-origin/strict bounded mutations, current session permissions, server-only financial fields, safe CSV, private image validation/streaming, immutable audit/cost history, stale version rejection and concurrent expense edits. Report sources use repeatable-read consistency and explicit row bounds; no secrets/proof bytes appear in DTOs. Direct database tests reject unaudited expense changes and fictitious revisions.

A real timezone problem was found: the installed Prisma adapter formats offset-free timestamps and normalizes returned offsets. The prior local non-UTC session could misinterpret instants, including reservation events. Application and fixture Prisma sessions now explicitly use UTC; reporting still applies BusinessSettings.timezone to calendar ranges. A new regression verifies database/application clocks and actual reservation events agree. Existing timestamps were not shifted. Real legacy history written under a former non-UTC session requires review before historical production use; the development transaction tables are empty.

## 17. Exact execution results

Final unique coverage, deduplicated by file/title/project across the full run and the affected rerun:

| Category                | Passed | Unresolved failed | Skipped | Required local not run |
| ----------------------- | -----: | ----------------: | ------: | ---------------------: |
| Unit                    |     38 |                 0 |       0 |                      0 |
| API/integration         |    208 |                 0 |       0 |                      0 |
| Desktop Chromium        |     29 |                 0 |       0 |                      0 |
| Mobile Chromium         |     29 |                 0 |       0 |                      0 |
| Unique Playwright total |    266 |                 0 |       0 |                      0 |
| Production-build smoke  |     19 |                 0 |       0 |                      0 |

Combined unique unit/API/browser/smoke coverage is **323 = 38 + 266 + 19**. The Playwright subtotal row is not counted twice.

The full command started `2026-11-14T00:41:10.800Z`, duration 781.611 seconds: **265 passed, 1 failed, 0 skipped, 0 flaky**. The mobile catalogue owner-content-editor case had a native Windows worker exit `3221226505` before its test body (0 ms), not an assertion failure. It was rerun without code/assertion changes at `2026-11-14T00:54:41.520Z`: **1 passed, 0 failed, 0 skipped**, duration 12.605 seconds. This is not a claim that a single 266-case run passed cleanly. No required local case remains without a passing observation.

All **39 Phase 7 Playwright cases** passed in the full run: 31 API and four browser cases on each viewport. Seven new unit cases passed. They cover known costs/revenue, missing/zero costs, losses, undispatched/cancelled orders, original prices/categories, actual receipts/refunds, partial/full receiving, current eligibility, stock/reservations, expense history/concurrency/private images, timezone/date bounds, permissions, formula-safe CSV and a 1,000-expense export. Direct database guards reject unaudited header changes and ghost revisions.

Evidence: `.local/phase7-audit/full-results.json`, `full-regression.log`, `catalogue-rerun-results.json`, `catalogue-rerun.log`, `final-verification-summary.json`, `unit-verified.log` and `check-results.json`. Standard `test-results/results.json` contains the focused one-case rerun; the original full results are preserved separately. Recovery groups/static checks and diagnostic reruns are not added to inflate unique test counts.

Diagnostic runs are preserved separately and never inflated into final counts: initial API 19 passed/4 failed (two timezone defects, one overbroad test assertion and one native Windows worker crash); corrected API 24/24 passed. Expanded combined run 33 passed/4 browser failures exposed ambiguous dropdown accessible names and a test selecting Next's route-announcer alert. Explicit filter labels and main-scoped assertions corrected those issues. Corrected combined run 38/38 passed, before adding the final direct database history-guard case. Initial whole-format check found only the new metric document; it was formatted. No tests/assertions were deleted, retries added, or financial permissions relaxed.

## 18. Phase 1–6 regression

All **227 existing Phase 1–6 Playwright cases** have final passing observations: 70 foundation/security/catalogue, 37 Phase 3, 37 Phase 4, 42 Phase 5 and 41 Phase 6. The full command executed 226 of them successfully; the affected native-crash catalogue case passed the focused rerun. All 31 earlier unit cases pass within the 38-unit run. The earlier Phase 3 browser test's saved-state reload correction is retained. The UTC connection change was exercised by all these regressions; old report claims were not substituted for current execution.

## 19. Build, lint and TypeScript

Prisma validation, twelve-migration status, empty datasource/schema diff, TypeScript, ESLint with zero warnings, whole-repository Prettier and whitespace checks passed. Initial formatting found only the new metrics document; after formatting it, the whole check passed. The original check-results file retains that diagnostic first formatting outcome; `format-final.log` records the successful final check.

Prisma client generation and Webpack production build exited 0, including 46/46 static generation steps. All **19 read-only production smoke checks passed**, including homepage/login/readiness and protected auth, cart/orders, payment evidence, dispatch/tracking, reporting CSV and expense attachment boundaries. No database writes were performed by the smoke script. Logs: `.local/phase7-audit/build-results.json`, `build-final.log`, `smoke-final.log`, and the per-check `*-verified.log` files. Backup/restore results are detailed in section 13.

Runtime Node 24.15.0, Next 16.4.6, Prisma 7.10.1. Installed Next route/page documentation was consulted before writing pages/routes. Existing dependencies were reused. Local preview is restored at `http://127.0.0.1:3000`; this is not hosted deployment.

## 20. Desktop and mobile screenshots

[Screenshot index](phase-7-screenshots.md): 24 captures, twelve views on desktop and emulated mobile Chromium. Browser cases exercise every report, date filtering, CSV downloads, expense create/edit/private receipt/cancellation and restricted admin/customer access. Representative desktop dashboard and mobile expense captures were visually inspected. Screenshots contain synthetic isolated QA data, not real FIXUP figures.

## 21. Known limitations

No full accounting, GST filing, payroll, refund/returns module, automatic reconciliation, bank/courier integration or forecasting. Costs need real original purchasing/lot allocations; unknown costs prevent complete estimates. Current status/configuration fields are not a comprehensive historical status warehouse. Expenses are not allocated by product/customer. Returned shipments require review without invented financial adjustments. Historical timezone caveat is documented above.

Queries allow up to ten years from 2000, reject future To dates and refuse more than 10,000 matching source rows. Ready eligibility is limited to 1,000 candidates; narrow filters if exceeded. Charts show up to 36 periods/top entities; full matched table rows remain exportable. Existing single-location/integer-pack/full-order-dispatch constraints remain. Mobile coverage is Chromium emulation, not physical Safari. Private image receipts increase database/backup size.

## 22. Missing business information

The owner supplied contact numbers, WhatsApp preference, email, locality and opening/closing hours in earlier work; opening days remain unspecified. Phase 7 cost method is explicitly approved. Still needed for real operation: actual purchase rates/stock lots, product prices/SKUs/approved technical details, confirmed tax/payment/shipping settings and actual expenses, authorised staff procedures, receipt retention policy and owner UAT. No missing values were fabricated.

Read-only development evidence `.local/phase7-audit/dev-counts.json`: zero expenses/revisions/attachments, lot/dispatch costs, suppliers, POs, Sales Orders, stock lots/movements and dispatches. The original four QWIK pack variants remain. All sample financial transactions exist only in the guarded test database.

## 23. Production readiness and stopping point

Local completion is not production launch approval. Owner UAT and actual operating data, historical timezone review if legacy business records exist, least-privilege database credentials, HTTPS/trusted ingress, SMTP, private backup/receipt retention, monitoring, restore and reservation-expiry scheduling remain prerequisites from earlier phases. Hosted load/failover, real bank/courier interactions, physical devices/other browsers and independent penetration testing were not run or counted as passes. No deployment or Phase 8 was started; further phases/deployment await owner approval.
