# BuildMate — Function Gap Analysis (PROMPT 18–20)

Ngày: 2026-10-26. Cập nhật Prompt 20: Chat Customer–Material Store trên stack DEV (`docs/feature-gap/PROMPT-20-CUSTOMER-STORE-CHAT.md`).

**Bản demo PROMPT 17 không bị sửa.** Git demo vẫn nhánh `Duc`, HEAD `cb88441775c4dfcd518a86500cde82cc4672f4ea`, working tree dirty như lúc chốt. Không commit / push / merge. Không ghi `BuilMate` nhóm. Không migrate / không ghi fixture `BuilMate_test` (:55432).

Bản phát triển tách: `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18` (git worktree, nhánh `prompt-18-mrl`) — overlay source hiện tại (159 file, bỏ `.env` và ảnh evidence) rồi thêm Material Requirement List.

---

## 0. Tài liệu backlog tìm được — không có bảng 79 UC

**Không tìm thấy Report3 SRS / bảng `UC-01`…`UC-79` của BuildMate trên disk.** Số “79” trong repo là mục **4.79** của class spec (CommerceAccess), không phải 79 use case.

Nguồn dùng để đối chiếu (không bịa UC):

| Nguồn | Vai trò | UC ID? |
|---|---|---|
| `d:\Đồ Án 2\Chức Năng BUILDMATE.docx` | 192 tên UC tiếng Anh theo actor | Không. Guest 25 / Customer 50 / Contractor+Store 55 / Worker 35 / Admin 27 |
| `ĐĂNG KÝ ĐỀ TÀI … Ver3.0.docx` | 16 nhóm chức năng, Material Requirement + Material Quote | Không |
| `BuildMate_Review1_Final.docx` | Phạm vi Review1: 10 nhóm, 15/85, giới hạn tồn kho nâng cao | Không |
| `Report2_Project Management Plan.docx` | WBS 7.1–7.15, **7.8 Material Requirement List** | Không |
| `BuildMate_Section4_Class_Specifications.docx` | 93 class suy từ **code**, không phải backlog | CS-nn |
| Prompt 15–17 E2E | Hiện trạng đã kiểm thử | Không |

Không khẳng định đã kiểm tra đủ 79 UC chính thức. Bảng dưới dùng **192 UC có tên** (File 1) + nhóm Ver3/Review1/WBS.

**Ngoài backlog (không triển khai như UC bắt buộc):** BOM/RFQ *với tên đó* (tài liệu dùng **Material Requirement List** / **Material Quote**); cổng thanh toán thật; AI chẩn đoán; chuỗi cung ứng / tồn kho nâng cao; mua vật liệu hộ Customer.

---

## 1. Thống kê

| Phân loại | Số (File 1, 192 UC) | Ghi chú |
|---|---|---|
| IMPLEMENTED | 89 | Đủ trang + API + service + PG theo phạm vi UC (Prompt 19: K-MRL + S-02; Prompt 20: S-03 trên DEV) |
| PARTIAL | 37 | Có một phần, thiếu bước/UI/quyền |
| MISSING | 60 | Gồm 35 UC Worker (không có role WORKER) |
| BUGGY | 0 | Không mở UC mới trên stack demo để bắt bug UI |
| UNVERIFIED | 6 | Phụ thuộc OTP/mail/VietMap key hoặc chưa click |
| NOT IN BACKLOG | — | Liệt kê mục 4, không đếm vào 192 |

WBS 7.8 Material Requirement List: **MISSING trên demo PROMPT 17**; **IMPLEMENTED trên worktree DEV** (UNIT + HTTP :5065 + PostgreSQL `BuilMate_dev` + Browser sequential :5178). Dual-profile đồng thời BLOCKED (một tab Cursor).

---

## 2. Bảng gap theo actor

