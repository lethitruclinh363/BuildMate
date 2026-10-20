# PHASE 6A — Unblock PostgreSQL, repair outdated tests, re-run E2E

Date: 2026-10-15  
Result: **NOT COMPLETE.** Integration and browser E2E remain **BLOCKED**. Shared `BuilMate` was not written. Tests that started work before deposit were aligned with the HELD-before-STARTED machine.

## A. Why the test database is still BLOCKED

This is **missing software / missing local admin password**, not an application bug.

| Check | Result |
| --- | --- |
| OS | Windows 10.0.26200 |
| Docker CLI / Engine / Podman | **Not installed** |
| `npm run test:db:up` | Exit 2, Docker missing |
| Local PostgreSQL 18 | Service `postgresql-x64-18` Running, Automatic |
| Port | `0.0.0.0:5432` and `[::]:5432` accepting connections (`pg_isready` exit 0) |
| Auth | `pg_hba.conf`: `scram-sha-256` for local and `127.0.0.1` |
| Superuser password | **Not provided.** Empty password is not accepted. A probe without a password does not authenticate (and must not be retried — SASL can hang). |
| `backend/.env.test` | Missing |
| `backend/.env.test.admin` | Missing |
| `TEST_DATABASE_URL` | Unset |
| Team `.env.migration` | Points at database name `BuilMate` on a **non-loopback** host. Unused for bootstrap. |

Compose `docker-compose.test.yml` is ready: image `postgres:16-alpine`, container `buildmate-test-pg`, volume `buildmate_test_pgdata`, bind `127.0.0.1:55432` only, database `BuilMate_test`, user `buildmate_test`, healthcheck present. It cannot start without Docker.

Helper `ensure-test-database.js` **must not be used**: it loaded `.env.migration` and copied catalog rows from the team database. It now exits 2.

Safe bootstrap remains `scripts/bootstrap-isolated-test-db.js` (local `TEST_PG*` only, `prisma db push` on `BuilMate_test`, finance SQL, fake seed). It cannot run until Docker or `.env.test.admin` exists.

## B. Path used

**Neither Docker nor local superuser access.** Preferred path is still Docker on `127.0.0.1:55432` so PostgreSQL 18 on `:5432` is untouched.

Team BuilMate credentials were not used as a substitute.

## C. Does the test database work?

**No.** `BuilMate_test` was not created. No test listener on `55432`.

## D. Where Escrow/Payout SQL ran

**Nowhere.** `apply-finance-sql-on-test.js` refuses `BuilMate` and refuses a missing `TEST_DATABASE_URL` (exit 1 this session).

Prisma escrow models stay in `backend/prisma/fragments/contractor-escrow.prisma` (not merged into live `schema.prisma`, so the BuilMate runtime does not SELECT missing columns).

## E. What changed in the two outdated tests, and why

State machine:

`ACCEPT` → Payment `DEPOSIT` `UNPAID` → mock 15% → Escrow `HELD` → contractor `STARTED`.

### `e2e-workflow.test.js`

Old expected: contractor `STARTED` immediately after accept.

New expected:

1. After accept: one order, one `DEPOSIT` `UNPAID`; second accept does not duplicate the order.
2. Contractor `STARTED` **rejected 409**.
3. `payMockDeposit` (terms + mock capture) → `PAID` + escrow `HELD`.
4. Then `STARTED` → `IN_PROGRESS` → `COMPLETED` → customer complete.

Backend was not changed to make the old test pass.

### `rbac.test.js`

Old expected: assigned contractor `STARTED` **201** while deposit still unpaid (wrong).

New expected:

- Anonymous progress: **401**
- Customer / admin / store / other contractor `STARTED`: **403**
- Assigned contractor before deposit: **409**
- After mock 15% hold: assigned contractor `STARTED` **201**; others still **403**
- Admin audit/customers endpoints unchanged (negative tests kept)

## F. Unit PASS/FAIL

**36 PASS / 0 FAIL** (`npm run test:unit`, this session).

## G. Integration PASS/FAIL

**0 executed.** `npm run test:integration` exit 1, isolation error. Fail-fast before suites, including the repaired files and `escrow-postgres.test.js`.

## H. Browser E2E PASS/FAIL

**0 executed / BLOCKED.** Frontend and Admin were not started against a test API. Browser tools were not used against the team API.

## I. Real race tests?

**No.** Concurrent refund/payout still only exists as code in `escrow-postgres.test.js`. Unit sequential double-spend remains PASS.

## J. New issues found

1. Environment still cannot create `BuilMate_test` (Docker missing + local SCRAM password unknown).
2. `ensure-test-database.js` was a foot-gun (dump/copy from BuilMate). Disabled.
3. Empty local Postgres password can hang a `pg` client; do not probe that way.
4. Four demo actors (`demo.*@buildmate.test`) are seeded only after a successful bootstrap — not created this session.

## K. Files changed

- `backend/src/tests/e2e-workflow.test.js`
- `backend/src/tests/rbac.test.js`
- `backend/src/tests/helpers/finance-http.js` (`payMockDeposit`)
- `backend/src/tests/helpers/ensure-test-database.js` (disabled)
- `backend/scripts/seed-test-actors.js` (new; isolated DB only)
- `backend/scripts/bootstrap-isolated-test-db.js` (calls actor seed)
- `backend/package.json` (`test:db:seed-actors`)
- `backend/.env.test.admin.example` (placeholders, no secret)
- `docs/PHASE-6A-TEST-UNBLOCK-REPORT.md`

`.env` / `.env.migration` not edited. No credentials in git.

## L. Commands to run after you unlock the machine

### Option 1 — Docker Desktop (preferred)

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) (this step needs Administrator).
2. Start Docker Desktop and wait until it is running.
3. From `BUILDMATE`:

```
npm run test:db:up --prefix backend
npm run test:db:bootstrap --prefix backend
npm run test:unit --prefix backend
npm run test:integration --prefix backend
```

Stop: `npm run test:db:down --prefix backend`

API for a later browser pass: `npm run test:api --prefix backend` (still requires `TEST_DATABASE_URL`).

### Option 2 — local PostgreSQL 18 on this PC

The instance on `127.0.0.1:5432` is this machine’s PostgreSQL 18, not the team host in `.env.migration`. It requires the **postgres superuser password you set when installing PostgreSQL**.

Create gitignored `backend/.env.test.admin`:

```
TEST_PGHOST=127.0.0.1
TEST_PGPORT=5432
TEST_PGUSER=postgres
TEST_PGPASSWORD=the-local-password
```

Then:

```
npm run test:db:bootstrap --prefix backend
npm test --prefix backend
```

Do not paste that password into chat or into this report. Do not copy `PGPASSWORD` from `.env.migration`.

## M. Still BLOCKED

- Isolated PostgreSQL test
- `TEST_DATABASE_URL`
- Escrow/Payout schema on a test DB
- Integration execution (including repaired STARTED tests)
- Four-actor fixtures
- Browser E2E
- Real Postgres races

Phase 6A completion criteria are **not** met until Option 1 or 2 is done and `npm run test:integration` actually runs.
