-- BuildMate demo. Schema public trên database BuilMate.
-- Chỉ SELECT. Không INSERT, UPDATE, DELETE.

SELECT current_database() AS database_name,
       current_user AS login_user,
       current_schema() AS schema_name;

SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

SELECT id, code, name
FROM roles
ORDER BY id;

SELECT u.id,
       u.legacy_mongo_id,
       u.full_name,
       r.code AS role,
       u.account_status,
       u.created_at
FROM users u
JOIN roles r ON r.id = u.role_id
ORDER BY u.created_at DESC
LIMIT 10;

SELECT s.id AS store_id,
       s.name AS store_name,
       s.store_type,
       s.status,
       u.legacy_mongo_id AS owner_public_id,
       p.verification_status
FROM stores s
JOIN users u ON u.id = s.owner_user_id
LEFT JOIN contractor_profiles p ON p.user_id = u.id
ORDER BY s.id
LIMIT 10;

SELECT sv.id AS service_id,
       sv.name AS service_name,
       sv.base_price,
       sv.is_active,
       c.name AS category_name,
       cs.code AS catalog_code,
       st.name AS store_name
FROM services sv
JOIN service_categories c ON c.id = sv.service_category_id
LEFT JOIN catalog_services cs ON cs.id = sv.catalog_service_id
JOIN stores st ON st.id = sv.store_id
ORDER BY sv.id
LIMIT 10;

SELECT m.id AS material_id,
       m.name AS material_name,
       m.price,
       m.is_active,
       mc.name AS category_name,
       s.name AS store_name
FROM materials m
JOIN material_categories mc ON mc.id = m.material_category_id
JOIN stores s ON s.id = m.store_id
ORDER BY m.id
LIMIT 10;

SELECT r.id AS request_id,
       r.legacy_mongo_id,
       r.title,
       r.status,
       u.full_name AS customer_name,
       r.created_at
FROM repair_requests r
JOIN users u ON u.id = r.customer_user_id
ORDER BY r.created_at DESC
LIMIT 10;

SELECT q.id AS quotation_id,
       q.status,
       q.total_cost,
       r.title AS request_title,
       r.legacy_mongo_id AS request_public_id
FROM quotations q
JOIN repair_requests r ON r.id = q.repair_request_id
ORDER BY q.created_at DESC
LIMIT 10;

SELECT o.order_code,
       o.status,
       o.payment_status,
       o.amount,
       p.payment_type,
       p.status AS payment_row_status,
       p.amount AS payment_amount
FROM service_orders o
LEFT JOIN payments p ON p.service_order_id = o.id
ORDER BY o.created_at DESC
LIMIT 10;

SELECT o.order_code,
       o.status,
       o.total_amount,
       i.name_snapshot,
       i.quantity,
       i.line_total
FROM material_orders o
JOIN material_order_items i ON i.material_order_id = o.id
ORDER BY o.created_at DESC, i.sort_order
LIMIT 20;

SELECT COUNT(*) AS foreign_key_count
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace;

SELECT COUNT(*) AS invalid_foreign_key_count
FROM pg_constraint
WHERE contype = 'f'
  AND NOT convalidated;
