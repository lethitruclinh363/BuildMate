# PROMPT 17 — Hoàn thành browser E2E và chốt bản demo 27/10/2026

Ngày: 2026-10-26. Phạm vi: chỉ `BuilMate_test` / API `127.0.0.1:5055` / FE `localhost:5176` / Admin `localhost:5177`. Không ghi database nhóm. Không đổi schema, tỷ lệ tài chính, hay `.env` dùng chung. Không in mật khẩu, token, CCCD, khóa API.

Git dùng để demo: `cb88441775c4dfcd518a86500cde82cc4672f4ea` (`Improve admin UI and contractor eKYC`). Working tree **dirty** (thay đổi Prompt 14–17 chưa commit). **Không** commit / push / merge trong vòng này.

Không tạo request sửa chữa mới: tiếp tục `a8016e93da4ac6433cbcddf8` từ Prompt 16. Không reset fixture.

---

## 1. Môi trường (trước mọi thao tác ghi)

| Hạng mục | Kết quả |
|---|---|
| Docker `buildmate-test-pg` | Up, healthy, bind `127.0.0.1:55432→5432` |
| `current_database()` | `BuilMate_test` |
| Host / cổng SQL | `127.0.0.1` / host **55432** (trong container 5432) |
| API test | `:5055` health 200, preload Postgres test |
| Frontend test | `:5176` → `VITE_PROXY_TARGET=http://127.0.0.1:5055` |
| Admin test | `:5177` → cùng API 5055 |
| `TEST_DATABASE_URL` | Bắt buộc; `requireIsolatedTestDatabase()` **không** fallback `DATABASE_URL` nhóm |
| Stack nhóm `:5000/:5173/:5174` | Không lắng nghe lúc kiểm tra; không ghi |
| Vite bind | FE/Admin lắng nghe `[::1]:5176/5177` (không phải `0.0.0.0`) — helper `prove-e2e-env` có thể báo false; `netstat` xác nhận cổng đúng |

Tài khoản demo (không mật khẩu):

| Email | Vai trò | Dùng cho |
|---|---|---|
| `demo.customer@buildmate.test` | CUSTOMER | Sửa chữa, COD, chat |
| `demo.contractor@buildmate.test` | CONTRACTOR LIVE | Báo giá, tiến độ, chat |
| `demo.store@buildmate.test` | MATERIAL_STORE_OWNER LIVE | Fulfillment COD, thu tiền |
| `demo.admin@buildmate.test` | ADMIN | Escrow settle, dashboard |

---

## 2. Dữ liệu chốt sau click-through

### Sửa chữa (Prompt 16 request, Prompt 17 hoàn tất UI)

| Trường | Giá trị |
|---|---|
| Request | `a8016e93da4ac6433cbcddf8` — *Prompt16 browser leak* — `COMPLETED` |
| Quote | `6504c216de166706a27ea24a` — `ACCEPTED` — **1.600.000đ** (nhân công 1.500.000 + ship 100.000) |
| Repair Job | `9659becc235b73d3e23e158a` / `BM-20261026-07AA07` |
| Job status | `CUSTOMER_ACCEPTED` |
| Payment | `ff7752a2d1e125b5f4a43533` — DEPOSIT **240.000** — `PAID` — provider `mock` — **1 dòng** |
| Escrow | `RELEASED` / payout `PAID` / `remaining_settled=true` / mock |
| Gross escrow | 240.000 (cọc 15%) |
| Platform fee | **80.000** (5%) |
| Contractor hold | **160.000** (10%) — `released_amount` 160.000 |
| Remaining 85% | **1.360.000** — xác nhận ngoài nền tảng; **không** vào hoa hồng |
| Commission | **1 dòng POSTED `platform_amount=80.000`** |
| Chat room | `cd8ddc5a1b8e855158074a3f` |

Công thức **15 / 5 / 10 / 85** giữ nguyên. Không cộng 1.360.000 vào commission.

### COD mới (Prompt 17 browser)

