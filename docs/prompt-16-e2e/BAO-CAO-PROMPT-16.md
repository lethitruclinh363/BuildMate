# PROMPT 16 — Khắc phục cuối và tổng duyệt demo

Ngày: 2026-10-26. Phạm vi: `BuilMate_test` / API `127.0.0.1:5055` / FE `localhost:5176` / Admin `localhost:5177`. Không ghi DB nhóm. Không in mật khẩu/token/CCCD.

## 1. Môi trường

| Hạng mục | Kết quả |
|---|---|
| Docker `buildmate-test-pg` | Up, healthy, `127.0.0.1:55432→5432` |
| `current_database()` | `BuilMate_test` |
| API test | `:5055` health 200 |
| Frontend test | `:5176` → `VITE_PROXY_TARGET=http://127.0.0.1:5055` |
| Admin test | `:5177` → cùng API 5055 |
| Stack nhóm `:5000/:5173/:5174` | Không lắng nghe lúc kiểm tra; không ghi |

## 2. Ảnh public 404 — nguyên nhân và sửa

**Lỗi thiếu file test, không phải chính sách truy cập.**

- Fixture trỏ `/uploads/e2e-placeholder.png` (ngoài `/uploads/contractors`).
- `isBlockedPublicUpload` = false.
- File không tồn tại trên disk → express.static 404 JSON.
- Sản phẩm demo không có `material_images`.

Sửa (chỉ test):

- Tạo PNG 1x1 vô hại `backend/uploads/e2e-placeholder.png`.
- Seed gọi `ensureE2ePlaceholderFile()`.
- Gắn ảnh placeholder cho `E2E-CEM-50` và `E2E-TILE-01` trên `BuilMate_test`.

Sau sửa: HEAD `/uploads/e2e-placeholder.png` → **200 image/png**. Guest CCCD `/uploads/contractors/...` vẫn **404 text/plain**. Private docs 401/403.

Cover 1x1 trông gần như trắng trên UI — cosmetic P2, HTTP vẫn 200.

## 3. Chat realtime

- Hai JWT socket.io độc lập trên `:5055`: customer gửi → contractor nhận `receive_message`; contractor trả lời → customer nhận; store **không** join room. **PASS HTTP/SOCKET**.
- Hai phiên browser cùng origin Cursor: vẫn ghi đè cookie. **BLOCKED BROWSER E2E**. Demo phải dùng 2 profile/Chrome+Firefox.

## 4. Browser sửa chữa (Prompt16)

Đã chạy UI + PG:

1. Customer login `:5176` → Explore → Demo Can Tho Crew → tạo request (Ống nước / Rò rỉ ống nước / GPS Long Tuyền) → chat.
2. History: `Prompt16 browser leak` **Đang chờ duyệt**.
3. PG: 1 dòng `PENDING` rồi `ACCEPTED` (`a8016e93da4ac6433cbcddf8`).
4. Contractor `Nhận hồ sơ` trên UI.
5. Form báo giá → + Pipe leak repair 1.500.000 + ship 100.000 = **1.600.000** → gửi vào chat.

Chưa click-through browser: customer xác nhận báo giá, mock cọc, tiến độ, nghiệm thu, 85%, admin settle. Các bước đó **PASS HTTP+PG ở Prompt 15** trên đơn khác. Không lấy HTTP thay cho browser còn thiếu.

## 5. Browser COD

Explore hiện Demo Portland Cement 2.000.000đ và Demo Ceramic Tile 350.000đ. Ảnh catalog HTTP 200. **Không** hoàn thành add-cart → checkout → fulfillment trên UI trong Prompt 16. Đơn `VL-20261026-C031DA Hoàn thành` vẫn có từ Prompt 15 (HTTP+PG PASS). **BLOCKED BROWSER E2E** cho click-through COD mới.

## 6. Admin

`:5177` phiên Demo Admin: GMV **84,2 triệu** ≠ hoa hồng **1,5 triệu**; 6 user; 1 contractor LIVE; 12 đơn; 1 khiếu nại. Request/quote Prompt16 chưa settle nên KPI không nhảy GMV — đúng, không hardcode.

## Bảng test

