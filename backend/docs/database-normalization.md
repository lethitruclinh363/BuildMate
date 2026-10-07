# Database normalization

Nguồn là schema `public` đang chạy. Tài liệu này giải thích 1NF, 2NF và 3NF bằng các bảng thật của BuildMate. Không kết luận BCNF.

## 1NF

Mỗi cột giữ một giá trị. Những mảng từng nằm trong document MongoDB đã thành bảng con. Một dòng vật tư không còn chứa một mảng URL. Ảnh nằm ở `material_images`, mỗi dòng một `file_url` và một `sort_order`.

Các bảng con cùng kiểu:

| Dữ liệu lặp trước đây | Bảng hiện tại |
| --- | --- |
| Ảnh vật tư | `material_images` |
| Ảnh dịch vụ | `service_images` |
| Ảnh yêu cầu sửa chữa | `repair_request_media` |
| Ảnh đánh giá | `review_media` |
| Ảnh tiến độ | `progress_media` |
| File khiếu nại | `complaint_attachments` |
| Giấy tờ đối tác | `contractor_documents` |
| Khu vực phục vụ của hồ sơ | `contractor_service_areas` |
| Khu vực phục vụ của cửa hàng | `store_service_areas` |
| Ảnh cửa hàng | `store_media` |
| Dòng hàng | `material_order_items` |
| Dòng báo giá | `quotation_items` |
| Lỗi OCR | `ekyc_ocr_issues` |
| Ảnh liveness | `ekyc_liveness_frames` |

`contractor_service_areas` có khóa (`contractor_profile_id`, `area_name`). Mỗi khu vực là một dòng, không phải một phần tử trong mảng.

## 2NF

2NF xét các bảng có khóa ghép. Cột không khóa phải phụ thuộc vào toàn bộ khóa, không chỉ một phần.

`contractor_profile_services` có khóa (`contractor_profile_id`, `catalog_service_id`). Cột thêm là `selection_status` và `created_at`. Trạng thái chọn phụ thuộc vào cặp hồ sơ và dịch vụ. Tên dịch vụ không nằm ở bảng này; tên nằm ở `catalog_services`.

`contractor_material_categories` có khóa (`contractor_profile_id`, `material_category_id`). `selection_status` phụ thuộc cả hai vế. Tên danh mục nằm ở `material_categories`.

`contractor_profile_steps` có khóa (`contractor_profile_id`, `step_no`). `is_completed` chỉ có nghĩa với đúng hồ sơ và đúng số bước.

`contractor_service_areas` và `store_service_areas` dùng chính `area_name` trong khóa. Không có cột mô tả khu vực phụ thuộc riêng vào hồ sơ hoặc riêng vào tên.

`reviews` không dùng khóa ghép làm khóa chính, nhưng unique (`service_order_id`, `customer_user_id`, `target_user_id`, `target_type`) chặn đánh giá trùng. Điểm và nhận xét mô tả đúng lần đánh giá đó.

## 3NF

Thông tin mô tả dùng lại được tách khỏi giao dịch. Giao dịch giữ khóa ngoại và, khi cần đóng băng số liệu, giữ bản chụp.

`users.role_id` trỏ tới `roles`. Tên role không lặp trên từng user.

`catalog_services.service_category_id` và `services.service_category_id` trỏ tới `service_categories`. Tên danh mục chuẩn nằm một nơi.

`materials.material_category_id` trỏ tới `material_categories`. `materials.store_id` trỏ tới `stores`.

`repair_requests`, `stores`, `users`, `service_orders` và `material_orders` trỏ tới `locations` thay vì nhét địa chỉ và tọa độ vào từng bảng giao dịch.

Hoa hồng không đọc lại rule tại thời điểm báo cáo. `commissions` lưu `rate_snapshot`, `platform_amount` và `contractor_amount`. `commission_rules` chỉ giữ tỷ lệ đang cấu hình. `material_orders` lưu `deposit_rate_snapshot`, `platform_fee_rate_snapshot` và các số tiền của đơn. Đổi rule sau này không viết lại đơn cũ.

`material_order_items` lưu `name_snapshot` và `price_snapshot` bên cạnh `material_id`. Đổi tên hoặc giá vật tư không đổi dòng đơn đã đặt. Đây là bản chụp giao dịch, không phải phụ thuộc bắc cầu cần tách thêm.

`service_orders.quotation_id` trỏ tới `quotations`. `service_orders.amount` là số tiền của đơn tại lúc tạo. Báo giá giữ `material_cost`, `labor_cost`, `transport_cost` và `total_cost` của riêng báo giá đó.
