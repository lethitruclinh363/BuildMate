# PostgreSQL stability report

Ngày đo: 7 Oct 2026. Runtime `DATABASE_PROVIDER=postgres`. Không đổi business rule, không bật lại Mongo, không thêm fallback.

PostgreSQL runtime stable: **YES**

## Kết quả lệnh

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 196 tests, 52 suites, 196 pass, 0 fail, 119.6s |
| `node scripts/migration/15-cutover-runtime-check.js` | 21/21 |
| frontend `npm run build` | pass |
| admin `npm run build` | pass |

`TEST_DATABASE_URL` chưa được đặt. Test ghi dòng `@buildmate.test` trên database đang chạy và chỉ xóa các dòng đó khi dọn.

## Role và flow

Bốn role đều có user `ACTIVE` có dữ liệu thật: khách có đơn dịch vụ, thợ có cửa hàng dịch vụ `LIVE`, chủ cửa hàng vật liệu `LIVE`, admin.

HTTP GET trên server tạm, mỗi path một lần. Token ký từ user đã có, không in mật khẩu. Mọi response `success: true`, không có `$oid`.

| Flow | Cách kiểm | HTTP |
| --- | --- | --- |
| Auth | Test `auth-session`, `auth-otp`; smoke register, login, reset | Service + test HTTP |
| Profile | `GET /api/user/profile`, `GET /api/contractor/profile` | 200 |
| Provider search | `GET /api/location/contractors/nearby` | 200 |
| Store search | `GET /api/location/stores/nearby` | 200 |
| Materials | `GET /api/materials/search`, `GET /api/material-store/materials` | 200 |
| Services | `GET /api/service-catalog`, `GET /api/services/search`, `GET /api/contractor/services` | 200 |
| Repair request | `GET /api/repair-requests/my`, `GET /api/repair-requests/received`; smoke tạo request | 200 |
| Chat | `GET /api/chat/rooms`, `GET /api/chat/rooms/:id/messages?limit=50`; smoke gửi tin | 200 |
| Quotation | `GET /api/quotations/request/:id`; smoke tạo và khách chấp nhận | 200 |
| Service order | `GET /api/orders/customer`, `GET /api/orders/contractor` | 200 |
| Payment | `GET /api/payments/order/:id`; smoke checkout mock | 200 |
| Progress | `GET /api/orders/:id/progress`; smoke thêm mốc | 200 |
| Review | Smoke tạo review sau khi hoàn thành đơn | Service |
| Complaint | `GET /api/complaints/my`, `GET /api/admin/complaints`; smoke tạo complaint | 200 |
| Material order | `GET /api/material-orders/my`, `GET /api/material-store/orders`; smoke tạo đơn và thu deposit | 200 |
| Notification | `GET /api/notifications?page=1&limit=40`; smoke ghi một thông báo | 200 |
| Policy | `GET /api/policies/active`, `GET /api/policies` | 200 |
| Admin | customers, analytics, complaints, verifications, stats | 200 |
| eKYC persistence | `GET /api/contractor/ekyc`; smoke lưu OCR, liveness, quyết định admin. FastAPI không được gọi | 200 |

Smoke xác nhận bản ghi mới nằm trên PostgreSQL: đơn dịch vụ, thanh toán, đơn vật liệu, deposit, thông báo, audit, location correction, eKYC và bảng con OCR/liveness.

## Ba trang ưu tiên

Mỗi API dưới đây là một request. Không có request trùng trong log của lần gọi đó.

| Trang | API | Status | Thời gian | Prisma queries |
| --- | --- | --- | --- | --- |
| `/store/dashboard` | `GET /api/material-store/workspace` | 200 | 414 ms | 6 |
| `/store/materials` | `GET /api/material-store/materials` | 200 | 231 ms | 4 |
| `/customer/request/history` | `GET /api/repair-requests/my` | 200 | 563 ms | 5 |

Frontend của ba trang đã bỏ vòng gọi lại ở lượt tối ưu trước: materials không mount lại khi đổi tab và không gọi `getStore` thêm; history không thay cả trang bằng skeleton khi bấm thử lại. Lần này không bấm trình duyệt nên console trình duyệt không được ghi.

