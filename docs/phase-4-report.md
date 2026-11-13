# FIXUP Phase 4 execution report

13 November 2026, India time. Supplier, purchasing and variant inventory management is implemented and verified locally. Existing Phase 1–3 work was preserved. No deployment or Phase 5 work was performed.

## 1. Completion summary and pre-implementation audit

Reviewed the repository, original PRD/briefs and implementation reports, existing schema/six migrations, product/variant catalogue, Better Auth/current-role permission checks, admin workspace/forms, audit/history services, request guards and actual integration/browser evidence. No critical existing architectural blocker was found. The [implementation plan](phase-4-plan.md) was written before major changes.

Phase 4 extends the current application rather than introducing another admin/auth system. The stock ledger is the source of truth; no user-editable balance field exists. All actual supplier, rate, stock, tax, batch/date and threshold inputs are administrator-entered. The development database was verified to contain **0 suppliers, 0 POs, 0 GRNs, 0 stock movements and 0 adjustments**, with **one QWIK parent and the original four variants**. Test data exists only in the guarded, separate test database.

## 2. Supplier module

Protected create/edit/details, supplied-variant relationships, search/status filtering, purchase history and ACTIVE/INACTIVE/BLOCKED states. Required contact/address/PIN/type fields are validated; GSTIN is optional and validated when present. Normalized name/phone/PIN identity and optional unique GSTIN prevent common accidental duplicates. No delete API is provided; historical foreign keys also prevent deletion of a transacted supplier. Versioned edits reject stale changes. Creation/status/edits are audited transactionally. History links to filtered purchase reporting beyond the latest 100 detail entries.

## 3. Purchase order module

Versioned drafts with active supplier and variant selection, multiple independent pack sizes, ordered quantities, actual unit purchase rate, explicit tax percentage, fixed line discount, optional expected date/internal notes, and server-calculated totals. The browser cannot submit authoritative subtotal/total fields. Tax applies after discount with half-up paise rounding per line; no tax rate or purchase rate is assumed. INR monetary values use integer paise, checked bounds and a 2,000,000,000-paise PO amount cap.

PO numbers are sequence-backed human-readable `FIX-PO-...` references. Statuses: DRAFT, SUBMITTED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CANCELLED. Submitted financial/product/supplier snapshots cannot be edited through the API, and submitted line snapshots are additionally DB-protected. Drafts and unreceived submitted POs can cancel; received POs cannot. Cancelling a PO cancels and audits its draft GRNs. Creation/submission/cancellation never creates stock. Historical snapshots remain unchanged after supplier/product name, variant MRP and selling-price changes.

## 4. Goods receiving module

Editable GRN drafts against submitted/outstanding POs; partial receipts, multiple GRNs, actual quantity entry, optional supplier invoice/reference and batch/manufacturing/expiry fields, review/explicit confirmation, receiving user/timestamp and `FIX-GRN-...` references. Drafts do not reserve remaining PO quantity and do not change stock.

Confirmation locks the PO, rechecks all outstanding quantities, locks affected variants in stable order and atomically completes the GRN, creates lots/movements, projects received quantities and updates PO status. Repeated/concurrent confirmation cannot post twice. Concurrent distinct drafts that together exceed the PO cause one safe rejection; no excess-receiving override was introduced.

Draft cancellation has no stock effect. Super Admin can explicitly reverse an eligible completed receipt with reason/confirmation only when sufficient undamaged units remain available in the original lots. Reversal appends compensating movements, reopens the appropriate PO remaining quantities and retains history. Consumed/damaged receipt reversal is refused.

## 5. Inventory module

Dashboard with total physical, available and damaged units, current stock by parent product and variant, low/out-of-stock counts and recent movements. Variant pages show lot/batch balances and threshold controls. All stock references existing ProductVariant IDs, including independent QWIK 8g/20g/40g/50g records. No duplicate QWIK parent was created.