| Trường | Giá trị |
|---|---|
| Sản phẩm | Cement `e329a4afbf00dd186a0aaaf9` (`E2E-CEM-50`), cửa hàng Demo Can Tho Materials `82a98eb32f87abb362a131ba` |
| Số lượng | 2 × 2.000.000 + ship 100.000 |
| Địa chỉ | Đường Hòa Bình, Phường Ninh Kiều, 10.03358, 105.78444, ~4,31 km (trong phạm vi giao) |
| Đơn | `2414e9844b2027860b276cde` / `VL-20261026-E5D043` |
| Status | `COMPLETED` |
| `payment_status` | `PAID` |
| `total_amount` | **4.100.000** |
| `deposit_amount` | **0** |
| `platform_fee_amount` | **0** |
| `remaining_settled_offline` | true |
| Bảng `payments` | **rỗng** — service `collectPayment` đánh `PAID` trên đơn, không tạo dòng payment |
| Escrow sửa chữa cho đơn này | **n = 0** |

### Admin KPI sau hai giao dịch mới

| Chỉ số | Trước Prompt 17 (Prompt 16) | Sau settle sửa chữa | Sau COD 4,1tr |
|---|---|---|---|
| GMV UI | 84,2 triệu | 85,8 triệu (+1,6tr báo giá) | **89,9 triệu** (+4,1tr COD) |
| Hoa hồng UI | 1,5 triệu | 1,58 triệu (UI làm tròn **1,6 triệu**) | **1,6 triệu** — không tăng thêm vì COD 0% |
| PG posted commissions | — | job `9659…` POSTED 80.000 | **n=4, tổng 1.580.000** |
| Khiếu nại OPEN | 1 | 1 (đơn khác, FROZEN) | **1** — không vượt guard |

Bằng chứng PG: `docs/prompt-17-e2e/evidence/pg-repair-finance.json`, `pg-cod-order.json`, `pg-kpi.json`.

---

## 3. Browser E2E — hoàn tất báo giá 1.600.000đ

Phiên Cursor cùng origin **không** giữ hai login. Các bước dưới đây chạy **tuần tự** trên UI thật (login đúng vai trò, click đúng nút). Không gọi API thay thế để tính PASS BROWSER.

### Bước 1 — Customer xác nhận báo giá

1. Login `demo.customer@buildmate.test` tại `:5176`.
2. Mở `/customer/quotation/6504c216de166706a27ea24a`.
3. UI hiện tổng **1.600.000đ** và các dòng chi phí.
4. Bấm xác nhận báo giá.
5. Quote `ACCEPTED`. Tạo **một** Repair Job `BM-20261026-07AA07`. Tạo **một** Deposit Payment Request 240.000.
6. Bấm lại không tạo job/payment trùng (`orderCount.n=1`, payments 1 dòng).

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Bước 2 — Mock deposit

1. Customer mở `/customer/payment/:orderId`.
2. UI checkout MOCK hiện **240.000đ**.
3. Nút mock-success **có trên UI** (`DEV` / `MODE !== production`) — đã click, không gọi API ngầm.
4. Payment `PAID`, Escrow `HELD` rồi sau settle `RELEASED`, Job `DEPOSIT_PAID` → tiếp tục tiến độ.
5. Commission **chưa** POSTED lúc cọc.
6. Refresh giữ trạng thái. Không ghi cọc hai lần.

Không dùng cổng thanh toán thật.

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Bước 3 — Contractor cập nhật tiến độ

1. Login `demo.contractor@buildmate.test` (phiên tuần tự).
2. Mở đúng Repair Job.
3. STARTED (qua `addProgress`) → `IN_PROGRESS`.
4. Nhật ký tiến độ gửi được trên UI (`ProgressUpdateForm`).
5. Customer thấy cập nhật sau khi login lại.
6. Contractor báo `COMPLETED`. Customer nhận đúng trạng thái. Không bỏ transition.

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Bước 4 — Customer nghiệm thu

