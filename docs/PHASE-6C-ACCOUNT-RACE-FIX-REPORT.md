# PHASE 6C — Account registration race and PostgreSQL UNIQUE indexes

Date: 2026-10-16  
Database used: Docker `buildmate-test-pg` → `127.0.0.1:55432` / `BuilMate_test` only.  
Shared team database `BuilMate`: **not written**.  
Browser E2E: **not run** (this phase is uniqueness only).

## 1. Root cause of TC13

TC13 failed because **PostgreSQL had no UNIQUE index on login email**, not because the test counted status codes wrong.

Facts from the failing design and from `BuilMate_test`:

1. Two `authService.register()` calls really ran in parallel (`Promise.allSettled`).
2. Both used the same email after `trim + lowercase`.
3. Both wrote `public.users` through `PgUser` / `prisma.users.create`.
4. Both used the isolated test connection (`TEST_DATABASE_URL` → `BuilMate_test`, `DATABASE_PROVIDER=postgres`).
5. Both requests **succeeded**. The assertion `emailWins === 1` failed with **actual 2**. That was not a test-counting bug.
6. PostgreSQL stored two different `users.id` rows for one email. Seed had already done the same for the four demo actors.
7. **Before this fix, `uq_users_email_lower` and `uq_users_phone_number_nonempty` did not exist** on `BuilMate_test`.
8. P2002 / `23505` mapping to HTTP 409 already existed in `accountIdentity.js` / `httpError.js`, but the database never raised a unique conflict.
9. Integration preload forces the PostgreSQL user repository. The test was not hitting MongoDB.

`assertAccountIdentityAvailable()` still does find-then-create (TOCTOU). That race is real, but it is not the layer that failed TC13. Two concurrent `INSERT`s both passed because Prisma schema has **no** `@@unique` on `email` / `phone_number`, `prisma db push` does not emit expression indexes, and bootstrap never ran `ensure-users-identity-unique.sql`.

## 2. UNIQUE indexes before the fix

Read-only `pg_index` on `BuilMate_test.public.users`:

| indexname | unique | valid | definition |
| --- | --- | --- | --- |
| `idx_users_location_id` | no | yes | btree (`location_id`) |
| `idx_users_role_status` | no | yes | btree (`role_id`, `account_status`) |
| `users_legacy_mongo_id_key` | yes | yes | btree (`legacy_mongo_id`) |
| `users_pkey` | yes | yes | btree (`id`) |

Missing:

- `uq_users_email_lower`
- `uq_users_phone_number_nonempty`

## 3. UNIQUE indexes after the fix

Same catalog query after `apply-users-identity-unique-on-test.js`:

| indexname | unique | valid | definition |
| --- | --- | --- | --- |
| `uq_users_email_lower` | **yes** | **yes** | `CREATE UNIQUE INDEX uq_users_email_lower ON public.users USING btree (lower((email)::text))` |
| `uq_users_phone_number_nonempty` | **yes** | **yes** | `CREATE UNIQUE INDEX uq_users_phone_number_nonempty ON public.users USING btree (phone_number) WHERE ((phone_number IS NOT NULL) AND (btrim((phone_number)::text) <> ''::text))` |

PostgreSQL prints extra casts/`USING btree`. The expression and partial predicate match the intended indexes.

Bootstrap order on `BuilMate_test` is now:

1. Create schema (`prisma db push` only if core tables are missing; **no `--force-reset`**).
2. Apply finance SQL.
3. Apply identity UNIQUE SQL, fail-fast if the two indexes are missing/invalid.
4. Seed `@buildmate.test` actors.
5. Integration tests.

## 4. PostgreSQL test data before / after

Duplicate login emails **before** index creation (all fixture `@buildmate.test`, zero foreign keys):

| email | ids kept | extra id removed |
| --- | --- | --- |
| `demo.admin@buildmate.test` | 4 | 123 |
| `demo.contractor@buildmate.test` | 2 | 121 |
| `demo.customer@buildmate.test` | 1 | 120 |
| `demo.store@buildmate.test` | 3 | 122 |

Cause: `seed-test-actors.js` ran twice without a UNIQUE index, and `createUser()` always inserted.

After fixture-only cleanup and index create:

- duplicate email groups: **0**
- duplicate nonempty phones: **0**
- no non-`@buildmate.test` rows were deleted
- no rows on `BuilMate` were touched

## 5. Files changed

| File | Why |
| --- | --- |
| `backend/scripts/sql/ensure-users-identity-unique.sql` | Create the two UNIQUE indexes; fail if duplicates remain |
| `backend/scripts/apply-users-identity-unique-on-test.js` | Isolated-DB only: report dupes, remove extra `@buildmate.test` seed copies, apply SQL, verify VALID+UNIQUE+expression/predicate |
| `backend/scripts/bootstrap-isolated-test-db.js` | Run identity SQL after finance SQL, before seed; fail-fast |
| `backend/scripts/seed-test-actors.js` | Skip create when email already exists |
| `backend/scripts/test-db/verify-schema.js` | Fail if the two identity indexes are missing |
| `backend/prisma/schema.prisma` | Comment: do not add `@@unique` on email/phone; SQL remains source of truth |
| `backend/src/utils/identity.js` | Walk Prisma `cause` chain for P2002 / `23505` |
| `backend/src/services/accountIdentity.js` | Unknown unique on `users` still becomes 409, not 500 |
| `backend/src/tests/account-uniqueness.test.js` | TC13–TC24 with real row counts |
| `backend/src/tests/identity.test.js` | Wrapped P2002/`23505` mapping |
| `backend/src/tests/helpers/pg-cleanup.js` | Delete `contractor_profiles` before fixture users |
| `backend/scripts/test-db/inspect-users-indexes.js` | Read-only index probe |
| `backend/scripts/test-db/inspect-duplicate-users.js` | Read-only duplicate probe |

