# PROMPT 19 — Material Requirement List E2E

Ngày: 2026-10-26.

**Bản demo PROMPT 17 không bị sửa.** Không commit / push / merge / reset / clean. Không migrate `BuilMate_test` hay database nhóm. Không triển khai Chat Customer–Store.

Worktree phát triển: `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18`  
Nhánh: `prompt-18-mrl`  
HEAD: `cb88441775c4dfcd518a86500cde82cc4672f4ea` (cùng commit với demo; overlay dirty)

---

## 1. Git của hai worktree

| | Demo PROMPT 17 | DEV Prompt 18/19 |
|---|---|---|
| Thư mục | `D:\Kì 9\BUILDMATE (2)\BUILDMATE` | `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18` |
| Branch | `Duc` (ahead 1 so với `origin/Duc`) | `prompt-18-mrl` |
| HEAD | `cb88441775c4dfcd518a86500cde82cc4672f4ea` | `cb88441775c4dfcd518a86500cde82cc4672f4ea` |
| Working tree | dirty (~148 tracked/untracked, không commit) | dirty (~165, gồm overlay demo + MRL) |
| File MRL trong `App.tsx` | **không** (`material-requirements` không match) | có `/contractor/material-requirements`, `/store/material-requests` |

Đối chiếu overlay Prompt 01–17 (bỏ `.env`, dump, `node_modules`, uploads):

| Kết quả | Số | Ý nghĩa |
|---|---|---|
| SAME | 145 | Source demo đã có trong DEV |
| MISSING_IN_DEV | 0 | Không thiếu bản vá 01–17 |
| DIFFER | 4 | `backend/package.json`, `frontend/src/locales/vi/common.json`, `en/common.json`, `ContractorRequestsPage.tsx` — khác biệt MRL, **không** copy đè từ demo |

**Đồng bộ có chọn lọc:** không copy thêm file demo vào DEV (MISSING=0). Không đụng `.env`, secret, dump, uploads, `node_modules`. Không sửa file nào của thư mục demo.

Nguy cơ regression nếu copy 4 file DIFFER từ demo sang DEV: mất route MRL trên trang yêu cầu sửa chữa và chuỗi locale `mrl.*`.

---

## 2. Stack DEV độc lập

| Thành phần | Giá trị đã xác minh |
|---|---|
| PostgreSQL | `127.0.0.1:55433`, container `buildmate-dev-pg`, `current_database() = BuilMate_dev` |
| Backend DEV | `http://127.0.0.1:5065` (`DATABASE_URL` host 55433 / `BuilMate_dev`, CORS 5178) |
| Frontend DEV | `http://localhost:5178` (`frontend/.env.mrl` → `VITE_API_URL=http://127.0.0.1:5065/api`) |
| Demo còn sống, không dùng | API `5055`, FE `5176`, PG `55432` / `BuilMate_test` |

Mọi ghi MRL (HTTP + browser) chạy trên `BuilMate_dev`. Không reset `BuilMate_test`.

---

## 3. Kiến trúc MRL (WBS 7.8)

Bốn bảng PostgreSQL (SQL 18, không Prisma migrate demo):

1. `material_requirement_lists`
2. `material_requirement_items`
3. `material_quotes`
4. `material_quote_items`

Unique: một list active (`status <> CANCELLED`) trên mỗi `repair_request`.

Trạng thái list: `DRAFT → SENT → QUOTED → CONFIRMED`, hoặc `CANCELLED` từ `DRAFT`/`SENT`.

Trạng thái báo giá vật tư: `SENT → ACCEPTED` (`REJECTED` có enum, **chưa** có API reject trong Prompt 19).

Thời điểm lập MRL: Contractor sở hữu/được giao request; **không** `PENDING`; **không** `REJECTED`/`CANCELLED`. Không tạo MRL ở mọi trạng thái.

Gửi store: `marketplaceService.assertApprovedLiveStore` (APPROVED + LIVE + `readiness.visible`) và `storeType` MATERIALS/BOTH. Eligible stores tái sử dụng `searchMaterials` (Luồng 03/08), không bộ lọc mới.

