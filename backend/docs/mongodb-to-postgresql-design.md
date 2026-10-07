# MongoDB sang PostgreSQL

MongoDB còn lại là bản lưu cũ. Runtime production đọc và ghi PostgreSQL. Số collection nghiệp vụ khoảng 28. Schema `public` có 55 bảng.

Số bảng tăng vì document được tách, không phải vì cùng một thực thể bị ghi hai lần.

Một document MongoDB thường nhúng mảng và object con. PostgreSQL đưa mỗi phần tử ra một dòng, thêm bảng nối cho quan hệ nhiều-nhiều, và thêm bảng danh mục để không lặp tên role, danh mục, địa điểm.

## Hồ sơ đối tác

Collection `contractorprofiles` trở thành:

| Bảng | Phần từng nằm trong document |
| --- | --- |
| `contractor_profiles` | Thông tin hồ sơ và trạng thái duyệt |
| `contractor_documents` | Mảng giấy tờ |
| `contractor_profile_services` | Dịch vụ hồ sơ chọn, nối với `catalog_services` |
| `contractor_material_categories` | Danh mục vật tư hồ sơ chọn |
| `contractor_service_areas` | Mảng khu vực |
| `contractor_profile_steps` | Các bước hoàn thiện |
| `contractor_portfolio_media` | Ảnh hồ sơ |
| `contractor_portfolio_projects` | Dự án portfolio |
| `contractor_portfolio_project_images` | Ảnh của từng dự án |

`contractor_profiles.user_id` unique. Một user vẫn chỉ có một hồ sơ, giống quan hệ một-một cũ, nhưng giấy tờ và khu vực không còn nằm chung một document.

## Đơn vật tư

Collection `materialOrders` trở thành:

| Bảng | Phần từng nằm trong document |
| --- | --- |
| `material_orders` | Đơn, tiền hàng, phí ship, đặt cọc, phần còn lại |
| `material_order_items` | Mảng dòng hàng, kèm giá và tên tại lúc đặt |
| `material_order_status_history` | Lịch sử đổi trạng thái |
| `material_order_payments` | Khoản đặt cọc |
| `material_commissions` | Hoa hồng của khoản đặt cọc |

`material_order_payments.material_order_id` unique và `material_commissions.material_order_payment_id` unique. Mỗi đơn vẫn có tối đa một payment và payment đó có tối đa một commission.

## Các chỗ tách cùng kiểu

Ảnh và file đi ra bảng media: `service_images`, `material_images`, `repair_request_media`, `review_media`, `progress_media`, `complaint_attachments`, `store_media`, `ekyc_liveness_frames`.

Quan hệ nhiều-nhiều đi qua bảng nối: `contractor_profile_services`, `contractor_material_categories`.

Danh mục và địa điểm dùng chung: `roles`, `service_categories`, `material_categories`, `catalog_services`, `locations`.

Lịch sử không ghi đè document: `policy_revisions`, `material_order_status_history`, `ekyc_attempts` cùng ảnh và lỗi OCR của lần nộp đó.

`legacy_mongo_id` trên bảng nghiệp vụ giữ id 24 ký tự mà API vẫn trả về. Khóa `bigint` chỉ dùng bên trong PostgreSQL.
