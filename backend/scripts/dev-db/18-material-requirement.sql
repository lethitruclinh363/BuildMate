-- Material Requirement List (WBS 7.8). Apply only on BuilMate_dev :55433.
-- The Node apply script refuses BuilMate and BuilMate_test.

CREATE TABLE IF NOT EXISTS material_requirement_lists (
  id BIGSERIAL PRIMARY KEY,
  legacy_mongo_id VARCHAR(24) UNIQUE,
  repair_request_id BIGINT NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
  contractor_user_id BIGINT NOT NULL REFERENCES users(id),
  store_id BIGINT REFERENCES stores(id),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  note VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_mrl_status CHECK (status IN ('DRAFT','SENT','QUOTED','CONFIRMED','PREPARING','DELIVERING','DELIVERED','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_active_request
  ON material_requirement_lists (repair_request_id)
  WHERE status <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_mrl_contractor ON material_requirement_lists (contractor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrl_store_status ON material_requirement_lists (store_id, status);

CREATE TABLE IF NOT EXISTS material_requirement_items (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES material_requirement_lists(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  specification VARCHAR(200) NOT NULL DEFAULT '',
  unit VARCHAR(40) NOT NULL DEFAULT '',
  quantity NUMERIC(14, 3) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrl_items_list ON material_requirement_items (list_id, sort_order);

CREATE TABLE IF NOT EXISTS material_quotes (
  id BIGSERIAL PRIMARY KEY,
  legacy_mongo_id VARCHAR(24) UNIQUE,
  list_id BIGINT NOT NULL REFERENCES material_requirement_lists(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL REFERENCES stores(id),
  store_user_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'SENT',
  delivery_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_material_quote_status CHECK (status IN ('SENT','ACCEPTED','REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_material_quotes_list ON material_quotes (list_id, created_at DESC);

CREATE TABLE IF NOT EXISTS material_quote_items (
  id BIGSERIAL PRIMARY KEY,
  quote_id BIGINT NOT NULL REFERENCES material_quotes(id) ON DELETE CASCADE,
  requirement_item_id BIGINT NOT NULL REFERENCES material_requirement_items(id) ON DELETE CASCADE,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  available_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
  note VARCHAR(500) NOT NULL DEFAULT ''
);