Không tạo Material Order COD, Deposit, Escrow, commission 5%, cọc 15%, không sửa Repair Quotation.

---

## 4. API MRL và phân quyền

Prefix: `/api/material-requirements`. Guest luôn 401.

| Method | Path | Role | Ghi chú |
|---|---|---|---|
| POST | `/` | CONTRACTOR | Unique active list / request |
| GET | `/` | CONTRACTOR, MATERIAL_STORE_OWNER | Contractor: list của mình; Store: inbox cửa hàng |
| GET | `/:id` | thành viên list | Customer 403; contractor/store khác 403 |
| POST | `/:id/items` | CONTRACTOR | Chỉ DRAFT; tên ≥2; qty > 0 |
| PATCH | `/:id/items/:itemId` | CONTRACTOR | DRAFT |
| DELETE | `/:id/items/:itemId` | CONTRACTOR | DRAFT |
| GET | `/:id/eligible-stores` | CONTRACTOR | LIVE + visible; không paste storeId |
| GET | `/:id/catalog-matches` | CONTRACTOR | `searchMaterials` |
| POST | `/:id/send` | CONTRACTOR | Body `storeId` từ picker; lock chống double send |
| POST | `/:id/cancel` | CONTRACTOR | DRAFT/SENT |
| POST | `/:id/quotes` | MATERIAL_STORE_OWNER | Store sở hữu list SENT; round VND; giá âm 422 |
| POST | `/:id/confirm` | CONTRACTOR | QUOTED; lock; store confirm 403 |

Không cho sửa `storeId` trên URL để gửi trái quyền: send lấy store từ body đã được `assertApprovedLiveStore`, rồi gắn `store_id` của list.

---

## 5. Bảng kiểm thử

