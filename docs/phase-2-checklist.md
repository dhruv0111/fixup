# Phase 2.1 implementation checklist

Source: supplied Phase 2 and Phase 2.1 briefs; repository audit. No separate original PRD was found in the checkout. Existing identity, authentication, authorization, audit and HTTP helpers will be reused.

- [x] Add additive catalogue/content/enquiry migration; verify fresh replay and repeat deployment without resetting existing data.
- [x] Connect protected content management and public catalogue APIs.
- [x] Implement database-backed homepage, about, catalogue, product detail and applications pages.
- [x] Implement dealer, bulk and contact forms with validation, idempotency, persistent throttling and spam protection.
- [x] Implement published FAQ and four clearly marked draft policies; protected content editor.
- [x] Apply purple/white/charcoal branding, accessible responsive navigation, shared components and image placeholders.
- [x] Add configurable WhatsApp links with general, product and bulk messages.
- [x] Add page metadata, canonical URLs, Open Graph, sitemap; preserve disabled indexing.
- [x] Verify authorization, public product visibility and private-document exclusion.
- [x] Add unit, integration and desktop/mobile browser tests; retain authentication regression tests.
- [x] Run Prisma/migration/static/build/test checks and capture screenshots; record exact results and blockers.
- [x] Document APIs, remaining business inputs and final completion assessment.

Verified on 13 November 2026. See [completion report](phase-2.1-report.md) for evidence and limits.

## Remaining owner inputs and launch prerequisites

- [ ] Supply actual product names/brands, SKUs, pack sizes, descriptions, availability and categories.
- [ ] Supply authorised product photos and approved specifications, applications, materials, storage instructions and public TDS/SDS documents.
- [ ] Approve the company profile and all four legal/policy documents; confirm applicable business identity and commercial details.
- [ ] Confirm operating days and any fuller postal address/PIN for publication.
- [ ] Separately approve and configure a production launch, domain, indexing and the production controls documented in Phase 1.1.

Business phone, WhatsApp, email, address and opening/closing times supplied during this task are configured. No application implementation or required local test remains blocked. The catalogue uses three labelled development samples until real products are supplied.

No deployment or Phase 3 commerce features are authorized.