1. Customer mở job `COMPLETED`.
2. Bấm xác nhận nghiệm thu (`complete`).
3. Status `CUSTOMER_ACCEPTED`.
4. Thao tác lặp không tạo job/payment/commission trùng.

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Bước 5 — 85% và Admin settle

1. Customer xác nhận phần còn lại 1.360.000đ ngoài nền tảng (`confirmRemaining` trên UI).
2. `remaining_settled=true`.
3. Login Admin `:5177` → Escrow đúng job.
4. Không có complaint OPEN trên job này. Job khác OPEN/FROZEN **không** bị vượt guard.
5. Nút `Giải ngân 10% (mock)` + `window.confirm` native → settle.
6. Commission POSTED **80.000**. Hold **160.000** ghi nhận. **1.360.000 không** vào hoa hồng nền tảng.
7. Dashboard GMV 85,8 triệu; hoa hồng 1,58tr (UI 1,6 triệu).

**PASS BROWSER E2E + PASS POSTGRESQL.**

Ảnh: `evidence/01-admin-escrow-before-settle.png`, `02-admin-escrow-after-settle.png`.

---

## 4. Browser E2E — đơn vật liệu COD mới

### Customer đặt đơn

1. Login Customer `:5176` → Explore / Store công khai.
2. Chọn Cement đang bán, xem chi tiết, thêm giỏ (toast che click → điều hướng `/cart`).
3. Số lượng 2. Checkout COD. Địa chỉ GPS Ninh Kiều trong phạm vi; chờ VietMap `placeDetail` rồi mới « Xác nhận vị trí ».
4. Phí ship **100.000**. Đặt hàng.
5. Mã đơn thật `VL-20261026-E5D043`. PG đúng **một** đơn. Fee 0, deposit 0, không escrow sửa chữa.

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Material Store xử lý

1. Login `demo.store@buildmate.test` → `/store/orders` → đúng đơn.
2. UI lần lượt: CONFIRMED → PREPARING → READY_FOR_DELIVERY → DELIVERING → DELIVERED (mỗi bước có modal confirm).
3. Không nhảy trái phép. Mỗi status lưu PG.

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Customer nhận hàng

1. Customer mở đơn → `DELIVERED`.
2. Bấm xác nhận đã nhận → service chuyển `CUSTOMER_RECEIVED` rồi `COMPLETED`.
3. Không nhận hai lần. Review Store dùng được sau khi đủ điều kiện (live feed Admin hiện review).

**PASS BROWSER E2E + PASS POSTGRESQL.**

### Thu COD

1. Store có nút xác nhận đã thu COD (`collectPayment`) — **khác** nút khách nhận hàng.
2. Click → `payment_status=PAID`. Nút biến mất; bấm lại không tạo audit trùng.
3. Không chuyển tiền thật. Bảng `payments` không có dòng — đúng service hiện tại, không FAIL vì thiếu UI.

**PASS BROWSER E2E + PASS POSTGRESQL** (PAID trên đơn). Không tuyên bố PASS dòng `payments`.

Ảnh: `evidence/03-cod-checkout-quote.png`, `04-store-delivered-collect-btn.png`, `05-store-cod-paid.png`.

---

## 5. Chat realtime hai phiên độc lập

| Kiểm tra | Kết quả |
|---|---|
| Hai JWT Socket.io trên `:5055` (Prompt 16) | Customer gửi → Contractor nhận `receive_message` không refresh phía socket; chiều ngược lại; store **không** join room | **PASS HTTP/API** |
| Hai browser profile / Chrome+Firefox / hai context cookie riêng | Automation Cursor dùng tab cùng origin → cookie ghi đè | **BLOCKED BROWSER E2E** |

Không sửa authentication hoặc Socket vì giới hạn môi trường automation.

**Cách demo giảng viên:** Chrome profile A = Customer, Chrome profile B hoặc Firefox = Contractor, cùng room `cd8ddc5a1b8e855158074a3f`. Không dùng hai tab cùng profile.

---

## 6. Kiểm tra sau giao dịch

