# Database inventory

Nguồn: PostgreSQL database BuilMate, schema `public`, đối chiếu `backend/prisma/schema.prisma` ngày 7 Oct 2026.

Có **55** bảng. Khóa chính nội bộ là `bigint`. Id công khai giữ từ MongoDB là `legacy_mongo_id` varchar(24), unique khi có giá trị. Năm bảng nối không có cột `id`; khóa chính của chúng là cặp cột.

## Identity / Account

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `roles` | Bốn role của hệ thống | `id` | — | `code` | ADMIN, CUSTOMER, CONTRACTOR, MATERIAL_STORE_OWNER |
| `users` | Tài khoản đăng nhập | `id` | `role_id` → `roles`, `location_id` → `locations` | `legacy_mongo_id`; `lower(email)`; `phone_number` khi không rỗng | Danh tính, mật khẩu hash, trạng thái tài khoản |
| `locations` | Điểm địa lý dùng chung | `id` | — | — | Địa chỉ, tọa độ, nguồn và trạng thái xác nhận |
| `location_corrections` | Địa chỉ đã xác nhận | `id` | `location_id` → `locations` | `legacy_mongo_id`; `normalized_address` | Nhớ địa chỉ người dùng đã chốt |

## Contractor / Provider

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `contractor_profiles` | Hồ sơ đối tác | `id` | `user_id` → `users`, `location_id` → `locations`, `reviewed_by` → `users` | `legacy_mongo_id`; `user_id` | Một user có tối đa một hồ sơ duyệt |
| `contractor_documents` | Giấy tờ xác minh | `id` | `contractor_profile_id` → `contractor_profiles` | (`contractor_profile_id`, `legacy_mongo_sub_id`) khi sub id có giá trị | CCCD, giấy phép, chứng chỉ |
| `contractor_profile_services` | Dịch vụ hồ sơ chọn | (`contractor_profile_id`, `catalog_service_id`) | cả hai cột là FK | khóa chính ghép | Nối hồ sơ với catalog |
| `contractor_profile_steps` | Bước hoàn thiện hồ sơ | (`contractor_profile_id`, `step_no`) | `contractor_profile_id` | khóa chính ghép | Tiến độ onboarding |
| `contractor_service_areas` | Khu vực phục vụ của hồ sơ | (`contractor_profile_id`, `area_name`) | `contractor_profile_id` | khóa chính ghép | Danh sách khu vực, không còn là mảng |
| `contractor_portfolio_media` | Ảnh hồ sơ | `id` | `contractor_profile_id` | — | Avatar, logo, xưởng, ảnh thi công |
| `contractor_portfolio_projects` | Dự án đã làm | `id` | `contractor_profile_id`, `catalog_service_id` | cặp sub id khi có giá trị | Portfolio |
| `contractor_portfolio_project_images` | Ảnh của dự án | `id` | `portfolio_project_id` | — | Ảnh con của một dự án |
| `contractor_material_categories` | Danh mục vật tư hồ sơ chọn | (`contractor_profile_id`, `material_category_id`) | cả hai cột là FK | khóa chính ghép | Nối hồ sơ cửa hàng với danh mục |

## Store

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `stores` | Gian hàng | `id` | `owner_user_id` → `users`, `location_id` → `locations` | `legacy_mongo_id`; `owner_user_id` | Một user có tối đa một cửa hàng |
| `store_media` | Ảnh công khai của cửa hàng | `id` | `store_id` | — | Gallery và ảnh đội thợ |
| `store_service_areas` | Khu vực phục vụ của cửa hàng | (`store_id`, `area_name`) | `store_id` | khóa chính ghép | Danh sách khu vực của store |

## Service Catalog

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `service_categories` | Danh mục dịch vụ | `id` | — | `name` | Electrical, Plumbing và các nhóm khác |
| `catalog_services` | Dịch vụ chuẩn của nền tảng | `id` | `service_category_id`, `proposed_by`, `reviewed_by` | `legacy_mongo_id`; `normalized_name`; `code` khi không rỗng | Catalog hệ thống và dịch vụ chờ duyệt |
| `services` | Dịch vụ một cửa hàng đang bán | `id` | `store_id`, `contractor_user_id`, `service_category_id`, `catalog_service_id` | `legacy_mongo_id`; (`store_id`, `catalog_key`) khi key không rỗng | Giá, đơn vị, trạng thái hoàn thiện |
| `service_images` | Ảnh dịch vụ | `id` | `service_id` | — | Ảnh tách khỏi document dịch vụ |
| `service_suggestions` | Đề xuất dịch vụ mới | `id` | `requester_user_id`, `provider_profile_id`, `reviewed_by`, `converted_catalog_service_id` | `legacy_mongo_id` | Hàng chờ admin duyệt catalog |

## Material Catalog

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `material_categories` | Danh mục vật tư | `id` | `owner_user_id`, `store_id` | `legacy_mongo_id`; tên chuẩn của danh mục CUSTOM theo chủ; tên SYSTEM theo `folded_name` | Danh mục chung hoặc của một cửa hàng |
| `materials` | Vật tư đang bán | `id` | `store_id`, `material_category_id` | `legacy_mongo_id` | Giá, tồn, đơn vị, ảnh chính |
| `material_images` | Ảnh phụ của vật tư | `id` | `material_id` | — | Nhiều ảnh cho một vật tư |

