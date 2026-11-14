# Dispatch and delivery API

All JSON mutations use the existing same-origin, application/json and 16 KiB request guards. Responses use `{data}` or safe `{error}` envelopes with private/no-store caching. Authorization is checked on the server, independently of UI controls. Version conflicts and reused keys with changed content return 409; validation/ineligible transitions return 422; missing/foreign owned orders return 404. ADMIN and SUPER_ADMIN receive `dispatch.manage`; only SUPER_ADMIN receives `dispatch.correct`. SALES_REP has no global dispatch access.

## Endpoints

| Method | Path                                          | Purpose                                                                                    |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/admin/dispatch`                      | Order queue with eligibility reasons and existing shipment summaries                       |
| POST   | `/api/v1/admin/dispatch`                      | Create one full-order draft                                                                |
| GET    | `/api/v1/admin/dispatch/[id]`                 | Protected shipment, actual lines, available lot choices, proofs metadata and event history |
| PATCH  | `/api/v1/admin/dispatch/[id]`                 | Versioned arrangements edit in draft or following delivery failure                         |
| POST   | `/api/v1/admin/dispatch/[id]`                 | Explicit confirmation or validated delivery event                                          |
| POST   | `/api/v1/admin/dispatch/[id]/allocations`     | Save staff-selected full-order lot quantities; no physical stock changes                   |
| POST   | `/api/v1/admin/dispatch/[id]/proofs`          | Private multipart delivery photograph/scanned-image upload                                 |
| POST   | `/api/v1/admin/dispatch/[id]/physical-return` | Owner-only inspected physical stock-return correction                                      |
| GET    | `/api/v1/me/orders/[id]/delivery`             | Own order tracking with an explicit public-to-owner field allowlist                        |
| GET    | `/api/v1/delivery-proofs/[id]`                | Authorized private image read; staff or explicitly permitted relevant customer             |

Queue filters: `q` (SO number/customer/dealer), `from`, `to` (order dates), `status` (order status), `method` (`LOCAL`, `COURIER`), `dispatchStatus` (`DRAFT`, `CONFIRMED`), `deliveryStatus`, `view` (`all`, `ready`, `blocked`, `history`, `failed`, `local`, `courier`). Empty filter strings are accepted. Up to 200 newest matching orders are examined; ready/blocked views then apply current eligibility. Narrow search/date filters for older records. Lot choices are bounded to 500 per variant and timelines to 500 events. Those limits are stated in the report rather than implying unbounded history.

## Payloads

Draft creation: `{requestId: UUID, orderId, shipment, reason}`. Draft edit: `{requestId, version, shipment, reason}`. `shipment` includes:

- `method`, actual integer `packageCount` (1–10,000), `scheduledDate` (YYYY-MM-DD), optional nullable `expectedDate`.
- Local: `personName`, `personPhone`, optional `vehicleNumber`. Name and phone must be entered together; assignment is required for confirmation/rescheduling/out-for-delivery.
- Courier: `courierName`, optional `courierService`, `awb`, nullable `bookingDate`, optional `shippingReference`, optional `trackingTemplate`. Actual courier/AWB/booking date are required at confirmation. No fictitious carrier or URL defaults are created.
- `instructions` are customer-visible; `internalRemarks` are staff-only. Irrelevant local/courier fields are rejected. After confirmation, method/package count/original scheduled dispatch date are immutable. Failed-delivery edits preserve before/after details in internal event history.

AWB supports 3–100 characters, starting alphanumeric and then letters/digits/spaces/dot/underscore/slash/hyphen. Courier and AWB normalize case/punctuation into a unique composite key. The same normalized AWB cannot be assigned twice to the same normalized courier; carrier aliases require consistent operator naming. A tracking template must be a known HTTPS URL with exactly one `{awb}` placeholder outside the hostname and without credentials or a custom port. AWB is URL-encoded. No provider is called and no live tracking is claimed.

Allocation: `{requestId, version, reason, allocations:[{lineId, lotId, quantity}]}`. All variants/quantities come from immutable Sales Order lines. Staff explicitly select actual lots; duplicate pairs, foreign variants, expired lots, insufficient lot stock and missing/excess quantity are refused. Multiple lots may supply one variant. Draft allocation is not a second reservation and can require revision if another eligible shipment consumes that lot first.

Action: `{requestId, version, action, reason, confirmed:true, occurredAt: ISO timestamp, publicMessage?, internalRemarks?, reference?, expectedDate?, recipientName?, confirmationSource?}`. Supported actions: `CONFIRM`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RESCHEDULE`, `RETURNED`, `CORRECT`. Failure has a required reason; return-to-sender also has a reference; rescheduling requires a current/future expected date. Delivered requires actual timestamp, recipient and confirmation source. Uploading evidence cannot change delivery status. Local delivery must pass through out-for-delivery; manual courier confirmation may follow dispatched/in-transit/out-for-delivery. Delivered/returned are terminal for operational transitions; an owner can append a correction record without rewriting the original event or changing stock.

Physical return: `{requestId, allocationId, quantity, condition: GOOD|DAMAGED, receivedAt, reference, reason, inspectedPhysicalReturn:true}`. Only returned shipments qualify. Cumulative returns cannot exceed the original allocation. Good units go to undamaged stock in the original lot; damaged units go to damaged stock. Both create an append-only positive ledger entry linked to the original allocation. No order reopening, refund, credit or automatic resale transaction occurs.

## Proof files and privacy

Multipart fields: `requestId`, `source`, `sharedWithCustomer` (`"true"`/`"false"`) and `file`. Unknown/repeated fields are rejected. Only PNG/JPEG/WebP images are accepted, maximum 5 MiB and 16 megapixels, one frame. Sharp decodes/re-encodes to PNG and removes source metadata. A document must be supplied as a scanned image; PDF/SVG/HTML and malformed or oversized files are rejected. Maximum 10 proofs per dispatch. Files and originals remain in PostgreSQL, never the public directory. Private reads use no-store, nosniff and sandbox headers. Access metadata is checked before reading bytes. Uploaded evidence is immutable and audited; sharing is an explicit upload-time choice. A new evidence upload does not imply successful delivery.

The customer tracking DTO excludes internal remarks, reasons intended for staff, operator IDs, request keys/digests, allocations, stock movements, private evidence and raw file bytes. Existing order timelines receive customer-facing dispatch/assignment/out-for-delivery/delivered/failure/reschedule messages. This is the existing in-app notification channel; no email/SMS/WhatsApp delivery is claimed.

## Confirmation transaction

The existing order advisory lock, customer/dealer lock and sorted variant stock locks serialize confirmation with payment, cancellation, expiry, account review and inventory work. Eligibility is rechecked after blocking locks. Verified receipts minus refunds must cover the full order; unresolved overpayment, late/refund flags, pending proof, invalid account/dealer status, non-ready/cancelled/expired/already-dispatched orders and mismatched/expired reservations block confirmation.

The transaction validates all allocations, consumes matching reservations, inserts exactly one negative ledger movement per allocation, confirms the dispatch with actor/time, changes the Sales Order and writes delivery/order/audit events. Unique allocation movement sources plus immutable records prevent repeated deduction. Deferred constraints require every confirmed line to match the order/reservation/allocation totals, every allocation to have its deduction, and the order to be paid and dispatched. Failure rolls back the whole operation. Repeated confirmation returns the existing shipment. Failed/returned delivery statuses alone never create positive movements. Sales refresh preserves confirmed delivery states when later payment evidence is recorded.
