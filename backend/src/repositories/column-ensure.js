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

module.exports = { ensureSaleColumns };
