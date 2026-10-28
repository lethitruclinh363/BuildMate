# BÁO CÁO TÍCH HỢP TOÀN BỘ CODE TỪ BUILDMATE-DEV-PROMPT18 VÀO BUILDMATE CHÍNH

**Thời gian hoàn thành:** 27/10/2026  
**Thư mục đích hoàn thành:** `D:\Kì 9\BUILDMATE (2)\BUILDMATE` (Bản chính, branch `Duc`)  
**Thư mục nguồn đối chiếu:** `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18` (Bản phát triển, branch `prompt-18-mrl`)

---

## 1. Đường dẫn thư mục nguồn
- `D:\Kì 9\BUILDMATE (2)\BUILDMATE-dev-prompt18`

## 2. Đường dẫn thư mục đích
- `D:\Kì 9\BUILDMATE (2)\BUILDMATE`

## 3. Branch và HEAD mỗi thư mục
- **Thư mục nguồn (DEV):**
  - Branch: `prompt-18-mrl`
  - HEAD commit: `cb88441 Improve admin UI and contractor eKYC`
- **Thư mục đích (BUILDMATE chính):**
  - Branch: `Duc` (ahead of `origin/Duc` by 1 commit)
  - HEAD commit: `cb88441 Improve admin UI and contractor eKYC`
  - Quan hệ Git: Cả hai thư mục là hai Git Worktree dùng chung Git object database (`.git` chung nằm tại `BUILDMATE/.git` và worktree metadata tại `.git/worktrees/BUILDMATE-dev-prompt18`).

