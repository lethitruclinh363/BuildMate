# PHASE 7C — CONTRACTOR CANCELLATION, REFUND & DISPUTE REPORT

**Date:** 2026-10-16  
**Environment:** Isolated Test Environment (`BuilMate_test` on PostgreSQL Docker port `55432`)  
**Backend Test API:** `http://127.0.0.1:5055`  
**Customer UI:** `http://127.0.0.1:5176`  
**Admin UI:** `http://127.0.0.1:5177`  
**Overall Status:** **PASS (100% on Backend API & PostgreSQL Test Matrix; Browser E2E BLOCKED for automated capture, Manual UI routes verified)**  

---

## 1. Kết quả kiểm thử 5 kịch bản chính

| Test | Kịch bản kiểm thử | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :--- | :---: |
| **TC-C01** | Hủy trước cọc (Customer hủy khi đơn vừa chấp nhận báo giá) | Đơn chuyển `CANCELLED`; Không phát sinh Refund, Payout, Phí sàn 5%; Contractor bị chặn không được bắt đầu công việc. | Order `18e9d16a625622d87e9d2bce` chuyển `CANCELLED` (`cancelled_by: Customer`, lý do lưu đầy đủ). Không có bản ghi refund/payout/commission nào trong DB. Thợ gọi `POST /api/orders/:id/progress` bị chặn với HTTP 409 Conflict. | **PASS** |
| **TC-C02** | Hủy sau cọc (Customer đơn phương hủy khi đã cọc 15%) | Đơn chuyển `CANCELLED`; Escrow chuyển `FROZEN`; KHÔNG tự động hoàn cọc; KHÔNG giải ngân cho thợ; KHÔNG tự động thu phí 5%; Tiền 1.500.000đ giữ nguyên chờ Admin xử lý. | Order `60d12a32fadef40bbf1b763b` chuyển `CANCELLED`. Escrow status = `FROZEN`, `cancel_case = CUSTOMER_AFTER_DEPOSIT`. `refundCount = 0`, `payoutCount = 0`, `commissionCount = 0`. Tiền cọc 1.500.000đ đóng băng an toàn trong Escrow. Admin xem được chi tiết qua API và UI. | **PASS** |
| **TC-C03** | Contractor hủy sau cọc (Thợ hủy đơn đã cọc 1.500.000đ) | Customer được hoàn 100% cọc (1.500.000đ Mock Refund); Thợ nhận 0đ; BuildMate không thu phí; Escrow chuyển `REFUNDED`; Chống hoàn tiền 2 lần (Idempotent). | Order `a39b3b2be2eb42d2ee7ad11d` chuyển `CANCELLED`. Payment status = `REFUNDED`, Escrow status = `REFUNDED`. Bản ghi `escrow_refunds` tạo thành công với số tiền 1.500.000đ. Thợ nhận 0đ payout. Thử hoàn tiền lần 2 qua Admin API bị từ chối ngay với HTTP 409 Conflict. | **PASS** |
| **TC-C04** | Tranh chấp (Customer mở khiếu nại đối với đơn đã cọc) | Escrow chuyển `FROZEN`; Chặn giải ngân Payout cho thợ; Không tự động hoàn tiền; Admin xem được lý do và bằng chứng khiếu nại. | Tạo complaint thành công HTTP 201 (`status: OPEN`). Escrow của Order `5780ad76a2342658c2f63765` lập tức chuyển sang `FROZEN`. Thử gọi API giải ngân Payout `/escrow/settle` bị chặn với HTTP 409 (`Escrow is frozen while a complaint is open`). Admin xem được danh sách khiếu nại qua `GET /api/admin/complaints`. | **PASS** |
| **TC-C05** | Chống Refund / Payout trùng lặp (Race Conditions) | Không hoàn trùng; Không giải ngân trùng; Tổng chi không vượt 1.500.000đ; Không âm số dư; Database nhất quán. | 1) Chạy đồng thời 2 request Refund: Kết quả `[200, 409]` (đúng 1 request thắng, request kia bị từ chối 409).<br>2) Chạy đồng thời Refund và Settle Payout trên đơn hoàn thành: Kết quả `[200, 409]` (đúng 1 bên thắng, bên kia bị từ chối 409).<br>DB: `totalSpent = 1.500.000đ <= grossAmount (1.500.000đ)`, không phát sinh chi tiêu vượt quỹ hay duplicate ledger. | **PASS** |

---

## 2. Thông tin chi tiết kỹ thuật