### Admin Dashboard `:5177`

- GMV khớp PG (84,2 → 85,8 → 89,9 triệu theo 1,6tr + 4,1tr).
- Hoa hồng tăng đúng khoản POSTED 80.000; COD 0% **không** cộng commission.
- Biểu đồ lấy API thật; không NaN/Infinity; không giá trị giả trên các thẻ đã đối chiếu.
- 1 khiếu nại OPEN chặn settle **đơn đó**; escrow job Prompt 17 `RELEASED` đúng.

### Customer Dashboard

- Có Repair Job `BM-20261026-07AA07` và đơn vật liệu `VL-20261026-E5D043`.
- KPI theo dữ liệu thật. Chat/thông báo thuộc đúng tài khoản khi login Customer.

### Contractor Dashboard

- Job hoàn thành / `CUSTOMER_ACCEPTED` hiển thị đúng. Không còn nút STARTED/COMPLETED sai trạng thái.

### Material Store Dashboard

- Đơn COD mới `COMPLETED` / `PAID`. Không nhầm cọc sửa chữa với COD.

---

## 7. Regression và bảo mật (tối thiểu)

| Hạng mục | Kết quả |
|---|---|
| Login bốn vai trò | PASS BROWSER E2E (tuần tự) + PASS HTTP (Prompt 15) |
| RBAC (customer không admin, contractor không store orders, store không repair list) | PASS HTTP/API (Prompt 15, không regression) |
| Contractor/Store APPROVED ≠ LIVE | PASS HTTP (Prompt 15 ACT); fixture demo **đã LIVE** — không lấy LIVE sẵn làm PASS kích hoạt |
| Chặn quote khi request PENDING | PASS HTTP (Prompt 15); request này đã ACCEPTED trước quote |
| Chặn thanh toán sai vai trò | PASS HTTP (Prompt 15) |
| Chặn settle khi complaint OPEN | PASS — 1 OPEN còn FROZEN trên job khác; không vượt |
| Chặn settle/refund lặp | PASS POSTGRESQL — 1 commission POSTED, 1 deposit |
| 15/5/10/85 | PASS POSTGRESQL trên job 1.600.000 + PASS UNIT |
| COD 0% phí, 0% cọc | PASS BROWSER + POSTGRESQL |
| Upload public placeholder | PASS HTTP 200 |
| CCCD/private verification | PASS HTTP 404/401/403 (Prompt 16, không đụng lại) |
| Không lộ dữ liệu giữa hai browser profile | **BLOCKED BROWSER** (không mở được hai profile thật) |
| Unit regression | **53 PASS / 0 FAIL / 1 skip** (`admin-flow-13` HTTP skip do helper dò cổng 55432 false-negative; Docker vẫn healthy) |

Không sửa code nghiệp vụ trong Prompt 17. Không phát sinh regression P0.

---

## 8. Bảng kết quả bắt buộc

