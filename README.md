# FIXUP — Phase 1 foundation

Local-only Next.js application for FIXUP – Adhesives & Bonding Solutions. Implements authentication, customer identity, permissions, audit logging and basic responsive pages. No real product data, commerce features, paid services or production deployment.

## Requirements

- Node.js 24 LTS recommended (`.nvmrc`); supported minimum 22.12.
- npm and PostgreSQL 18 command-line tools on PATH (`initdb`, `pg_ctl`, `psql`, `createdb`).
- PostgreSQL can instead be provided independently; follow the manual environment setup below.

## Quick start with an isolated local database

```sh
npm ci
npm run setup:local
npm run db:migrate
npm run db:health
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

The runner refuses a non-loopback or non-test database, never loads production data, does not reset the development database, and will not reuse an already-running test web server. Dummy records persist in the isolated test database between runs; each test uses unique generated identities.

## Verification

```sh
npm exec playwright -- install chromium
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:production
```

Tests apply committed migrations to the isolated test database and start/stop their own Next.js server on port 3100. They include real PostgreSQL and HTTP tests plus desktop/mobile Chromium tests. Reports: `test-results/results.json` and `playwright-report/index.html` (ignored). Traces are off to avoid collecting credential-bearing network bodies. Failure screenshots contain dummy test data only.

Build and browser tests both use `.next`; run them sequentially. `npm run start` runs a built app locally on port 3000. This does not deploy it. A production-mode local smoke test may use the local development environment; an external production environment must use APP_ENV=production.

## Local administrator access

Register normally, then grant owner access to that existing account:

```sh
npm run admin:promote -- you@example.com "Initial local business owner setup"
```

This audited operator action revokes the account's existing sessions. Sign in again, then open `/admin`. Do not share operator/database access. No user can promote themselves through registration or an API.

## Password recovery

`/forgot-password` and `/reset-password` use Better Auth's expiring, single-use reset tokens. Local mail is written as private JSON files in `.local/mail`; test mail goes to `.local/test-mail`. Open your local message to use its link. These files contain recovery secrets; never commit, serve, screenshot or log them. No email is delivered externally in local file mode.

SMTP support is implemented but requires an owner-selected provider and actual configuration. No provider was created. APP_ENV=production rejects file mail and non-HTTPS app URLs. Set MAIL_MODE=smtp, MAIL_FROM and SMTP_HOST/PORT/USER/PASSWORD/SECURE through your hosting secret store. SMTP connections require TLS. External delivery has not been verified without an approved provider.

## Project map

- `src/app`: homepage, login/register/recovery, protected account/admin, API routes, loading/error/not-found.
- `src/components`: reusable navigation, auth layouts and forms.
- `src/modules`: customer and settings business services/validation.
- `src/server`: authentication, database, permissions, audit, email and HTTP utilities.
- `src/config`: validated environment configuration.
- `prisma`: foundation schema and versioned migration.
- `scripts`: local DB, health, admin bootstrap and guarded tests.
- `tests`: PostgreSQL/API integration and desktop/mobile browser coverage.
- `docs`: architecture, API and execution report.

The full planned business-module structure is documented in `docs/architecture.md`. Reserved future folders contain only `.gitkeep` files; no later-phase code is stubbed into the runtime.

Production builds use Next.js's supported Webpack option. The default Turbopack production CSS worker failed to bind its internal port in this execution environment, including on the approved retry. Development remains on Turbopack. No framework downgrade or application feature change was needed.

## Migrations and production preparation

Use `npm run db:migrate:dev -- --name descriptive_name` for future development migrations. Review SQL, then commit it. Use `npm run db:migrate` to apply reviewed migrations. Never use `db push` or reset a production database. The migration includes SQL CHECKs beyond Prisma's schema DSL; preserve them in later migrations.

Before an external launch: configure HTTPS, SMTP, trusted ingress headers, least-privilege runtime/migration database users, backup restoration, monitoring, verified email and staff MFA. Configure TRUSTED_IP_HEADER only if the reverse proxy overwrites that header. Without it, authentication conservatively rate-limits a shared bucket. No hosting purchase or deployment is authorised in this phase.

Email/password, India-only addresses, INR and Asia/Kolkata are foundation defaults. No legal policy, tax rate, product specification, price, credit policy or delivery rule has been invented.

See [architecture](docs/architecture.md), [API contracts](docs/api.md) and the [execution report](docs/phase-1-report.md) for decisions, implemented permissions and exact verification results.
