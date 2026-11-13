# Phase 4 purchasing and inventory contracts

All internal pages reuse `/admin` and the FIXUP workspace. APIs live under `/api/v1/admin/operations`. Existing Better Auth, current-role/active-account checks, strict same-origin JSON mutations, 16 KiB body limit and private/no-store responses are retained. There is no supplier or stock deletion endpoint and no public inventory/cost endpoint.

## Permissions

ADMIN and SUPER_ADMIN: suppliers.manage, purchasing.manage, inventory.read, inventory.adjust. SUPER_ADMIN alone: inventory.reverse. CUSTOMER, DEALER and SALES_REP receive no new internal access. UI redirects do not replace API/service authorization.

## Endpoints

| Method    | Relative endpoint         | Behavior                                                                       |
| --------- | ------------------------- | ------------------------------------------------------------------------------ |
| GET/POST  | `/suppliers`              | Search/filter/page or create supplier.                                         |
| GET/PATCH | `/suppliers/[id]`         | Details, supplied variants and purchase history; versioned edit/status update. |
| GET/POST  | `/purchase-orders`        | Search/filter/page or create PO draft with requestId.                          |
| GET/PATCH | `/purchase-orders/[id]`   | Details/snapshots or edit a current-version draft.                             |
| POST      | `/purchase-orders/[id]`   | Explicit confirmed SUBMIT/CANCEL with version and reason.                      |
| GET/POST  | `/goods-receiving`        | Search/filter/page or create GRN draft against an outstanding submitted PO.    |
| GET/PATCH | `/goods-receiving/[id]`   | Details or edit current-version draft.                                         |
| POST      | `/goods-receiving/[id]`   | Confirm/cancel draft or Super Admin reversal of an eligible completed receipt. |
| GET       | `/inventory`              | Paginated variant balances and threshold flags.                                |
| GET       | `/lots/[id]`              | Batch/lot, remaining available/damaged quantities and source traceability.     |
| GET       | `/stock-ledger`           | Paginated immutable movement records.                                          |
| GET/POST  | `/stock-adjustments`      | History or explicit confirmed/idempotent adjustment.                           |
| PATCH     | `/thresholds/[variantId]` | Versioned optional minimumQuantity and mandatory reason.                       |
| GET       | `/reports`                | Protected JSON or CSV, kind/search/date/supplier/variant filters.              |
| GET       | `/options`                | Protected supplier/variant/lot choices for admin forms.                        |

Supplier fields: name, contactName, phone, email, address, city, state, postalCode, optional GSTIN, supplierType, paymentTerms, notes, status, variantIds, reason and version on edits. Status ACTIVE/INACTIVE/BLOCKED. A normalized name/phone/PIN identity key and optional unique GSTIN prevent accidental duplicates. No supplier data is seeded. Historical suppliers remain referenced, including after deactivation.

PO input: requestId UUID, supplierId, optional expectedDate/notes, reason, lines, version on edits. Each line has variantId, positive integer quantity (up to 1,000,000), integer ratePaise (up to 100,000,000), explicit taxBps (0–10,000), and optional fixed line discountPaise. Duplicate variant lines, invalid active targets, inactive suppliers and browser total fields are rejected. All totals are recomputed server-side. Tax applies after fixed line discount and rounds half-up to paise per line. The PO/subtotal amount cap is 2,000,000,000 paise; no tax rate, purchase rate, discount policy or supplier terms are inferred. Up to 50 lines within the request-size bound.

PO numbers and GRN numbers use database sequences (`FIX-PO-...`, `FIX-GRN-...`). Supplier, product/variant name, SKU/pack and financial values are snapshots. Submitted orders cannot be edited through the API; submitted line snapshots are additionally protected by a database trigger. Only draft or submitted orders with no received units can cancel. Cancelling a PO also cancels and audits its draft GRNs. No creation/submission/cancellation action adds inventory.

