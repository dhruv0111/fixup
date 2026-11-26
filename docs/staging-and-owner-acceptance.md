# FIXUP staging validation and owner acceptance

15 November 2026. **BLOCKED:** the owner confirmed no hosted environment exists. **NOT VERIFIED:** owner acceptance; no row is pre-approved. The guarded local test server is not a hosted staging environment.

## Minimum staging setup — requires separate approval

Use an isolated app/service, HTTPS origin, selected supported Node runtime, separate PostgreSQL database and restricted runtime/migration/backup identities. Provide a private secret store, controlled test mailbox/sender, protected dummy proof storage, health/log/backup/job visibility and named release/recovery operators. Prefer existing provider features; no paid service/account or deployment has been created.

Keep staging secrets, auth cookies/origin, database and mail distinct from production. Populate only synthetic customers/dealers, approved test catalogue, inventory and clearly dummy payment instructions. Restrict recipients/outbound mail and operator access. Do not copy real proofs or perform bank transfers. The owner must approve hosting, costs and the exact staging setup before execution.

Hosted staging must exercise `APP_ENV=production` with its own canonical HTTPS `BETTER_AUTH_URL`, persistent strong auth secret, valid SMTP sender/delivery and restricted database/TLS configuration. Development/test modes intentionally allow only loopback origins. Production guards must remain enabled even though staging business data is synthetic.

## Controlled validation plan

After approved staging exists, record its URL, commit/build/runtime, migration history, operators and test-data reference. Run this sequence with separate test customers, dealer and authorized staff:

1. Register/login; verify staff email and actual authenticator enrollment; test sign-out, reset/recovery and fresh MFA. Verify wrong-role/suspended sessions are denied.
2. Apply as a dealer; review approval, retail versus approved-dealer prices, and private customer/data boundaries.
3. Receive dummy stock through PO → GRN; reconcile variant/lot quantities, damaged/expired stock and ledger entries.
4. Place customer/dealer orders and reconcile reservations without physical deduction. Test concurrent stock limits and configured unpaid cancellation/expiry release.
5. Upload dummy proof; confirm it does not create cleared funds. A different authorized reviewer records a dummy bank-record attestation. Check duplicate reference rejection and private proof access.
6. Allocate the full order and confirm dispatch; stock is deducted once. Record failure/rebooking/return and delivery with actual test recipient/source/time. Returned status alone must not restore stock.
7. Test paid cancellation and recording a dummy completed refund under the existing decision rules. No website transfer or automatic stock restoration should occur.
8. Reconcile reports/CSV, expenses and recorded original lot costs; confirm absent costs show incomplete, and operational Admin cannot view profitability/cost values.
9. Verify HTTPS/proxy/cookies/no-store/IP handling, read-only health failure/recovery, restart behavior, monitoring alerts, a fresh isolated restore and measured load against approved targets.

Retain sanitized screenshots, record IDs, expected/actual totals, request IDs, timings and Pass/Fail outcomes. Stop on financial, privacy, authorization or stock-integrity failure. Do not bypass safeguards to finish a checklist.

## Owner checklist — complete with test data only

Environment/build: __________ Owner/reviewer: __________ Date: __________

| #   | What to do                                                                                                                                           | Expected result                                                                                                                       | Pass / Fail | Evidence / notes |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------- |
| 1   | Sign in as owner with MFA. Create a test product and its pack variants; set SKU and approve public content. Open the catalogue.                      | Only approved active content appears; each pack is separate and names/SKUs match.                                                     | ____        | ____             |
| 2   | From a separate test customer, apply as a dealer. As authorized staff, review and approve it. Sign in again as the dealer.                           | Approval is visible and dealer access follows the recorded decision.                                                                  | ____        | ____             |
| 3   | Set test retail/dealer prices, assign the lists and compare both accounts. Change a price after placing a test order.                                | Each account sees its permitted current price; the existing order keeps its recorded price.                                           | ____        | ____             |
| 4   | Create a test supplier/PO, submit it and receive a known quantity into a lot. Check inventory and ledger.                                            | Drafts do not add stock; confirmed receipt adds the exact variant/lot quantities once.                                                | ____        | ____             |
| 5   | As customer, add packs, review checkout and place the order. Check stock before/after unpaid cancellation on another order.                          | Totals/address match review; reservation reduces availability without deducting physical stock; permitted cancellation releases once. | ____        | ____             |
| 6   | Upload dummy payment proof. Check status, then have another authorized reviewer verify a dummy bank record. Try the same reference again.            | Upload alone is not payment; only verified funds count; duplicate credit is refused and proofs stay private.                          | ____        | ____             |
| 7   | Allocate every pack/lot, confirm dispatch, then record delivery recipient/source/time. Exercise a failed attempt and reschedule on a separate order. | Confirmation deducts stock once; tracking updates accurately; failure/returned status alone never restores inventory.                 | ____        | ____             |
| 8   | Open sales/payment/delivery reports for the test dates and export CSV. Compare order value, bank-verified money and dispatch/delivery.               | These measures stay distinct; dates/filters and source records reconcile.                                                             | ____        | ____             |
| 9   | Check profitability for a test lot with known original purchase cost and another without it. Record an expense.                                      | Cost uses the approved original method, missing costs remain incomplete, and expense/profit results reconcile.                        | ____        | ____             |
| 10  | Use owner, operational Admin, customer and dealer accounts. Attempt another customer's order/proof and Admin profitability.                          | Each role gets only permitted pages/data/actions; customer data stays isolated and Admin financial access is denied.                  | ____        | ____             |

Record failed rows, responsible person and retest evidence. Resolve every release-blocking failure before signing.

**Owner decision:** APPROVE / REJECT / RETEST REQUIRED: __________

“I reviewed the completed checklist and its evidence for the named staging build.”

Owner name/signature: __________ Date: __________ Outstanding accepted noncritical items: __________

Owner acceptance is required before release review. It does not, by itself, authorize deployment, production data entry, live payment testing or infrastructure purchases. Deployment requires a separate explicit approval identifying target, artifact, operator and rollback plan.