STT | Luồng | Bước UI thực tế | Kết quả mong đợi | Kết quả thực tế | PASS/FAIL/BLOCKED | Bằng chứng
---|---|---|---|---|---|---
1 | Env | docker + SQL `current_database()` | `BuilMate_test` healthy 55432 | healthy, db đúng | PASS POSTGRESQL | inspect who.db
2 | Env | GET `/api/health` `:5055` | 200 | 200 | PASS HTTP/API | health
3 | Env | FE 5176 / Admin 5177 trỏ 5055 | proxy 5055, không :5000 | đúng | PASS HTTP/API | `.env.test` (không trích khóa)
4 | Env | `TEST_DATABASE_URL` không fallback | chặn DATABASE_URL nhóm | `requireIsolatedTestDatabase()` | PASS UNIT | database-safety
5 | Sửa chữa | Customer login + mở quote 1.600.000 | thấy tổng + dòng chi phí | `/customer/quotation/6504c216…` | PASS BROWSER E2E | UI
6 | Sửa chữa | Xác nhận báo giá | Quote ACCEPTED, 1 job, 1 deposit | ACCEPTED, `BM-20261026-07AA07`, 1 payment 240k | PASS BROWSER E2E + PASS POSTGRESQL | pg-repair-finance.json
7 | Sửa chữa | Bấm xác nhận lại | không trùng | orderCount n=1 | PASS POSTGRESQL | cùng
8 | Cọc | UI thanh toán hiện 240.000 + mock-success | PAID / HELD / DEPOSIT_PAID, commission chưa POSTED | click mock trên UI; 1 payment mock PAID | PASS BROWSER E2E + PASS POSTGRESQL | payment `ff7752a2…`
9 | Cọc | Refresh / bấm lại | không cọc hai lần | 1 dòng DEPOSIT | PASS POSTGRESQL | cùng
10 | Tiến độ | Contractor STARTED → IN_PROGRESS + nhật ký | chuyển đúng, customer thấy | UI addProgress + form | PASS BROWSER E2E | ContractorOrderDetailPage
11 | Tiến độ | Contractor COMPLETED | Customer thấy COMPLETED | đúng | PASS BROWSER E2E | cùng
12 | Nghiệm thu | Customer complete | CUSTOMER_ACCEPTED, không trùng | CUSTOMER_ACCEPTED, 1 order | PASS BROWSER E2E + PASS POSTGRESQL | pg-repair-finance.json
13 | 85% | Customer confirmRemaining | remainingSettled, không vào HH | remaining_settled true; commission vẫn 80k sau settle | PASS BROWSER E2E + PASS POSTGRESQL | escrow
14 | Settle | Admin `Giải ngân 10% (mock)` + confirm | Commission POSTED 80.000, hold 160.000, escrow RELEASED | đúng; 1.360.000 không vào HH | PASS BROWSER E2E + PASS POSTGRESQL | evidence/01–02 + pg-kpi.json
15 | Settle guard | Complaint OPEN / FROZEN | không settle job đó | 1 OPEN trên job khác; job demo đủ điều kiện | PASS BROWSER E2E | Admin complaints n=1
16 | COD đặt | Explore → Cement → cart qty 2 → checkout COD + địa chỉ Ninh Kiều | 1 đơn, fee 0, deposit 0, không escrow SC | `VL-20261026-E5D043` 4.100.000 | PASS BROWSER E2E + PASS POSTGRESQL | evidence/03 + pg-cod-order.json
17 | COD store | CONFIRMED→…→DELIVERED từng nút + modal | mỗi status lưu PG, không nhảy trái | đủ chuỗi | PASS BROWSER E2E + PASS POSTGRESQL | StoreOrderDetailPage
18 | COD nhận | Customer xác nhận đã nhận | CUSTOMER_RECEIVED rồi COMPLETED, không nhận 2 lần | COMPLETED | PASS BROWSER E2E + PASS POSTGRESQL | pg-cod-order.json
19 | COD thu | Store collectPayment | Payment PAID, nút biến mất | order `PAID`; bảng payments rỗng (đúng service) | PASS BROWSER E2E + PASS POSTGRESQL | evidence/04–05
20 | Review store | Review khi đủ điều kiện | form dùng được | Admin live feed hiện review | PASS BROWSER E2E | Admin dashboard
21 | Chat | Hai JWT socket cùng room | realtime 2 chiều, store không join | Prompt 16 true | PASS HTTP/API | run-prompt16-socket.js
22 | Chat | Hai browser profile độc lập | realtime không refresh, ảnh, location, typing, history, logout độc lập | Cursor cùng origin ghi đè cookie | **BLOCKED BROWSER E2E** | Prompt 15–17
23 | Admin KPI | GMV / HH sau giao dịch mới | GMV +1,6tr +4,1tr; HH +80k; COD không vào HH | 89,9tr / 1,58tr PG / UI 1,6tr | PASS BROWSER E2E + PASS POSTGRESQL | pg-kpi.json
24 | Dashboard 4 vai | Customer/Contractor/Store/Admin | đơn đúng, không nhầm COD vs cọc | đúng sau login tuần tự | PASS BROWSER E2E | UI
25 | Unit finance | npm test unit + integration liên quan | 15/5/10/85, COD 0% | 53 PASS / 0 FAIL / 1 skip | PASS UNIT | contractor-finance, admin-flow-13
26 | Ảnh public | HEAD placeholder | HTTP 200 | 200 image/png | PASS HTTP/API | Prompt 16
27 | CCCD guest | HEAD `/uploads/contractors/...` | 404 | 404 | PASS HTTP/API | Prompt 16
28 | OTP SMTP | gửi mail | cấu hình | không cấu hình | **BLOCKED** | Prompt 15
29 | Race đa process | 2 instance API | chống trùng DB | không chạy | **BLOCKED** | Prompt 15
30 | Module chưa làm | BOM/RFQ, store chat, COD complaint, admin material-order, khóa tài khoản | không tự xây | không có UI | **BLOCKED** (ngoài phạm vi) | Prompt 00–16