STT | UC ID | Use Case | Actor | Backlog | Hiện trạng code | Phần còn thiếu | File liên quan | Ưu tiên | Độ phức tạp | Trạng thái
---|---|---|---|---|---|---|---|---|---|---
1 | G-01 | View Platform Introduction | Guest | File 1 | Landing | — | `frontend/src/pages/public` | P3 | S | IMPLEMENTED
2 | G-02 | View About BuildMate | Guest | File 1 | Trang giới thiệu | — | public pages | P3 | S | IMPLEMENTED
3 | G-03..G-08 | View/search categories, contractor, store, service, location, map | Guest | File 1 | Explore + marketplace API | Lọc vật liệu trên Explore chỉ PARTIAL | `ExplorePage.tsx`, `marketplaceService.js` | P2 | M | PARTIAL
4 | G-09..G-24 | Profile/store/service/material/portfolio/reviews/rating/contact | Guest | File 1 | Public contractor/store pages | Ảnh placeholder 1×1 (P2 cosmetic) | `StorePublicPage.tsx`, `PublicMaterialPage.tsx` | P3 | S | IMPLEMENTED
5 | G-25 | Register / Login | Guest | File 1 | Auth FE+API | OTP mail BLOCKED cấu hình | `auth` routes | P1 | M | PARTIAL
6 | C-01..C-10 | Account: register, login, logout, password, profile, avatar, address | Customer | File 1 | Có | Manage Address/Saved Location mỏng | `ProfilePage`, `authService` | P2 | M | PARTIAL
7 | C-11..C-22 | GPS, nearby search, radius, map, filter contractor/store | Customer | File 1 | Explore | Filter vật liệu keyword trên UI Explore | `ExplorePage.tsx`, `FilterDrawer.tsx` | P2 | M | PARTIAL
8 | C-23 | Create Repair Request | Customer | File 1 + WBS 7.6 | Browser E2E Prompt 16 | — | `repairRoutes.js`, request form | P0 | M | IMPLEMENTED
9 | C-24..C-27 | Category, describe, image, video, location | Customer | File 1 | Form request có image/video | — | `repairRoutes.js` upload fields | P1 | S | IMPLEMENTED
10 | C-28 | Edit Repair Request | Customer | File 1 | Không có PATCH request | API+UI | `repairRoutes.js` | P2 | S | MISSING
11 | C-29 | Cancel Repair Request | Customer | File 1, Ver3 Cancelled | **IMPLEMENTED (DEV)** PENDING→CANCELLED; demo Prompt 17 chưa có | `repairRoutes.js`, `RequestHistoryPage.tsx`, `PROMPT-21-CANCEL-PENDING.md` | P1 | S | IMPLEMENTED (DEV)
12 | C-30 | View Request History | Customer | File 1 | Có | — | `RequestHistoryPage.tsx` | P1 | S | IMPLEMENTED
13 | C-31..C-36 | Chat TEXT/IMAGE/VIDEO, receive | Customer | File 1, WBS 7.11 | Chat repair + DEV chat Store | Dual-browser realtime BLOCKED; IMAGE store chưa browser-upload riêng | `chatService.js`, `ChatPage.tsx`, `PROMPT-20-CUSTOMER-STORE-CHAT.md` | P1 | M | PARTIAL
14 | C-37..C-45 | Receive/view/accept/reject/modify quotation | Customer | File 1, WBS 7.7 | Browser E2E quote 1.6tr | — | `CustomerQuotationPage.tsx`, `quotationService.js` | P0 | M | IMPLEMENTED
15 | C-46..C-52 | Order, deposit, payment status, history | Customer | File 1 | Mock deposit E2E | Cổng thật không làm | `PaymentPage`, `paymentService.js` | P0 | M | IMPLEMENTED
16 | C-53 | Cancel Order | Customer | File 1 | Có nhánh hủy job/COD theo status | Không đủ mọi trạng thái File 1 | `orderService.js`, `material-order.service.js` | P2 | M | PARTIAL
17 | C-54..C-60 | Progress, acceptance, remaining 85% | Customer | Review1 off-platform 85% | Browser E2E Prompt 17 | Video tiến độ không có | `progressRoutes.js` images only | P0 | M | PARTIAL
18 | C-61..C-64 | Rate/review contractor/service | Customer | File 1, WBS 7.12 | Có | Rate Worker không có actor | `reviewService.js` | P1 | S | PARTIAL
19 | C-65 | Report Problem | Customer | File 1 complaint | Complaint **service_orders** | Không khiếu nại COD | `complaintRoutes.js`, `complaints` Prisma | P1 | M | PARTIAL
20 | C-COD | Đặt vật liệu COD | Customer | Review1 nhóm 7, WBS 7.4 | Browser E2E Prompt 17 | — | `material-checkout`, store orders | P0 | M | IMPLEMENTED
21 | K-01..K-09 | Partner account, verification, store/profile | Contractor | File 1, WBS 7.3 | eKYC + activation LIVE | — | `contractor` / verification pages | P0 | M | IMPLEMENTED
22 | K-10..K-18 | Store CRUD / materials — **trùng Store Owner** | File 1 gộp Contractor+Store | Store owner app | Contractor không bán VL | Tách actor đúng Review1 | `materialStoreRoutes.js` | P2 | S | IMPLEMENTED (Store)
23 | K-19..K-24 | Repair services CRUD | Contractor | File 1 | Services page | — | `ContractorServicesPage.tsx` | P1 | M | IMPLEMENTED
24 | K-25..K-32 | Receive/accept/reject request, chat | Contractor | File 1 | Browser E2E | — | `ContractorRequestsPage.tsx` | P0 | M | IMPLEMENTED
25 | K-33..K-41 | Dynamic quotation + material/labor/transport lines | Contractor | File 1, WBS 7.7 | Có; **không phải MRL** | MRL là module riêng | `CreateQuotationPage.tsx`, `quotation_items` | P0 | M | IMPLEMENTED
26 | K-MRL | Material Requirement List | Contractor | WBS **7.8**, Ver3 §7, Review1 §6–7 | Demo: không có. DEV Prompt 19: HTTP+PG+Browser sequential | Dual-profile đồng thời; reject quote | `PROMPT-19-MRL-E2E.md`, `material-requirement.*` | P1 | M | IMPLEMENTED (DEV)
27 | K-42..K-49 | Order, progress, complete | Contractor | File 1, WBS 7.9–7.10 | Browser E2E | Assign Worker MISSING | `ContractorOrderDetailPage.tsx` | P0 | M | PARTIAL
28 | K-50..K-55 | Workers, schedule, revenue, commission, feedback | Contractor | File 1 | Earnings/reviews | Worker list/schedule không có | `ContractorEarningsPage.tsx` | P2 | M | PARTIAL
29 | S-01 | Quản lý cửa hàng, giá, tồn khả dụng, giao hàng | Store | Ver3 actor | CRUD + stock thủ công + delivery | Không trừ tồn tự động | `StoreMaterialsPage.tsx`, `materials.stock` | P1 | M | PARTIAL
30 | S-02 | Tiếp nhận yêu cầu vật liệu + Material Quote | Store | Ver3 §7 | Demo MISSING; DEV inbox + quote + confirm | Dual-profile đồng thời; locale title MRL đã vá Prompt 20 | `StoreMaterialRequestsPage.tsx`, `StoreMaterialRequestDetailPage.tsx` | P1 | M | IMPLEMENTED (DEV)
31 | S-03 | Chat với Customer về vật liệu | Store | Ver3/Review1 | DEV: room_kind CUSTOMER_MATERIAL_STORE + ChatPage + socket JWT | Dual-profile browser realtime; `/uploads/chat` public | `PROMPT-20-CUSTOMER-STORE-CHAT.md`, `chatService.js` | P1 | M | IMPLEMENTED (DEV)
32 | S-04 | Fulfillment COD | Store | WBS 7.4 | Browser E2E Prompt 17 | DELIVERY_FAILED không có | `material-order.rules.js` | P0 | M | PARTIAL
33 | W-01..W-35 | Toàn bộ Worker | Worker | File 1, Ver3 phân công Worker | **Không có role WORKER** trong `ROLES` | Module worker | `user.model.js` | P2 | L | MISSING
34 | A-01 | Login Admin | Admin | File 1 | `:5177` E2E | — | admin auth | P0 | S | IMPLEMENTED
35 | A-02..A-04 | Manage customer/contractor/worker | Admin | File 1 | Users + partner review | Worker không có | `AdminUserManagementPage.tsx` | P1 | M | PARTIAL
36 | A-05..A-06 | Lock / Unlock Account | Admin | File 1 | `account_status` BLOCKED/BANNED chặn login (`authMiddleware.js`) | **Không** API/UI khóa-mở | `AdminUserManagementPage.tsx`, `adminRoutes.js` | P1 | S | PARTIAL
37 | A-07..A-12 | Review/approve/reject partner, license, certificate | Admin | File 1 | Có | — | verification admin | P0 | M | IMPLEMENTED
38 | A-13..A-15 | Manage store / service / material category | Admin | File 1 | Catalog + suggestions | Admin store CRUD mỏng | admin catalog | P2 | M | PARTIAL
39 | A-16 | Monitor Order | Admin | File 1 | `/admin/orders` = **service orders** | Không list COD; detail material nếu mở đúng id | `adminService.listRepairOrders`, `OrdersPage.tsx` | P1 | M | PARTIAL
40 | A-17..A-20 | Payment, commission, revenue, dashboard | Admin | File 1, WBS 7.14 | KPI E2E khớp PG | — | dashboard + finance | P0 | M | IMPLEMENTED
41 | A-21..A-23 | Review, complaint, dispute | Admin | File 1, WBS 7.12 | Repair complaints | COD complaint MISSING | `admin/src/complaints` | P1 | M | PARTIAL
42 | A-24..A-27 | Dashboard, report, statistics, remove violation | Admin | File 1 | Dashboard + analytics | Remove content hẹp | `AnalyticsPage.tsx` | P2 | M | PARTIAL
43 | SYS-OTP | SMTP OTP | System | Auth | Code có | Cấu hình mail BLOCKED | Prompt 15–17 | P2 | S | UNVERIFIED
44 | SYS-CHAT2 | Chat 2 browser profile | System | WBS 7.11 | Socket 2 JWT PASS HTTP | Cursor cùng origin BLOCKED BROWSER | Prompt 17 | P1 | S | PARTIAL
45 | CR | Change Request | All | **Ver3 only** | Không có | Cả module | — | P3 | L | MISSING
46 | WR | Warranty Claim | Customer | **Ver3 only** | Không có | Cả module | — | P3 | L | MISSING
47 | PAY85 | Thanh toán 85% trong hệ thống | — | Ver3 vs Review1 **mâu thuẫn** | Review1 + code: xác nhận ngoài nền tảng | Không đổi 15/5/10/85 | `confirmRemaining` | — | — | NOT IN BACKLOG (Review1)

