const { prisma } = require('../config/prisma');

let ready = false;

async function ensureSaleColumns() {
  if (ready) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE materials ADD COLUMN IF NOT EXISTS listing_status character varying(20) NOT NULL DEFAULT 'ACTIVE'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE materials ADD COLUMN IF NOT EXISTS sale_availability character varying(30) NOT NULL DEFAULT 'AVAILABLE'`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS restock_expected_on date`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE materials ADD COLUMN IF NOT EXISTS status_note character varying(400) NOT NULL DEFAULT ''`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE materials SET listing_status = 'PAUSED' WHERE is_active = false AND listing_status = 'ACTIVE'`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE materials DROP CONSTRAINT IF EXISTS chk_materials_listing_status`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE materials ADD CONSTRAINT chk_materials_listing_status CHECK ((listing_status)::text = ANY (ARRAY['ACTIVE','PAUSED','DISCONTINUED']::text[]))`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE materials DROP CONSTRAINT IF EXISTS chk_materials_sale_availability`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE materials ADD CONSTRAINT chk_materials_sale_availability CHECK ((sale_availability)::text = ANY (ARRAY['AVAILABLE','MANUALLY_UNAVAILABLE']::text[]))`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE contractor_material_categories ADD COLUMN IF NOT EXISTS listing_status character varying(20) NOT NULL DEFAULT 'ACTIVE'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE contractor_material_categories DROP CONSTRAINT IF EXISTS chk_contractor_material_listing`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE contractor_material_categories ADD CONSTRAINT chk_contractor_material_listing CHECK ((listing_status)::text = ANY (ARRAY['ACTIVE','HIDDEN']::text[]))`
  );
  ready = true;
}

let chatReady = false;

async function ensureChatColumns() {
  if (chatReady) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE chat_rooms ALTER COLUMN repair_request_id DROP NOT NULL`
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS room_kind character varying(32) NOT NULL DEFAULT 'CUSTOMER_CONTRACTOR'`
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS store_id bigint`
    );
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_rooms_store'
        ) THEN
          ALTER TABLE chat_rooms
            ADD CONSTRAINT fk_chat_rooms_store
            FOREIGN KEY (store_id) REFERENCES stores(id);
        END IF;
      END $$;
    `);
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_chat_rooms_store ON chat_rooms (store_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_chat_rooms_kind ON chat_rooms (room_kind)`);
  } catch {}
  chatReady = true;
}

let locationReady = false;

async function ensureLocationColumns() {
  if (locationReady) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_approved_at timestamptz(6)`
    );
  } catch {}
  locationReady = true;
}

let locationChangeReady = false;

async function ensureLocationChangeTable() {
  if (locationChangeReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS partner_location_change_requests (
        id BIGSERIAL PRIMARY KEY,
        legacy_mongo_id VARCHAR(24) UNIQUE,
        partner_id BIGINT NOT NULL,
        partner_type VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        reason VARCHAR(1000) NOT NULL DEFAULT '',
        current_location_id BIGINT,
        current_address VARCHAR(500) DEFAULT '',
        current_city VARCHAR(120) DEFAULT '',
        current_latitude NUMERIC(10, 7),
        current_longitude NUMERIC(10, 7),
        proposed_address VARCHAR(500) NOT NULL,
        proposed_city VARCHAR(120) NOT NULL,
        proposed_latitude NUMERIC(10, 7) NOT NULL,
        proposed_longitude NUMERIC(10, 7) NOT NULL,
        proposed_location_source VARCHAR(50) NOT NULL DEFAULT '',
        proposed_provider_ref_id VARCHAR(2000) NOT NULL DEFAULT '',
        reviewed_by BIGINT,
        reviewed_at TIMESTAMPTZ(6),
        admin_note VARCHAR(1000) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error('[column-ensure] Failed creating partner_location_change_requests table:', err.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_loc_change_partner'
        ) THEN
          ALTER TABLE partner_location_change_requests
            ADD CONSTRAINT fk_loc_change_partner
            FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_loc_change_reviewer'
        ) THEN
          ALTER TABLE partner_location_change_requests
            ADD CONSTRAINT fk_loc_change_reviewer
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_loc_change_current_location'
        ) THEN
          ALTER TABLE partner_location_change_requests
            ADD CONSTRAINT fk_loc_change_current_location
            FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_pending_location_request
        ON partner_location_change_requests (partner_id, partner_type)
        WHERE status = 'PENDING';
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_loc_change_partner_status ON partner_location_change_requests (partner_id, status)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_loc_change_status_created ON partner_location_change_requests (status, created_at DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_loc_change_type_status ON partner_location_change_requests (partner_type, status)`);
  } catch {}

  locationChangeReady = true;
}

let weeklyHoursReady = false;

async function ensureWeeklyHoursColumn() {
  if (weeklyHoursReady) return;
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE contractor_profiles ADD COLUMN IF NOT EXISTS weekly_hours jsonb`);
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE stores ALTER COLUMN opening_hours TYPE varchar(200)`);
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE stores ALTER COLUMN opening_hours SET DEFAULT ''`);
  } catch {}
  weeklyHoursReady = true;
}

module.exports = {
  ensureSaleColumns,
  ensureChatColumns,
  ensureLocationColumns,
  ensureLocationChangeTable,
  ensureWeeklyHoursColumn,
};
