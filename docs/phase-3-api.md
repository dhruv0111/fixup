# Phase 3 account, dealer, variant and shared-pricing contracts

All endpoints reuse Better Auth and the existing current-role/active-account permission checks. Mutation requests require the configured Origin, `application/json`, and a JSON body of at most 16 KiB. Responses use `private, no-store`; failures have safe codes/messages and no raw database details. No checkout, inventory, payment or order creation endpoint exists.

## Customer endpoints

| Method           | Path                              | Behavior                                                                                                                                             |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/PATCH        | `/api/v1/me`                      | Read own profile; update name, contact phone and business name only. Email/password stay with the existing authentication foundation.                |
| GET/POST         | `/api/v1/me/addresses`            | List/create own delivery addresses.                                                                                                                  |
| GET/PATCH/DELETE | `/api/v1/me/addresses/[id]`       | Owner-scoped read/edit/delete; another customer's ID returns 404.                                                                                    |
| GET/POST         | `/api/v1/me/dealer`               | Read own application; submit complete business application.                                                                                          |
| GET              | `/api/v1/me/orders`               | Authenticated later-phase foundation: `available: false, orders: []`.                                                                                |
| GET              | `/api/v1/me/prices?productId=...` | Resolve current user's category and return only eligible published product/variant prices from its active assigned list. No query overrides allowed. |
| POST             | `/api/v1/me/price-quote`          | Accept exactly one productId/variantId and integer quantity 1–10,000. Resolve and multiply prices on the server; never creates an order.             |

A price quote is an estimate of the configured selling amount, not a commercial quotation workflow or tax/checkout calculation. It includes list/assignment revision IDs for future order snapshot design. Future order creation must re-resolve and persist its original price snapshot transactionally; no orders or fictitious order history are stored now.

Dealer input: businessName, contactName, phone, email, address, city, state, postalCode, businessType, optional nullable GSTIN, expectedVolume and optional message. No status, role, category or priceListId fields are accepted. Identical concurrent pending retries return the same application without duplicate audit entries. A different pending application conflicts; rejected applicants can revise and resubmit; suspended applicants must contact FIXUP.

## Administrative endpoints

| Method    | Path                                                        | Permission / behavior                                                                                                    |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET       | `/api/v1/admin/management/customers`                        | `customers.manage`; query q/status/page, 25 per page. Status ACTIVE/INACTIVE.                                            |
| GET       | `/api/v1/admin/management/dealers`                          | `dealers.manage`; search and PENDING/APPROVED/REJECTED/SUSPENDED filters.                                                |
| GET       | `/api/v1/admin/management/customers/[id]` or `dealers/[id]` | Protected details, addresses/business data and latest 100 history events. Staff accounts cannot be managed as customers. |
| PATCH     | `/api/v1/admin/management/customers/[id]`                   | `{active, version, reason}`; suspend/reactivate; suspension deletes sessions through the existing DB trigger.            |
| PATCH     | `/api/v1/admin/management/dealers/[id]`                     | `{status, version, reason}`; transactional review, category/role synchronization and history.                            |
| GET/POST  | `/api/v1/admin/management/price-lists`                      | `pricing.manage`; list/create shared price lists.                                                                        |
| GET/PATCH | `/api/v1/admin/management/price-lists/[id]`                 | Read/edit entries and revisions; an update requires current version.                                                     |
| POST      | `/api/v1/admin/management/assignments`                      | `{category, priceListId, version, reason}`; assign an active list or null to RETAIL/APPROVED_DEALER.                     |
| POST      | `/api/v1/admin/management/variants?productId=...`           | `catalogue.write`; create a variant for an existing parent.                                                              |
| PATCH     | `/api/v1/admin/management/variants/[id]?productId=...`      | `catalogue.write`; update with current version, explicit approval/MRP confirmation, reason.                              |

ADMIN and SUPER_ADMIN manage customers, dealers and shared price lists. Catalogue publication remains SUPER_ADMIN-only, preserving Phase 2's owner publication policy. Parent products/categories continue through `/api/v1/admin/content/[resource]` rather than a duplicate catalogue API.

Dealer transitions: PENDING → APPROVED/REJECTED; APPROVED → SUSPENDED; SUSPENDED → APPROVED. Rejected applicants must resubmit before review. Inactive customer accounts cannot be approved. A suspended dealer retains ordinary active-account access but loses dealer capability and dealer pricing immediately. Category pricing requires all of current DEALER role, APPROVED profile, APPROVED_DEALER category and active account; otherwise only retail pricing is eligible.

Price-list input: name, active, entries, reason and version on edits. Each entry contains exactly one productId/variantId and integer amountPaise in 1–100,000,000. Duplicate targets and missing targets are rejected. Products with variants require variant entries; no fallback to a legacy parent price. No individual dealer overrides or internal supplier/cost fields are implemented. Missing/inactive/unassigned prices return an empty list or PRICE_UNAVAILABLE for estimates.

Optimistic revisions reject stale customer/dealer/list/assignment/variant writes with 409. Dealer application/review/customer suspension serialize using the same per-customer transaction lock. Important administrative writes create both ManagementEvent before/after snapshots and allowlisted AuditLog metadata in the transaction. Existing parent-content changes retain their Phase 2 transactional audit.

## Frontend

Customer: `/account`, `/account/profile`, `/account/addresses`, `/account/dealer`, `/account/orders`; existing `/register`, `/login`, `/forgot-password`, `/reset-password` remain the only authentication system.

Admin: `/admin/customers`, `/admin/customers/[id]`, `/admin/dealers`, `/admin/dealers/[id]`, `/admin/price-lists`, `/admin/price-lists/new`, `/admin/price-lists/[id]`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`; existing content/enquiry pages remain.

Public `/become-a-dealer` retains its initial enquiry form and links to the authenticated application. Product detail URLs are preserved and display approved active/published variants, representative-image labels, confirmed MRP only, variant-specific WhatsApp messages and opt-in account-price retrieval.

## Local QWIK setup

Run `npm run db:migrate` then `npm run db:seed:qwik`. Setup accepts only APP_ENV=development and the loopback fixup_dev database. Existing product/category/variant edits are preserved on repeat runs. No actual SKU, selling price or confirmed MRP is seeded. The 50g ₹175 reference is private administrative reference data, awaiting explicit confirmation.

The parent `/products/fixup-qwik-instant-adhesive` has 8g/20g/40g/50g variants with separate stable IDs, optional unique SKUs, images, publication and MRP settings, and variant PriceEntry relations. These IDs support later inventory/order relationships without implementing inventory now.

Actual assets: `public/brand/FixUp Qwik Adhesive Product Showcase.png` (featured/card/detail marketing image) and `public/brand/Fixup Qwik Super Glue Box Studio Shot.png` (gallery and variant packaging). URL paths encode spaces. The other three sizes explicitly label shared packaging as representative. Packaging claims remain labelled source notes; approved applications/materials/specifications/storage/documents remain unset until authoritative documents arrive.
