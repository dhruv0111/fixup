# Phase 3 screenshot evidence

Captured 13 November 2026. **44 images: 26 public production-build previews and 18 browser-workflow images.** All files are local and ignored by Git.

Public previews use the local development database, supplied QWIK images, documented owner contact settings and unconfirmed commercial fields. Desktop: 1440×1000 CSS viewport. Mobile: iPhone 13 Chromium emulation, 390×664 CSS viewport at device pixel ratio 3. Public captures returned HTTP 200, decoded all product images, reported no browser page errors and had no horizontal overflow.

Workflow captures use the isolated test database with dummy identities and synthetic prices; they are not real selling prices. Workflow desktop viewport: 1280×720; mobile as above. These browser captures also assert viewport fit. Representative homepage, QWIK/mobile, customer-address and dealer-review/mobile images were visually inspected.

## Public pages

| Page                 | Desktop                                                                                | Mobile                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Homepage             | [Desktop](../.local/qa/phase3/public/home-desktop.png)                                 | [Mobile](../.local/qa/phase3/public/home-mobile.png)                                 |
| About                | [Desktop](../.local/qa/phase3/public/about-desktop.png)                                | [Mobile](../.local/qa/phase3/public/about-mobile.png)                                |
| Catalogue            | [Desktop](../.local/qa/phase3/public/products-desktop.png)                             | [Mobile](../.local/qa/phase3/public/products-mobile.png)                             |
| QWIK product details | [Desktop](../.local/qa/phase3/public/products-fixup-qwik-instant-adhesive-desktop.png) | [Mobile](../.local/qa/phase3/public/products-fixup-qwik-instant-adhesive-mobile.png) |
| Applications         | [Desktop](../.local/qa/phase3/public/applications-desktop.png)                         | [Mobile](../.local/qa/phase3/public/applications-mobile.png)                         |
| Become a dealer      | [Desktop](../.local/qa/phase3/public/become-a-dealer-desktop.png)                      | [Mobile](../.local/qa/phase3/public/become-a-dealer-mobile.png)                      |
| Bulk orders          | [Desktop](../.local/qa/phase3/public/bulk-orders-desktop.png)                          | [Mobile](../.local/qa/phase3/public/bulk-orders-mobile.png)                          |
| Contact              | [Desktop](../.local/qa/phase3/public/contact-desktop.png)                              | [Mobile](../.local/qa/phase3/public/contact-mobile.png)                              |
| FAQ                  | [Desktop](../.local/qa/phase3/public/faq-desktop.png)                                  | [Mobile](../.local/qa/phase3/public/faq-mobile.png)                                  |
| Privacy              | [Desktop](../.local/qa/phase3/public/policies-privacy-desktop.png)                     | [Mobile](../.local/qa/phase3/public/policies-privacy-mobile.png)                     |
| Terms                | [Desktop](../.local/qa/phase3/public/policies-terms-desktop.png)                       | [Mobile](../.local/qa/phase3/public/policies-terms-mobile.png)                       |
| Shipping             | [Desktop](../.local/qa/phase3/public/policies-shipping-desktop.png)                    | [Mobile](../.local/qa/phase3/public/policies-shipping-mobile.png)                    |
| Returns/refunds      | [Desktop](../.local/qa/phase3/public/policies-returns-desktop.png)                     | [Mobile](../.local/qa/phase3/public/policies-returns-mobile.png)                     |

## Workflow evidence

| Workflow                                            | Desktop                                                           | Mobile                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Featured QWIK homepage                              | [Desktop](../.local/qa/phase3/home-desktop.png)                   | [Mobile](../.local/qa/phase3/home-mobile.png)                   |
| QWIK variants / images / guest prices               | [Desktop](../.local/qa/phase3/qwik-product-desktop.png)           | [Mobile](../.local/qa/phase3/qwik-product-mobile.png)           |
| Customer profile                                    | [Desktop](../.local/qa/phase3/customer-profile-desktop.png)       | [Mobile](../.local/qa/phase3/customer-profile-mobile.png)       |
| Multiple delivery addresses                         | [Desktop](../.local/qa/phase3/customer-addresses-desktop.png)     | [Mobile](../.local/qa/phase3/customer-addresses-mobile.png)     |
| Dealer application                                  | [Desktop](../.local/qa/phase3/dealer-application-desktop.png)     | [Mobile](../.local/qa/phase3/dealer-application-mobile.png)     |
| Admin dealer review and history                     | [Desktop](../.local/qa/phase3/admin-dealer-review-desktop.png)    | [Mobile](../.local/qa/phase3/admin-dealer-review-mobile.png)    |
| Shared price lists and category assignments         | [Desktop](../.local/qa/phase3/admin-price-lists-desktop.png)      | [Mobile](../.local/qa/phase3/admin-price-lists-mobile.png)      |
| Authenticated retail pricing (synthetic test price) | [Desktop](../.local/qa/phase3/customer-pricing-desktop.png)       | [Mobile](../.local/qa/phase3/customer-pricing-mobile.png)       |
| Owner variant administration                        | [Desktop](../.local/qa/phase3/admin-product-variants-desktop.png) | [Mobile](../.local/qa/phase3/admin-product-variants-mobile.png) |
