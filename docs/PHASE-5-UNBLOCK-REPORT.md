# PHASE 5 — Unblock test database (2026-10-15)

Honest status: **integration remains BLOCKED**. Source, guards, Docker Compose, and finance SQL are ready. `BuilMate_test` was not created. Finance SQL was not applied. Shared database `BuilMate` was not touched.

## A. Database test sẵn sàng?

**Chưa.** `backend/.env.test` không tồn tại. `TEST_DATABASE_URL` unset. `npm run test:integration` fail-fast trước khi mở suite.

## B. Docker / local PostgreSQL

- OS: Windows 10.0.26200.
- Docker Desktop / Docker Engine: **không cài**. Podman: không cài.
- PostgreSQL local: service `postgresql-x64-18` Running, Automatic, listen `0.0.0.0:5432` và `[::]:5432`.
- `psql` không có trên PATH. Prisma CLI có (`npx prisma validate` PASS).
- Port `55432` (stack test Docker) **không** listen.
- `.env.migration` trỏ database tên `BuilMate` trên host **không** loopback. Không kết nối, không ghi.

Không tự cài Docker. Không dùng password local (không có `.env.test.admin`). Không `CREATE DATABASE` trên PostgreSQL 18.

## C. Connection safety

Guard `requireIsolatedTestDatabase()`:

- Bắt buộc `TEST_DATABASE_URL`.
- Không fallback `DATABASE_URL` / `PGDATABASE`.
- Chặn tên `builmate` / `postgres` / `template0` / `template1`.
- Chặn host không local trừ khi `TEST_ALLOW_REMOTE=yes`.
- Unit test từ chối `171.244.39.202/BuilMate_test`.

Đã xác nhận:

- `npm run test:integration` thoát 1 với thông báo isolation (không chạy fixture).
- `npm run test:db:up` thoát 2 vì thiếu Docker.
- `test:db:bootstrap` thoát 1 vì thiếu `TEST_PGHOST`.
- `test:db:sql` thoát 1 vì thiếu `TEST_DATABASE_URL`.

Preload test ghi đè `DATABASE_URL` bằng URL test, tắt SMTP, `NODE_ENV=test`. Backend E2E: `npm run test:api` (fail-fast nếu chưa có URL test).

## D. Migration đã áp dụng lên database nào?

**Không database nào.** `2026-contractor-escrow-material-free.sql` chỉ chạy qua `apply-finance-sql-on-test.js`, script này từ chối `BuilMate`.

## E. Prisma Schema

- `npx prisma validate` (URL dummy `127.0.0.1:55432/BuilMate_test`): **PASS**.
- Models escrow **không** merge vào `schema.prisma` (fragment `backend/prisma/fragments/contractor-escrow.prisma`). Merge sẽ làm Prisma SELECT cột/bảng chưa có trên BuilMate.
- `material_orders.deposit_rate_snapshot` default Prisma vẫn 15 / fee 5 / `PENDING_PAYMENT`. SQL test sẽ đổi default trên `BuilMate_test` sau khi có DB.
- `payments` đã có `@@unique([service_order_id, payment_type])`.
- Không `prisma db push` / `prisma generate` trên BuilMate. `prisma generate` không cần vì schema live không đổi.

## F. Unit PASS/FAIL

**36 PASS / 0 FAIL** (`npm run test:unit`).

Trước Phase 5: 35/35. Thêm 1 test chặn remote `BuilMate_test`.

## G. Integration PASS/FAIL

**0 PASS / 0 FAIL / BLOCKED.** Suite không chạy. Có 49 file `src/tests/*.test.js` sẵn sàng, gồm `escrow-postgres.test.js`.

## H. Race condition đã test thật chưa?

**Chưa trên PostgreSQL test.** Unit sequential (payout rồi refund) PASS. HTTP concurrent settle/refund nằm trong `escrow-postgres.test.js` nhưng chưa execute vì thiếu DB.

## I. Còn BLOCKED

1. Thiếu Docker nên không tạo cluster `127.0.0.1:55432`.
2. Thiếu mật khẩu superuser PostgreSQL 18 nên không `CREATE DATABASE "BuilMate_test"` trên `:5432`.
3. `TEST_DATABASE_URL` unset → integration + E2E + finance SQL blocked.
4. Bảng escrow chưa tồn tại trên bất kỳ database nào trong máy này.
5. Không có script `lint` / `build` backend (Node thuần). Không chạy được.

## J. File đã tạo hoặc sửa

Tạo: `docker-compose.test.yml`, `backend/scripts/test-db/up.js`, `backend/scripts/test-db/down.js`, `backend/scripts/apply-finance-sql-on-test.js`, `backend/src/tests/helpers/finance-http.js`, `backend/src/tests/escrow-postgres.test.js`, `docs/TEST-DATABASE.md`, `docs/PHASE-5-UNBLOCK-REPORT.md`.

Sửa: `backend/src/tests/helpers/database-safety.js`, `database-safety.test.js`, `preload-postgres.js`, `backend/scripts/bootstrap-isolated-test-db.js`, `backend/package.json`, `backend/.env.test.example`, `backend/src/config/prisma.js`, `backend/src/tests/helpers/party.js`, `sprint61-finance.test.js`, `sprint63-validation.test.js`, `backend/prisma/fragments/contractor-escrow.prisma`, `backend/scripts/sql/2026-contractor-escrow-material-free.sql`, `.gitignore` (đã có `.env.test*`).

Không sửa `.env` / `.env.migration`. Không commit credentials.

## K. Lệnh khởi động lại sau khi có Docker hoặc password local

Docker (ưu tiên, không đụng PostgreSQL 18):

```
cd BUILDMATE
npm run test:db:up --prefix backend
npm run test:db:bootstrap --prefix backend
npm run test:unit --prefix backend
npm run test:integration --prefix backend
```

Dừng: `npm run test:db:down --prefix backend`

Hoặc local PG 18: tạo `backend/.env.test.admin` rồi `npm run test:db:bootstrap --prefix backend`.

Không trỏ `TEST_DATABASE_URL` vào BuilMate.
