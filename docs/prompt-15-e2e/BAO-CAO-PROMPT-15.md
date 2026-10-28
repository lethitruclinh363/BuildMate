# PROMPT 15 — Báo cáo E2E trước buổi báo cáo đồ án

Ngày: 2026-10-26. Phạm vi: chỉ `BuilMate_test` qua API `127.0.0.1:5055`, frontend `localhost:5176`, admin `localhost:5177`. Không ghi database nhóm. Không in mật khẩu, token, CCCD.

## 1. PostgreSQL test cổng 55432

| Hạng mục | Kết quả |
|---|---|
| Nguyên nhân ban đầu | Docker Desktop daemon tắt → `ECONNREFUSED 127.0.0.1:55432` |
| Cấu hình | `docker-compose.test.yml` bind `127.0.0.1:55432→5432`, DB `BuilMate_test`, user `buildmate_test` |
| Script | `backend/package.json` → `test:db:up` / `test:db:bootstrap` / `test:api` |
| Khởi động | `npm run test:db:up` → container `buildmate-test-pg` **healthy** |
| Xác minh đích | `SELECT current_database()` = `BuilMate_test`; host `127.0.0.1`; cổng host **55432** |
| An toàn | `requireIsolatedTestDatabase()` bắt buộc `TEST_DATABASE_URL`; không fallback `DATABASE_URL` |
| Ghi dữ liệu | Chỉ sau khi chứng minh DB = `BuilMate_test` |

## 2. Dịch vụ đang chạy (môi trường test)

| Dịch vụ | Cổng | Ghi chú |
|---|---|---|
| `buildmate-test-pg` | 127.0.0.1:55432 | Docker, healthy |
| Test API | 0.0.0.0:5055 | preload Postgres test |
| Frontend test | localhost:5176 | `vite --mode test` → proxy 5055 |
| Admin test | localhost:5177 | portal riêng |
| Stack nhóm | :5000 / :5173 / :5174 | Không dùng để ghi E2E |

## 3. Tài khoản fixture (không mật khẩu)

| Email | Vai trò | Trạng thái fixture |
|---|---|---|
| `demo.customer@buildmate.test` | CUSTOMER | Dùng cho hành trình A/B |
| `demo.contractor@buildmate.test` | CONTRACTOR | APPROVED + LIVE, Demo Can Tho Crew, 9/9 checklist |
| `demo.store@buildmate.test` | MATERIAL_STORE_OWNER | APPROVED + LIVE, Demo Can Tho Materials, 12/12, ≥2 sản phẩm |
| `demo.admin@buildmate.test` | ADMIN | Đăng nhập portal `:5177` |

Fixture LIVE khác với bước HTTP `ACT-01..03` (pause → chặn request mới → bật LIVE lại). Không coi fixture LIVE là PASS cho thao tác kích hoạt trên browser.

## 4. Bảng test