GRN input: requestId UUID, purchaseOrderId, optional invoiceReference/notes, reason, lines, version on edits. A line has purchaseLineId, positive integer quantity, optional batchNumber/manufacturedAt/expiresAt. Dates use YYYY-MM-DD and must be valid and ordered if both are supplied. No expiry is calculated. Only selected actual quantities are included. A draft neither reserves outstanding PO quantities nor changes stock. Confirmation revalidates each remaining quantity under a PO lock, atomically changes GRN status, creates traceable lots and movements, projects received quantities and updates the PO state. Another PO's line, excess quantities and cancelled/fully received POs are rejected.

Repeated confirmation of a completed receipt returns that receipt without another posting/audit. Concurrent confirmations of different drafts serialize on the PO, so excess drafts fail safely. Creation and stock adjustment request IDs are persistent idempotency keys; same normalized input returns the original result, changed input returns 409. Retain request IDs during network retries.

Reversal requires Super Admin, explicit confirmation/reason, and sufficient undamaged available units in every original receipt lot. It creates compensating RECEIPT_REVERSAL movements and reduces PO received quantities atomically. It never deletes receipt/stock history. A reversal of a damaged/consumed lot is refused; damaged disposal/reclassification and supplier returns are not implemented business workflows in this phase. Draft GRN cancellation is available to authorized purchasing admins and has no stock effect.

## Stock boundary

Stock is the SUM of StockMovement.availableDelta/damagedDelta. There is no mutable stock-balance field or balance-edit API. Lots provide optional batch metadata and receipt traceability. A DB trigger takes a variant advisory lock, verifies both per-lot and per-variant quantities stay nonnegative, checks receiving sources and writes previous/updated balance snapshots. Another trigger projects PO received quantities; direct application edits to receivedQuantity are rejected. Ledger/adjustment mutations and historical lot metadata changes are rejected by database triggers. Permissions and operational commands remain the application boundary; a database superuser can disable triggers, so production still needs least-privilege roles.

Adjustment input: requestId, variantId, optional existing lotId, kind, signed integer quantity, reason, confirmed:true and optional batch/date metadata for a new positive lot only.

- OPENING: positive units in a new lot, once before any prior variant movement.
- CORRECTION: signed available-unit difference, representing an admin's physical correction.
- DAMAGE: positive quantity transferred from available to damaged units of an existing lot.
- MISSING: negative available-unit difference against an existing lot.
- OTHER: signed available-unit difference with explanation.

Deductions/damage require a lot from the same variant with sufficient available units. An adjustment, movement and audit/history commit together. No negative stock, automatic reservation, automatic purchasing/reorder rule, return-to-supplier or stock allocation is implemented. Integer units are per pack/variant; total physical quantity is available plus damaged. Zero derived from no entries means no stock recorded, not a verified physical opening count.

## Pages and reports

Pages: `/admin/operations/suppliers`, `/purchase-orders`, `/goods-receiving`, `/inventory`, `/stock-ledger`, `/stock-adjustments`, `/reports`, plus new/detail pages for suppliers/POs/GRNs, variant stock/threshold pages under `/inventory/[variantId]` and lot traceability under `/lots/[id]`.

Reports: stock by product/variant, purchases, supplier purchases, GRNs, movements, damage, adjustments, low-stock and batches/expiry. Stock report To date is an as-of cutoff; From is for event reports. Batch date filters are expiry-date filters. Supplier filters apply where a supplier relationship exists; unbatched/manual additions have no invented supplier. Supplier purchase totals count committed orders separately from drafts/cancellations and imply no payment state. Quantities and rates are internal only.

JSON reports include all matching rows up to 10,000. The report page shows the first 100; CSV includes all matching rows within the cap. If the limit is exceeded, narrow filters rather than silently truncating. Operational list pages show 25 records per page; selectors are bounded to 1,000 options and latest 100 supplier/detail history records. CSV values are quoted and text formulas escaped. Metadata and source snapshots remain private.

The module is single-location inventory. No warehouse transfers, sales orders, checkout, payments, dealer credit, dispatch, FEFO allocation or production deployment is included. Optional expiry fields/indexing preserve a foundation for later FEFO support.
