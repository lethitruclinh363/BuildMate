-- Customer saved material lists and per-store request snapshots.
-- Apply only on BuilMate_dev. Keeps existing lists and quote history.
-- Safe to re-run.

ALTER TABLE material_requirement_lists
  ADD COLUMN IF NOT EXISTS parent_list_id BIGINT REFERENCES material_requirement_lists(id) ON DELETE SET NULL;

ALTER TABLE material_requirement_lists
  ADD COLUMN IF NOT EXISTS title VARCHAR(140) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS uq_mrl_active_request;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_source_request
  ON material_requirement_lists (repair_request_id)
  WHERE parent_list_id IS NULL AND status <> 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_saved_draft
  ON material_requirement_lists (parent_list_id)
  WHERE parent_list_id IS NOT NULL AND status = 'DRAFT';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_parent_store
  ON material_requirement_lists (parent_list_id, store_id)
  WHERE parent_list_id IS NOT NULL AND store_id IS NOT NULL AND status <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_mrl_parent ON material_requirement_lists (parent_list_id);