---

## 3. Nhóm A–F (đối chiếu kỹ)

### A. Material Requirement List / BOM / RFQ

Backlog thật: **Material Requirement List** (WBS 7.8) + Ver3 **Material Quote**. Không có chữ BOM/RFQ. Quotation line `MATERIAL` **không** thay MRL.

| Hạng mục | Demo HEAD+dirty | Worktree Prompt 18 |
|---|---|---|
| Contractor tạo list + tên/quy cách/đơn vị/SL | MISSING | SOURCE+UNIT; SQL `BuilMate_dev` |
| Sửa/xem list | MISSING | UI contractor |
| Tìm catalog/giá/phạm vi giao từ list | MISSING | `catalog-matches` tái sử dụng `searchMaterials` |
| Gửi Store, Store quote, Contractor confirm | MISSING | API + UI; **không** tạo đơn COD |
| PG tables | Không | 4 bảng trên **BuilMate_dev :55433** |
| Browser E2E / API 5055 | — | Chưa (cố ý không gắn vào demo 5055) |

### B. Chat Customer–Store

MISSING. `chat_rooms` unique `repair_request_id`, membership customer+contractor. Test `chat-flow-11.test.js` khẳng định không tạo room store. `/store/chat/:roomId` có route nhưng không inbox.

### C. Admin đơn vật liệu COD

