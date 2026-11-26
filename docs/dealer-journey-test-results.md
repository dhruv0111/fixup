# Dealer journey UX test results

14 November 2026. **CONDITIONAL PASS.** Important existing dealer workflows passed; manual-repeat/sign-in friction and actual shop-user acceptance remain. [Audit](ux-audit-report.md), [improvements](ux-improvement-report.md), [evidence](ux-before-after-screenshots.md).

## Actually executed journey

**Eight complete dealer cases passed:** four requested sizes (375×812, 390×844, 768×1024, 1366×768) in desktop/mobile-emulation contexts. Each uses an isolated new hardware-shop account and dummy prices/payment information.

1. Find the catalogue and pricing sign-in requirement, register in the real browser.
2. Visit Become a Dealer, follow Apply through your account, submit actual business form.
3. See PENDING and verify current retail pricing still applies; approved-dealer price message is absent.
4. Switch to a distinct MFA-verified administrator; approve that exact application through the browser.
5. Sign in again as the dealer; load approved-dealer prices from the protected endpoint.
6. Add 8g and 20g variants, save quantity **25 of each** explicitly in cart, choose owned delivery address, review actual server total and place bulk order.
7. Submit invalid proof, verify it was not saved; replace with valid dummy screenshot/reference/date. Verified funds remain absent before review.
8. Administrator performs real browser bank-review/attestation using the server order amount. Protected dispatch/delivery APIs allocate and confirm the same dummy order; dealer sees actual delivered tracking/history.
9. Revisit the existing product, reload current authorized prices and add a pack to cart again as the **manual repeat-purchase** route.

The implemented experience is shared My account/dealer status/order history with category pricing, not a separate dealer dashboard. No one-click reorder endpoint or feature was invented. Manual repeat is verified through current-price/cart entry, not a claim that an automatic duplicate order was created. No discount percentage, approval deadline, credit facility or business benefit was invented.

## Approval, pricing and status isolation

Public initial enquiry remains distinct from a formal tracked dealer application. New wording explains where the review decision appears, why pending remains retail and how approved users buy. Existing desktop/mobile Phase 3 status tests exercise rejection, revision, approval, suspension and reactivation. All latest 222 API cases passed; backend current eligibility/assignment rules remain authoritative.

Fresh price-management cases also prove a product omitted by the old 500-item selector can be found by bounded search, saved price targets survive a search-away, and category assignments remain selected outside current list results. Customers see only their assigned active retail prices; no dealer price was made public by the UX work. No current amount/cost was fabricated to populate a missing quote.

## Failures, fixes and actual results

The first dealer matrix failed because automation filled the old public enquiry before navigation finished. Added explicit destination/heading waits. An intermediate test put repeat purchase before proof and navigated away; corrected its order. No application approval/security guard changed for those harness errors. Corrected initial matrix passed 13/13.

The complete regression executed 316 cases: **309 passed/seven failed**, including separately diagnosed cart/report/selector/capture failures. Fresh affected run **28/28 passed** and inventory/purchasing rerun **37/37 passed**. Latest deduplicated coverage is 316 passes (222 API/47 desktop/47 mobile); original failures remain retained. See the main audit for every root and rerun. Private evidence: `.local/ux-audit/full-regression-results.json`, `affected-final-results.json`, `inventory-final-results.json`, final atlas JSONL and named dealer screenshots.

## Remaining risks

Account creation precedes the separate business application; sign-in does not preserve application/product intent. Bulk quantities save per line; no spreadsheet importer was added. Repeat purchase is manual and must use current availability/prices. Actual staff/shop acceptance, physical Android/iOS/Safari, screen readers and low-bandwidth tests remain pending. This is synthetic local verification, not production identity/MFA, external bank, real courier or hosting acceptance. No deployment or production-data change.

Final stable journey rerun: **13/13 passed**, zero skipped/flaky, 2m34.215s, after clearing stale cart success feedback during the next save. Each customer/dealer quantity is checked in the test database and saving finishes before capture. Evidence: `.local/ux-audit/stable-journeys-results.json` and `journeys-1794667941209/`. This strengthens existing coverage; it does not add another 13 unique cases.
