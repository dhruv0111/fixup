# Customer journey UX test results

14 November 2026. **CONDITIONAL PASS.** All exercised core customer journeys passed after corrections; noncritical friction/device acceptance remains. [Main audit](ux-audit-report.md), [improvements](ux-improvement-report.md), [screenshots](ux-before-after-screenshots.md).

## Actually executed customer journey

Eight complete customer cases passed: 375×812, 390×844, 768×1024 and 1366×768 in each of desktop Chromium and the mobile-emulation browser context. Existing customer cases separately passed in the retained regression/affected results. All data/accounts/images/payment references are isolated dummy records; no actual bank transfer occurred.

| Step                 | Actual interaction / verification                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage/catalogue   | Open home, use Products navigation, search a uniquely named QA adhesive product, open its details. Existing QWIK tests separately verify supplied images, all 8g/20g/40g/50g sizes and representative-photo labels.                                               |
| Anonymous pricing    | Check my prices requires sign-in; no dealer prices shown. Follow real sign-in/create-account links.                                                                                                                                                               |
| New account          | Fill/submit actual browser registration and reach protected account. No imported preauthenticated customer cookie substitutes for this registration.                                                                                                              |
| Delivery information | Visit empty-address checkout; follow Add delivery address; create actual saved address through its browser form.                                                                                                                                                  |
| Cart                 | Load current retail prices, Add to cart, follow View cart, clear/type and explicitly save quantity 2. Separate regression proves DB quantity stays unchanged before save, dirty checkout is blocked, keyboard submission works and repeat Add preserves saved 25. |
| Checkout             | Choose owned address, review server-calculated price/tax/delivery/terms, place sales order and read the actual order number.                                                                                                                                      |
| Payment proof        | Submit invalid PNG bytes; verify no submission saved. Replace with valid dummy image plus date/reference; submission appears, verified-payment count remains zero.                                                                                                |
| Bank verification    | Switch to distinct MFA-verified dummy administrator and complete actual browser review/attestation for the order's server-recorded amount. Order becomes ready only after verified funds/checks.                                                                  |
| Dispatch/delivery    | Existing protected APIs prepare actual lot allocations, confirm dispatch and explicit delivery for the same order. Browser then reads real delivered tracking and opens its history/detail.                                                                       |

The new chain is **mixed browser/API**, not a claim its browser operated dispatch forms. Existing Phase 6 desktop/mobile tests separately pass real draft/allocation/confirmation, local delivery, courier failure/rebooking, private delivery evidence and tracking isolation. No pricing, payment, reservation or dispatch rule was weakened.

## Negative and existing-user scenarios

Eight negative-state matrix cases passed (four sizes/two contexts): invalid required registration submission; empty cart/browse destination; quantity above stock; zero available stock held by another dummy reservation; cancelled order; expired reservation. Failed image and submitted/unverified payment are also exercised in every customer/dealer chain.

Expiry uses the existing test method: change only that dummy reservation's mutable expiry/revision/reason, then invoke the real expiry service. The initial attempt to edit the immutable order snapshot correctly failed and was replaced; no trigger disabled. This is not a claim of waiting through a natural production reservation period. Existing API tests exercise real expiry/release/concurrency rules.

Existing-user login/logout, profile/multiple-address management, price changes, proof rejection/replacement, paid cancellation/refund-decision and private proof isolation are covered by retained full/affected tests.

## Execution evidence and limits

The full 316-case invocation was **309 passed/seven failed**; targeted fixes/reruns yield **316 unique latest passes**, not a relabelled green full run. Corrected initial matrix: 13/13. Final affected run: 28/28. Complete inventory/purchasing rerun: 37/37. Exact failures, roots, corrections and JSON paths are in the main audit. Customer chain cases are in `full-regression-results.json`; current quantity/feedback checks are in `affected-final-results.json` under private `.local/ux-audit/`.

Final atlas: 368 states across both contexts; no detected main-content axe violations/overflow/unlabelled controls/short header links, with 48 contrast incompletes retained. Native file choice uses automation, not physical device/OS picker testing. Representative screenshots use labelled QA figures and are not real business results.

Remaining friction: anonymous account pricing/cart requires sign-in; login returns to My account and loses product intent; user returns through catalogue. Some inline auth/policy link geometry needs manual review. No guest checkout, public dealer price, delivery promise, gateway or automatic bank/courier integration was added. Physical-device, screen-reader, complete keyboard-only, low-bandwidth and first-time real-user acceptance remain pending. No deployment or production-data change.

Final stable journey rerun: **13/13 passed**, zero skipped/flaky, 2m34.215s, after clearing stale cart success feedback during the next save. Each customer/dealer quantity is checked in the test database and saving finishes before capture. Evidence: `.local/ux-audit/stable-journeys-results.json` and `journeys-1794667941209/`. This strengthens existing coverage; it does not add another 13 unique cases.
