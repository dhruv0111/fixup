# Phase 7 desktop and mobile screenshots

Screenshots are private local QA artifacts containing synthetic test accounts and transactions, not business performance. Browser tests capture all twelve views on desktop and mobile, with a document-width assertion before each capture. They are deliberately excluded from Git.

Directory: `.local/qa/phase7/`. Each basename below has `-desktop.png` and `-mobile.png` variants:

| Basename                  | Coverage                                                      |
| ------------------------- | ------------------------------------------------------------- |
| owner-dashboard           | KPI cards, source definitions, trends and completeness labels |
| custom-date-dashboard     | Business-timezone custom range                                |
| sales-report              | Sales table, date/entity filters and export                   |
| payments-report           | Verified collections and payment workload                     |
| inventory-report          | Usable/reserved/available units and owner valuation           |
| profitability-report      | Estimated dispatch profit and missing-cost warnings           |
| deliveries-report         | Actual dispatch/delivery statuses                             |
| products-report           | Independent product pack variants                             |
| expense-detail            | Actual expense fields and initial immutable revision          |
| expense-private-receipt   | Optional private receipt metadata/link                        |
| expense-cancelled-history | Cancellation with retained original and edited history        |
| operational-dashboard     | Admin operational cards without owner-only valuation/profit   |

Representative files were visually inspected: `owner-dashboard-desktop.png` and `expense-detail-mobile.png`. Additional browser assertions exercise all eleven report pages on both viewports, downloads, unauthorized financial-page redirects, and expense creation/edit/upload/cancellation. Exact execution counts are in the [report](phase-7-report.md).