STT | Chức năng | Actor | Test case | Kết quả mong đợi | Kết quả thực tế | Loại kiểm thử | PASS/FAIL/BLOCKED | File sửa
---|---|---|---|---|---|---|---|---
1 | Git overlay 01–17 | — | SAME/MISSING/DIFFER | Không thiếu vá demo | SAME=145, MISSING=0, DIFFER=4 (MRL) | SOURCE | PASS | không copy đè
2 | Guard DB | — | Từ chối BuilMate / BuilMate_test / 55432 | Throw Refusing | 6/6 unit guard PASS | UNIT | PASS | `dev-database-guard.js`
3 | Stack DEV | — | `current_database()` | `BuilMate_dev` :55433 | Đúng; API 5065; FE 5178 | POSTGRESQL | PASS | `docker-compose.dev.yml`
4 | Contractor login | Contractor | Đăng nhập FE 5178 | Dashboard contractor | Demo Contractor `/contractor/dashboard` | BROWSER | PASS | —
5 | Mở job đã nhận | Contractor | ACCEPTED request `0d926aeb9d99c3ebac6ed933` | Tạo/mở MRL | URL `/contractor/material-requirements/aaaaaaaaaaaaaaaaaaaaaa01` | BROWSER | PASS | `ContractorRequestsPage.tsx`
6 | Tạo/mở MRL | Contractor | Một list / request | Không trùng | Unique index; create trả list sẵn có | HTTP+PG | PASS | `materialRequirement.postgres.js`
7 | Thêm vật tư | Contractor | Tên, quy cách, đơn vị, SL | ≥2 dòng lưu PG | PCB40 cement 10 bao + Ceramic tile 12.5 m2 | BROWSER+PG | PASS | `ContractorMaterialRequirementPage.tsx`
8 | Validation tên rỗng | Contractor | name ngắn | 422 | HTTP 422 empty name | HTTP | PASS | `material-requirement.rules.js`
9 | Validation SL | Contractor | qty 0 | 422 | HTTP 422 zero qty | HTTP | PASS | validator
10 | SL thập phân | Contractor | 12.5 | Schema numeric cho phép | PG `12.500` | BROWSER+PG | PASS | schema SQL 18
11 | Store picker | Contractor | LIVE visible, không dán id | Card Demo Can Tho Materials | Không có `id="mrl-store"` paste | BROWSER | PASS | `ContractorMaterialRequirementPage.tsx`
12 | PAUSED/BLOCKED | Contractor | Không hiện / không send | `assertApprovedLiveStore` | HTTP send store không LIVE 409 (Prompt 18/19 HTTP) | HTTP | PASS | `material-requirement.service.js`
13 | Gửi MRL | Contractor | SENT + store đúng | Badge SENT, store name | Screenshot `prompt19-contractor-mrl-sent.png` | BROWSER | PASS | service send
14 | Double send | Contractor | 409 | HTTP 409 | PASS HTTP | HTTP | PASS | `withLock`
15 | Store inbox | Store | Chỉ list cửa hàng mình | aaaa01 SENT + 972d6e CONFIRMED | `prompt19-store-inbox.png` | BROWSER | PASS | `StoreMaterialRequestsPage.tsx`
16 | Store xem dòng | Store | Tên/QC/ĐVT/SL | Khớp contractor | Cement + tile 12.5 | BROWSER | PASS | detail page
17 | HTML step qty | Store | 12.5 hợp lệ | Native validation pass | Ban đầu FAIL step=1; sửa `step="0.001"` rồi PASS | BROWSER | PASS | `StoreMaterialRequestDetailPage.tsx`
18 | Báo giá + tổng VND | Store | 10×95000 + 12.5×185000 + 30000 | 3.292.500đ | UI + PG `95000/185000/30000` ACCEPTED | BROWSER+PG | PASS | service `roundVnd`
19 | Gửi báo giá | Store | QUOTED, không COD | Fields khóa, quoteLocked | `prompt19-store-quoted.png`; `material_orders` vẫn 4, latest 12:43Z | BROWSER+PG | PASS | service quote
20 | Store khác / giả contractor | Store | 403 | HTTP store confirm 403 | PASS HTTP | HTTP | PASS | `confirmQuote`
21 | Contractor xem quote | Contractor | Đơn giá + tổng | 3.292.500đ QUOTED | `prompt19-contractor-quoted.png` | BROWSER | PASS | contractor page
22 | Xác nhận | Contractor | CONFIRMED một lần | Badge CONFIRMED; double 409 | Browser confirm; HTTP double 409 | BROWSER+HTTP | PASS | confirm + lock
23 | Refresh quote | Contractor | Vẫn hiện tổng | Quote ẩn khi CONFIRMED (bug P1) rồi sửa | `prompt19-contractor-confirmed-refresh.png` | BROWSER | PASS | contractor page `QUOTED\|\|CONFIRMED`
24 | Contractor khác confirm | Other contractor | 403 | HTTP 403 | PASS HTTP | HTTP | PASS | `loadOwnedList`
25 | Guest API | Guest | 401 | 401 | PASS HTTP | HTTP | PASS | `authenticate`
26 | Customer tạo/xem | Customer | 403 | create 403, get 403 | PASS HTTP | HTTP | PASS | service
27 | Notify send | Store | PG + link inbox | `Material requirement list` → `/store/material-requests/aaaa…01` | 15:07:19Z | POSTGRESQL | PASS | `notify()`
28 | Notify quote | Contractor | PG + link MRL | `Material quote received` | Bell hiện body store; **title i18n ra "—"** | PG+BROWSER | PASS (P2 UI) | `notificationService` + bell
29 | Notify confirm | Store | PG | `Material quote confirmed` | 15:12:26Z | POSTGRESQL | PASS | service
30 | Realtime socket | Cả hai | `notification:new` | `notify()` gọi `emitToUser` | Có emit backend; không đo 2 profile song song | SOURCE | PASS SOURCE | `notificationService.js`
31 | Dual browser profile | Cả hai | 2 phiên độc lập cùng lúc | Cursor chỉ 1 profile | Sequential logout/login **PASS**; simultaneous **BLOCKED** | BROWSER | BLOCKED (tool) | —
32 | Không COD/escrow | — | Không order mới | `material_orders=4` latest 12:43Z; MRL 15:12Z | PASS | POSTGRESQL | PASS | service không gọi checkout
33 | Finance 15/5/10/85 + COD 0% | — | Unit không đổi | 33/33 unit finance+MRL PASS | PASS | UNIT | PASS | `contractor-finance.js`
34 | Demo an toàn | — | Không sửa demo | HEAD demo giữ nguyên; không ghi 55432 | PASS | SOURCE | PASS | —