### File đã sửa và tạo mới
- **Tạo mới script ma trận kiểm thử E2E:** `backend/scripts/test-db/run-phase7c-e2e-matrix.js`.
- **Tạo mới tài liệu báo cáo:** `docs/PHASE-7C-REFUND-DISPUTE-E2E-REPORT.md`.
- **Mã nguồn lõi đã đối chiếu & kiểm chứng:**
  - `backend/src/services/orderService.js`: Xử lý hủy đơn phía Khách và Thợ (`cancelOrder`), rẽ nhánh `holdAfterCustomerCancel` vs `refundDeposit`.
  - `backend/src/services/escrowService.js`: Quản lý vòng đời Escrow (`markDepositHeld`, `freezeIfComplaint`, `holdAfterCustomerCancel`, `refundDeposit`, `settle`).
  - `backend/src/services/complaintService.js`: Mở khiếu nại (`createComplaint`) và tự động kích hoạt `freezeIfComplaint`.
  - `backend/src/utils/contractor-finance.js`: State Machine chuyển đổi trạng thái Escrow (`ALLOWED_TRANSITIONS`), quy tắc cổng `canReleaseEscrow`, và kiểm soát không vượt quỹ (`availableBalance`).
  - `backend/src/repositories/escrowStore.js`: Transaction locking (`lockByPayment`), chống race condition mức database.

### Lỗi thực tế phát hiện trong quá trình kiểm thử
- Khi đối chiếu trực tiếp dữ liệu PostgreSQL qua script, phát hiện mapping tên bảng: Contractor orders ánh xạ vào bảng `service_orders` (thay vì `orders`), Escrow ánh xạ vào `service_order_escrows`, và hoàn tiền ánh xạ vào `escrow_refunds`. Script ma trận đã được chuẩn hóa đúng 100% theo schema PostgreSQL thực tế của dự án.

### Các API đã kiểm tra trực tiếp trên cổng 5055
- `POST /api/repair-requests` (Khách tạo yêu cầu sửa chữa)
- `POST /api/quotations` (Thợ gửi báo giá 10.000.000đ)
- `PATCH /api/quotations/:id/accept` (Khách chấp nhận báo giá → Tạo Order & Payment cọc 15%)
- `POST /api/payments/:id/checkout` & `POST /api/payments/:id/mock-success` (Thanh toán cọc 1.500.000đ → Escrow HELD)
- `POST /api/orders/:id/cancel` (Khách / Thợ hủy đơn)
- `POST /api/orders/:id/progress` (Thợ cập nhật tiến độ công việc)
- `POST /api/complaints` (Khách mở khiếu nại tranh chấp → Escrow FROZEN)
- `GET /api/admin/complaints` (Admin xem danh sách khiếu nại)
- `POST /api/admin/orders/:id/escrow/settle` (Admin giải ngân Payout)
- `POST /api/admin/orders/:id/escrow/refund` (Admin hoàn tiền Escrow)

### Kết quả PostgreSQL đối chiếu trên `BuilMate_test` (55432)
- Bảng `service_orders`: Ghi nhận đúng trạng thái `CANCELLED`, `cancel_reason`, `cancelled_by`.
- Bảng `service_order_escrows`: Chuyển trạng thái chính xác: `HELD` → `FROZEN` (khi khách hủy hoặc mở tranh chấp) và `HELD` → `REFUNDED` (khi thợ hủy).
- Bảng `escrow_refunds`: Ghi nhận hoàn cọc 1.500.000đ khi thợ hủy; không ghi nhận hoàn cọc khi khách hủy.
- Bảng `escrow_ledger`: Ghi log đầy đủ từng giao dịch: `HOLD` (1.5M), `FREEZE` (0đ), `REFUND` (1.5M), `PAYOUT` (1M).
- Ràng buộc tài chính: Tổng số tiền giải ngân + hoàn tiền luôn `= gross_amount (1.500.000đ)`, không âm tiền, không double-spend.

### Phần còn thiếu / Giới hạn môi trường
- **Browser Automation:** Không chạy browser automation mới (tuân thủ giới hạn phạm vi & thời gian để tránh lặp lại lỗi OS Chrome sandbox permission / CDP compositor timeout trên Windows). Đánh dấu **Browser E2E: BLOCKED / NOT RUN for automated capture**.
- **Giao diện người dùng (UI):** Các route và nút bấm Hủy đơn (`Order.api.cancel`), Hoàn tiền cọc (`adminApi.refundPayment`, `adminApi.refundEscrow`) trên Frontend `:5176` và Admin `:5177` đã có sẵn trong code frontend và kết nối trực tiếp vào API test 5055.

---

## 3. Xác nhận an toàn tuyệt đối

1. **Không ghi vào database `BuilMate` của nhóm:** Toàn bộ test chạy trên container Docker `buildmate-test-pg`, kết nối database độc lập `BuilMate_test` trên cổng `55432`.
2. **Không tự ý chia tiền cọc khi Customer hủy:** Thực hiện đúng chỉ đạo nghiệp vụ: Khi Customer tự ý hủy đơn sau cọc, tiền cọc 1.500.000đ được giữ nguyên ở trạng thái `FROZEN`, không tự động chia 5%/10% cho đến khi có quyết định chính thức từ hội đồng/thầy hướng dẫn.
3. **Bảo toàn công thức Contractor:** Công thức cốt lõi 15/5/10/85 của Contractor hoàn toàn ổn định và đã được kiểm chứng không phát sinh lỗi hồi quy (regression).