PARTIAL. `GET /admin/orders` = repair only. `GET /orders/:id` admin có thể thấy material nếu biết id. Không list/filter COD. Không cho admin giao hàng thay store.

### D. Admin khóa tài khoản

PARTIAL. `USER_STATUS.BLOCKED/BANNED` → 403 authenticate/login. Admin UI chỉ badge. Không lock/unlock endpoint. File 1 **có** Lock/Unlock. Ver3 đăng ký **không** nhấn mạnh.

### E. Tồn kho

PARTIAL. `materials.stock` nhập tay; checkout chặn vượt tồn; **không** trừ/hoàn tự động (`material-flow-08.test.js` `doesNotMatch material.stock -=`). Đúng giới hạn “không tồn kho nâng cao”. Không đổi mô hình trong Prompt 18.

### F. Còn lại

| UC | Trạng thái | Bằng chứng |
|---|---|---|
| Customer hủy request PENDING | MISSING | `repairRoutes.js` không có cancel |
| Khiếu nại COD | MISSING | `complaints.service_order_id` only |
| Giao thất bại / giao lại | MISSING | không `DELIVERY_FAILED` |
| Video nhật ký tiến độ | MISSING (progress); VIDEO có ở chat/request | `progressUpload.array('images')` |
| Lọc vật liệu Explore | PARTIAL | API `searchMaterials`; Explore `searchMaterials({})` |
| Thông báo COD | IMPLEMENTED | `material-order.service.js` notify |

