# Demo script — BuildMate Sprint 4.5

Thời lượng gợi ý: 8–12 phút. Seed trước: `cd backend && npm run seed`.

## 0. Mở scene

- Web: `http://localhost:5173`
- Chỉ Construction OS: navy, copper, giấy blueprint. Không đổi branding.

## 1. Landing + i18n (45s)

- Hero, Why, How, Services.
- Đổi VI → EN rồi trở lại VI.
- Bấm khám phá nhà thầu và cửa hàng gần bạn.

## 2. Marketplace (2 phút)

Đăng nhập `oscar.d@example.net` / `Demo@1234`.

- `/customer/explore`
- GPS hoặc ghim Ninh Kiều.
- Gần Ninh Kiều: An Phu Construction (nhà thầu) và Can Tho Materials (cửa hàng vật liệu).
- Mở **Bộ lọc**: Waterproofing, rating 4+, loại Dịch vụ.
- Click marker → thẻ nearby → hồ sơ công khai (chứng chỉ, portfolio).

## 3. Repair + chat + quotation (4 phút)

Tài khoản khách đã seed:

- Lịch sử: “Bathroom leak…” **ACCEPTED**.
- Mở chat An Phu: có ảnh hiện trạng, tin nhắn, thẻ báo giá 4.210.000đ.
- Báo giá chống thấm An Phu đã được chấp nhận.
- Bấm **Chấp nhận** → Confirm modal → toast thành công.
- Chuông: badge số chưa đọc. **Xem tất cả**.

Luồng live (nếu thời gian): tạo yêu cầu mới từ hồ sơ An Phu, gửi ảnh, chuyển tab `paula.r@example.org`, nhận request, gửi quotation.

## 4. Hồ sơ (1 phút)

`/customer/profile`: trạng thái ACTIVE, đổi SĐT, không đổi email. Không bắt buộc upload avatar trên máy chiếu.

## 5. Admin (1 phút)

`ivan.p@example.net` / `Admin@1234`

- `/admin/verification`: hồ sơ đối tác đang chờ duyệt.
- Duyệt hoặc từ chối (cần lý do).
- API `GET /api/admin/audit-logs` ghi `ADMIN_APPROVE` / `ADMIN_REJECT`.

## 6. Orders — Sprint 5 (2 phút)

Customer `/customer/orders` → đơn chống thấm seed. Timeline:

Customer Request → Contractor Quotation → Deposit → Repair Job → Contractor Progress Update → Customer Acceptance.

Contractor `/contractor/orders` → nhận việc và cập nhật tiến độ.

Customer nghiệm thu khi nhà thầu đã đánh dấu hoàn thành (`COMPLETED` → `CUSTOMER_ACCEPTED`).

## 7. Production-ready notes (30s)

- Helmet, CORS theo `CLIENT_URL`, rate limit `/api` + `/api/auth`.
- `/api/v1` là alias không phá `/api`.
- Upload: tên file ngẫu nhiên, chặn `.exe`.
- Error boundary nếu UI crash.

## Nếu kẹt

| Hiện tượng | Xử lý |
| --- | --- |
| Bản đồ trống | Nới 10 km, ghim [10.045, 105.746] |
| Không có quotation | `npm run seed` lại |
| Socket chết | Backend đang chạy cổng 5000, frontend proxy `/socket.io` |
| 401 liên tục | Xóa `localStorage` key `buildmate-auth` |
