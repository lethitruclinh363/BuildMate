# PostgreSQL production checklist

PostgreSQL database `BuilMate`, schema `public`, là runtime chính. MongoDB chỉ là legacy backup.

## Trước khi deploy

- `DATABASE_PROVIDER=postgres` trong môi trường chạy API.
- `DATABASE_URL` trỏ tới `BuilMate`. Không in chuỗi này ra log.
- Không chạy `prisma migrate reset`, `prisma db push`, hoặc `prisma migrate dev` trên `BuilMate`.
- Không `DROP` hoặc `TRUNCATE` schema `public`.
- Không xóa database Mongo và không xóa dữ liệu PostgreSQL đã migrate.

## Kiểm tra

- `npm test` trong `backend`: fixture service đi qua Prisma. User test dùng email `@buildmate.test`.
- Cảnh báo: role hiện tại không có quyền `CREATE DATABASE` hoặc `CREATE SCHEMA`. Chưa có database test riêng.
- Khi admin cấp database khác `BuilMate`, đặt `TEST_DATABASE_URL` trước khi chạy test. Suite sẽ dùng URL đó và từ chối cleanup nếu tên database là `BuilMate`.
- Khi `TEST_DATABASE_URL` trống, test vẫn ghi vào runtime database và chỉ xóa dòng `@buildmate.test`.
- `node scripts/migration/15-cutover-runtime-check.js`: smoke runtime.
- `node scripts/migration/16-integrity-check.js`: FK, legacy id, role, tiền, payment, commission.
- `npm run build` ở `frontend` và `admin`.

## eKYC

- FastAPI không nhận chuỗi kết nối database.
- OCR và liveness chỉ được tính là đã chạy khi process FastAPI thật sự phản hồi.
- Backend ghi kết quả vào `contractor_ekyc_verifications` và các bảng con.

## Dữ liệu không ép migrate

- Đơn vật liệu Mongo `6abfe5976081502fb7f16356` không có vật liệu `6abe7c638978b68e49fb8ad5` ở cả hai database. Payment và commission của đơn đó không được chép.
- 12 notification không có user PostgreSQL.
- 563 audit log giữ `actor_user_id` null.

## Backup

MongoDB: **LEGACY BACKUP - DO NOT DELETE.**

PostgreSQL, không chạy restore trừ khi đang khôi phục có chủ đích. Thay host, user và đường dẫn file. Không ghi mật khẩu vào lệnh này:

```text
pg_dump -h HOST -p 5432 -U USER -d BuilMate -F c -f buildmate-YYYYMMDD.dump
pg_restore -h HOST -p 5432 -U USER -d BuilMate_restore --clean --if-exists buildmate-YYYYMMDD.dump
```

`--clean` chỉ được dùng trên database khôi phục, không dùng trên `BuilMate` đang chạy. Kiểm tra file dump mở được trước khi coi bản backup là xong. Giữ cả dump Mongo.

## Rollback

1. Dừng API.
2. Đặt `DATABASE_PROVIDER=mongo` và giữ `MONGODB_URI` của backup.
3. Khởi động lại.
4. Dữ liệu tạo sau cutover chỉ có trên PostgreSQL. Rollback không xóa PostgreSQL.

## Production mongoose

- Route production không được gọi `mongoose.connect` khi provider là postgres.
- Package `mongoose` được giữ cho script migration và test.
