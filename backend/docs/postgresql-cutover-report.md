# PostgreSQL cutover

Kết luận: **FINAL COMPLETE** cho runtime PostgreSQL. Khi `DATABASE_PROVIDER=postgres` (mặc định runtime), production route không mở kết nối MongoDB và không đọc/ghi MongoDB. Approve eKYC bằng ảnh CCCD thật vẫn chưa chạy.

MongoDB không bị xóa. Database Mongo giữ vai trò legacy backup. Script migration vẫn đọc Mongo để đối chiếu.

## Domain đã chuyển

Runtime PostgreSQL, public id vẫn là `legacy_mongo_id` 24 ký tự:

- Auth / User
- Contractor profile, Store
- Catalog, Service, Service suggestion, Material category, Material
- Repair request, Chat room, Message, Quotation
- Service order, Payment, Commission rule, Commission, Progress update, Review, Complaint
- Material order, Material order item, Material order status history, Material order payment, Material commission
- Notification, Policy, Policy revision, Audit log, Location correction
- Contractor eKYC (`contractor_ekyc_verifications`, `ekyc_ocr_issues`, `ekyc_liveness_frames`, `ekyc_attempts` và bảng con)
- Admin list khách hàng, analytics, duyệt hồ sơ, moderation, complaint, policy, payment/commission, audit

Ảnh chụp tài chính của material order được lưu nguyên (subtotal, phí ship, tổng, tỷ lệ cọc, tiền cọc, tỷ lệ phí sàn, phí sàn, tiền cọc cửa hàng, số còn lại). Lịch sử không bị tính lại theo giá hiện tại.

Location correction là bộ nhớ tọa độ đã xác nhận, không phải yêu cầu chỉnh sửa của admin.

FastAPI eKYC vẫn đi qua API backend. FastAPI không được cấp kết nối PostgreSQL.

## Backfill

Script `backend/scripts/migration/14-backfill-remaining.js` đã commit. Mongo không đổi trong lúc chép.

| Nguồn Mongo | Số document | Đã chép | Ghi chú |
| --- | ---: | ---: | --- |
| materialOrders | 1 | 0 | Vật liệu `6abe7c638978b68e49fb8ad5` không có trong Mongo `materials` và không có trong PostgreSQL |
| materialOrderPayments | 1 | 0 | Phụ thuộc đơn ở trên |
| materialCommissions | 1 | 0 | Phụ thuộc thanh toán ở trên |
| notifications | 69 | 57 | 12 thông báo trỏ tới user không còn trong PostgreSQL |
| policies | 14 | 14 | Giữ type, language, version, status, effective date, content |
| policyrevisions | 1 | 1 | |
| auditlogs | 655 | 655 | 563 dòng không map được actor; `actor_user_id` để null, không bịa user |
| locationcorrections | 0 | 0 | |
| contractorekycverifications | 1 | 1 | 5 dòng eKYC đã có trong PostgreSQL được giữ nguyên |

## Tests

Smoke `backend/scripts/migration/15-cutover-runtime-check.js`: **21/21 PASS**.

Đã chạy trên PostgreSQL:

- Auth: register, login, yêu cầu reset password (token lưu PostgreSQL)
- Customer: profile, tìm provider, tìm cửa hàng, repair request, chat, quotation, order, payment, progress, review, complaint, material order và cọc
- Location correction
- Policy list
- Admin: danh sách khách, analytics
- Audit log
- Notification
- eKYC: lưu OCR issue, liveness frame, submit, admin review

Trong smoke, số document Mongo của các collection runtime không đổi.

Ràng buộc sau smoke:

- Foreign key không valid: 0
- Legacy id trùng: 0
- Role không hợp lệ: 0
- Lệch tiền material order (`subtotal + shipping = total`, `deposit + remaining = total`, `platform fee + store deposit = deposit`) và lệch `service_orders.amount` với `quotations.total_cost`: 0
- Payment không cùng customer/contractor với service order: 0
- Commission không cùng order/payment hoặc material commission không cùng material order: 0

`node scripts/migration/16-integrity-check.js` sau smoke: 55 bảng, duplicate legacy 0, invalid role 0, invalid FK 0, monetary 0, order/payment 0, commission 0. 563 audit log vẫn để `actor_user_id` null. Không tạo user hay vật liệu giả để lấp các dòng này.

Build:

- Frontend `npm run build`: PASS
- Admin `npm run build`: PASS

`npm test`: 196 tests, 196 pass, 0 fail, 0 cancelled.

Các test service trước đây tạo fixture bằng Mongoose. Service production đọc PostgreSQL nên không thấy fixture đó. Fixture User, contractor, store, service, material, repair request, quotation, order và admin JWT đã chuyển sang Prisma. Quan hệ dùng BIGINT. Public id vẫn là `legacy_mongo_id` 24 ký tự. Không thêm fallback Mongo vào service.