Available and damaged quantities are sums of posted ledger deltas. Zero without movements is labelled as no stock recorded, not an asserted physical opening count. No reserved-stock balance, automatic reservation or invented reorder quantity is displayed. Inventory is single-location and uses integer pack/variant units.

## 6. Stock ledger and adjustments

Each movement records ID, product/variant, lot, type, available/damaged differences, previous/updated quantities, source GRN/adjustment reference, reason, actor and timestamp. Types include OPENING_STOCK, PURCHASE_RECEIVING, STOCK_ADJUSTMENT, DAMAGE, STOCK_CORRECTION and RECEIPT_REVERSAL.

Database triggers serialize by variant, validate both lot and variant nonnegative balances, validate receiving sources, calculate before/after snapshots, project PO received quantity and reject edits/deletes to movements/adjustments and changes to transacted lot metadata. Direct received-quantity changes are rejected. Application transactions also lock and validate before writing; failed posting rolls back all document/lot/ledger/quantity/audit changes.

Confirmed adjustments support opening stock once before any prior variant movement, signed physical corrections, positive damage transfers from available to damaged, negative missing-stock changes and other explained differences. Deductions/damage require a lot belonging to that exact variant. Every adjustment includes a mandatory reason, actor, timestamp, confirmation and persistent request ID. Balances are never silently overwritten.

## 7. Batch and expiry

Optional supplied batch number, manufacturing and expiry dates, received quantities, remaining available/damaged quantities, supplier/invoice/GRN references and lot movement traceability. Dates must be valid calendar dates and ordered if both are supplied. No shelf life or expiry rule is invented, no expiry is calculated, and missing dates remain missing. Expiry indexing and report ordering provide a foundation for later FEFO; no FEFO allocation, automatic quarantine or disposal policy is implemented.

## 8. Reports and dashboard

Protected stock by product/variant, purchases, supplier-wise purchases, GRN history, stock movements, damage, adjustments, low-stock and batch/expiry reports. Search/date filters and CSV export are implemented. Event reports use event dates; stock To date provides an as-of cutoff and batch date filters use expiry. Supplier filters apply to supplier-related event/batch records. Supplier purchase summaries separate committed purchases from drafts/cancellations and imply no payment status.

Operational lists paginate at 25 records; report pages show the first 100 matching rows and CSV includes all matching records up to a 10,000-row explicit bound. Larger result sets require narrower filters. Text formulas are escaped in CSV while numeric negative quantities remain numeric. Main tables prioritize product/variant/quantity fields and place traceability IDs later.

## 9. Schema changes

Ten new models: Supplier, SupplierVariant, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, StockLot, StockAdjustment, StockMovement and StockSetting. Relationships extend existing User/ProductVariant models. Unique request keys, supplier identities, PO/GRN numbers, PO variant lines, receipt lines and posting sources support integrity. No mutable stock-balance table or sales/order/payment/reservation model was introduced.

## 10. Migration and recovery

New additive transactional migration: [`20261113030000_supplier_purchasing_inventory`](../prisma/migrations/20261113030000_supplier_purchasing_inventory/migration.sql). It adds tables/relations/indexes/CHECK constraints, PO/GRN sequences, stock/source/quantity guards and immutable-history/projection triggers. The previous six migrations and existing rows remain intact; no actual business records are seeded.

All **7 migrations** are applied locally; Prisma validation and database/schema diff pass. Recovery passed **3 check groups**: exact restored table fingerprints/counts and document-number sequence states, matching constraints/indexes/functions/triggers, and complete fresh replay plus repeat deploy with matching schema. Snapshot evidence covers **34 tables and both numbering sequences**, privately stored under `.local/backup-checks/28a908a5f0b62790/`. Temporary restore/replay databases were removed. Recovery ran after fault-injection tests cleaned up their triggers.

## 11. APIs and frontend

Full contracts and input shapes: [Phase 4 API documentation](phase-4-api.md).

Root: `/api/v1/admin/operations`.