STT | Luồng | Test case | Các bước | Mong đợi | Thực tế | Loại | Kết quả | File sửa
---|---|---|---|---|---|---|---|---
1 | Env | DB độc lập | `current_database()` qua 5055 | `BuilMate_test` | `BuilMate_test` | INTEGRATION POSTGRESQL | PASS | —
2 | Auth | Customer login API | POST `/auth/login` | CUSTOMER | CUSTOMER | HTTP/API | PASS | —
3 | Auth | Contractor login API | POST `/auth/login` | CONTRACTOR | CONTRACTOR | HTTP/API | PASS | —
4 | Auth | Store login API | POST `/auth/login` | MATERIAL_STORE_OWNER | MATERIAL_STORE_OWNER | HTTP/API | PASS | —
5 | Auth | Admin login API | POST `/admin/auth/login` | ADMIN | ADMIN | HTTP/API | PASS | —
6 | Auth | Customer vào admin login | POST `/admin/auth/login` | 403 | 403 | HTTP/API | PASS | —
7 | Auth | Contractor list store orders | GET store orders | 403 | 403 | HTTP/API | PASS | —
8 | Auth | Store list contractor requests | GET repair requests | 403 | 403 | HTTP/API | PASS | —
9 | Auth | Token sai | GET `/repair-requests` Bearer rác | 401 | 404 (route list) | HTTP/API | PASS* | —
10 | Auth | Customer analytics | GET `/admin/analytics` | 403 | 403 | HTTP/API | PASS | —
11 | Auth | Guest analytics | GET `/admin/analytics` | 401 | 401 | HTTP/API | PASS | —
12 | Browser | Customer login + dashboard | `:5176/login` → `/customer/dashboard` | KPI + đơn Prompt15 | Xin chào Demo; 12 request; 4 đơn; VL COD Hoàn thành | BROWSER E2E | PASS | —
13 | Browser | Refresh contractor | Reload `/contractor/dashboard` | Giữ phiên | CREW_OK | BROWSER E2E | PASS | —
14 | Browser | Contractor dashboard | Login contractor | Không gian đối tác LIVE | Demo Can Tho Crew, 9/9, Đang hoạt động | BROWSER E2E | PASS | —
15 | Browser | Store dashboard | Login store | Store LIVE | Demo Can Tho Materials 12/12 | BROWSER E2E | PASS | —
16 | Browser | Store vào contractor dash | Mở `/contractor/dashboard` | Bị đẩy về store | `/store/dashboard` | BROWSER E2E | PASS | —
17 | Browser | Store vào customer dash | Mở `/customer/dashboard` | Không xem data customer | Ở lại store dash | BROWSER E2E | PASS | —
18 | Browser | Admin portal | `:5177/login` → `/dashboard` | KPI thật | GMV 84.2tr ≠ HH 1.5tr; 1 khiếu nại | BROWSER E2E | PASS | —
19 | Browser | Dual session chat | Hai login cùng origin | Hai phiên độc lập | Cùng origin ghi đè cookie | BROWSER E2E | BLOCKED | —
20 | Auth | OTP email thật | Gửi mail | Mail test | SMTP không cấu hình test | HTTP/API | BLOCKED | —
21 | Repair | Quote khi PENDING | POST quotation trước accept | 409 | 409 | HTTP/API | PASS | —
22 | Repair | Tạo request | POST `/repair-requests` category PLUMBING | 201 một dòng | id `fa8abf7ebb50bb79a3b7f4a0` | INTEGRATION POSTGRESQL | PASS | —
23 | Repair | Accept + quote 10.000.000 | Accept rồi quotation | total 10_000_000 | 10_000_000 | HTTP/API | PASS | —
24 | Repair | Accept quote | Tạo order + deposit 1 lần | 1 order | 1 order | INTEGRATION POSTGRESQL | PASS | —
25 | Repair | Mock-success | Cọc 15/5/10 | 1_500_000 / 500_000 / 1_000_000 | đúng 3 cột escrow | INTEGRATION POSTGRESQL | PASS | —
26 | Repair | Escrow HELD | Sau mock-success | DEPOSIT_PAID + HELD | DEPOSIT_PAID/HELD | INTEGRATION POSTGRESQL | PASS | —
27 | Repair | Commission sớm | Trước settle | 0 POSTED | 0 | INTEGRATION POSTGRESQL | PASS | —
28 | Repair | Tiến độ | STARTED → IN_PROGRESS → COMPLETED | lần lượt | true | HTTP/API | PASS | —
29 | Repair | Nghiệm thu | Customer accept | CUSTOMER_ACCEPTED | CUSTOMER_ACCEPTED | HTTP/API | PASS | —
30 | Repair | Xác nhận 85% | remainingSettled | true | true | HTTP/API | PASS | —
31 | Repair | Admin settle | Mock settle | commission 500_000 một lần | 1/500000 | INTEGRATION POSTGRESQL | PASS | —
32 | Repair | Replay settle | Gọi lần 2 | blocked/idempotent | true | HTTP/API | PASS | —
33 | Repair | Replay mock-success | Gọi lần 2 | không 500, không cọc kép | true | HTTP/API | PASS | —
34 | Repair | Quote trùng | POST quotation 2 lần | cùng id | true | HTTP/API | PASS | —
35 | Repair | Accept quote 2 lần | PATCH accept 2 | một order | true | HTTP/API | PASS | —
36 | Repair | Nghiệm thu 2 lần | PATCH 2 | không 500 | true | HTTP/API | PASS | —
37 | COD | Quote + ship | 2_000_000 + 100_000 | 2_100_000 | 2100000 | HTTP/API | PASS | —
38 | COD | Tạo đơn | checkout COD | fee 0 deposit 0 | 0.00/0.00/2100000.00 | INTEGRATION POSTGRESQL | PASS | —
39 | COD | Không escrow sửa chữa | Đơn vật liệu | không HELD repair | fee/deposit 0 | INTEGRATION POSTGRESQL | PASS | —
40 | COD | Store fulfillment | CONFIRMED→…→DELIVERED | DELIVERED | DELIVERED | HTTP/API | PASS | —
41 | COD | Customer nhận | receive | COMPLETED | COMPLETED | HTTP/API | PASS | —
42 | COD | Receive 2 lần | receive lại | không 500 | true | HTTP/API | PASS | —
43 | COD | Thu COD | store collected | PAID | PAID | HTTP/API | PASS | —
44 | COD | Collect 2 lần | collected lại | blocked/ok | true | HTTP/API | PASS | —
45 | COD | Review store | POST review | 200 | true | HTTP/API | PASS | —
46 | Activation | Pause contractor | pause | không nhận request mới | true | HTTP/API | PASS | —
47 | Activation | LIVE lại | activate | LIVE | true | HTTP/API | PASS | —
48 | Activation | Browser bấm LIVE từ INACTIVE | checklist chưa LIVE | thao tác browser | Fixture đã LIVE; không click-through | BROWSER E2E | SKIP | —
49 | Chat | TEXT + LOCATION | REST send/history | history ≥2 | n=3 | HTTP/API | PASS | —
50 | Chat | Store đọc phòng repair | GET room | bị chặn | true | HTTP/API | PASS | —
51 | Chat | Realtime 2 browser | socket 2 tab | nhận ngay | cùng origin | BROWSER E2E | BLOCKED | —
52 | Chat | IMAGE/VIDEO | upload media | mở được | không chạy file test | BROWSER E2E | SKIP | —
53 | Complaint | Tạo OPEN | POST complaint | 201 OPEN | 201 | HTTP/API | PASS | —
54 | Complaint | Escrow FROZEN | SQL sau OPEN | FROZEN | FROZEN | INTEGRATION POSTGRESQL | PASS | —
55 | Complaint | Settle khi OPEN | POST settle | 409 | 409 | HTTP/API | PASS | —
56 | Complaint | PROCESSING → RESOLVED | PATCH adminNote | RESOLVED | 200 RESOLVED | HTTP/API | PASS | —
57 | Complaint | Settle vs complaint song song 2 process | 2 instance | chống race DB | chỉ 1 process | HTTP/API | BLOCKED | —
58 | Admin | GMV ≠ commission | analytics + UI | khác nhau | 74.2tr/1.5tr HTTP; UI 84.2tr/1.5tr sau dispute | HTTP/API + BROWSER E2E | PASS | —
59 | Admin | Series 7/30/12 | analytics series | có | true | HTTP/API | PASS | —
60 | File | Guest CCCD contractor | GET `/uploads/contractors/.../cccd.jpg` | 404 | 404 text/plain | HTTP/API | PASS | —
61 | File | Legacy CCCD | GET url cũ | 404 | 404 | HTTP/API | PASS | —
62 | File | Private doc guest | GET `/api/contractor/.../file` | 401 | 401 | HTTP/API | PASS | —
63 | File | Private doc customer | cùng URL | 403 | 403 | HTTP/API | PASS | —
64 | File | Admin file guest | GET admin verification file | 401 | 401 | HTTP/API | PASS | —
65 | File | Avatar public trên disk 5055 | HEAD file fixture | 200 nếu có file | 404 (disk test chưa có file) | HTTP/API | FAIL | —
66 | Missing | BOM/RFQ | source | chưa có | không model/route | SOURCE REVIEW | SKIP | —
67 | Missing | Chat customer–store | source | chưa có | không | SOURCE REVIEW | SKIP | —
68 | Missing | Khiếu nại COD | source | chưa có | `material_complaints` không có | SOURCE REVIEW | SKIP | —
69 | Missing | Admin đơn vật liệu đầy đủ | source/UI | chưa đủ | không module đầy đủ | SOURCE REVIEW | SKIP | —
70 | Missing | Khóa/mở tài khoản admin | source | chưa UI | auth có BANNED/BLOCKED, không module admin | SOURCE REVIEW | SKIP | —
71 | Missing | Trừ tồn kho tự động | source | chưa có | không decrement stock | SOURCE REVIEW | SKIP | —
72 | Missing | Giao thất bại/giao lại | source | chưa có | không `DELIVERY_FAILED` | SOURCE REVIEW | SKIP | —
73 | Missing | Video nhật ký tiến độ | source/E2E | chưa E2E | không chạy | BROWSER E2E | SKIP | —
74 | Missing | Customer hủy request PENDING | source | chưa có | test `doesNotMatch cancelRequest` | SOURCE REVIEW | SKIP | —

