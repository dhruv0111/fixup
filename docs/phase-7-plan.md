# Phase 7 architecture and data-source plan

14 November 2026. Existing Phase 1–6 working-tree changes are preserved. No deployment, Phase 8, paid services or accounting/GST filing.

The baseline has 10 migrations, immutable sales/purchase snapshots, manual verified PaymentRecord entries, receipt-linked physical stock lots, reservation events, actual dispatch lot allocations and private proof pipelines. Inspected prior reports, schema, services, permissions, dashboards and bounded CSV reporting. Earlier execution evidence remains historical; fresh tests will verify this work. No separate original PRD is available in the current checkout/attachments.

## Sources and boundaries

- Sales Order/Line: created order count/value, category and historical selling-price performance. Cancelled orders remain a separate count and are excluded from successful order-value aggregates. Created/paid/dispatched/delivered are distinct metrics.
- PaymentRecord: actual verified receipts and recorded external refunds by transaction timestamp. PaymentSubmission is only the proof/review workload and never collections. Outstanding balances use verified net payments as of the selected cutoff against eligible order totals.
- PurchaseOrder/Line: draft/submitted/partial/full/cancelled commitments. GoodsReceipt/Line and posting/reversal ledger events: actual received value and quantity, independent of unreceived commitments. No supplier payables or payments are invented.
- StockMovement and ReservationEvent: on-hand, damaged and reserved snapshots through the selected cutoff, with available = on-hand minus reserved. Variant quantities remain independent; cross-variant pack totals are explicitly labelled.
- Dispatch/Allocation/DeliveryEvent: original dispatch activity and safe delivery-status reports. No courier data is invented. Immutable dispatch cost snapshots support profitability independent of later selling-price or cost changes.
- Customer/DealerProfile plus owned order history: protected customer/dealer activity and purchase frequency; no new public analytics or broad sales-rep access.
- New BusinessExpense with append-only revisions and optional private image attachment: basic auditable expense tracker, no financial record deletion.

## Approved costing decision

The owner explicitly approved recorded lot cost in this conversation before implementation: actual PO line subtotal less its recorded discount, excluding separately recorded tax, divided by the ordered quantity. Store the integer numerator/denominator rather than prematurely rounding unit cost. Compute quantity amounts with integer half-up paise rounding. Each received lot freezes this source; each confirmed dispatch allocation freezes its cost. Existing receipt-linked lots/confirmed allocations may be backfilled only from immutable original purchase records, with an explicit legacy-backfill marker. Opening/correction stock without a supported original receipt cost remains missing; no selling-price fallback or fabricated cost. A zero net purchase cost is valid if supported by a full recorded discount.

Gross dispatched revenue excludes line tax for tax-inclusive orders and excludes separate delivery charges/tax for tax-exclusive orders. Gross profit = dispatched merchandise revenue minus supported COGS. Operating surplus = estimated gross profit minus active expenses, labelled as a management estimate. Missing cost or returned shipments requiring financial review makes the complete estimate unavailable; known portions and missing quantities are shown. This phase does not invent refund/return accounting. Original dispatch revenue/cost remains tied to the dispatch date rather than silently restating earlier dispatch history after a delivery status change.

Business expenses have no invented customer/product allocation. Subset reports show supported gross profit, but allocated operating surplus is unavailable; the business-wide estimate is shown only without customer/product/shipment subset filters. Delivery activity includes preparation, confirmation or recorded delivery events in range, so an older dispatch delivered/returned in the selection remains visible. A return event requiring review can make the current management estimate incomplete even if its original dispatch belonged to an earlier period. Ready counts reuse current Phase 6 eligibility and are explicitly current queue metrics for the selected created-order cohort.

## Date/filter/report architecture

Shared server-side reporting service and validated filters feed both dashboard and CSV. Business timezone comes from BusinessSettings, default Asia/Kolkata; date ranges use local calendar boundaries converted to UTC, including DST-aware zones. Date-only expense fields use the same selected calendar dates. Stock is explicitly an as-of snapshot at the range end; flow metrics use their documented event date. Presets: today/yesterday/last 7/last 30/this month/previous month/Indian April–March financial year/custom. Applied filters and metric definitions travel with the response and UI.

Use explicit selects, RepeatableRead transactions and bounded source rows with a clear narrow-filters error instead of silent truncation or sample values. Group/chart/CSV calculations reuse server results and safe integer paise/rational arithmetic. CSV flattens only permitted fields, formats date/amount columns and protects spreadsheet formulas. No private image bytes, bank instructions, proof URLs or unnecessary customer PII are exported.

Sample-record testing reproduced an installed Prisma adapter timezone assumption: it emits offset-free DateTime parameters and replaces returned timestamp offsets with UTC. The local PostgreSQL default session was Asia/Calcutta; application timestamps and database-trigger reservation timestamps were therefore inconsistent. Set application/test Prisma sessions explicitly to UTC while preserving BusinessSettings timezone for reporting. No stored timestamps are rewritten. Pre-existing local records written under the old connection behavior require historical interpretation review before production use; verified development business tables are empty, and no real order/inventory/payment history is shifted or fabricated. Regression coverage must verify the complete earlier auth/expiry/stock suite under the corrected sessions.

## Permissions and implementation

ADMIN/SUPER_ADMIN: operational reports and basic expense management. SUPER_ADMIN: valuation/profitability/cost financial reports and any cost configuration. SALES_REP retains assigned-lead access only; customer/dealer accounts retain their owned order history. API and service permission checks remain mandatory.

Build dashboard summary and simple responsive charts, centralized 11-report navigation, filters and CSV, QWIK size comparison, protected expense create/edit/cancel/history/private image UI. Use the existing purple/white/charcoal styling. Add additive expense/cost snapshot schema and database immutability/consistency guards, then unit/API/desktop/mobile sample-record accuracy/security tests. Execute all earlier regression suites, Prisma/status/diff, types/lint/format, build/smoke and backup/restore; report exact outcomes and screenshots.