## Latency

36 GET. Tất cả 200. Không response lỗi shape.

- Nhanh nhất: `GET /api/health` 5 ms, 0 query.
- Trung vị khoảng 238 ms.
- 21 request dưới 300 ms, 12 request từ 300 đến 700 ms, 2 request trên 1 giây.

Chậm nhất:

| Endpoint | Thời gian | Queries | Tổng thời gian query |
| --- | --- | --- | --- |
| `GET /api/admin/verifications` | 1726 ms | 70 | 11998 ms |
| `GET /api/service-catalog` | 1718 ms | 71 | 1679 ms |
| `GET /api/contractor/services` | 681 ms | 7 | 677 ms |
| `GET /api/contractor/workspace` | 564 ms | 7 | 558 ms |
| `GET /api/repair-requests/my` | 563 ms | 5 | 886 ms |

Tổng thời gian query lớn hơn thời gian request khi các query chạy song song. Hai dòng đầu là số đo trước khi gộp N+1. Số sau khi sửa nằm ở mục dưới.

## PostgreSQL

Trước test và sau smoke, cùng một kết quả:

| Kiểm tra | Số dòng |
| --- | --- |
| FK chưa validate | 0 |
| `legacy_mongo_id` trùng | 0 |
| Role không thuộc bốn role hệ thống | 0 |
| Lệch tiền đơn vật liệu hoặc đơn dịch vụ | 0 |
| Payment lệch khách/thợ với đơn | 0 |
| Commission lệch đơn hoặc payment | 0 |

Index mới trong đợt này: **0**. Các index cũ (`legacy_mongo_id` unique, `idx_materials_store_active`, index theo `created_at` của request, notification, order) vẫn được giữ. Planner không cần index mới ở kích thước bảng hiện tại.

## MongoDB

Đếm 22 collection trước `npm test` và sau smoke giống nhau, gồm users 6, orders 2, payments 2, notifications 69, repairrequests 1, materials 1, stores 3. Không có document mới.

`mongoose.connect` chỉ nằm ở nhánh `DATABASE_PROVIDER=mongo` trong `src/config/database.js`, helper test, và script seed. Probe HTTP không nạp package `mongoose` (`readyState` không mở). Smoke mở Mongo chỉ để đếm, rồi ghi nhận counts không đổi.

## Duplicate request đã xử lý ở frontend

- `/store/materials`, `/store/products`, `/store/prices` dùng một page. Hết refetch khi đổi ngôn ngữ và hết `GET /store` trùng.
- Explore không gọi lại materials mỗi lần đổi bán kính.
- Thông báo cùng page dùng chung một request đang chạy.
- Trạng thái duyệt đối tác và admin search không fetch lại chỉ vì hàm dịch đổi.
- Chi tiết đơn vật liệu bỏ poll 15 giây; cập nhật đi qua socket.

## Hai endpoint sau khi gộp query

Đo lại trên cùng cách đếm Prisma query. Không thêm index: kế hoạch và kích thước bảng hiện tại không chứng minh một index mới sẽ được dùng.

| Endpoint | Trước | Sau |
| --- | --- | --- |
| `GET /api/service-catalog` | 71 query, 1718 ms | 2 query ở lần đầu của process (330 ms), sau đó 1 query (98 ms) |
| `GET /api/admin/verifications` | 70 query, 1726 ms | 9 query, khoảng 808 ms khi pool đã ấm |

Catalog hết vòng `findOne` và `save` cho từng dịch vụ hệ thống. Verification hết vòng đọc user, cửa hàng và đếm hàng theo từng hồ sơ.

## Việc còn lại

- Tìm kiếm marketplace vẫn có thể quét catalog khi filter không đẩy được xuống SQL.
- Danh sách vật liệu, yêu cầu sửa chữa và đơn dịch vụ của chủ sở hữu chưa có query `page`.
- eKYC bằng ảnh CCCD thật qua FastAPI chưa chạy.
- Console trình duyệt của ba trang ưu tiên chưa được bấm trong phiên này.
- Test chưa tách database vì thiếu `TEST_DATABASE_URL`.