---

## 4. Ưu tiên triển khai (backlog đã chốt)

1. **Material Requirement List + Material Quote** (WBS 7.8, Ver3) — bắt đầu Prompt 18.
2. Chat Customer–Store (Ver3/Review1).
3. Customer hủy Repair Request PENDING (File 1).
4. Admin list đơn COD (monitor order).
5. Admin Lock/Unlock (File 1; tận dụng `account_status`).
6. Explore filter vật liệu (WBS 7.15).
7. Video tiến độ (File 1 View Completion / Upload Progress — một phần).
8. Khiếu nại COD / giao thất bại — sau khi admin COD list ổn.
9. Worker (File 1 + Ver3) — module lớn, sau.
10. Change Request / Warranty — chỉ nếu chốt Ver3 thay Review1.
11. Trừ tồn tự động — chỉ khi product owner xác nhận, vì Review1 loại tồn kho nâng cao.

---

## 5. Nhóm đã triển khai đầu tiên: Material Requirement List

### Luồng (đúng UC, không mua hộ Customer)

1. Contractor chỉ tạo list khi request **không PENDING** (đã nhận hồ sơ).
2. Thêm dòng: tên, quy cách, đơn vị, SL ước tính.
3. DRAFT: sửa/xóa dòng; unique 1 list active / request.
4. Gợi ý catalog LIVE (`searchMaterials`).
5. Gửi store MATERIALS/BOTH **LIVE** → SENT + notify store.
6. Store gửi Material Quote đủ mọi dòng → QUOTED + notify contractor.
7. Contractor confirm → CONFIRMED. **Không** tạo material order / escrow / COD.
8. Double-click send/quote/confirm: in-process lock. Unique index chặn 2 list active.

Trạng thái: `DRAFT → SENT → QUOTED → CONFIRMED` hoặc `CANCELLED` từ DRAFT/SENT.

### File worktree (không có trên demo)

Tạo:

- `backend/src/utils/material-requirement.rules.js`
- `backend/src/utils/dev-database-guard.js`
- `backend/src/validators/material-requirement.validator.js`
- `backend/src/repositories/materialRequirement.postgres.js`
- `backend/src/services/material-requirement.service.js`
- `backend/src/controllers/materialRequirementController.js`
- `backend/src/routes/materialRequirementRoutes.js`
- `backend/scripts/dev-db/18-material-requirement.sql`
- `backend/scripts/dev-db/apply-mrl.js`
- `backend/src/tests/material-requirement.test.js`
- `frontend/src/lib/material-requirement-api.ts`
- `frontend/src/pages/contractor/ContractorMaterialRequirementPage.tsx`
- `frontend/src/pages/store/StoreMaterialRequestsPage.tsx`
- `frontend/src/pages/store/StoreMaterialRequestDetailPage.tsx`
- `docker-compose.dev.yml`

Sửa (worktree): `backend/src/routes/index.js`, `backend/package.json`, `frontend/src/App.tsx`, `StoreDashboard.jsx`, `ContractorRequestsPage.tsx`, `locales/*`, `storage.ts`.

### API

| Method | Path | Role |
|---|---|---|
| POST | `/api/material-requirements` | CONTRACTOR |
| GET | `/api/material-requirements` | CONTRACTOR, STORE |
| GET | `/api/material-requirements/:id` | thành viên |
| POST/PATCH/DELETE | `/:id/items` | CONTRACTOR, DRAFT |
| POST | `/:id/send` | CONTRACTOR |
| POST | `/:id/cancel` | CONTRACTOR |
| GET | `/:id/catalog-matches` | CONTRACTOR |
| GET | `/:id/eligible-stores` | CONTRACTOR |
| POST | `/:id/quotes` | STORE |
| POST | `/:id/confirm` | CONTRACTOR |

Không mock data. 503 nếu bảng chưa cài trên DB đang chạy.

### Database

- **Không** Prisma migrate lên nhóm / `BuilMate_test`.
- Container `buildmate-dev-pg` `127.0.0.1:55433`, DB `BuilMate_dev` (volume riêng).
- Schema nghiệp vụ được **đọc** dump từ test container → restore **chỉ** vào `BuilMate_dev`.
- SQL 18 tạo 4 bảng; unique active list đã FAIL lần insert 2 (đúng).
- Hàng thử Prompt 19: list `aaaaaaaaaaaaaaaaaaaaaa01` **CONFIRMED** (browser), item cement 10 + tile 12.5, quote ACCEPTED 3.292.500đ; list HTTP `79003bca9fec0dc711972d6e` CONFIRMED.

### Test

| Case | Loại | Kết quả |
|---|---|---|
| DRAFT-only edit, send cần ≥1 item, confirm đúng trạng thái | PASS UNIT | `material-requirement.test.js` |
| Zod reject payload | PASS UNIT | cùng file |
| Route/UI wiring, không gọi checkout COD, giữ 15%/5% | PASS SOURCE | cùng file |
| Guard từ chối BuilMate, BuilMate_test, :5432, :55432 | PASS UNIT | `dev-database-guard.js` |
| Finance 15/5/10/85 + COD 0% + escrow | PASS UNIT | 33/33 cùng `contractor-finance.test.js` |
| Insert/quote/confirm trên BuilMate_dev | PASS POSTGRESQL | psql 55433 |
| HTTP API **5065** RBAC/send/quote/confirm | PASS HTTP | `run-prompt19-mrl-http.js` |
| Browser sequential Contractor→Store→Contractor :5178 | PASS BROWSER | `docs/feature-gap/prompt-19-e2e/` |
| Dual browser profile đồng thời | BLOCKED | Một tab Cursor |
| HTTP API 5055 / demo | **BLOCKED** (cố ý) | Không mount MRL lên demo |

Regression demo: không chạy `npm test` trên API 5055 với code mới. Demo `App.tsx` / `routes/index.js` **không** chứa `material-requirements`.

