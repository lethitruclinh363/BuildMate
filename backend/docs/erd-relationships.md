# ERD relationships

Quan hệ lấy từ foreign key đang có trong schema `public`. Không suy ra quan hệ không có khóa ngoại.

Tổng số foreign key: **111**.

Quy ước: bảng cha nằm bên trái. `1 --- N` nghĩa là nhiều dòng con trỏ tới một dòng cha. `1 --- 0..1` nghĩa là cột khóa ngoại phía con có unique index nên mỗi dòng cha có tối đa một dòng con.

Bảng nối N-N:

- `contractor_profiles` N --- N `catalog_services` qua `contractor_profile_services`
- `contractor_profiles` N --- N `material_categories` qua `contractor_material_categories`

## Identity và location

- `locations` 1 --- N `location_corrections` qua `location_id`
- `locations` 1 --- N `users` qua `location_id`
- `roles` 1 --- N `users` qua `role_id`

## Đối tác và cửa hàng

- `contractor_profiles` 1 --- N `contractor_documents` qua `contractor_profile_id`
- `material_categories` 1 --- N `contractor_material_categories` qua `material_category_id`
- `contractor_profiles` 1 --- N `contractor_material_categories` qua `contractor_profile_id`
- `contractor_profiles` 1 --- N `contractor_portfolio_media` qua `contractor_profile_id`
- `contractor_portfolio_projects` 1 --- N `contractor_portfolio_project_images` qua `portfolio_project_id`
- `catalog_services` 1 --- N `contractor_portfolio_projects` qua `catalog_service_id`
- `contractor_profiles` 1 --- N `contractor_portfolio_projects` qua `contractor_profile_id`
- `catalog_services` 1 --- N `contractor_profile_services` qua `catalog_service_id`
- `contractor_profiles` 1 --- N `contractor_profile_services` qua `contractor_profile_id`
- `contractor_profiles` 1 --- N `contractor_profile_steps` qua `contractor_profile_id`
- `locations` 1 --- N `contractor_profiles` qua `location_id`
- `users` 1 --- N `contractor_profiles` qua `reviewed_by`
- `users` 1 --- 0..1 `contractor_profiles` qua `user_id`
- `contractor_profiles` 1 --- N `contractor_service_areas` qua `contractor_profile_id`
- `stores` 1 --- N `store_media` qua `store_id`
- `stores` 1 --- N `store_service_areas` qua `store_id`
- `locations` 1 --- N `stores` qua `location_id`
- `users` 1 --- 0..1 `stores` qua `owner_user_id`

## Catalog dịch vụ và vật tư

- `service_categories` 1 --- N `catalog_services` qua `service_category_id`
- `users` 1 --- N `catalog_services` qua `proposed_by`
- `users` 1 --- N `catalog_services` qua `reviewed_by`
- `users` 1 --- N `material_categories` qua `owner_user_id`
- `stores` 1 --- N `material_categories` qua `store_id`
- `materials` 1 --- N `material_images` qua `material_id`
- `material_categories` 1 --- N `materials` qua `material_category_id`
- `stores` 1 --- N `materials` qua `store_id`
- `services` 1 --- N `service_images` qua `service_id`
- `catalog_services` 1 --- N `service_suggestions` qua `converted_catalog_service_id`
- `contractor_profiles` 1 --- N `service_suggestions` qua `provider_profile_id`
- `users` 1 --- N `service_suggestions` qua `requester_user_id`
- `users` 1 --- N `service_suggestions` qua `reviewed_by`
- `catalog_services` 1 --- N `services` qua `catalog_service_id`
- `service_categories` 1 --- N `services` qua `service_category_id`
- `users` 1 --- N `services` qua `contractor_user_id`
- `stores` 1 --- N `services` qua `store_id`

## Yêu cầu, chat và báo giá

- `users` 1 --- N `chat_rooms` qua `contractor_user_id`
- `users` 1 --- N `chat_rooms` qua `customer_user_id`
- `repair_requests` 1 --- 0..1 `chat_rooms` qua `repair_request_id`
- `locations` 1 --- N `messages` qua `location_id`
- `quotations` 1 --- N `messages` qua `quotation_id`
- `chat_rooms` 1 --- N `messages` qua `chat_room_id`
- `users` 1 --- N `messages` qua `sender_user_id`
- `quotations` 1 --- N `quotation_items` qua `quotation_id`
- `users` 1 --- N `quotations` qua `contractor_user_id`
- `users` 1 --- N `quotations` qua `customer_user_id`
- `repair_requests` 1 --- N `quotations` qua `repair_request_id`
- `chat_rooms` 1 --- N `quotations` qua `chat_room_id`
- `repair_requests` 1 --- N `repair_request_media` qua `repair_request_id`
- `catalog_services` 1 --- N `repair_requests` qua `catalog_service_id`
- `service_categories` 1 --- N `repair_requests` qua `service_category_id`
- `users` 1 --- N `repair_requests` qua `contractor_user_id`
- `users` 1 --- N `repair_requests` qua `customer_user_id`
- `locations` 1 --- N `repair_requests` qua `location_id`
- `stores` 1 --- N `repair_requests` qua `store_id`

