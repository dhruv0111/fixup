# FIXUP — Catalogue, inventory and sales

Local-only Next.js application for FIXUP – Adhesives & Bonding Solutions. Includes the Phase 1/1.1 authentication foundation, Phase 2 public catalogue and enquiries, Phase 3 customer/dealer administration and shared pricing, Phase 4 supplier, purchasing and variant inventory management, and Phase 5 cart, sales orders, stock reservations and manual UPI/bank payment review. No payment gateway, paid services or production deployment. Search indexing remains disabled pending launch approval.

See [Phase 2 API and content operations](docs/phase-2-api.md), [implementation checklist](docs/phase-2-checklist.md) and [verification report](docs/phase-2.1-report.md). The supplied QWIK photos and product identity are integrated; actual SKUs, selling prices, confirmed MRP, technical documents and policy approval still require owner input. Development preview products are explicitly labelled and excluded in production.

## Requirements

- Node.js 24 LTS (`.nvmrc`); Phase 1.1 verified on 24.22.3. Package minimum is 22.12. Phase 3–5 checks in this checkout use Node 26.4.0; the earlier Node 24 results are historical.
- npm and PostgreSQL 18 command-line tools on PATH (`initdb`, `pg_ctl`, `psql`, `createdb`, `pg_dump`, `pg_restore`).
- PostgreSQL can instead be provided independently; follow the manual environment setup below.

