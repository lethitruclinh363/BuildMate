# PROMPT 21 — Customer hủy Repair Request khi còn PENDING (DEV)

Ngày: 2026-10-27.

**Bản demo PROMPT 17 không bị sửa trong lượt này.** Không commit / push / merge / reset / clean. Không migrate `BuilMate_test` hay database nhóm. Không đụng cọc 15%, phí 5%, share 10%, remaining 85%, Escrow, COD, MRL, chat Store.

Worktree: `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18`  
Nhánh: `prompt-18-mrl`  
HEAD (trùng demo): `cb88441775c4dfcd518a86500cde82cc4672f4ea`

**CUSTOMER CANCEL PENDING REPAIR REQUEST: IMPLEMENTED (DEV).**

---

## 1. Chức năng đã có trước khi sửa

- `REQUEST_STATUS.CANCELLED` đã có trong model; cột `repair_requests.status` là String, không cần schema mới.
- Contractor `ACCEPT`/`REJECT` dùng `claimPending` = `updateMany` WHERE `contractor` + `PENDING`.
- `quotationService` đã 409 `'This request was cancelled'`.
- Chat room được tạo lúc **CREATE** (`createRoomForRequest`), không phải lúc accept.
- `ConfirmModal` đã có; thiếu `cancelLabel` nên nút phụ sẽ hiện “Hủy” thay vì “Quay lại”.
- Customer history **không** có nút hủy; `repair-flow-05` trước đây khẳng định không có cancel.
- Không có `PATCH /:id/cancel`.

## 2. Phần còn thiếu (đã bổ sung)

- API cancel chỉ CUSTOMER owner + PENDING, `updateMany` có điều kiện.
- Race với ACCEPT: hai `updateMany` cùng WHERE `status = PENDING`.
- UI history: nút “Hủy yêu cầu”, modal tiếng Việt, loading, chặn double-click.
- Badge “Đã hủy” customer + contractor; ẩn ACCEPT/REJECT khi không PENDING.
- Thông báo contractor `Request cancelled` đúng một lần; lần hai 409 không tạo notify mới.

## 3. File frontend đã sửa

- `frontend/src/pages/customer/RequestHistoryPage.tsx`
- `frontend/src/pages/contractor/ContractorRequestsPage.tsx` (badge CANCELLED)
- `frontend/src/features/chat/services/sprint4.api.ts` (`repairApi.cancel`)
- `frontend/src/components/feedback/ConfirmModal.tsx` (`cancelLabel`)
- `frontend/src/locales/vi/marketplace.json`, `en/marketplace.json`
- `frontend/src/locales/vi/common.json`, `en/common.json` (`status.CANCELLED`, lỗi, notify title)

## 4. File backend đã sửa

- `backend/src/repositories/conversation.postgres.js` — `claimCustomerPending`; hydrate `status` sau persist
- `backend/src/services/repairService.js` — `cancelPending`
- `backend/src/controllers/repairController.js` — `cancel`
- `backend/src/routes/repairRoutes.js` — `PATCH /:id/cancel` `authorize(CUSTOMER)`
- `backend/src/tests/cancel-pending.test.js` (mới)
- `backend/src/tests/repair-flow-05.test.js`
- `backend/scripts/dev-db/run-prompt21-cancel-pending-http.js` (mới)

## 5. API thực tế

`PATCH /api/repair-requests/:id/cancel`

- Auth JWT; role CUSTOMER.
- Claim: `updateMany` WHERE id + customer + `PENDING` → `CANCELLED`.
- 404 không tồn tại; 403 không phải chủ; 409 đã `CANCELLED` hoặc không còn PENDING.
- Không xóa row, room, message, notification cũ; không đụng payments/commissions.

## 6. Database

Không đổi Prisma schema / enum. `BuilMate_dev` :55433. Row E2E:

`legacy_mongo_id=0e061893c143d608abe854f9` status `CANCELLED`, 1 chat room, 1 notification `Request cancelled`.

Fixture DEV `prompt21.other@buildmate.test` (customer thứ hai cho test 403). Không đụng `BuilMate_test`.

## 7–10. Kiểm thử

Xem bảng STT dưới. Source GREEN. HTTP+PG 40/40. Browser sequential PASS. Race 2/2 đúng một winner. Regression MRL list 200, store chat room 200, payments 13→13, commissions 4→4.

## 11. Tổng

| Lớp | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Source (`cancel-pending` + `repair-flow-05`) | 18 | 0 | 3 |
| HTTP + PostgreSQL DEV | 40 | 0 | 0 |
| Browser sequential | 3 | 0 | 0 |

SKIP source: unauth mặc định origin `:5000`; isolated `BuilMate_test` không dùng trong lượt DEV.

## 12. Lỗi còn lại

- Hai vòng race HTTP đều CANCEL thắng / ACCEPT 409. ACCEPT thắng không quan sát trong 2 lần, nhưng `updateMany` WHERE `PENDING` không cho cả hai 200.
- Tạo request JSON không trả `status` trước hydrate persist; đã gán `doc.status = row.status` sau create. History dùng GET nên không phụ thuộc.
- Dual-tab realtime không chạy (một tab Cursor). Không thuộc Prompt 21.

## 13. Demo PROMPT 17

HEAD demo vẫn `cb88441775c4dfcd518a86500cde82cc4672f4ea`. API demo `:5055` health 200. Lượt này không ghi source trong `BUILDMATE/`. Working tree demo vẫn dirty sẵn từ Prompt 17.

Dừng tại Prompt 21. Không làm Admin COD (Prompt 22).
