# Phase 6 desktop and mobile evidence

Captured locally on 14 November 2026, using isolated synthetic QA accounts, orders, bank references, stock, delivery people and courier details. No real transaction or shipment was created. Desktop Chromium and mobile Chromium with iPhone 13 viewport emulation; not a physical iOS device. Every capture checks document-level horizontal overflow. Files remain local/ignored; none were uploaded or published.

| View                        | Desktop                                                      | Mobile                                                      |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Ready queue                 | [View](../.local/qa/phase6/ready-queue-desktop.png)          | [View](../.local/qa/phase6/ready-queue-mobile.png)          |
| Blocked order reasons       | [View](../.local/qa/phase6/blocked-queue-desktop.png)        | [View](../.local/qa/phase6/blocked-queue-mobile.png)        |
| Local draft                 | [View](../.local/qa/phase6/local-draft-desktop.png)          | [View](../.local/qa/phase6/local-draft-mobile.png)          |
| Confirmed dispatch/stock    | [View](../.local/qa/phase6/confirmed-stock-desktop.png)      | [View](../.local/qa/phase6/confirmed-stock-mobile.png)      |
| Out for delivery            | [View](../.local/qa/phase6/out-for-delivery-desktop.png)     | [View](../.local/qa/phase6/out-for-delivery-mobile.png)     |
| Delivered admin             | [View](../.local/qa/phase6/delivered-admin-desktop.png)      | [View](../.local/qa/phase6/delivered-admin-mobile.png)      |
| Delivered customer tracking | [View](../.local/qa/phase6/customer-tracking-desktop.png)    | [View](../.local/qa/phase6/customer-tracking-mobile.png)    |
| Owned local tracking        | [View](../.local/qa/phase6/owned-local-tracking-desktop.png) | [View](../.local/qa/phase6/owned-local-tracking-mobile.png) |
| Courier shipment            | [View](../.local/qa/phase6/courier-shipment-desktop.png)     | [View](../.local/qa/phase6/courier-shipment-mobile.png)     |
| Delivery failed             | [View](../.local/qa/phase6/delivery-failed-desktop.png)      | [View](../.local/qa/phase6/delivery-failed-mobile.png)      |
| Rescheduled                 | [View](../.local/qa/phase6/rescheduled-desktop.png)          | [View](../.local/qa/phase6/rescheduled-mobile.png)          |
| Private delivery evidence   | [View](../.local/qa/phase6/private-proof-desktop.png)        | [View](../.local/qa/phase6/private-proof-mobile.png)        |
| Return inspection screen    | [View](../.local/qa/phase6/return-inspection-desktop.png)    | [View](../.local/qa/phase6/return-inspection-mobile.png)    |

26 captures. The final report records their associated executed browser tests. Browser workflows use the real persisted cart/order/payment/reservation services to prepare test orders, then operate dispatch forms. Existing Phase 5 browser tests separately exercise cart, reviewed checkout and manual payment verification forms. Representative local/customer and courier/admin screenshots were visually inspected.