## Quick start with an isolated local database

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run db:health
npm run db:seed:qwik
npm run dev
```

Open http://127.0.0.1:3000 (use this exact hostname so cookies and origin checks agree). Register your own local account. There are no seeded credentials.

`setup:local` creates a PostgreSQL cluster under `.local/postgres`, listening only on 127.0.0.1:55432. It generates a random database password, separate auth secrets and private `.env` / `.env.test` files. It creates only `fixup_dev` and `fixup_test`, preserves existing environment files, and does not reuse a system PostgreSQL server. The database role is a local bootstrap superuser: do not use it for production.

After restarting your machine:

```sh
npm run db:local
npm run dev
```

Stop the app with Ctrl+C and the owned database with `npm run db:stop`. Logs, generated credentials and local email messages live in ignored `.local/`. Do not publish or share that directory.

## Manual configuration

Copy `.env.example` to `.env`, set a PostgreSQL connection string, and generate your secret with `openssl rand -base64 48`. Never use the example placeholders. Set APP_ENV=development and BETTER_AUTH_URL=http://127.0.0.1:3000 for local work. Run `npm run db:migrate`.

For tests create a **separate** `.env.test` with:

- APP_ENV=test
- DATABASE_URL pointing at a loopback database named `fixup_test` (or `fixup_*test`)
- a separate BETTER_AUTH_SECRET
- BETTER_AUTH_URL=http://127.0.0.1:3100
- MAIL_MODE=file

The runner refuses a non-loopback or non-test database, rejects development/test database aliases even with different login credentials, does not reset the development database, and will not reuse an already-running test web server. Dummy records persist in the isolated test database between runs; each test uses unique generated identities. Keep `.env.test` exclusively for disposable local test data.

## Verification

```sh
npm exec playwright -- install chromium
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:production
npm run db:recovery-check
```

Tests apply committed migrations to the isolated test database and start/stop their own Next.js server on port 3100. They include real PostgreSQL and HTTP tests plus desktop/mobile Chromium tests. Reports: `test-results/results.json` and `playwright-report/index.html` (ignored). Traces are off to avoid collecting credential-bearing network bodies. Failure screenshots contain dummy test data only.

Build and browser tests both use `.next`; stop the local dev server and run them sequentially. `npm run start` runs a built app locally on port 3000. This does not deploy it. A production-mode local smoke test may use the local development environment; an external production environment must use APP_ENV=production.

## Local administrator access

Register normally, then grant owner access to that existing account:

```sh
npm run admin:promote -- you@example.com "Initial local business owner setup"
```

This audited operator action revokes the account's existing sessions. Sign in again, verify email and confirm authenticator enrollment at `/account/security`, then open `/admin`. Local verification messages stay in private local mail; no real external email is sent in file mode. Do not share operator/database access. No user can promote themselves through registration or an API.

Local promotion is restricted to named loopback development/test databases. Production promotion is refused by default and requires a verified existing identity, explicit target confirmation and the [controlled operator procedure](docs/operations.md). Do not enable privileged operations in the web application's environment.

## Registration recovery

Registration retains its committed identity if customer provisioning fails. The next protected request retries profile setup; APIs return a safe `503 PROFILE_SETUP_PENDING` with `Retry-After: 5` while recovery is unavailable. Public navigation and logout remain usable. Customer creation, its registration audit and the completion marker commit together, with a per-user database lock and a unique customer owner constraint.

An authorised operator can reconcile pending accounts without a browser session:

```sh
npm run profiles:repair -- --limit 100
```

Repeated runs preserve existing business data and do not duplicate profiles or registration audits. The command reports counts and exits unsuccessfully if any selected account fails. See [operations](docs/operations.md) for monitoring and backup recovery.

## Password recovery

`/forgot-password` and `/reset-password` use Better Auth's expiring, single-use reset tokens. Local mail is written as private JSON files in `.local/mail`; test mail goes to `.local/test-mail`. Open your local message to use its link. These files contain recovery secrets; never commit, serve, screenshot or log them. No email is delivered externally in local file mode.

SMTP support is implemented but requires an owner-selected provider and actual configuration. No provider was created. APP_ENV=production rejects file mail and non-HTTPS app URLs. Set MAIL_MODE=smtp, MAIL_FROM and SMTP_HOST/PORT/USER/PASSWORD/SECURE through your hosting secret store. SMTP connections require TLS. External delivery has not been verified without an approved provider.

## Project map

- `src/app`: all public website pages, login/register/recovery, protected account/admin, API routes, loading/error/not-found.
- `src/components`: reusable navigation/footer, product presentation, enquiry forms, content editor and auth layouts/forms.
- `src/modules`: catalogue, content, enquiry, customer and settings services/validation.
- `src/server`: authentication, database, permissions, audit, email and HTTP utilities.
- `src/config`: validated environment configuration.
- `prisma`: foundation and public catalogue schema with additive versioned migrations.
- `scripts`: local DB, health, admin bootstrap and guarded tests.
- `tests`: unit tests, PostgreSQL/API integration and desktop/mobile browser coverage. Run `npm run test:unit` and `npm test`.
- `docs`: architecture, API and execution report.

The full planned business-module structure is documented in `docs/architecture.md`. Reserved future folders contain only `.gitkeep` files; no later-phase code is stubbed into the runtime.

Production builds use Next.js's supported Webpack option. The default Turbopack production CSS worker failed to bind its internal port in this execution environment, including on the approved retry. Development remains on Turbopack. No framework downgrade or application feature change was needed.

## Migrations and production preparation

Use `npm run db:migrate:dev -- --name descriptive_name` for future development migrations. Review SQL, then commit it. Use `npm run db:migrate` to apply reviewed migrations. Never use `db push` or reset a production database. The migration includes SQL CHECKs beyond Prisma's schema DSL; preserve them in later migrations.

Before an external launch: configure HTTPS, SMTP, trusted ingress headers, least-privilege runtime/migration database users, backup restoration, monitoring, verified email and staff MFA. Configure TRUSTED_IP_HEADER only if the reverse proxy overwrites that header. Without it, authentication conservatively rate-limits a shared bucket. No hosting purchase or deployment is authorised in this phase.

Email/password, India-only addresses, INR and Asia/Kolkata are foundation defaults. No legal policy, tax rate, product specification, price, credit policy or delivery rule has been invented.

See [architecture](docs/architecture.md), [API contracts](docs/api.md), [operations](docs/operations.md) and the [Phase 1.1 execution report](docs/phase-1.1-report.md) for current decisions and verification results. The [Phase 1 report](docs/phase-1-report.md) records the earlier baseline.

## Phase 3 management

See [Phase 2 independent audit](docs/phase-2-final-audit.md), [Phase 3 API and frontend contracts](docs/phase-3-api.md) and [Phase 3 verification report](docs/phase-3-report.md). Customer profile, delivery addresses, dealer application and the future order-history page are linked from `/account`. Authorized administrators manage customers, dealer review and shared price lists from `/admin`; the owner also manages products and variants. Account pricing appears on product details after signing in. No individual dealer price overrides, checkout, orders, stock transactions or deployment are included.

`npm run dev` regenerates Prisma automatically before startup. After schema/migration changes, run `npm run db:migrate` and restart the dev server to replace its cached client. QWIK setup is repeatable and preserves existing administrator edits; it never invents prices/SKUs or confirms the image-derived MRP.

## Phase 4 purchasing and inventory

See [the implementation plan](docs/phase-4-plan.md), [API/operating rules](docs/phase-4-api.md), and [verification report](docs/phase-4-report.md). After `npm run db:migrate` and a dev-server restart, authorized admins can open Suppliers, Purchase Orders, Goods Receiving, Inventory, Ledger, Adjustments and Reports from `/admin`. Enter actual suppliers, rates and opening quantities through the protected forms; no supplier or inventory demo data is seeded into development or production. PO/GRN drafts do not create stock; confirmed GRNs and confirmed adjustments post immutable ledger entries.

Inventory is single-location, in integer units per variant. Damaged stock is separate from available units. Phase 5 adds sales reservations and Phase 6 consumes them at dispatch confirmation. Super Admin reversal is limited to receipt lots that still have enough undamaged, unreserved available stock. Reports and CSV exports remain protected.

## Phase 5 sales and manual payment review

Customer/dealer flow: product variant → shopping cart → reviewed checkout with saved address → Sales Order → stock reservation → direct UPI/bank transfer outside the website → private screenshot submission → admin checks the actual bank record → full verified payment and resolved exceptions → Ready for Dispatch. Phase 6 adds dispatch confirmation and physical deduction, followed by delivery tracking.

Use `/account/cart`, `/account/checkout`, `/account/orders` and order detail pages. Admins use `/admin/sales/orders` and `/admin/sales/payments`. Only Super Admin can configure `/admin/sales/settings`. Checkout stays disabled until the owner explicitly confirms actual payment details, tax mode/rate (zero allowed), delivery charge (zero allowed), reservation duration, near-expiry review window and cancellation rules. No real business banking data or invented policies are seeded.

Private proof is decoded and re-encoded as PNG, stored transactionally inside PostgreSQL, and streamed only to the order owner or authorized payment reviewers. Include database backups in the private financial-document retention policy. Partial/late/excess payments remain reviewable; screenshots never confirm payment. Refund recording documents an externally completed transfer and never initiates one.

Reservation cleanup is a protected admin action and trusted server command:

```sh
npm run orders:expire -- --confirm-expire
```

Run in the intended private server environment; each execution handles up to 100 orders. Repeat until zero. No automated scheduler is configured. [API contracts and operation notes](docs/phase-5-api.md), [pre-implementation audit/plan](docs/phase-5-plan.md), [execution report](docs/phase-5-report.md) and [screenshot index](docs/phase-5-screenshots.md) document behavior, verification and launch blockers. Gateway, automatic reconciliation and automatic refunds remain outside scope.

## Phase 6 dispatch and delivery

Admins use `/admin/dispatch` for ready/blocked orders, local deliveries, manual courier shipments, packing review, dispatch history, failed deliveries and status tracking. Confirmation is full-order only: enter actual packages/delivery details, allocate actual stock lots, review and confirm. The transaction consumes each reservation and deducts its allocated stock exactly once. Drafts do not deduct stock. Customers/dealers see only their own tracking inside order details. Courier/AWB information and delivery updates are manual; no paid API is connected.

Private delivery photographs or scanned images are optional. Explicit delivery confirmation requires recipient, date/time and the real confirmation source. Failed/returned status alone does not restore inventory. Only Super Admin can record an inspected physical-return correction with bounded, auditable stock movements. [API](docs/phase-6-api.md), [plan](docs/phase-6-plan.md), [execution report](docs/phase-6-report.md) and [screenshots](docs/phase-6-screenshots.md) describe verification and limits.

## Phase 7 business reports and expenses

Open `/admin/business` for the dashboard and `/admin/reports` for sales, payments, purchases, suppliers, inventory, expenses, profitability estimates, deliveries, customers, dealers and products. Admins receive operational reports and expense management; only Super Admin receives financial valuation and profitability. CSV exports enforce the same permissions and filters. Expenses preserve reasoned revisions and cancellations, with optional private image receipts.

The approved cost method freezes received lots at their recorded purchase rate after line discount, excluding separately recorded tax, then freezes actual allocated dispatch costs. Unsupported opening/correction stock stays cost missing; no selling-price fallback is used. Read [metric definitions](docs/phase-7-metrics.md), [API contracts](docs/phase-7-api.md), [execution report](docs/phase-7-report.md) and [screenshots](docs/phase-7-screenshots.md). Run migrations and restart after updating. No production deployment or Phase 8 is included.
