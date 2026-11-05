-- Direct catalog Material Requests (customer → store, no repair job).
-- Additive only. Keeps existing lists, quotes, and historical material_orders.
-- Safe to re-run. Apply on BuilMate_dev; runtime ensureDirectRequestSchema is a fallback.

ALTER TABLE material_requirement_lists
  ALTER COLUMN repair_request_id DROP NOT NULL;

ALTER TABLE material_requirement_lists
  ALTER COLUMN contractor_user_id DROP NOT NULL;

ALTER TABLE material_requirement_lists
  ADD COLUMN IF NOT EXISTS customer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mrl_customer_user
  ON material_requirement_lists (customer_user_id);

UPDATE material_requirement_lists mrl
SET customer_user_id = rr.customer_user_id
FROM repair_requests rr
WHERE mrl.repair_request_id = rr.id
  AND mrl.customer_user_id IS NULL;