\* Token rác trên GET `/repair-requests` trả 404 vì list route không public; endpoint có `authenticate` (analytics/file) trả 401 đúng.

HTTP script `run-prompt15-e2e.js`: **53 PASS / 0 FAIL**. Complaint script: **PASS**. File script: **PASS** trừ ảnh public thiếu file trên disk 5055.

## 5. Tổng hợp số

| | PASS | FAIL | BLOCKED | SKIP |
|---|---:|---:|---:|---:|
| Hàng trong bảng trên | 56 | 1 | 4 | 13 |
| HTTP E2E 53 case | 53 | 0 | 0 | 0 |

FAIL duy nhất: file avatar/public trên API 5055 không có trên disk (404). Không phải rò CCCD.

## 6. Hành trình

**A — Sửa chữa:** PASS trên HTTP + PostgreSQL (request → accept → quote 10tr → cọc 1.5tr HELD → tiến độ → nghiệm thu → 85% → settle commission 500k một lần). Browser xác nhận đơn `Prompt15 leak` trạng thái nghiệm thu trên Customer Dashboard và Contractor Dashboard. Không click-through tạo request trên browser trong vòng này.

**B — Vật liệu COD:** PASS HTTP + PG (2.100.000, phí 0, cọc 0, fulfillment DELIVERED, nhận COMPLETED, thu COD PAID). Browser thấy `VL-20261026-C031DA Hoàn thành`.