---

## 6. Kết quả theo nhóm

### Contractor tạo MRL

PASS. List `aaaaaaaaaaaaaaaaaaaaaa01` trên request `0d926aeb9d99c3ebac6ed933`. Hai dòng, SL thập phân 12.5 lưu PostgreSQL.

### Store nhận MRL

PASS. Inbox store LIVE Demo Can Tho Materials. List HTTP `79003bca9fec0dc711972d6e` (CONFIRMED sẵn) và list browser SENT→quoted→confirmed.

### Store gửi báo giá

PASS. Tổng **3.292.500 VND**. Quote status `ACCEPTED` sau confirm. Không tạo COD.

### Contractor xác nhận

PASS. Status list `CONFIRMED`. Refresh vẫn hiện dòng giá và hint không COD/escrow.

### Notifications

| Sự kiện | PG | Người nhận | Link | Bell FE | Socket |
|---|---|---|---|---|---|
| Gửi MRL | Có `STATUS_UPDATE` | Store owner | `/store/material-requests/:id` | Store chưa mở bell lần này (sequential) | emit backend |
| Store nhận | cùng bản ghi gửi | Store | như trên | — | emit |
| Store báo giá | Có `QUOTATION` | Contractor | `/contractor/material-requirements/:id` | Có, title "—" (thiếu i18n) | emit |
| Contractor nhận quote | cùng | Contractor | như trên | PASS P2 | emit |
| Confirm | Có `QUOTATION_ACCEPTED` | Store | store detail | Sequential, không mở lại store | emit |

Không tạo hệ thống notify mới. Retry HTTP không nhân đôi list (unique + lock).

### Browser E2E

**PASS sequential** (một tab Cursor: Contractor → logout → Store → logout → Contractor).

**BLOCKED dual-profile đồng thời** (harness chỉ một browser profile).

Không dùng API thay nút: Thêm dòng, chọn card store, Gửi yêu cầu, Gửi báo giá, Xác nhận đều click UI.

### Unit / HTTP / PostgreSQL

| Suite | Kết quả |
|---|---|
| `material-requirement.test.js` + `contractor-finance.test.js` | **33/33 PASS** |
| HTTP `scripts/dev-db/run-prompt19-mrl-http.js` trên :5065 | PASS guest 401, customer 403, empty/zero 422, send 200, double send 409, store confirm 403, double confirm 409 (list `79003bca9fec0dc711972d6e`) |
| PG `BuilMate_dev` | list browser CONFIRMED; items 10 + 12.5; quote ACCEPTED 3292500 |

### Regression tối thiểu (không ghi demo)

| Hạng mục | Cách | Kết quả |
|---|---|---|
| RBAC Contractor/Store/Customer/Guest | HTTP MRL | PASS |
| Repair Request / Job | Không sửa service order/quotation | PASS (không đụng) |
| Repair Quotation | MRL không gọi `quotationService` | PASS SOURCE |
| Store `readiness.visible` | `assertApprovedLiveStore` | PASS |
| Material catalog | `searchMaterials` reuse | PASS |
| Checkout COD / Material Order | `material_orders` count 4, latest trước MRL | PASS |
| Commission 5% / Deposit 15% / hold 10% / remaining 85% | unit 33/33 | PASS |
| Escrow HELD/FROZEN/RELEASED | unit state machine | PASS |
| COD 0% phí | `snapshotMaterialFree` unit | PASS |
| Private verification uploads | không sửa `verificationStorage` trong Prompt 19 | PASS (không đụng) |

---

## 7. Lỗi