- GET/POST suppliers; GET/PATCH supplier ID.
- GET/POST purchase-orders; GET/PATCH PO ID; POST confirmed submit/cancel on PO ID.
- GET/POST goods-receiving; GET/PATCH GRN ID; POST confirmed confirm/cancel/reverse on GRN ID.
- GET inventory, stock-ledger, stock-adjustments, lots/[id], options and reports; POST stock-adjustments; PATCH thresholds/[variantId].
- Reports support private JSON and authenticated CSV export.

Pages under `/admin/operations`: suppliers, purchase-orders, goods-receiving, inventory, stock-ledger, stock-adjustments, reports, plus new/detail supplier/PO/GRN pages, inventory/[variantId] and lots/[id]. The existing admin dashboard links all seven modules and retains FIXUP styling and prior navigation.

## 12. Role/permission changes

ADMIN and SUPER_ADMIN receive suppliers.manage, purchasing.manage, inventory.read and inventory.adjust. SUPER_ADMIN alone receives inventory.reverse. CUSTOMER, DEALER and SALES_REP receive no internal inventory/purchasing access. Existing role/auth/dealer/publication permissions are retained. API and service authorization remain mandatory, independent of button visibility.

## 13. Security and data-integrity results

Executed tests verify supplier duplicates/validation/status/history, authorized draft edits and status revisions, tampered totals/invalid rates/quantities, PO/GRN state restrictions, foreign/excess receipt lines, all four independent pack sizes, repeated/concurrent receipt confirmation, concurrent deductions, immutable ledger/snapshots, negative-stock refusal, source/lot traceability, reversal privileges/eligibility, threshold revisions, optional/invalid batch dates, protected filters/CSV, formula escaping and origin/content-type/body-size guards.

A fault-injection test deliberately failed one line of a multi-line receipt and verified no partial GRN completion, lot creation, movement, received quantity or success audit persisted. Transactional operations create ManagementEvent snapshots and allowlisted AuditLog metadata. Public catalogue responses contain no supplier purchase rates or internal stock documents. No critical failing implemented workflow remains under this local coverage.

## 14. Exact test execution

Full combined Playwright run: **13 November 2026, 11:45:01.949 India time** (`2026-11-13T06:15:01.949Z`), duration **210.832 seconds**, retries disabled.

| Final suite                            | Passed | Failed | Skipped | Flaky |
| -------------------------------------- | -----: | -----: | ------: | ----: |
| Unit                                   |     19 |      0 |       0 |     0 |
| API/integration                        |    110 |      0 |       0 |     0 |
| Desktop Chromium                       |     17 |      0 |       0 |     0 |
| Mobile Chromium                        |     17 |      0 |       0 |     0 |
| Complete Playwright (three rows above) |    144 |      0 |       0 |     0 |
| Local production smoke                 |      5 |      0 |       0 |     0 |

Distinct test/smoke outcomes: **168 = 19 unit + 144 Playwright + 5 smoke**. Phase 4 adds 7 unit + 29 API + 8 desktop/mobile tests. No required final automated test was skipped or left unrun. Recovery/static/build/screenshot checks are separate categories, not added to this test total.

After the combined run, the purchase-history test was strengthened to explicitly change selling prices/MRP; all **29 Phase 4 API tests passed again**. After prioritizing business quantities in tables, all **8 Phase 4 browser tests passed again**, refreshing screenshots. These are reruns of existing cases, not extra unique tests. Final build/static/smoke checks use that final presentation.

Diagnostic runs are separate: first Phase 4 API 29/29 passed; initial browser run 2 passed/3 failed/1 interrupted/2 not run due ambiguous dropdown labels; second browser run 5 passed/3 failed due nested-section/duplicate-fixture selectors; corrected run 8/8 passed. The first combined attempt executed no tests because another checkout dev server held `.next`; it was stopped temporarily and the successful full run followed. No test or assertion was removed or given retries to obtain a pass.

Evidence: `.local/phase4-audit/final-results.json`, `full-tests.log`, `api-final-results.json`, `api-final.log`, `browser-final-results.json`, `browser-final.log`, `unit.log`, `smoke.log` and `check-results.json`. The standard `playwright-report/index.html` and `test-results/results.json` retain the full 144-test report; supplemental results remain separately saved.