## Đơn dịch vụ, thanh toán và hậu mãi

- `users` 1 --- N `commissions` qua `contractor_user_id`
- `service_orders` 1 --- N `commissions` qua `service_order_id`
- `payments` 1 --- 0..1 `commissions` qua `payment_id`
- `complaints` 1 --- N `complaint_attachments` qua `complaint_id`
- `users` 1 --- N `complaints` qua `admin_user_id`
- `users` 1 --- N `complaints` qua `against_user_id`
- `users` 1 --- N `complaints` qua `created_by_user_id`
- `service_orders` 1 --- N `complaints` qua `service_order_id`
- `users` 1 --- N `payments` qua `contractor_user_id`
- `users` 1 --- N `payments` qua `customer_user_id`
- `service_orders` 1 --- N `payments` qua `service_order_id`
- `progress_updates` 1 --- N `progress_media` qua `progress_update_id`
- `users` 1 --- N `progress_updates` qua `actor_user_id`
- `locations` 1 --- N `progress_updates` qua `location_id`
- `service_orders` 1 --- N `progress_updates` qua `service_order_id`
- `reviews` 1 --- N `review_media` qua `review_id`
- `users` 1 --- N `reviews` qua `customer_user_id`
- `service_orders` 1 --- N `reviews` qua `service_order_id`
- `users` 1 --- N `reviews` qua `target_user_id`
- `users` 1 --- N `service_orders` qua `cancelled_by`
- `users` 1 --- N `service_orders` qua `contractor_user_id`
- `users` 1 --- N `service_orders` qua `customer_user_id`
- `locations` 1 --- N `service_orders` qua `location_id`
- `quotations` 1 --- 0..1 `service_orders` qua `quotation_id`
- `repair_requests` 1 --- 0..1 `service_orders` qua `repair_request_id`
- `stores` 1 --- N `service_orders` qua `store_id`

## Đơn vật tư

- `material_orders` 1 --- N `material_commissions` qua `material_order_id`
- `material_order_payments` 1 --- 0..1 `material_commissions` qua `material_order_payment_id`
- `users` 1 --- N `material_commissions` qua `store_owner_user_id`
- `materials` 1 --- N `material_order_items` qua `material_id`
- `material_orders` 1 --- N `material_order_items` qua `material_order_id`
- `users` 1 --- N `material_order_payments` qua `customer_user_id`
- `material_orders` 1 --- 0..1 `material_order_payments` qua `material_order_id`
- `users` 1 --- N `material_order_payments` qua `store_owner_user_id`
- `users` 1 --- N `material_order_status_history` qua `actor_user_id`
- `material_orders` 1 --- N `material_order_status_history` qua `material_order_id`
- `users` 1 --- N `material_orders` qua `customer_user_id`
- `locations` 1 --- N `material_orders` qua `delivery_location_id`
- `stores` 1 --- N `material_orders` qua `store_id`
- `users` 1 --- N `material_orders` qua `store_owner_user_id`

## eKYC và quản trị

- `users` 1 --- N `audit_logs` qua `actor_user_id`
- `users` 1 --- N `contractor_ekyc_verifications` qua `admin_reviewed_by`
- `contractor_profiles` 1 --- 0..1 `contractor_ekyc_verifications` qua `contractor_profile_id`
- `users` 1 --- 0..1 `contractor_ekyc_verifications` qua `user_id`
- `ekyc_attempts` 1 --- N `ekyc_attempt_liveness_frames` qua `ekyc_attempt_id`
- `ekyc_attempts` 1 --- N `ekyc_attempt_ocr_issues` qua `ekyc_attempt_id`
- `users` 1 --- N `ekyc_attempts` qua `admin_reviewed_by`
- `contractor_ekyc_verifications` 1 --- N `ekyc_attempts` qua `ekyc_verification_id`
- `contractor_ekyc_verifications` 1 --- N `ekyc_liveness_frames` qua `ekyc_verification_id`
- `contractor_ekyc_verifications` 1 --- N `ekyc_ocr_issues` qua `ekyc_verification_id`
- `users` 1 --- N `notifications` qua `user_id`
- `users` 1 --- N `policies` qua `created_by`
- `users` 1 --- N `policy_revisions` qua `edited_by`
- `policies` 1 --- N `policy_revisions` qua `policy_id`