---

## 6. Lỗi còn lại (nhóm MRL + Chat Store)

- Customer không xem MRL (đúng Ver3: Customer xác nhận **báo giá sửa chữa**, không mua hộ).
- Chưa reject quote / gửi store thứ 2 sau CANCEL.
- Bell title MRL: locale đã thêm Prompt 20 (`notify.titles` + fallback không còn `—`).
- Dual-profile browser đồng thời BLOCKED (tool). Socket JWT Customer–Store PASS.
- `/uploads/chat` vẫn công khai (Prompt 11); không mở rộng.
- Prisma schema demo chưa có `room_kind` (cố ý). Client demo không bị generate đè.
- `DEV_DATABASE_URL` host chưa gắn vào `test:api` — không được trỏ 5055 sang 55433 nếu còn demo.

---

## 7. Xác nhận demo PROMPT 17

| Kiểm tra | Kết quả |
|---|---|
| HEAD demo | `cb88441775c4dfcd518a86500cde82cc4672f4ea` nhánh `Duc` |
| Source demo MRL | Không (`App.tsx`, `routes/index.js` không match) |
| `BuilMate_test` migrate MRL | Không chạy |
| Tỷ lệ 15/5/10/85 và COD 0% | Không sửa trên demo |
| Worktree | `prompt-18-mrl` tại `BUILDMATE-dev-prompt18` |

---

## DANH SÁCH PROMPT TRIỂN KHAI TIẾP THEO

| Prompt | Nhóm | Phụ thuộc | DB |
|---|---|---|---|
| **19** | MRL HTTP + browser DEV — **xong sequential E2E** (xem `PROMPT-19-MRL-E2E.md`) | 18 | `BuilMate_dev` |
| **20** | Chat Customer–Store — **xong HTTP+PG+socket JWT+browser tuần tự** (`PROMPT-20-CUSTOMER-STORE-CHAT.md`) | 19 | migration **dev** `chat_rooms.room_kind` |
| **21** | Customer hủy Repair Request khi còn **PENDING** — **xong HTTP+PG+browser** (`PROMPT-21-CANCEL-PENDING.md`) | C-29 IMPLEMENTED (DEV) | cột `status` có sẵn; không đụng ACCEPTED/ Escrow |
| **22** | Admin danh sách/lọc đơn COD (không giao thay store) | Không | bảng material_orders có sẵn |
| **23** | Admin lock/unlock + audit + chặn phiên | File 1 | `users.account_status` có sẵn |
| **24** | Explore filter/search vật liệu | API đã có | không |
| **25** | Video trong progress update | Upload policy | progress_media |
| **26** | Khiếu nại COD | 22 | migration `material_order_id` **dev** |
| **27** | Giao thất bại / giao lại | 22 | status machine |
| **28** | Tồn kho trừ/hoàn — **chỉ sau khi chốt** không đụng “tồn kho nâng cao” | 26–27 | cẩn thận snapshot |
| **29** | Worker assignment | Ver3 + File 1 | role mới, lớn |
| **30** | Change Request / Warranty | Chỉ nếu SRS Ver3 được chốt thay Review1 | lớn |

### PROMPT 21 — Customer hủy Repair Request khi còn PENDING — xong trên DEV

C-29: `PATCH /api/repair-requests/:id/cancel` + nút history + modal. Chỉ PENDING, `updateMany` có điều kiện, race với ACCEPT một winner. Chat/notify cũ giữ. Báo cáo: `PROMPT-21-CANCEL-PENDING.md`.

Không tuyên bố dự án đã hoàn chỉnh: Worker 35 UC, MRL và chat Store **chưa có trên bản demo**, khóa tài khoản UI, hủy PENDING **trên demo**, admin COD list, khiếu nại COD vẫn thiếu trên bản demo. MRL + S-03 + C-29 **IMPLEMENTED** chỉ trên worktree DEV.