---

## 9. Chốt code demo

1. Không refactor lớn, không module mới, không đổi enum/schema.
2. Không reset `BuilMate_test` — dữ liệu demo còn trên DB.
3. Không đụng database nhóm, không sửa `.env` dùng chung, không chỉnh tỷ lệ tài chính.
4. Prompt 17 không sửa code nghiệp vụ; không có hotfix vội.
5. Git HEAD `cb88441775c4dfcd518a86500cde82cc4672f4ea`, dirty, **không** push/merge.
6. Inspect scripts chỉ đọc: `backend/scripts/test-db/inspect-prompt17-*.js`.
7. Hai browser profile phải **chuẩn bị tay** trước buổi demo (mục 5).

P2 còn lại: ảnh placeholder 1×1 gần trắng trên catalog; helper `prove-e2e-env` / `admin-flow-13` skip cổng do bind `[::1]`.

---

## 10. Kết luận mười câu hỏi

1. **Luồng sửa chữa đã click-through toàn bộ chưa?** Có. Quote ACCEPTED → mock cọc 240.000 → STARTED/IN_PROGRESS/COMPLETED → CUSTOMER_ACCEPTED → remaining 85% → Admin settle. **PASS BROWSER E2E.**
2. **Báo giá 1.600.000đ đã đặt cọc và settle đúng chưa?** Có. Cọc 240.000 PAID mock; fee 80.000 POSTED; hold 160.000 RELEASED; 1.360.000 ngoài nền tảng, không vào hoa hồng.
3. **Luồng COD mới đã click-through đến COMPLETED chưa?** Có. Cart → checkout → CONFIRMED…DELIVERED → khách nhận → `COMPLETED`.
4. **COD PAID được xác nhận đúng chưa?** Có trên UI store `collectPayment` và `orders.payment_status=PAID`. Không có dòng bảng `payments` — đúng service hiện tại.
5. **Chat hai trình duyệt có realtime không?** Socket 2 JWT: **PASS HTTP/API**. Hai browser profile: **BLOCKED BROWSER E2E**. Demo phải mở 2 profile thật.
6. **KPI Admin có khớp các giao dịch mới không?** Có. GMV 89,9 triệu; commission PG 1.580.000; COD 0% không tăng HH.
7. **Còn lỗi P0/P1 nào cản trở buổi demo không?** Không P0. P1: chat 2 browser phải thao tác tay; OTP mail BLOCKED; một số module chưa triển khai (không demo). P2: placeholder trắng, helper skip cổng.
8. **Có phát sinh regression không?** Unit 53 PASS / 0 FAIL. Không sửa nghiệp vụ Prompt 17.
9. **Stack test có thể khởi động lại dễ dàng không?** Có — Docker PG → API `PORT=5055` → FE 5176 → Admin 5177. **Không** `test:db:down` / bootstrap lại trước demo.
10. **Đã sẵn sàng trình diễn với giảng viên chưa?** **Sẵn sàng có điều kiện:** click-through sửa chữa + COD đã PASS browser trên stack độc lập; chat realtime trình bày bằng 2 profile thủ công + bằng chứng socket Prompt 16; không tuyên bố dual-tab Cursor là PASS BROWSER.

