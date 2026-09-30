# Hướng dẫn người dùng & demo BuildMate

BuildMate là nền tảng kết nối khách hàng, nhà thầu và cửa hàng vật liệu tại Cần Thơ. Giao diện mặc định **tiếng Việt**, có thể chuyển **English** bằng nút 🇻🇳 VI | 🇬🇧 EN trên header (không reload). Lựa chọn lưu trong `localStorage` key `buildmate-language`.

## Vai trò trên giao diện

| Giá trị trong DB | Hiển thị |
| --- | --- |
| CUSTOMER | Khách hàng / Chủ nhà |
| CONTRACTOR | Nhà thầu |
| MATERIAL_STORE_OWNER | Chủ cửa hàng vật liệu |
| ADMIN | Quản trị viên |

## Trạng thái trên giao diện

| Giá trị trong DB | Hiển thị |
| --- | --- |
| PENDING / SUBMITTED | Đang chờ / Đang xét duyệt · Pending / In review |
| APPROVED | Đã duyệt |
| REJECTED | Từ chối |

## Đa ngôn ngữ

1. Mở site → mặc định tiếng Việt.
2. Click **EN** → toàn bộ UI sang English, không reload.
3. Refresh → ngôn ngữ giữ nguyên (`localStorage`: `{"language":"vi"|"en"}`).
4. Nếu `User.preferredLanguage` có trên API (tùy chọn, chưa migrate DB) → áp dụng sau đăng nhập.

Thêm ngôn ngữ mới: copy `frontend/src/locales/vi/*.json` sang thư mục mới (ví dụ `ja/`), đăng ký trong `src/locales/i18n.ts`.

## Các màn hình chính

| Đường dẫn | Màn hình |
| --- | --- |
| `/` | Trang giới thiệu |
| `/login` | Đăng nhập |
| `/register` | Đăng ký |
| `/explore` | Khám phá bản đồ (khách) |
| `/customer/dashboard` | Trang chủ chủ nhà |
| `/customer/explore` | Tìm nhà thầu và cửa hàng vật liệu |
| `/contractor/dashboard` | Tổng quan đối tác |
| `/admin/dashboard` | Tổng quan hệ thống |
| `/customer/profile` | Hồ sơ khách hàng |
| `/customer/notifications` | Trung tâm thông báo |
| `/contractor/profile` | Tài khoản nhà thầu |
| Chat | `/customer/chat/:roomId` hoặc `/contractor/chat/:roomId` |
| Báo giá | `/customer/quotation/:id` hoặc tạo từ `/contractor/quotation/create/:requestId` |

## Tài khoản demo

Xem bảng trong `README.md`. Mật khẩu khách/đối tác: `Demo@1234`. Admin: `Admin@1234`.

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

## Demo — bản đồ và báo giá

1. Chạy Mongo, `npm run seed` trong `backend/`, rồi API + Vite.
2. Đăng nhập `oscar.d@example.net` / `Demo@1234` → khám phá quanh Ninh Kiều (`10.045, 105.746`).
3. **An Phu Construction** là nhà thầu (dịch vụ). **Can Tho Materials** (`materials@buildmate.vn`) là cửa hàng vật liệu.
4. Mở yêu cầu chống thấm đã seed với An Phu → chat và báo giá đã chấp nhận.
5. Nhà thầu `anphu@buildmate.vn` cập nhật tiến độ. Khách nghiệm thu khi công việc ở trạng thái hoàn thành của nhà thầu.
6. Admin `admin@buildmate.vn` / `Admin@1234` duyệt đối tác.

## Menu theo vai trò

**Khách hàng:** Trang chủ · Tìm nhà thầu / cửa hàng · Yêu cầu sửa chữa · Đơn sửa chữa · Thông báo · Hồ sơ

**Nhà thầu:** Tổng quan · Hồ sơ · Cửa hàng dịch vụ · Dịch vụ · Yêu cầu · Đơn thi công · Thông báo · Tài khoản

**Chủ cửa hàng vật liệu:** Cửa hàng vật liệu · Danh mục · Thông báo · Tài khoản

**Quản trị viên:** Tổng quan hệ thống · Duyệt đối tác · Thông báo · Tài khoản