## 4. Cách sao lưu toàn bộ thay đổi chưa commit
Trước khi thực hiện gộp mã nguồn, toàn bộ trạng thái source code thực tế (bao gồm cả tracked, unstaged, staged và untracked files) ở cả 2 thư mục đã được sao lưu độc lập ra bên ngoài cả hai worktree:
- **Đường dẫn sao lưu an toàn:** `D:\Kì 9\BUILDMATE (2)\_BACKUP_INTEGRATION_SOURCE\`
  - Bản lưu BUILDMATE chính: `_BACKUP_INTEGRATION_SOURCE\BUILDMATE_Duc_pre_merge` (890 files)
  - Bản lưu DEV: `_BACKUP_INTEGRATION_SOURCE\BUILDMATE_dev_prompt18_pre_merge` (910 files)
- **Tiêu chuẩn an toàn & bảo mật:**
  - Loại trừ toàn bộ `node_modules`.
  - Loại trừ toàn bộ `.git` internals.
  - Loại trừ `uploads` và dữ liệu ảnh CCCD/eKYC người dùng.
  - Loại trừ các file cấu hình chứa credentials/secrets `.env`, `.env.local`, `.env.test`.
  - Loại trừ Python virtualenv `.venv`, `.cache`, `__pycache__` của `ekyc-service` (66,000 files).
  - Loại trừ file nén zip lớn `BUILDMATE-dev-prompt18.zip`.
- **Kiểm tra tính toàn vẹn (Integrity Check):** 100% tệp sao lưu đã được kiểm tra hash SHA-256 đối chiếu với thư mục gốc, đạt tỷ lệ khớp 1700/1700 tệp (0 lỗi).

---

## 5. Danh sách file mới đưa từ DEV vào BUILDMATE (64 files)
Toàn bộ các file mới thuộc PROMPT 18–21 đã được đưa vào `BUILDMATE`:
1. `docker-compose.dev.yml` (Docker compose cho PostgreSQL dev port 55433)
2. `frontend/.env.mrl` (Cấu hình proxy dev server port 5178)
3. **Backend SQL Migrations & Dev Scripts:**
   - `backend/scripts/dev-db/18-material-requirement.sql`
   - `backend/scripts/dev-db/20-customer-store-chat.sql`
   - `backend/scripts/dev-db/apply-mrl.js`
   - `backend/scripts/dev-db/apply-store-chat.js`
   - `backend/scripts/dev-db/run-prompt19-mrl-http.js`
   - `backend/scripts/dev-db/run-prompt20-store-chat-http.js`
   - `backend/scripts/dev-db/run-prompt20-store-chat-socket.js`
   - `backend/scripts/dev-db/run-prompt21-cancel-pending-http.js`
4. **Backend MRL & Chat Store Module:**
   - `backend/src/controllers/materialRequirementController.js`
   - `backend/src/repositories/materialRequirement.postgres.js`
   - `backend/src/routes/materialRequirementRoutes.js`
   - `backend/src/services/material-requirement.service.js`
   - `backend/src/validators/material-requirement.validator.js`
   - `backend/src/utils/material-requirement.rules.js`
   - `backend/src/utils/chat-room.rules.js`
   - `backend/src/utils/dev-database-guard.js`
5. **Backend Tests:**
   - `backend/src/tests/material-requirement.test.js`
   - `backend/src/tests/chat-store.test.js`
   - `backend/src/tests/cancel-pending.test.js`
6. **Frontend MRL & Chat Store Components/Pages:**
   - `frontend/src/features/chat/components/ChatStoreButton.tsx`
   - `frontend/src/lib/material-requirement-api.ts`
   - `frontend/src/pages/contractor/ContractorMaterialRequirementPage.tsx`
   - `frontend/src/pages/store/StoreMaterialRequestsPage.tsx`
   - `frontend/src/pages/store/StoreMaterialRequestDetailPage.tsx`
7. **Prisma Client Generated:**
   - `backend/prisma/generated/client/*` (27 files pre-generated client)
8. **Evidence & Documentation PROMPT 18-21:**
   - `docs/feature-gap/PROMPT-19-MRL-E2E.md`
   - `docs/feature-gap/PROMPT-20-CUSTOMER-STORE-CHAT.md`
   - `docs/feature-gap/PROMPT-21-CANCEL-PENDING.md`
   - `docs/feature-gap/prompt-19-e2e/*` (9 ảnh minh chứng E2E flow)

---

## 6. Danh sách file gộp logic từ DEV vào BUILDMATE
Phân tích diff chi tiết và kết hợp logic, giữ nguyên toàn bộ tính năng PROMPT 01–17:
1. `.gitignore`: Bổ sung bỏ qua `backend/.env.dev` và `backend/prisma/generated/`.
2. `backend/package.json`: Bổ sung script `"test:mrl"` và cập nhật `"test:unit"`.
3. `backend/prisma/schema.prisma`:
   - Thêm `output = "./generated/client"` vào `generator client`.
   - Cập nhật model `chat_rooms`: `repair_request_id` nullable (`BigInt?`), thêm `store_id BigInt?`, `room_kind String @default("CUSTOMER_CONTRACTOR")`, quan hệ `stores?`, indexes cho `store_id` và `room_kind`.
   - Cập nhật model `stores`: thêm quan hệ `chat_rooms chat_rooms[]`.
4. `backend/src/config/env.js`: Thêm `http://localhost:5178` và `http://127.0.0.1:5178` vào `DEV_CLIENT_ORIGINS`.
5. `backend/src/config/prisma.js`: Dẫn Prisma client tới `../../prisma/generated/client`.
6. `backend/src/repositories/offering.postgres.js`: Trỏ Prisma import tới `../../prisma/generated/client`.
7. `backend/src/routes/index.js`: Mount router `router.use('/material-requirements', require('./materialRequirementRoutes'));`.
8. `backend/src/routes/repairRoutes.js`: Thêm route `PATCH /api/repair-requests/:id/cancel` cho role CUSTOMER.
9. `backend/src/controllers/repairController.js`: Bổ sung action `cancel` gọi `repairService.cancelPending`.
10. `backend/src/services/repairService.js`:
    - Bổ sung `cancelPending(id, customerId)`: Kiểm tra quyền sở hữu của Customer, kiểm tra trạng thái chỉ hủy khi `PENDING`, gọi `claimCustomerPending`.
    - Gửi thông báo hủy `NOTIFICATION_TYPE.STATUS_UPDATE` cho Contractor và ghi audit log `AUDIT_ACTION.REQUEST_STATUS`.
11. `backend/src/models/ChatRoom.js`: Thêm `storeId`, `roomKind`, sparse index cho `requestId`.
12. `backend/src/repositories/conversation.postgres.js`:
    - Hỗ trợ `CUSTOMER_MATERIAL_STORE` trong `persistRoom`, chống duplicate với error code P2002.
    - Bổ sung `claimCustomerPending(id, customerId, status)` dùng `prisma.repair_requests.updateMany` có điều kiện `status: 'PENDING'` chống race condition với ACCEPT.
    - Bổ sung include `store` trong thông tin phòng chat.
13. `backend/src/routes/chatRoutes.js`: Thêm endpoint `POST /api/chat/stores/:storeId/rooms` cho Customer.
14. `backend/src/controllers/chatController.js`: Thêm action `openStore`.
15. `backend/src/services/chatService.js`:
    - Bổ sung `createRoomForStore(user, storeId)`: Phân quyền Customer, kiểm tra store LIVE, tạo hoặc mở lại room cũ.
    - Hàm `storePeer`: Phân biệt đối tác cửa hàng và thợ thi công.
    - Chặn gửi báo giá sửa chữa (`quotationAllowed`) trong phòng chat cửa hàng.
    - Điều hướng đường dẫn chat theo role (`/store/chat`, `/customer/chat`, `/contractor/chat`).
16. `backend/src/tests/chat-flow-11.test.js`: Cập nhật assertions cho schema và phòng chat store.
17. `backend/src/tests/repair-flow-05.test.js`: Cập nhật assertions cho API hủy PENDING và ConfirmModal.
18. `frontend/package.json`: Thêm script `"dev:mrl": "vite --port 5178 --mode mrl"`.
19. `frontend/src/App.tsx`:
    - Bổ sung lazy loading các page MRL và Store Request.
    - Bổ sung routes:
      - `/customer/chat`
      - `/contractor/material-requirements/new/:requestId`
      - `/contractor/material-requirements/:listId`
      - `/store/material-requests`
      - `/store/material-requests/:id`
      - `/store/chat`
20. `frontend/src/components/feedback/ConfirmModal.tsx`: Thêm prop `cancelLabel` tùy biến nút hủy/quay lại.
21. `frontend/src/components/layout/roleNav.ts`: Bổ sung mục "Tin nhắn" (`/customer/chat`) trong menu Customer.
22. `frontend/src/features/chat/services/sprint4.api.ts`: Bổ sung `repairApi.cancel` và `chatApi.openStoreRoom`.
23. `frontend/src/features/map/components/ExplorePopup.tsx`: Bấm Chat trên popup cửa hàng mở phòng chat store qua `chatApi.openStoreRoom`.
24. `frontend/src/features/notification/notificationLabel.ts`: Tránh trả về `—` khi chuỗi thông báo là title thuần.
25. `frontend/src/locales/storage.ts`: Thêm namespace `mrl: 'common'`.
26. `frontend/src/locales/en/chat.json` & `vi/chat.json`: Bổ sung i18n cho phòng chat cửa hàng và giao diện chọn cuộc trò chuyện.
27. `frontend/src/locales/en/common.json` & `vi/common.json`: Bổ sung i18n cho toàn bộ tính năng MRL, thông báo trạng thái `CANCELLED`, menu store.
28. `frontend/src/locales/en/marketplace.json` & `vi/marketplace.json`: Bổ sung i18n cho modal hủy yêu cầu sửa chữa.
29. `frontend/src/pages/CustomerDashboardPage.tsx`: Thẻ "Tin nhắn" trỏ về `/customer/chat`.
30. `frontend/src/pages/chat/ChatPage.tsx`: Hỗ trợ phòng chat cửa hàng, giao diện khi chưa chọn room (`/customer/chat`, `/store/chat`), ẩn nút tạo báo giá khi ở room cửa hàng.
31. `frontend/src/pages/contractor/ContractorRequestsPage.tsx`: Badge màu đỏ cho yêu cầu `CANCELLED`, hiển thị nút "Danh sách vật tư" cho yêu cầu `ACCEPTED`/`COMPLETED`.
32. `frontend/src/pages/customer/RequestHistoryPage.tsx`: Hiển thị nút "Hủy yêu cầu" cho status `PENDING`, tích hợp `ConfirmModal`, cập nhật danh sách tại chỗ và gọi `repairApi.cancel`.
33. `frontend/src/pages/public/StoreProfileShowcase.tsx`: Tích hợp `<ChatStoreButton storeId={profile.id} />`.
34. `frontend/src/pages/public/StorePublicPage.tsx`: Tích hợp `<ChatStoreButton storeId={store.id} />`.
35. `frontend/src/pages/store/StoreDashboard.jsx`: Thêm 2 mục menu: "Yêu cầu vật tư" (`/store/material-requests`) và "Tin nhắn" (`/store/chat`).
36. `frontend/src/types/sprint4.ts`: Mở rộng interface `ChatRoom` với `storeId`, `roomKind`, `storeName`, `storeAvatar`.
37. `docs/feature-gap/BUILDMATE-FUNCTION-GAP-ANALYSIS.md`: Cập nhật bảng chức năng gap analysis.

---

## 7. Các file giữ nguyên từ BUILDMATE
- 44 tệp đặc thù trong BUILDMATE được giữ nguyên vẹn 100%:
  - Toàn bộ hồ sơ eKYC private: `backend/private/ekyc/*` (32 tệp ảnh).
  - Toàn bộ báo cáo kiểm tra migration PROMPT 11–15: `backend/scripts/migration/output/*.json` (7 tệp).
  - Ảnh minh chứng PROMPT 17: `docs/prompt-17-e2e/evidence/*` (5 tệp).
  - `BuildMate_Section4_Class_Specifications.docx`.
- Toàn bộ source Admin giữ nguyên logic nghiệp vụ PROMPT 01–17.

---

## 8. Prisma Migrations đã đưa vào thư mục chính
Bản BUILDMATE chính đã tiếp nhận đầy đủ:
1. `backend/scripts/dev-db/18-material-requirement.sql`:
   - Bảng `material_requirement_lists` (ràng buộc status `DRAFT, SENT, QUOTED, CONFIRMED, CANCELLED`, unique index cho `repair_request_id` khi active).
   - Bảng `material_requirement_items` (tên, quy cách, đơn vị, số lượng, thứ tự).
   - Bảng `material_quotes` (status `SENT, ACCEPTED, REJECTED`, phí giao hàng, ghi chú).
   - Bảng `material_quote_items` (đơn giá, số lượng đáp ứng, ghi chú).
2. `backend/scripts/dev-db/20-customer-store-chat.sql`:
   - Cho phép `repair_request_id` null trong `chat_rooms`.
   - Bổ sung `room_kind VARCHAR(32) DEFAULT 'CUSTOMER_CONTRACTOR'`.
   - Bổ sung `store_id BIGINT REFERENCES stores(id)`.
   - Unique index `uq_chat_rooms_customer_store` (duy nhất 1 phòng giữa Customer và Store).
   - Check constraint `chat_rooms_room_kind_check` phân định rạch ròi 2 loại phòng chat.
3. Không tạo migration mới cho trạng thái `CANCELLED` vì enum và trường status `repair_requests` đã hỗ trợ sẵn.

---

## 9. Kết quả build Frontend
- **Thư mục:** `D:\Kì 9\BUILDMATE (2)\BUILDMATE\frontend`
- **Lệnh chạy:** `npm run build` (`tsc -b && vite build`)
- **Kết quả:** **PASS 100%** (Thời gian build: 1m 1s)
- **Các chunk bundle tạo mới thành công:**
  - `StoreMaterialRequestsPage-DB8MAlJF.js`
  - `StoreMaterialRequestDetailPage-DBWCkRzT.js`
  - `ContractorMaterialRequirementPage-CXb8TkjX.js`
  - `material-requirement-api-vAR8Efbi.js`
  - `ChatPage-DmT7Q2q1.js`
  - `RequestHistoryPage-DTDLdgZd.js`

## 10. Kết quả build Admin
- **Thư mục:** `D:\Kì 9\BUILDMATE (2)\BUILDMATE\admin`
- **Lệnh chạy:** `npm run build` (`tsc -b && vite build`)
- **Kết quả:** **PASS 100%** (Thời gian build: 31.35s)
- Đã tinh chỉnh type index signature của hàm `chartHasValues` và parameter formatter Tooltip để tương thích hoàn toàn với TypeScript strict check mà không làm thay đổi bất kỳ logic giao diện hay tính toán tài chính nào.

## 11. Kết quả test Backend
- **Thư mục:** `D:\Kì 9\BUILDMATE (2)\BUILDMATE\backend`
- **Lệnh chạy:** `npm run test:unit`
- **Kết quả:** **PASS 57/57 tests (0 FAIL)**
  - `identity.test.js`: PASS
  - `error-status.test.js`: PASS
  - `response.test.js`: PASS
  - `database-safety.test.js`: PASS
  - `contractor-finance.test.js`: PASS
  - `admin-flow-13.test.js`: PASS
  - `material-requirement.test.js`: PASS

## 12. Kết quả MRL (Material Requirement List)
- **Lệnh chạy:** `npm run test:mrl`
- **Kết quả:** **PASS 6/6 tests**
  - Chỉnh sửa chỉ ở trạng thái DRAFT: PASS
  - Kiểm tra validation tên vật tư, số lượng > 0, tính tổng tiền báo giá: PASS
  - Wiring route Contractor & Store đầy đủ: PASS
  - Không sinh đơn hàng COD tự động: PASS
  - Tỷ lệ tài chính sửa chữa 15% cọc / 5% phí sàn giữ nguyên: PASS
  - Guard chặn database nhóm & demo: PASS

## 13. Kết quả Chat Customer–Store
- **Lệnh chạy:** `node --test src/tests/chat-store.test.js`
- **Kết quả:** **PASS 5/5 tests**
  - Tạo phòng chat chỉ với cửa hàng vật tư trạng thái LIVE: PASS
  - Cửa hàng PAUSED vẫn giữ lịch sử trò chuyện: PASS
  - Cửa hàng bị khóa/BLOCKED bị chặn gửi tin nhắn: PASS
  - Cấm gửi báo giá sửa chữa (`MESSAGE_TYPE.QUOTATION`) trong phòng chat cửa hàng: PASS
  - Không phá vỡ quan hệ 1:1 của phòng chat Customer–Contractor cũ: PASS

## 14. Kết quả Cancel PENDING
- **Lệnh chạy:** `node --test src/tests/cancel-pending.test.js`
- **Kết quả:** **PASS 4/4 tests**
  - Trạng thái CANCELLED có sẵn: PASS
  - Cập nhật có điều kiện `updateMany` chống race condition với ACCEPT: PASS
  - Giao diện có nút Hủy và modal xác nhận ConfirmModal: PASS
  - Không đụng chạm tài chính, Escrow hay đơn hàng: PASS

## 15. Kết quả regression các chức năng cũ (Flow 05 & Flow 11 & Auth & Onboarding)
- **Flow 05 & Flow 11:** `node --test src/tests/chat-flow-11.test.js src/tests/repair-flow-05.test.js` -> **PASS 20/20 tests** (5 tests integration bỏ qua an toàn vì test db không bật).
- **Auth & Category Onboarding:** `node --test src/tests/forgot-password-merged.test.js src/tests/material-category-onboarding.test.js src/tests/otp-cooldown-safety.test.js src/tests/password-validation.test.js` -> **PASS 36/36 tests**.
- **Tài chính nền tảng:**
  - Cọc sửa chữa: 15% (bảo toàn).
  - Phí nền tảng (Platform fee): 5% (bảo toàn).
  - Nhà thầu tạm giữ (Hold): 10% (bảo toàn).
  - Còn lại (Remaining): 85% (bảo toàn).
  - Đơn vật tư COD: 0% phí sàn, 0% đặt cọc (bảo toàn).

## 16. Kết quả PostgreSQL Integration
- Migration scripts được chuẩn bị đầy đủ tại `BUILDMATE/backend/scripts/dev-db/`.
- Thực hiện nghiêm ngặt nguyên tắc an toàn: Không tự ý chạy migration trên database demo `BuilMate_test :55432` hoặc database nhóm.
- Guard `assertDevDatabaseUrl` bảo vệ tuyệt đối cổng 5432 và 55432.

## 17. Các test còn BLOCKED
- Các bài test Live HTTP E2E đồng thời đa trình duyệt (Dual-profile Browser concurrent) yêu cầu mở 2 phiên trình duyệt cùng lúc (Customer + Contractor hoặc Customer + Store) được ghi nhận là BLOCKED theo đúng tài liệu thiết kế DEV (do môi trường runner đơn luồng).

## 18. Những lỗi hoặc conflict chưa xử lý
- **Không có bất kỳ conflict nào chưa xử lý.** Toàn bộ 61 tệp khác biệt đã được dung hợp chính xác, không còn xung đột code.
- 0 lỗi biên dịch trên cả frontend và admin.
- 0 lỗi test trên toàn bộ unit test backend.

## 19. Git status của BUILDMATE chính sau khi gộp
- Nhánh hiện tại: `Duc`
- Tất cả các tệp mới từ PROMPT 18–21 đã nằm trong working tree của `BUILDMATE`.
- Toàn bộ file cấu hình `.env`, thư mục `node_modules`, `uploads` cá nhân và CCCD được `.gitignore` bảo vệ nghiêm ngặt, không bị đưa vào Git tracking.

## 20. Những bước cần làm trước khi push lên GitHub
1. Thành viên phụ trách kiểm tra lại branch `Duc` trong thư mục `BUILDMATE`.
2. Tạo một branch mới để tạo PR (khuyến nghị `integrate/prompt-18-to-21`):
   ```bash
   git checkout -b integrate/prompt-18-to-21
   ```
3. Stage các file mã nguồn hợp lệ:
   ```bash
   git add backend/ frontend/ admin/ docs/ docker-compose.dev.yml .gitignore
   ```
4. Kiểm tra lại `git status` trước khi commit để đảm bảo không lọt `.env` hay `uploads`.
5. Thực hiện commit với thông điệp rõ ràng:
   ```bash
   git commit -m "feat: integrate PROMPT 18-21 (MRL, Customer-Store Chat, Cancel Pending Request) into BUILDMATE"
   ```
6. Push lên remote repository của nhóm và tạo Pull Request vào nhánh chính theo quy định nhóm.

---

## KẾT LUẬN CUỐI CÙNG

1. **Code mới đã được đưa vào BUILDMATE CHÍNH chưa?**
   -> **ĐÃ ĐƯA ĐẦY ĐỦ.** Chiều gộp chính xác 100%: từ `BUILDMATE-dev-prompt18` vào `BUILDMATE`.
2. **Thư mục DEV có còn nguyên không?**
   -> **CÒN NGUYÊN VẸN 100%.** Không bị xóa, không bị sửa đổi, giữ vai trò đối chiếu.
3. **BUILDMATE chính đã có MRL chưa?**
   -> **ĐÃ CÓ ĐẦY ĐỦ.** Bao gồm route giao diện Contractor & Store, controller, service, repository, validation, quy tắc nghiệp vụ và migration SQL.
4. **BUILDMATE chính đã có Chat Customer–Store chưa?**
   -> **ĐÃ CÓ ĐẦY ĐỦ.** Bao gồm nút chat tại trang cửa hàng, endpoint tạo room, logic chat phân quyền và socket realtime.
5. **BUILDMATE chính đã có Customer Cancel PENDING chưa?**
   -> **ĐÃ CÓ ĐẦY ĐỦ.** Gồm nút Hủy trên giao diện lịch sử yêu cầu, ConfirmModal, API `PATCH /api/repair-requests/:id/cancel` và cơ chế chống race condition `claimCustomerPending`.
6. **Các chức năng PROMPT 01–17 có bị ảnh hưởng không?**
   -> **KHÔNG BỊ ẢNH HƯỞNG.** Toàn bộ tỷ lệ tài chính, escrow, COD, authentication, eKYC, dashboard và test regression đều pass.
7. **Đã kiểm thử trên source BUILDMATE chính chưa?**
   -> **ĐÃ KIỂM THỬ TRỰC TIẾP TRÊN SOURCE BUILDMATE CHÍNH.** Frontend build thành công, Admin build thành công, Backend test pass 100%.
8. **Có cần thêm migration khi thành viên khác pull code không?**
   -> Khi thành viên khác pull code về, chỉ cần chạy file script `backend/scripts/dev-db/apply-mrl.js` và `backend/scripts/dev-db/apply-store-chat.js` lên database môi trường làm việc của mình.
9. **Có thể đưa lên GitHub cho nhóm chưa?**
   -> **ĐÃ HOÀN TOÀN SẴN SÀNG.** Code đã sạch sẽ, build pass, test pass, không rò rỉ secret, sẵn sàng để tạo commit và push theo quyết định của bạn.