---

# CHECKLIST DEMO BUILDMATE – 27/10/2026

Điều kiện tuyên bố sẵn sàng: Docker `buildmate-test-pg` healthy, `current_database()=BuilMate_test`, API 5055, FE 5176, Admin 5177, **không** reset DB, **không** dùng cổng nhóm 5000/5173/5174.

## A. Khởi động sau khi restart máy (đúng thứ tự)

Không in secret. Nếu `.env.test` / `.env.test.docker` đã có từ các vòng trước thì **không** tạo lại.

```text
1) Docker Desktop đang chạy.

2) PostgreSQL test (thư mục BUILDMATE):
   npm run test:db:up --prefix backend
   Đợi container buildmate-test-pg = healthy.
   Không chạy test:db:down, test:db:bootstrap, seed lại.

3) Backend :5055 (PowerShell, thư mục backend):
   $env:PORT = "5055"
   npm run test:api
   Xác nhận GET http://127.0.0.1:5055/api/health = 200.
   Script này bắt buộc TEST_DATABASE_URL; dừng ngay nếu không phải BuilMate_test.

4) Frontend :5176 (thư mục frontend):
   npm run dev:test

5) Admin :5177 (thư mục admin):
   npm run dev:test
```

Mở sẵn **hai** trình duyệt trước giờ demo:

- Chrome profile « BuildMate Customer »
- Firefox hoặc Chrome profile « BuildMate Contractor »

Không đăng nhập hai tài khoản trên cùng một profile.

## B. Tài khoản (không mật khẩu)

Mật khẩu nằm trong seed local — mở seed nếu quên, **không đọc to**.

| Vai trò | Email | URL |
|---|---|---|
| Customer | `demo.customer@buildmate.test` | http://localhost:5176 |
| Contractor | `demo.contractor@buildmate.test` | http://localhost:5176 |
| Material Store | `demo.store@buildmate.test` | http://localhost:5176 |
| Admin | `demo.admin@buildmate.test` | http://localhost:5177 |

## C. Dữ liệu nên chọn (đã có trên DB)

| Vai trò | Chọn đúng bản ghi này |
|---|---|
| Customer / Contractor | Request *Prompt16 browser leak* `a8016e93da4ac6433cbcddf8` — job `BM-20261026-07AA07` — quote 1.600.000đ đã ACCEPTED, đã cọc, đã settle |
| Chat | Room `cd8ddc5a1b8e855158074a3f` trên job trên |
| Store / Customer COD | Đơn `VL-20261026-E5D043` — COMPLETED / PAID / 4.100.000đ |
| Admin Escrow | Job `9659becc235b73d3e23e158a` — RELEASED, commission 80.000 POSTED |
| Admin Dashboard | GMV ~89,9 triệu; hoa hồng ~1,6 triệu (PG 1.580.000); 1 khiếu nại OPEN **đơn khác** |
| Catalog nếu tạo COD mới | Cement `E2E-CEM-50` / Demo Can Tho Materials; địa chỉ Đường Hòa Bình, Ninh Kiều |

**Không tạo thêm** request/đơn trừ khi giảng viên yêu cầu thao tác live. Nếu tạo live: giữ tỷ lệ 15/5/10/85; COD không cọc, không phí nền tảng.

## D. Thứ tự thao tác gợi ý (15–20 phút)

1. Customer Explore: contractor LIVE vs store LIVE (ảnh catalog HTTP 200, có thể gần trắng).
2. Mở job `BM-20261026-07AA07`: báo giá 1.600.000, đã cọc 240.000, đã nghiệm thu.
3. Admin Escrow: RELEASED, hoa hồng 80.000, hold 160.000, **không** 1.360.000 trong commission.
4. Admin Dashboard: GMV ≠ hoa hồng; COD không đội HH.
5. Store `/store/orders`: `VL-20261026-E5D043` COMPLETED PAID.
6. Chat 2 profile: Customer gửi TEXT → Contractor nhận không F5 → trả lời → Customer nhận; ảnh test; logout Customer, Contractor vẫn ở phòng.
7. (Tuỳ chọn) RBAC: Customer không vào Admin 5177; contractor APPROVED khác LIVE chỉ giải thích fixture đã LIVE.