STT | Chức năng | Test thực tế | Mong đợi | Thực tế | Kết quả | Bằng chứng | File sửa
---|---|---|---|---|---|---|---
1 | PG 55432 | docker ps + SQL | BuilMate_test healthy | healthy, db đúng | PASS POSTGRESQL | inspect-prompt16-images | —
2 | API 5055 | GET /api/health | 200 | 200 | PASS HTTP | health JSON | —
3 | FE/Admin cổng | netstat + .env.test | 5176/5177 → 5055 | đúng, không :5000 | PASS SOURCE | frontend/.env.test admin/.env.test | —
4 | Placeholder disk | HEAD 5055 | 200 png | 200 image/png | PASS HTTP | inspect files | ensure-e2e-placeholder.js
5 | Store/product URL | SQL + HEAD | có file, 200 | 2 SP + 2 store trỏ placeholder | PASS POSTGRESQL | attach-prompt16-demo-images.js | cùng
6 | CCCD guest | HEAD contractors/cccd | 404 | 404 text/plain | PASS HTTP | run-prompt15-files.js | —
7 | Private doc | GET file API | 401/403 | 401 guest, 403 customer | PASS HTTP | run-prompt15-files.js | —
8 | Socket 2 token | io customer+contractor | nhận 2 chiều, store fail join | true / join ok=false | PASS HTTP | run-prompt16-socket.js | —
9 | Browser 2 profile chat | 2 origin độc lập | realtime UI | Cursor cùng origin | BLOCKED BROWSER E2E | Prompt 15+16 | —
10 | Customer tạo request | UI Explore→form→submit | 1 request PG | PENDING rồi ACCEPTED | PASS BROWSER E2E + POSTGRESQL | history + SQL | —
11 | Contractor accept | UI Nhận hồ sơ | ACCEPTED | ACCEPTED | PASS BROWSER E2E + POSTGRESQL | SQL | —
12 | Contractor quote | UI gửi 1.600.000 | hiện chat | Đã gửi 1.600.000đ | PASS BROWSER E2E | chat contractor | —
13 | Customer accept quote + mock cọc | UI | deposit 15% | không chạy UI Prompt 16 | BLOCKED BROWSER E2E | — | —
14 | Tiến độ / nghiệm thu / settle UI | UI | COMPLETED→settle | không chạy UI Prompt 16 | BLOCKED BROWSER E2E | Prompt 15 HTTP PASS | —
15 | COD click-through | UI cart→COMPLETED | full | chỉ thấy listing | BLOCKED BROWSER E2E | Prompt 15 HTTP PASS | —
16 | Admin KPI | UI 5177 | GMV ≠ HH | 84.2tr / 1.5tr | PASS BROWSER E2E | dashboard | —
17 | 15/5/10/85 unit | node test | giữ tỷ lệ | 42 pass / 0 fail | PASS UNIT | contractor-finance + admin-flow-13 | —
18 | OTP SMTP | mail test | gửi được | không cấu hình | BLOCKED | Prompt 15 | —
19 | Race đa process | 2 instance | chống trùng DB | không chạy | BLOCKED | Prompt 15 | —

## Kết luận ngắn

1. PG test: **có**.
2. 5055/5176/5177: **đúng cổng, không gọi 5000**.
3. Ảnh 404: **đã sửa** (thiếu file, không mở `/uploads/contractors`).
4. Chat realtime 2 browser: **BLOCKED**; 2 socket JWT: **PASS**.
5. Browser sửa chữa: tạo request, accept, gửi báo giá **PASS**; cọc/tiến độ/settle UI **chưa**.
6. Browser COD mới: **chưa**; đơn hoàn thành Prompt 15 vẫn dùng được.
7. Admin KPI: **khớp**, GMV ≠ hoa hồng.
8. OTP: **BLOCKED**.
9. P0: không. P1: dual-browser chat, COD/repair UI còn dở, module chưa làm. P2: placeholder 1x1 gần trắng, logout menu.
10. Chưa chạy: COD UI, mock pay UI, settle UI, dual Chrome profile, OTP.
11. File Prompt 16: `ensure-e2e-placeholder.js`, `attach-prompt16-demo-images.js`, `seed-e2e-browser-actors.js`, `inspect-prompt16-*.js`, `run-prompt16-socket.js`, `e2e-placeholder.test.js`, báo cáo này.
12. Regression unit finance/admin/placeholder: **42 PASS / 0 FAIL** (1 skip HTTP phụ thuộc cách test dò cổng).

**Sẵn sàng demo có điều kiện:** hành trình đã chứng UI đến báo giá + hành trình đầy đủ trên API/PG (Prompt 15). Không tuyên bố toàn bộ click-through COD/cọc/settle đã PASS browser.
