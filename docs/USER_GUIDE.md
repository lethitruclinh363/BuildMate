# Hướng dẫn người dùng BuildMate

BuildMate kết nối khách hàng, nhà thầu và cửa hàng vật liệu tại Cần Thơ. Giao diện mặc định tiếng Việt; chuyển English bằng 🇻🇳 VI | 🇬🇧 EN.

Tài liệu này dành cho người dùng cuối và hội đồng demo. Chi tiết kỹ thuật: [API.md](./API.md), [DATABASE.md](./DATABASE.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

## Vai trò

```
Customer
    |
Contractor
    |
Material Store Owner
    |
Admin
```

| Đăng nhập | Việc chính |
| --- | --- |
| Khách hàng | Bản đồ → yêu cầu sửa chữa → chat → chấp nhận báo giá → cọc → nghiệm thu |
| Nhà thầu | Cửa hàng dịch vụ → nhận yêu cầu → báo giá → cập nhật tiến độ |
| Chủ cửa hàng vật liệu | Cửa hàng vật liệu và danh mục |
| Quản trị viên | Duyệt đối tác, xem thống kê |

## Luồng sửa chữa

```
Customer Request
    ↓
Contractor Quotation
    ↓
Deposit
    ↓
Repair Job
    ↓
Contractor Progress Update
    ↓
Customer Acceptance
```

## Tài khoản demo

Mật khẩu khách, nhà thầu và cửa hàng: `Demo@1234`. Admin: `Admin@1234`.

1. `oscar.d@example.net` — khách hàng.
2. `anphu@buildmate.vn` — An Phu Construction (nhà thầu, đã duyệt).
3. `materials@buildmate.vn` — Can Tho Materials (cửa hàng vật liệu).
4. `admin@buildmate.vn` — quản trị viên.

## Luồng khách hàng

1. Đăng nhập → Trang chủ.
2. Khám phá bản đồ. Ghim công trình hoặc dùng GPS.
3. Mở hồ sơ nhà thầu → **Yêu cầu sửa chữa**.
4. Chat. Nhận thẻ báo giá → **Chấp nhận**.
5. Thanh toán cọc, theo dõi tiến độ nhà thầu, rồi **nghiệm thu**.

## Luồng nhà thầu

1. Đăng nhập → hoàn tất xác minh nếu hồ sơ chưa duyệt.
2. Cửa hàng dịch vụ và danh mục dịch vụ.
3. Nhận yêu cầu, chat, tạo báo giá.
4. Khi khách chấp nhận, nhận việc và đăng tiến độ (`STARTED`, `IN_PROGRESS`, `COMPLETED`).

## Màn hình không để trống

Mọi danh sách có trạng thái đang tải, rỗng, lỗi và (khi phù hợp) thành công. Nếu API lỗi, dùng **Thử lại** hoặc toast góc phải.

## Mobile web

Landing, đăng nhập, bản đồ, chat, dashboard dùng menu hamburger dưới ~768px. Bộ lọc marketplace là ngăn kéo bên phải.