| ID | Mức | Mô tả | Xử lý Prompt 19 |
|---|---|---|---|
| P1 | P1 | Input `type=number` store availableQty mặc định step=1 chặn 12.5 | **Đã sửa** `step="0.001"` |
| P1 | P1 | Quote ẩn sau CONFIRMED, refresh mất tổng | **Đã sửa** hiện quote khi QUOTED/CONFIRMED |
| P2 | P2 | Bell title MRL tiếng Anh không có locale → "—" | Chưa dịch; body/link đúng |
| P2 | P2 | Dual browser profile đồng thời | BLOCKED tool |
| P2 | P2 | Chưa reject quote / gửi store thứ 2 sau CANCEL | Ngoài luồng bắt buộc confirm |
| — | Info | Prisma schema demo chưa khai 4 bảng MRL | Cố ý: SQL chỉ trên `BuilMate_dev` |

Không P0.

---

## 8. File đã sửa (worktree DEV, không demo)

Prompt 19 (hoàn thiện E2E):

- `frontend/src/pages/store/StoreMaterialRequestDetailPage.tsx`
- `frontend/src/pages/contractor/ContractorMaterialRequirementPage.tsx`
- `frontend/src/locales/vi/common.json`
- `frontend/src/locales/en/common.json`
- `docs/feature-gap/PROMPT-19-MRL-E2E.md`
- `docs/feature-gap/BUILDMATE-FUNCTION-GAP-ANALYSIS.md`
- `docs/feature-gap/prompt-19-e2e/*.png`

Đã có từ Prompt 18 / đầu Prompt 19 (DEV):

- `backend/src/config/env.js` (CORS 5178)
- `backend/src/services/material-requirement.service.js` (`assertApprovedLiveStore`, `listEligibleStores`)
- `backend/src/controllers/materialRequirementController.js`
- `backend/src/routes/materialRequirementRoutes.js` (`GET /:id/eligible-stores`)
- `backend/src/repositories/materialRequirement.postgres.js`
- `backend/src/utils/material-requirement.rules.js`
- `backend/src/validators/material-requirement.validator.js`
- `backend/src/tests/material-requirement.test.js`
- `backend/scripts/dev-db/*`
- `frontend/src/lib/material-requirement-api.ts`
- `frontend/src/pages/store/StoreMaterialRequestsPage.tsx`
- `frontend/.env.mrl`, `frontend/package.json` `dev:mrl`
- `docker-compose.dev.yml`

Bằng chứng screenshot: `docs/feature-gap/prompt-19-e2e/`.

---

## 9. Xác nhận demo PROMPT 17

| Kiểm tra | Kết quả |
|---|---|
| HEAD | `cb88441775c4dfcd518a86500cde82cc4672f4ea` nhánh `Duc` |
| File demo đã sửa trong Prompt 19 | **Không** |
| `App.tsx` demo | Không có `material-requirements` |
| `BuilMate_test` / :55432 | Không migrate, không ghi MRL |
| Cổng demo | 5055 / 5176 vẫn listen, không dùng cho MRL |

---

## KẾT LUẬN

| Câu hỏi | Trả lời |
|---|---|
| MRL đã hoàn thành end-to-end chưa? | **Có trên stack DEV** (HTTP + PG + Browser sequential). Dual-profile đồng thời BLOCKED do tool. |
| Contractor lập được danh sách vật tư thật? | **Có.** |
| Gửi đúng Material Store? | **Có** (LIVE Demo Can Tho Materials, picker không paste id). |
| Store báo giá được? | **Có.** 3.292.500đ. |
| Contractor xác nhận được? | **Có.** `CONFIRMED`. |
| Quyền và dữ liệu đúng? | **Có** (guest/customer/store/contractor khác bị chặn ở API). |
| Làm sai Repair Quotation hoặc Escrow? | **Không.** |
| Ảnh hưởng COD 0% phí? | **Không.** `material_orders` không tăng. |
| Bản demo PROMPT 17 an toàn? | **Có.** |

Gap Analysis: **K-MRL** và **S-02** → **IMPLEMENTED** trên worktree DEV, kèm bằng chứng file này. Demo PROMPT 17 vẫn **MISSING** MRL (đúng khóa). Chat Customer–Store **không** triển khai.
