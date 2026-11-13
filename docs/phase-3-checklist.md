# Phase 3 acceptance checklist

The independent Phase 2 gate is recorded in [the audit](phase-2-final-audit.md). Final executed counts and limitations belong in [the completion report](phase-3-report.md).

- [x] Preserve the existing application, Better Auth, ownership checks, session revocation and foundation migrations.
- [x] Support customer name/contact editing and multiple owner-scoped delivery addresses, including deletion.
- [x] Complete dealer business application, duplicate retry handling, review/rejection/suspension/reactivation and transactional audit history.
- [x] Enforce active customer accounts and approved dealer status using current database values.
- [x] Protect admin customer/dealer lists/details, filtering, status review and history.
- [x] Use shared RETAIL/APPROVED_DEALER price-list assignments; no per-dealer overrides.
- [x] Validate integer paise, target uniqueness, active-list behavior and server-side estimate calculations; reject browser price/category overrides.
- [x] Keep one FIXUP QWIK parent and four stable 8g/20g/40g/50g variants; preserve existing product URL behavior.
- [x] Use both actual supplied images with aspect-ratio-preserving presentation and representative labels for other pack sizes.
- [x] Leave real SKUs, selling prices and confirmed MRP unset; keep the image-derived 50g ₹175 as a private reference only.
- [x] Preserve approved-document/publication filters and disabled indexing; label packaging claims as unverified source information.
- [x] Provide owner product/variant/category editing and confirmed MRP controls; maintain per-variant shared price entries.
- [x] Strengthen the database MRP constraint through a forward migration and repair backup-check support for natural keys.
- [x] Add API tests for database constraints, parent-to-variant pricing transition and repeatable content setup.
- [x] Complete final desktop/mobile browser rerun and review screenshots: 107 Playwright tests passed; 44 screenshot artifacts.
- [x] Complete final static, migration, recovery, build and smoke validation; exact outcomes recorded in the completion report.

No checkout, payment, stock quantities/transactions, suppliers, procurement, receiving, dispatch, dealer credit, production deployment or Phase 4 work is included. Order history is an authenticated foundation with no fabricated orders. Business/technical/legal approvals and production controls remain dependencies.