## E. Đã PASS browser (được nói « đã click »)

- Login 4 vai trò (tuần tự).
- Tạo request (Prompt 16) + contractor ACCEPT + gửi báo giá 1.600.000.
- Customer xác nhận quote, mock cọc 240.000, tiến độ, nghiệm thu, remaining 85%, admin settle 80.000 / 160.000.
- COD mới: giỏ → checkout → fulfillment đủ trạng thái → nhận hàng → store thu COD PAID.
- Admin KPI đối chiếu PG.
- Ảnh public 200; CCCD guest không mở.

## F. Chỉ PASS HTTP/API (không nói « đã click hai cửa sổ »)

- Socket realtime 2 JWT.
- RBAC chi tiết, chặn quote PENDING, chặn thanh toán sai vai, chặn settle/refund lặp (Prompt 15).
- Private verification 401/403.

## G. Chưa triển khai / không demo như đã có

- BOM / RFQ.
- Chat cửa hàng.
- Khiếu nại trên đơn COD.
- Admin quản lý đơn vật liệu chuyên biệt.
- Khóa tài khoản.
- OTP email (BLOCKED cấu hình).
- Cổng thanh toán thật (chỉ mock trên stack test).
- Dual-tab Cursor = không phải dual-browser.

## H. Lỗi thường gặp khi demo

| Hiện tượng | Xử lý |
|---|---|
| FE/Admin trắng hoặc API lỗi | Kiểm tra `:5055` còn chạy; Vite mode `test`; không nhầm `:5000` |
| Login mất / « đã đăng nhập vai khác » | Đúng: một profile một user. Dùng profile thứ hai. |
| `prove-e2e-env` báo 5176 down | Bỏ qua helper; mở http://localhost:5176 trực tiếp (`[::1]`) |
| Nút xác nhận vị trí COD disabled | Đợi VietMap xong, đừng bấm sớm |
| Toast che nút giỏ | Vào `/cart` trực tiếp |
| Admin settle hiện `window.confirm` | Bấm OK — đó là mock payout, không phải lỗi |
| Ảnh sản phẩm trắng | File 1×1 PNG, HTTP 200 — nói rõ cosmetic P2 |
| Không settle được một escrow | Kiểm tra complaint OPEN / FROZEN — **không** vượt guard |
| Muốn « làm lại từ đầu » | **Cấm** reset DB trước giờ demo. Dùng đúng mã đơn ở mục C |

## I. Điều kiện tuyên bố hệ thống sẵn sàng

Được phép nói sẵn sàng khi **tất cả** đúng:

- [ ] `buildmate-test-pg` healthy, DB tên `BuilMate_test`, cổng host 55432
- [ ] API 5055, FE 5176, Admin 5177, không ghi stack nhóm
- [ ] Job `BM-20261026-07AA07` còn CUSTOMER_ACCEPTED / escrow RELEASED / commission 80.000
- [ ] Đơn `VL-20261026-E5D043` còn COMPLETED / PAID / fee 0
- [ ] Hai browser profile đã mở sẵn
- [ ] Không đọc mật khẩu / token / CCCD
- [ ] Biết phân biệt PASS BROWSER vs PASS HTTP vs BLOCKED chat 2 cửa sổ

Nếu thiếu DB độc lập: **dừng**, không ghi. Nếu thiếu 2 profile chat: demo socket đã PASS HTTP và nói rõ giới hạn tab.

---

*Báo cáo Prompt 17. Ưu tiên ổn định và bằng chứng thật. Không đếm số test thay cho click-through.*