Not changed: contractor 15/5/10/85, material COD/0 fee, escrow state machine, payment services.

## 6. P2002 / 23505 strategy

PostgreSQL UNIQUE is the last line of defense. `findByEmail` / `findByPhone` is only a fast path.

On `users.create` / `users.update` / `PgUser.save`:

1. Catch Prisma `P2002` and PostgreSQL `23505`, including `err.cause`.
2. Map `uq_users_email_lower` / email target → **409 `EMAIL_ALREADY_EXISTS`**.
3. Map `uq_users_phone_number_nonempty` / phone target → **409 `PHONE_ALREADY_EXISTS`**.
4. Unique on `users` with an unknown field → **409 `ACCOUNT_IDENTITY_CONFLICT`**, still not 500.
5. `errorMiddleware` uses `classifyError`; the JSON envelope does not include Prisma/SQL stack traces.
6. Registration creates the user first, then OTP. A UNIQUE failure never creates the user, so it does not leave a partner profile or OTP row.
7. Requests were **not** serialized and **no** `sleep` was added.

Login identity rules (all actors: CUSTOMER, CONTRACTOR, MATERIAL_STORE_OWNER):

- email: `trim + lowercase`, one `users.id`
- VN mobile `090…` / `+8490…` / `8490…` stored as `090…`, one `users.id`
- store hotline / crew contact fields are not these login columns

## 7. Concurrency tests actually run

`npm run test:integration` against Docker Postgres, `--test-concurrency=1` for files, but TC13/TC14/TC23 themselves call `Promise.allSettled` with two live `register()` calls and then `prisma.users.count` / `findMany`.

| Case | Result this run |
| --- | --- |
| TC13 concurrent same email | PASS — 1 win, 1 HTTP 409, 1 DB row |
| TC14 concurrent same phone | PASS — 1 win, 1 HTTP 409, 1 DB row |
| TC15–TC16 case / `0`/`+84`/`84` | PASS |
| TC17–TC18 cross-actor email/phone | PASS |
| TC19 P2002/`23505` → 409 | PASS |
| TC20 failed contractor register leaves no profile | PASS |
| TC21–TC22 self update vs foreign identity | PASS |
| TC23 second race still one row | PASS |
| TC24 indexes VALID+UNIQUE+expression | PASS |

## 8. Unit PASS / FAIL

Command: `npm run test:unit --prefix backend`

**37 PASS / 0 FAIL.** No contractor-finance regression.

## 9. Integration PASS / FAIL

Command: `npm run test:integration --prefix backend`

**287 PASS / 0 FAIL** (was 277 PASS / 1 FAIL of 278; uniqueness coverage was added).

`contractor escrow on isolated PostgreSQL` still PASS, including 15% hold, 5% fee once, 10% payout, refund-once, refund/payout race, and free material snapshot (no contractor escrow math).

## 10. Financial business impact

**None.** This phase did not change deposit 15%, fee 5%, hold 10%, remaining 85%, material COD, or fee 0.

## 11. Confirmation `BuilMate` was not written

Apply/bootstrap/inspect clients:

- host `127.0.0.1`
- database name asserted `BuilMate_test`
- refuse `builmate` / `postgres` / `template0` / `template1`
- no `prisma migrate` / `db push --force-reset` on any shared database

## 12. Remaining risks

- A new test database still needs bootstrap (or `apply-users-identity-unique-on-test.js`). `prisma db push` alone will **not** recreate the expression indexes.
- Shared/runtime `BuilMate` was not migrated. If that database also lacks these indexes, production can still insert duplicate logins. This phase explicitly did not run production SQL.
- Empty `phone_number` is excluded from the phone UNIQUE index (partial). Several dummy phones may be null; nonempty login phones cannot collide.
- Phone uniqueness is on the **stored** normalized value. Every write path must keep using `storedVnMobile()`.
- Prisma schema still cannot describe `lower(email)` / partial unique. Official mechanism: SQL file + bootstrap verification, documented on the `users` model. Do not add incompatible `@@unique`.
- Browser E2E is still outstanding.

## Completion

- TC13 PASS on real PostgreSQL test.
- Concurrent phone registration PASS.
- UNIQUE indexes confirmed VALID + UNIQUE + correct expression/predicate.
- No duplicate login identity across actors in tests.
- No finance formula change; escrow integration still PASS.
- Bootstrap fail-fast if identity UNIQUE indexes are missing.