## Repair / Chat / Quotation

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `repair_requests` | Yêu cầu sửa chữa | `id` | khách, đối tác, cửa hàng, danh mục, catalog, location | `legacy_mongo_id` | Đầu việc khách gửi |
| `repair_request_media` | File của yêu cầu | `id` | `repair_request_id` | — | Ảnh yêu cầu |
| `chat_rooms` | Phòng chat của yêu cầu | `id` | khách, đối tác, `repair_request_id` | `legacy_mongo_id`; `repair_request_id` | Mỗi yêu cầu tối đa một phòng |
| `messages` | Tin nhắn | `id` | phòng, người gửi, location, báo giá | `legacy_mongo_id` | Nội dung chat |
| `quotations` | Báo giá | `id` | yêu cầu, khách, đối tác, phòng chat | `legacy_mongo_id`; một báo giá `ACCEPTED` cho mỗi yêu cầu | Giá vật tư, nhân công, vận chuyển |
| `quotation_items` | Dòng báo giá | `id` | `quotation_id` | — | Từng khoản trong báo giá |

## Service Order / Payment

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `service_orders` | Đơn dịch vụ | `id` | `quotation_id`, `repair_request_id`, khách, đối tác, cửa hàng, location, người hủy | `legacy_mongo_id`; `order_code`; `quotation_id`; `repair_request_id` | Mỗi báo giá và mỗi yêu cầu có tối đa một đơn |
| `payments` | Thanh toán đơn dịch vụ | `id` | đơn, khách, đối tác | `legacy_mongo_id`; (`service_order_id`, `payment_type`) | Khoản tiền của đơn |
| `commissions` | Hoa hồng của một payment | `id` | `payment_id`, đơn, đối tác | `legacy_mongo_id`; `payment_id` | Mỗi payment có tối đa một dòng hoa hồng |
| `commission_rules` | Tỷ lệ hoa hồng | `id` | — | `legacy_mongo_id`; chỉ một dòng `is_active = true` | Rule đang áp dụng |
| `progress_updates` | Mốc tiến độ | `id` | đơn, actor, location | `legacy_mongo_id` | STARTED, IN_PROGRESS, COMPLETED |
| `progress_media` | Ảnh tiến độ | `id` | `progress_update_id` | — | Ảnh của một mốc |
| `reviews` | Đánh giá sau đơn | `id` | đơn, khách, user được đánh giá | `legacy_mongo_id`; một lần đánh giá cho mỗi bộ đơn, khách, đối tượng và loại | Điểm và nhận xét |
| `review_media` | Ảnh đánh giá | `id` | `review_id` | — | Ảnh kèm review |
| `complaints` | Khiếu nại | `id` | đơn, người tạo, người bị khiếu nại, admin | `legacy_mongo_id` | Khiếu nại gắn đơn dịch vụ |
| `complaint_attachments` | File khiếu nại | `id` | `complaint_id` | — | Ảnh hoặc file đính kèm |

## Material Order

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `material_orders` | Đơn vật tư | `id` | khách, cửa hàng, chủ cửa hàng, địa điểm giao | `legacy_mongo_id`; `order_code` | Tiền hàng, ship, cọc, phần còn lại |
| `material_order_items` | Dòng hàng | `id` | đơn, vật tư | — | Tên và giá chụp lúc đặt |
| `material_order_payments` | Đặt cọc | `id` | đơn, khách, chủ cửa hàng | `legacy_mongo_id`; `material_order_id` | Mỗi đơn tối đa một payment |
| `material_order_status_history` | Lịch sử trạng thái | `id` | đơn, actor | — | Ai đổi trạng thái, lúc nào |
| `material_commissions` | Hoa hồng đặt cọc vật tư | `id` | payment, đơn, chủ cửa hàng | `legacy_mongo_id`; `material_order_payment_id` | Mỗi payment tối đa một commission |

## eKYC

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `contractor_ekyc_verifications` | Hồ sơ eKYC hiện tại | `id` | `user_id`, `contractor_profile_id`, admin reviewer | `legacy_mongo_id`; `user_id`; `contractor_profile_id` | OCR, liveness, so khớp mặt, quyết định admin |
| `ekyc_attempts` | Lần nộp đã lưu | `id` | hồ sơ eKYC, admin | cặp sub id khi có giá trị | Lịch sử một lần nộp |
| `ekyc_liveness_frames` | Ảnh liveness hiện tại | `id` | hồ sơ eKYC | (`ekyc_verification_id`, `direction`) | Một ảnh cho mỗi hướng |
| `ekyc_ocr_issues` | Lỗi OCR hiện tại | `id` | hồ sơ eKYC | — | Từng lỗi, không gom một chuỗi |
| `ekyc_attempt_liveness_frames` | Ảnh liveness của lần nộp cũ | `id` | `ekyc_attempt_id` | (`ekyc_attempt_id`, `direction`) | Ảnh lịch sử |
| `ekyc_attempt_ocr_issues` | Lỗi OCR của lần nộp cũ | `id` | `ekyc_attempt_id` | — | Lỗi lịch sử |

## System / Administration

| Table | Purpose | Primary key | Foreign keys quan trọng | Unique quan trọng | Vai trò nghiệp vụ |
| --- | --- | --- | --- | --- | --- |
| `audit_logs` | Nhật ký quản trị | `id` | `actor_user_id` → `users` | `legacy_mongo_id` | Ai làm gì, trên đối tượng nào |
| `notifications` | Thông báo trong app | `id` | `user_id` | `legacy_mongo_id` | Hộp thư của user |
| `policies` | Chính sách | `id` | `created_by` | `legacy_mongo_id`; một bản ACTIVE cho mỗi loại và ngôn ngữ | Điều khoản đang soạn hoặc đang hiệu lực |
| `policy_revisions` | Lịch sử sửa chính sách | `id` | `policy_id`, `edited_by` | `legacy_mongo_id` | Bản nội dung trước mỗi lần sửa |
