# Phase 5 screenshots

22 local screenshots: 11 desktop Chromium views and 11 iPhone 13 viewport views using Chromium. Captured by executed Playwright Phase 5 browser tests with synthetic records in the isolated test database. No real payment or banking information is shown. Private QA artifacts remain under ignored `.local/qa/phase5/`; these files are not published. Each capture asserts no horizontal viewport overflow.

| View                                                              | Desktop                                                       | Mobile                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Variant cart and quantity controls                                | [Desktop](../.local/qa/phase5/cart-desktop.png)               | [Mobile](../.local/qa/phase5/cart-mobile.png)               |
| Reviewed address, prices, charges and direct payment instructions | [Desktop](../.local/qa/phase5/checkout-desktop.png)           | [Mobile](../.local/qa/phase5/checkout-mobile.png)           |
| Private proof awaiting manual verification                        | [Desktop](../.local/qa/phase5/payment-submitted-desktop.png)  | [Mobile](../.local/qa/phase5/payment-submitted-mobile.png)  |
| Independent bank-record verification form                         | [Desktop](../.local/qa/phase5/admin-verification-desktop.png) | [Mobile](../.local/qa/phase5/admin-verification-mobile.png) |
| Full verified payment and held reservation                        | [Desktop](../.local/qa/phase5/ready-for-dispatch-desktop.png) | [Mobile](../.local/qa/phase5/ready-for-dispatch-mobile.png) |
| Customer order history                                            | [Desktop](../.local/qa/phase5/order-history-desktop.png)      | [Mobile](../.local/qa/phase5/order-history-mobile.png)      |
| Admin order search                                                | [Desktop](../.local/qa/phase5/admin-orders-desktop.png)       | [Mobile](../.local/qa/phase5/admin-orders-mobile.png)       |
| Admin verification queue                                          | [Desktop](../.local/qa/phase5/payment-queue-desktop.png)      | [Mobile](../.local/qa/phase5/payment-queue-mobile.png)      |
| Explicit payment and business-rule confirmation                   | [Desktop](../.local/qa/phase5/settings-desktop.png)           | [Mobile](../.local/qa/phase5/settings-mobile.png)           |
| Rejected proof with customer-visible reason                       | [Desktop](../.local/qa/phase5/rejected-proof-desktop.png)     | [Mobile](../.local/qa/phase5/rejected-proof-mobile.png)     |
| Paid cancellation with manual refund decision                     | [Desktop](../.local/qa/phase5/paid-cancellation-desktop.png)  | [Mobile](../.local/qa/phase5/paid-cancellation-mobile.png)  |

Browser scenarios cover the complete retail cart-to-verified-order path, private proof rendering, admin search/settings/payment queue, rejected-proof history, and paid cancellation/refund-decision visibility. Dealer category pricing and order ownership are additionally covered by the API tests. Supplied QWIK imagery remains covered by the previous-phase desktop/mobile catalogue regression tests.