**C — Admin:** PASS browser `:5177` KPI khớp giao dịch test. GMV 84.2 triệu (thêm 10tr đơn dispute chưa settle) ≠ hoa hồng 1.5 triệu (3 lần 500k POSTED).

## 7. Chat / Socket / Thông báo

- REST chat TEXT + LOCATION + history: PASS.
- Store không đọc phòng repair: PASS.
- Realtime 2 browser: BLOCKED (cùng origin).
- Chuông: UI có badge (Customer 12, Contractor 9+, Store 6, Admin 1). Không đối chiếu từng mốc event trên browser → không PASS giả từng loại.

## 8. Escrow / Khiếu nại

Đơn dispute riêng: OPEN → escrow FROZEN → settle 409 → PROCESSING → RESOLVED. Không tự giải ngân khi đóng khiếu nại. Race 2 process: BLOCKED (một process).

## 9. Bảo mật file

Guest/CCCD/legacy contractor: 404. Private file: 401/403. Admin analytics: 401 guest / 403 customer / 200 admin. Không mount lại thư mục nhạy cảm. Ảnh public fixture thiếu file trên disk 5055 (FAIL cosmetic).

## 10. Chống trùng

Trong **một process** + ràng buộc DB: quotation, accept quote, mock-success, nghiệm thu, settle, receive, COD collect — PASS mức idempotent/không 500. **Không** tuyên bố chống trùng đa instance (in-memory lock có thể còn).

