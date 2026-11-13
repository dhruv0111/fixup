# Phase 2 catalogue and public enquiries

All application API responses use `{ data: ... }` or the existing safe `{ error: { code, message, fields? } }` envelope. Personal and administrative responses are `private, no-store`. Mutations require same-origin `Origin`, JSON media type and the existing 16 KiB request limit.

## Public endpoints

| Method | Path                                    | Contract                                                                                                                                   |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/catalogue?q=&category=&page=1` | Public products, total, page/pages and active categories. Pages contain at most 12 products. Search checks name, SKU, brand and summary.   |
| GET    | `/api/v1/catalogue/[slug]`              | Approved public product DTO or 404. Never includes private document references or approval notes.                                          |
| GET    | `/api/v1/enquiries/challenge`           | Signed form token; response is not cached. At most 60 attempts per trusted client per ten minutes.                                         |
| POST   | `/api/v1/enquiries`                     | Validated CONTACT, DEALER or BULK submission. Returns only `{ received: true }`. At most five attempts per trusted client per ten minutes. |

Enquiries require a UUID `requestId`, `kind`, `name`, `phone`, `consent: true`, `token`, and an empty `website` honeypot. CONTACT requires `message`. DEALER additionally requires `businessName`, `email`, `address`, `city`, six-digit Indian `postalCode`, `businessType`, and `quantity`; GSTIN and message are optional. BULK requires `productId`, `quantity` including units, and `location`; business name and message are optional. A supplied product ID must refer to a currently public product.

The token is valid between two seconds and one hour after issuance. It is a lightweight spam deterrent, not proof of a human. Fields have bounded lengths, whitespace is trimmed, and markup/control characters are rejected. Text is rendered through React escaping, never as user-supplied HTML.

PostgreSQL advisory locks serialize same-request and same-payload submissions. Same-ID retries return success without creating another row; changed content with a used ID returns 409. Equivalent submissions within ten minutes are also deduplicated. The enquiry and its metadata-only audit event commit together. Rate limits are shared across processes through the existing RateLimit table. Only an ingress-overwritten configured `TRUSTED_IP_HEADER` is trusted; without one all callers share a conservative bucket. No raw IP is retained in enquiry rate-limit keys.

## Protected endpoints

| Method | Path                               | Permission                                              |
| ------ | ---------------------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/admin/content/[resource]` | `catalogue.read`: ADMIN or SUPER_ADMIN                  |
| POST   | `/api/v1/admin/content/[resource]` | `catalogue.write`: SUPER_ADMIN only                     |
| GET    | `/api/v1/admin/enquiries?page=1`   | `enquiries.read`: ADMIN or SUPER_ADMIN; 25 records/page |

Resources: `categories`, `products`, `website`, `faqs`, `policies`. POST body: `{ id?: string, data: {...}, reason: string }`; reason is 5–350 characters. Existing records use `id`; policies require `privacy`, `terms`, `shipping` or `returns`; website always uses `singleton`. Writes and audit events are transactional. Reads are bounded to 100 records per resource (website is a singleton); this is intended for the initial 1–5 product catalogue.

Category data: name, slug, description, active. Product data: name, slug, sku, brand, packSize, summary, description, categoryId, active, published, featured, contentApproved, approvalReference, applications[], materials[], specifications[{label,value}], storageInstructions, availability (ENQUIRE / AVAILABLE_ON_REQUEST / UNAVAILABLE), images[] and documents[]. See `src/modules/catalogue/validation.ts` for exact validation. A full product save replaces its image/document associations. No pricing, inventory, order or payment fields exist. Publication requires content approval and a supporting reference.

Images require an approved HTTPS Cloudinary raster upload URL, alt text and sort order. Documents are TDS or SDS; a public document requires approval and an HTTPS Cloudinary PDF URL. A private document must have no public URL and can hold an internal reference only. Private storage must stay outside `public/` and must not use a publicly accessible storage URL. This phase does not provide private-file upload/download infrastructure; public APIs never resolve private references. An externally public file cannot be made private merely by changing a database flag.

Website fields: phone, whatsapp (international digits), email, address, workingHours, aboutText, aboutApproved. FAQ fields: question, answer, published, sortOrder. Policy fields: title, body, approved (defaults false). `/admin/content` supplies owner editing for these content resources; product/category management is via the protected API. `/admin/enquiries` provides staff review. Applications and product structured data use approved product information; demo products never generate structured data or application claims.

## Local content and launch boundary

`scripts/setup-public-content.ts <json-file>` initializes supplied contact settings, helpful website-use FAQs and draft policies in the local development database only. Reruns preserve existing edits. Run with `node --conditions=react-server --import tsx`. The ignored `.local/business-content.json` contains the business details supplied in this conversation; there are no hardcoded public contact defaults in application code.

`scripts/seed-demo-catalogue.ts` optionally adds three clearly labelled illustrative products to the local development database. It refuses test/production databases; public queries with `APP_ENV=production` exclude demo products and categories. There are no invented technical values, prices, reviews or ratings.

Canonical URLs use configured `BETTER_AUTH_URL`, never the incoming Host header. Metadata explicitly keeps `noindex,nofollow` and robots continues `Disallow: /`. `/sitemap.xml` contains public routes and eligible non-demo product slugs; no account/admin/API/private routes. Enabling indexing requires a separate approved launch change. No deployment is included.

On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. PostgreSQL tools must be on PATH; this session uses portable binaries under ignored `.local/tools/postgresql/pgsql/bin`. The local database helper omits Unix socket options on Windows and avoids inherited startup pipe handles. Credentials remain in ignored local files.
