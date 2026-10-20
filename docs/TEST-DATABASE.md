# Isolated test database

Integration and E2E writes are allowed only against `BuilMate_test` on localhost.
`TEST_DATABASE_URL` is required. There is no fallback to `DATABASE_URL` or `PGDATABASE`.

## Dual-write rule

| Store | When it is written | Source of truth |
| --- | --- | --- |
| `payments.metadata.finance` / `payments.metadata.escrow` | Always, including on BuilMate | Authority only while escrow tables are absent |
| `service_order_escrows`, `contractor_payouts`, `escrow_ledger`, `escrow_refunds`, `escrow_cancellations` | When the tables exist (detected at runtime) | Authority after finance SQL on `BuilMate_test` |
| Material Store amounts | `material_orders` / `material_order_payments` / `material_commissions` | COD / fee 0 for new V2 orders; no contractor escrow rows |

CAS updates the table row first, then metadata, in one PostgreSQL transaction. A failed second step rolls back the first. Do not treat metadata and tables as two independent ledgers.

Identities: `deposit = platformFee + contractorHold`; escrow available balance never goes negative; `released + refunded <= gross`.

## Current machine (2026-10-15 probe)

- Windows, PostgreSQL 18 listening on port 5432 (local superuser password unknown).
- Docker / Podman: not installed unless you install it after this note.
- Team database `BuilMate` must never receive fixtures, finance SQL, or `prisma db push`.

Until Docker Desktop is installed **or** the local `postgres` superuser password is provided in gitignored `.env.test.admin`, `TEST_DATABASE_URL` stays unset and `npm run test:integration` fail-fasts.

Prisma escrow models stay in `backend/prisma/fragments/contractor-escrow.prisma` and are **not** merged into `schema.prisma`. Merging would make Prisma SELECT missing columns on BuilMate.

## Path A — Docker (preferred, does not touch PostgreSQL 18)

1. Install Docker Desktop and start it.
2. From `BUILDMATE/backend`:

```
npm run test:db:up
npm run test:db:bootstrap
npm test
```

3. Optional API for E2E, still on the test database:

```
npm run test:api
```

4. Stop:

```
npm run test:db:down
```

Compose file: `docker-compose.test.yml`  
Port: `127.0.0.1:55432` only  
Database: `BuilMate_test`  
User: `buildmate_test`  
Volume: `buildmate_test_pgdata` (separate from local PG 18)

`test:db:bootstrap` applies `scripts/sql/2026-contractor-escrow-material-free.sql` on that database only. It skips `prisma db push` if `service_orders` already exists, so a second run does not drop finance tables.

## Path B — local PostgreSQL 18

Create `backend/.env.test.admin` (gitignored):

```
TEST_PGHOST=127.0.0.1
TEST_PGPORT=5432
TEST_PGUSER=postgres
TEST_PGPASSWORD=<local superuser password>
```

Then:

```
npm run test:db:bootstrap --prefix backend
npm test --prefix backend
```

Do not reuse the team BuilMate login. Do not run `npm run seed` against BuilMate for this work; bootstrap seeds fake roles/categories only.