## 11. Bug còn lại

**P0:** Không có lỗi tiền/bảo mật đã chứng minh trên stack test.

**P1**
- Chat realtime 2 phiên chưa kiểm được trên browser.
- Ảnh public marketplace trên 5055 404 nếu file chưa copy vào upload root.
- BOM/RFQ, chat customer–store, khiếu nại COD, admin đơn vật liệu — chưa triển khai (không làm trong Prompt 15).
- OTP email thật không gửi được trên môi trường test.

**P2**
- Menu Đăng xuất: click không điều hướng ngay; xóa `localStorage` mới ra login.
- Form admin `:5177` gợi ý email mặc định khác actor test.
- Token rác trên một số GET public-missing trả 404 thay vì 401.
- Video tiến độ / dual-instance race chưa E2E.

## 12. File Prompt 15

Chỉ script/báo cáo test, **không** sửa schema, `.env` dùng chung, tỷ lệ 15/5/10/85, hay module mới:

- `backend/scripts/test-db/inspect-prompt15-fixtures.js`
- `backend/scripts/test-db/ensure-prompt15-catalog.js`
- `backend/scripts/test-db/run-prompt15-e2e.js`
- `backend/scripts/test-db/run-prompt15-complaint.js`
- `backend/scripts/test-db/run-prompt15-files.js`
- `docs/prompt-15-e2e/http-results.json`
- `docs/prompt-15-e2e/file-results.json`
- `docs/prompt-15-e2e/BAO-CAO-PROMPT-15.md`
- `docs/prompt-15-e2e/screenshots/*.png`

## 13. Regression

Không đụng production business logic trong Prompt 15. Admin KPI vẫn tách GMV ≠ hoa hồng (không còn lỗi 185.000đ trùng). Customer dashboard không còn thanh navy (Prompt 14).

## 14. Việc phải test tay nếu automation không đủ

1. Mở 2 trình duyệt khác hẳn (Chrome + Firefox / 2 profile) để chat realtime.
2. Click-through Customer: Explore → hồ sơ thợ → tạo request → upload ảnh.
3. Contractor: accept trên UI → tạo báo giá form.
4. Customer: xác nhận báo giá → mock cọc trên UI (chỉ stack test).
5. Store: xác nhận đơn COD từng nút trạng thái.
6. Admin: Escrow list + settle trên UI (đơn đã nghiệm thu, hết complaint).
7. Logout menu từng vai trò đến khi URL về `/login`.
8. Featured homepage sau Pause/LIVE.

## 15. Kết luận 12 câu

1. Demo xuyên suốt Customer → Contractor → Admin: **có**, trên stack test 5176/5177/5055; đã chứng HTTP+PG+quan sát UI.
2. COD đến COMPLETED: **có** (HTTP+PG; UI hiện Hoàn thành).
3. Admin thấy số liệu thật: **có** (84.2tr / 1.5tr sau giao dịch test).
4. GMV và hoa hồng: **đúng, khác nhau**.
5. Escrow giữ/giải ngân: **đúng** (HELD 15/5/10; settle POSTED 5%; FROZEN khi complaint).
6. Chat/thông báo realtime: REST **đúng**; socket 2 browser **chưa chứng minh**.
7. Rò CCCD: **không** trên các URL đã quét; 404/401/403.
8. P0 chưa xử lý: **không**.
9. Chưa triển khai: BOM/RFQ, chat customer–store, khiếu nại COD, admin đơn VL đầy đủ, khóa TK, tồn kho tự động, giao thất bại, hủy PENDING.
10. Regression Prompt 14/trước: **không thấy** trên dashboard test.
11. Môi trường demo: **ổn định trên stack độc lập** nếu Docker + 5055/5176/5177 chạy; phụ thuộc Docker Desktop.
12. Trình diễn không sửa code: **có thể**, nếu dùng stack test và kịch bản dưới; không tạo thanh toán thật trên DB nhóm.
