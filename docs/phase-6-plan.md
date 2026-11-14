# Phase 6 implementation plan and baseline audit

Local-only work. No deployment, paid services or Phase 7.

The current clean checkout includes Phase 1–5 source, nine migrations and reports. Inspected sales creation, manual bank verification, private payment proof, reservations/expiry/cancellation, stock lots/append-only ledger, permissions, UI and test fixtures. The separately referenced original PRD and prior Phase 3–5 private execution logs are not present in this environment; report claims will not substitute for fresh test execution. The supplied Phase 6 brief is the authoritative new scope.

Integration changes required before dispatch:

- The existing order refresh function treats consumed reservations as expired. Preserve confirmed dispatch/delivery states when later payment actions refresh an order.
- Existing CHECK constraints admit neither consumed reservations nor dispatched order/ledger states. Extend them in a forward migration, preserving previous constraints and immutable history.
- Reservation expiry must be rechecked after all blocking locks, as payment verification already does. Use the existing order lock, customer/dealer lock and sorted variant stock locks; consume and deduct in the same transaction.
- Never infer payment from a screenshot. Recalculate verified receipts minus refunds; require full covered amount, reviewed overpayment if any, no pending proof/review flags, valid customer/dealer status, and matching unexpired active reservations.

Implementation sequence:

1. Run baseline Phase 5 integration checks. Add full-order draft dispatch, immutable line snapshots, manually selected lot allocations, delivery events, private proof and correction records. Use one dispatch per order, database sequence numbering, versioned updates and persistent request keys.
2. Implement draft editing, local assignment, courier/AWB details, eligibility queue, atomic confirmation and database guards enforcing exact reservation/ledger correspondence. Drafts never affect physical stock. Expired lots are blocked; staff choose actual lots and quantities rather than inventing package or stock details.
3. Add validated delivery transitions, explicit delivered confirmation, optional private PNG/JPEG/WebP photograph or scanned-document proof, failure/reschedule/return handling, and owner-only inspected physical-return corrections. Reuse the existing decoded/re-encoded image pipeline; PDF files are outside the supported upload formats. Returned status alone never restores stock. Corrections preserve original shipments and link positive return ledger entries to original allocations, with cumulative return limits.
4. Add protected admin navigation/queue/detail screens and owned customer/dealer tracking within existing order pages. Use the order timeline as the existing in-app notification channel; no external delivery claims. Tracking URL is optional, manually configured and validated; no invented provider URLs.
5. Test API authorization, eligibility, concurrency/idempotency, transaction rollback, exact stock/lot movements, private documents, transitions and customer isolation. Exercise local/courier workflows on desktop/mobile; rerun all prior tests, validation/migration/recovery, lint/types/format/build and smoke. Save exact results and screenshots, report business inputs and limitations.

Decisions: full-order dispatch only; no partial shipment, automatic courier tracking, automatic refund, multi-warehouse or general returns system. ADMIN/SUPER_ADMIN manage dispatch/delivery; only SUPER_ADMIN may record an inspected physical return correction. SALES_REP retains no broad order access because the existing assigned-lead scope does not justify it. Private delivery proofs live in PostgreSQL alongside the existing private payment-proof model, with size/type validation and authorization on every read.
