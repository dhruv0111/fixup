# Phase 7 API and operations

Uses existing authentication/current-role checks, safe error envelopes `{data}` / `{error}`, private/no-store responses, same-origin JSON validation and request-size limits. Mutations are transactional and audited. No public analytics, payment gateway, paid service or bank synchronization.

## Permissions

ADMIN/SUPER_ADMIN: `reports.read`, `expenses.manage`. SUPER_ADMIN alone: `reports.financial` for profitability and numeric inventory valuation. Operational inventory responses do not select or return internal cost amounts. Sales reps retain their existing assigned-lead scope; no global reports permission was inferred. Customers/dealers retain owned orders through earlier APIs and cannot read reports, financial CSV or expenses.

## Read endpoints

- `GET /api/v1/admin/reports/dashboard`: KPI cards, charts, definitions, warnings and date/knowledge metadata. Owner gets valuation/profit; operational admins receive their permitted summary.
- `GET /api/v1/admin/reports/options`: bounded product/variant, customer/dealer and supplier filter choices; no costs, bank instructions, proofs or contact lists beyond names and IDs.
- `GET /api/v1/admin/reports/[kind]`: one of sales, payments, purchases, suppliers, inventory, expenses, profitability, deliveries, customers, dealers, products.
- Add `format=csv` to report kinds for the same filtered server-calculated report records. Dashboard/options are JSON-only. Financial authorization is checked before building/exporting data.

Common query: `preset=today|yesterday|last7|last30|month|previous-month|financial-year|custom`, custom `from`/`to` as YYYY-MM-DD, optional `knowledgeAsOf` ISO timestamp, `q`, `customerId`, `dealerId`, `customerCategory`, `supplierId`, `productId`, `variantId`, `method`, current `status`, current order `paymentStatus`, proof-workload `reviewStatus`, `deliveryMethod`, `courier`, expense `category`, `period=daily|weekly|monthly`, `view=summary|movements|receipts|history`. Unknown fields are rejected. The UI presents relevant filters per report; entity/date bounds and current-versus-historical semantics are defined in [metric definitions](phase-7-metrics.md).

Inventory `view=movements` exports posting history in the selected business period rather than stock snapshot rows. Purchases/suppliers `view=receipts` exports actual received/reversed events. Customers/dealers `view=history` exports the authorized selected order history. Main reports also expose these details in expandable tables. No private attachment or proof URL/bytes appears in CSV. Text formula prefixes are escaped through the existing CSV utility, and actual numeric monetary columns remain numeric, including negative profit. Timestamps are ISO UTC; expense dates are business calendar dates.

The response contains `range`, `summary` with formulas/units, `rows`, simple `charts`, protected `details`, `warnings`, `limit`, and `methodology`. The dashboard exposes cards, charts and inventory summary. UI tables paginate locally; exports use the complete matched rows up to the explicit bound. Too many source records return 422 REPORT_LIMIT, never silently truncated totals.

## Expense endpoints

- `POST /api/v1/admin/expenses`: `{requestId:UUID, reason, data:{title,category,amountPaise,expenseDate,paymentMethod,reference?,description?}}`.
- `GET /api/v1/admin/expenses/[id]`: current header, latest 100 immutable revisions and private attachment metadata; includes creator/time/version.
- `PATCH /api/v1/admin/expenses/[id]`: same fields plus expected `version`; active records only.
- `POST /api/v1/admin/expenses/[id]`: `{requestId,version,action:"CANCEL",reason}`. No deletion or automatic bank action; cancelled records are terminal.
- `POST /api/v1/admin/expenses/[id]/attachments`: private multipart `requestId` and `file` only. Reuses bounded image decoding/stripping/re-encoding. Maximum five PNG/JPEG/WebP receipt images, each up to 5 MiB/16 megapixels. PDF/SVG/HTML/malformed files rejected. Attachment cannot alter expense amount/status.
- `GET /api/v1/expense-attachments/[id]`: authorized expense staff only, PNG stream with private/no-store/nosniff/sandbox headers. No public storage URL.

Amounts are integer paise, 1–1,000,000,000. Actual expense date cannot be future or before 2000. Categories: TRANSPORTATION, LOCAL_DELIVERY, COURIER, PACKAGING, RENT, ELECTRICITY, INTERNET_TELEPHONE, MARKETING, STAFF, OFFICE, MAINTENANCE, OTHER. Methods: UPI, BANK, CASH, OTHER. Reference is optional; description up to 2,000 characters. Reason is mandatory, 5–500 characters. Strict payloads reject totals/roles and other unrecognized fields.

Persistent keys make identical retries idempotent; changed key reuse/stale versions return 409. Per-expense locks serialize edits/cancellations/attachments. Header changes and immutable revisions/audit commit together. Database guards reject changes without history, ghost revisions, noncontiguous history, edits after cancellation and historical deletion. Reusing the returned report knowledge cutoff preserves earlier expense revision figures after a correction.

## Cost policy

Owner-approved recorded lot cost is fixed for this phase. No arbitrary cost-editing API exists. Receiving captures original tax-excluded discounted purchase cost; dispatch posting captures allocation COGS. Existing immutable source records support explicitly marked legacy backfills. Unsupported opening/correction stock is missing-cost. See [methodology](phase-7-metrics.md) for complete/incomplete estimates and why customer/product operating surplus is unavailable without invented expense allocation.

## Pages

`/admin/business`, `/admin/reports`, `/admin/reports/[kind]`, `/admin/expenses/new`, `/admin/expenses/[id]`. Linked from the existing admin dashboard. Purple/white/charcoal styling, responsive KPI/chart/table layouts, loading/empty/error states and INR formatting. No frontend-calculated authoritative totals.

No deployment, Phase 8, statutory accounting/GST filing, payroll, returns/refunds module, automatic reconciliation or paid analytics is introduced. Before real use, confirm operating policies, actual costs/stock/expenses and private evidence retention, review legacy timezone interpretation where applicable, and complete earlier production controls.