Not run: physical iOS/Android devices, Firefox/Safari, external SMTP, real WhatsApp delivery, production infrastructure/load/failover or independent penetration testing. No pass is claimed for those. Current runtime: Node 26.4.0; earlier Node 24 evidence is historical, not re-executed in this phase.

## 15. Phase 1–3 regression preservation

All **107 prior Playwright regressions** remain and passed: 81 existing API/integration and 13 desktop + 13 mobile checks. Those include all 47 original Phase 1/1.1 and subsequent Phase 2/3 coverage. Existing 12 unit checks also pass within the 19. Registration/login/logout/recovery, durable suspension/session revocation, ownership, dealer approval/category pricing, public catalogue/enquiries/SEO/images and prior admin workflows remain intact under the executed coverage.

## 16. Build/lint/static results

Prisma validation, migration status, empty schema diff, TypeScript, ESLint with zero allowed warnings, Prettier, production build and 5 local production smoke checks pass. Builds retain the existing supported Webpack command; development retains Turbopack with persistent dev caching disabled from Phase 3. Command statuses/logs are saved in `.local/phase4-audit/`. No dependency/framework upgrade, paid service or production deployment was performed.

## 17. Desktop/mobile screenshots

[Phase 4 screenshot index](phase-4-screenshots.md) links **20 images**, ten views at both desktop 1280×720 and mobile iPhone 13 Chromium emulation (390×664 CSS pixels). Views include suppliers/detail, PO, GRN, adjustment, ledger, variant inventory, dashboard, batch traceability and purchase report. Browser captures assert no document-level horizontal overflow; data tables scroll within their own regions. Screenshots contain clearly synthetic QA identities/rates/stock only in the isolated test database. Representative captures were visually inspected.

## 18. Known limitations

No known failing implemented local workflow remains. Single inventory location; integer pack units; no carton/unit conversions, expiry eligibility policy, FEFO allocation, damaged disposal/reclassification, supplier returns or reservations. Reversal requires sufficient undamaged stock in original receipt lots; it cannot silently reverse consumed/damaged units. Submitted POs cannot change financial terms; cancel an eligible unreceived PO and create a reviewed replacement instead.

Selectors are bounded at 1,000 options, detail audit/purchase history at 100, and report exports at 10,000 matching rows with narrowing required. Ledger/adjustment pages use DB pagination; dashboard recent movements are a bounded query. Supplier duplicate checks are deterministic identity/GSTIN guards, not fuzzy identity resolution or branch merging. Purchasing calculations are internal records, not a GST invoice/payment/accounting system. A database superuser can bypass triggers; web authorization does not replace database least privilege.

## 19. Business information still required

Actual supplier/contact/GSTIN/type/payment terms and supplied products; approved purchase rates/discounts/tax details and rounding conventions; actual opening counts per QWIK variant and lot; supplied batch/manufacturing/expiry data; minimum thresholds; approved expiry/damage/correction/reversal operating procedures and responsible staff. No quantities, supplier identity, price or expiry policy was invented to fill these gaps. Existing SKU/selling-price/confirmed-MRP/TDS/SDS/legal inputs from Phase 3 remain pending independently.

## 20. Production blockers and stopping point

Owner UAT and commercial/technical/legal approval; real supplier/stock inputs and operating policies; verified email and privileged MFA; production HTTPS/SMTP/trusted ingress; least-privilege runtime/migration/operator DB roles; monitored errors/provisioning/stock operations; encrypted offsite backup scheduling/retention and a production restore procedure; realistic scale/security/availability validation. Local bootstrap-superuser credentials and test dumps are not production configuration.

No checkout, payments/payment verification, sales orders, dealer credit, automatic stock reservation, dispatch/couriers, advanced warehousing or transfers were implemented. No production deployment occurred and indexing remains disabled. Work stops at Phase 4; Phase 5 or deployment requires the owner's approval.