Role PostgreSQL hiện tại không có quyền `CREATE DATABASE` và không có quyền `CREATE SCHEMA` trên `BuilMate`. Vì vậy chưa tách được database test.

Khi `TEST_DATABASE_URL` được đặt, `npm test` dùng đúng URL đó và từ chối nếu tên database là `BuilMate`. Cleanup không được chạy trên database production. Khi biến này trống, suite in cảnh báo và giữ cơ chế cũ: chỉ tạo và xóa user `@buildmate.test`. Sprint finance chụp `commission_rules` trước khi chạy và khôi phục rule đang active sau khi xong. Không `DROP`, `TRUNCATE`, `prisma migrate reset`, `prisma db push`, hay `prisma migrate dev` trên database này.

Email OTP HTML đã khớp câu an toàn và cụm “chỉ sử dụng một lần”. Catalog test đọc unique index `normalized_name` trên `catalog_services`.

## eKYC

FastAPI khởi động bằng `python main.py` hoặc `uvicorn main:app --host 0.0.0.0 --port 8000` trong `ekyc-service`. Health: `GET /health`. OCR upload: `POST /api/v1/ai/verify-ekyc-upload`. Liveness: `POST /api/v1/face/enroll` và `POST /api/v1/face/validate-frame`. Timeout backend: `EKYC_TIMEOUT_MS`, mặc định 120000. Token nội bộ: `EKYC_INTERNAL_TOKEN`, header `X-Internal-Token`. FastAPI không có `DATABASE_URL`, `PGHOST`, hay Mongo.

Service đã chạy và trả `GET /health` 200. Ảnh không phải CCCD được đưa qua backend tới OCR thật: `validation_passed` là false, PostgreSQL lưu 2 OCR issue và 5 frame. Liveness thật trả 400 vì không có khuôn mặt. Submit bị chặn với 400. Admin retake lưu `REQUEST_RETAKE`. Không gọi approve, vì kết quả AI không đạt và không được ghi là PASS.

Hồ sơ approve/reject trên ảnh CCCD và selfie thật: **NOT RUN**. Không có giấy tờ thật trong repo, và không bịa kết quả OCR.

## Mongo còn lại

Production route không import Mongoose khi chỉ lấy hằng số. Schema Mongoose chỉ được dựng khi code truy cập model constructor.

Còn dùng Mongoose, không nằm trên production route:

1. Production runtime: 0 đường đọc/ghi. `require` app không nạp package `mongoose`. Nhánh `DATABASE_PROVIDER=mongo` trong các access module vẫn còn để tương thích, và không được mặc định. `mongoose.connect` chỉ nằm trong nhánh mongo của `database.js`.
2. Migration scripts trong `backend/scripts/migration`: đọc Mongo backup.
3. Backup / seed: `backend/src/scripts/seed*.js`, `removeDemoUsers.js`.
4. Tests: `backend/src/tests`.

`mongoose` vẫn nằm trong `dependencies` vì script migration và test import nó. `backend/src/repositories/user.repository.js` là file Mongo cũ, không file route nào import.

## PostgreSQL

- Provider runtime: `postgres` (mặc định trong `backend/src/config/env.js` nếu biến môi trường trống)
- Database: `BuilMate`, schema `public`
- Client: Prisma 6.19.3
- Chuỗi kết nối lấy từ `DATABASE_URL` trong `backend/.env` (không ghi secret vào báo cáo)
- `connectDatabase` khi postgres chỉ chạy `SELECT 1` qua Prisma, rồi return

## Rollback

1. Dừng API.
2. Đặt `DATABASE_PROVIDER=mongo`.
3. Giữ `MONGODB_URI` của backup.
4. Khởi động lại. Access module sẽ dùng model Mongoose.

Dữ liệu tạo sau cutover chỉ có trên PostgreSQL (user smoke, đơn dịch vụ, đơn vật liệu, thông báo, audit, eKYC mới). Rollback sang Mongo không thấy các dòng đó. Không xóa PostgreSQL và không xóa Mongo khi rollback.

## Known issues

- Một đơn vật liệu lịch sử không chép được vì vật liệu tham chiếu không tồn tại ở cả hai database. Payment và commission của đơn đó cũng không chép. Đã ghi trong `backend/scripts/migration/output/remaining-backfill-report.json`.
- 12 notification lịch sử thiếu user PostgreSQL.
- 563 audit log lịch sử không có actor trong PostgreSQL; dòng vẫn được chép, actor để trống.
- Approve eKYC trên CCCD và selfie thật chưa chạy. Service AI đã từ chối ảnh không phải giấy tờ.
- Role database không tạo được database hoặc schema riêng cho test. Khi chưa có `TEST_DATABASE_URL`, fixture nằm trên `BuilMate` và chỉ bị xóa nếu email là `@buildmate.test`.
- Backup: giữ dump Mongo hiện có. Thêm `pg_dump` của `BuilMate` trước mỗi lần deploy. Không xóa một trong hai bản.
