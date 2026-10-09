const { prisma } = require('../config/prisma');
const { ensureSaleColumns } = require('../repositories/column-ensure');
const { ApiError } = require('../utils/ApiError');
const { ContractorProfile } = require('../repositories/partnerAccess');
const materialCategoryService = require('./material-category.service');
const {
  collapseServiceName,
  foldServiceName,
  normalizeServiceName,
} = require('../constants/contractorServices');
const { findSystemCategory } = require('../constants/material-categories');

let columnsReady = false;

async function ensureCategoryColumns() {
  if (columnsReady) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE material_categories ADD COLUMN IF NOT EXISTS description character varying(400) NOT NULL DEFAULT ''`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE material_categories ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT ''`
  );
  const existing = await prisma.$queryRaw`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'chk_material_categories_status'
  `;
  const def = String(existing[0]?.def || '');
  if (!def.includes('INACTIVE')) {
    await prisma.$executeRawUnsafe(`ALTER TABLE material_categories DROP CONSTRAINT IF EXISTS chk_material_categories_status`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE material_categories ADD CONSTRAINT chk_material_categories_status CHECK ((status)::text = ANY (ARRAY['PENDING_APPROVAL'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'INACTIVE'::character varying]))`
    );
  }
  columnsReady = true;
}

async function storeContext(userId) {
  const store = await prisma.stores.findFirst({
    where: { users: { legacy_mongo_id: String(userId) } },
    select: { id: true, owner_user_id: true },
  });
  if (!store) throw new ApiError(400, 'Create your material store before adding materials');
  const profile = await prisma.contractor_profiles.findFirst({
    where: { user_id: store.owner_user_id },
    select: { id: true },
  });
  return { store, profile };
}

function publicId(row) {
  return row.legacy_mongo_id || String(row.id);
}

function present(row) {
  const system = row.category_type !== 'CUSTOM';
  const hidden = row.store_listing === 'HIDDEN' || (!system && row.status === 'INACTIVE');
  return {
    id: publicId(row),
    name: row.name,
    description: row.description || '',
    image: row.image_url || '',
    type: system ? 'SYSTEM' : 'CUSTOM',
    status: hidden ? 'INACTIVE' : 'ACTIVE',
    productCount: Number(row.product_count || 0),
    createdAt: row.created_at || null,
  };
}

async function loadRows(userId) {
  await ensureCategoryColumns();
  await ensureSaleColumns();
  const ctx = await storeContext(userId);
  const profileId = ctx.profile?.id || 0n;
  const rows = await prisma.$queryRaw`
    SELECT
      mc.id,
      mc.legacy_mongo_id,
      mc.name,
      mc.category_type,
      mc.status,
      mc.description,
      mc.image_url,
      mc.owner_user_id,
      mc.created_at,
      COALESCE(link.listing_status, 'ACTIVE') AS store_listing,
      COALESCE(sp.product_count, 0)::int AS product_count
    FROM material_categories mc
    LEFT JOIN contractor_material_categories link
      ON link.material_category_id = mc.id
      AND link.contractor_profile_id = ${profileId}
    LEFT JOIN (
      SELECT material_category_id, COUNT(*)::int AS product_count
      FROM materials
      WHERE store_id = ${ctx.store.id}
      GROUP BY material_category_id
    ) sp ON sp.material_category_id = mc.id
    WHERE (
      mc.owner_user_id = ${ctx.store.owner_user_id}
      AND mc.category_type = 'CUSTOM'
      AND mc.status <> 'REJECTED'
    )
    OR COALESCE(sp.product_count, 0) > 0
    OR mc.id IN (
      SELECT material_category_id
      FROM contractor_material_categories
      WHERE contractor_profile_id = ${profileId}
        AND selection_status <> 'REJECTED'
    )
    ORDER BY mc.name ASC
  `;
  return { ctx, rows };
}

function slim(item) {
  const custom = item.type === 'CUSTOM';
  return {
    name: item.name,
    type: custom ? 'CUSTOM' : 'SYSTEM',
    categoryId: custom ? item.categoryId || item.id || null : null,
    status: 'APPROVED',
  };
}

async function rememberCategory(userId, pick) {
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile) return;
  const current = await materialCategoryService.categoriesForProfile(profile);
  const folded = foldServiceName(pick.name);
  if (current.some((item) => foldServiceName(item.name) === folded)) return;
  profile.materialCategories = [...current.map(slim), slim(pick)];
  if (typeof profile.markModified === 'function') profile.markModified('materialCategories');
  await profile.save();
}

async function forgetCategory(userId, name) {
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile) return;
  const current = await materialCategoryService.categoriesForProfile(profile);
  const folded = foldServiceName(name);
  profile.materialCategories = current.filter((item) => foldServiceName(item.name) !== folded).map(slim);
  if (typeof profile.markModified === 'function') profile.markModified('materialCategories');
  await profile.save();
}

async function writeExtras(id, { description, image }) {
  await prisma.$executeRaw`
    UPDATE material_categories
    SET description = ${String(description || '').slice(0, 400)},
        image_url = ${String(image || '').slice(0, 2000)},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

function sameCategory(row, name) {
  const folded = foldServiceName(name);
  const system = findSystemCategory(name);
  return foldServiceName(row.name) === folded || (system && row.name === system);
}

async function listStoreCategories(userId) {
  const { rows } = await loadRows(userId);
  return rows.map(present);
}

async function createStoreCategory(userId, body) {
  const display = collapseServiceName(body.name);
  if (!display || display.length > 80) throw new ApiError(400, 'Please enter a category name.');
  const { rows } = await loadRows(userId);
  if (rows.some((row) => sameCategory(row, display))) {
    throw new ApiError(409, 'This category already exists in this store.');
  }

  const system = findSystemCategory(display);
  let row;
  if (system) {
    row = await prisma.material_categories.findFirst({
      where: { name: system, category_type: 'SYSTEM', owner_user_id: null },
    });
    if (!row) throw new ApiError(400, 'Select a valid category.');
    await rememberCategory(userId, { name: system, type: 'SYSTEM' });
  } else {
    const created = await materialCategoryService.createCustomCategory({ name: display, userId });
    row = await prisma.material_categories.findFirst({ where: { legacy_mongo_id: String(created.id || created.categoryId) } });
    if (!row) throw new ApiError(500, 'Could not save category');
    try {
      await rememberCategory(userId, { name: created.name, type: 'CUSTOM', categoryId: created.categoryId || created.id });
    } catch (error) {
      console.error('[store-category] profile link skipped', error.message);
    }
  }

  const status = !system && body.status === 'INACTIVE' ? 'INACTIVE' : 'APPROVED';
  await prisma.material_categories.update({
    where: { id: row.id },
    data: { status, updated_at: new Date() },
  });
  await writeExtras(row.id, body);
  const listed = await listStoreCategories(userId);
  return listed.find((item) => item.name === (system || display) || item.id === (row.legacy_mongo_id || String(row.id))) || listed.at(-1);
}

async function updateStoreCategory(userId, id, body) {
  const { rows, ctx } = await loadRows(userId);
  const row = rows.find((item) => publicId(item) === String(id));
  if (!row) throw new ApiError(404, 'Category not found');
  const system = row.category_type !== 'CUSTOM';
  if (!system && row.owner_user_id && String(row.owner_user_id) !== String(ctx.store.owner_user_id)) {
    throw new ApiError(403, 'Category not found');
  }

  const data = { updated_at: new Date() };
  if (!system && body.name != null) {
    const display = collapseServiceName(body.name);
    if (!display || display.length > 80) throw new ApiError(400, 'Please enter a category name.');
    if (findSystemCategory(display) && findSystemCategory(display) !== row.name) {
      throw new ApiError(409, 'This category already exists in the system.');
    }
    if (rows.some((item) => String(item.id) !== String(row.id) && sameCategory(item, display))) {
      throw new ApiError(409, 'This category already exists in this store.');
    }
    data.name = display.slice(0, 80);
    data.normalized_name = normalizeServiceName(display).slice(0, 120);
    data.folded_name = foldServiceName(display).slice(0, 120);
  }
  if (!system && body.status) {
    data.status = body.status === 'INACTIVE' ? 'INACTIVE' : 'APPROVED';
  }
  await prisma.material_categories.update({ where: { id: row.id }, data });
  if (body.status && ctx.profile?.id) {
    const listing = body.status === 'INACTIVE' ? 'HIDDEN' : 'ACTIVE';
    await prisma.$executeRaw`
      INSERT INTO contractor_material_categories (contractor_profile_id, material_category_id, selection_status, listing_status)
      VALUES (${ctx.profile.id}, ${row.id}, 'APPROVED', ${listing})
      ON CONFLICT (contractor_profile_id, material_category_id)
      DO UPDATE SET listing_status = ${listing}
    `;
  }
  if (body.description != null || body.image != null) {
    await writeExtras(row.id, {
      description: body.description != null ? body.description : row.description,
      image: body.image != null ? body.image : row.image_url,
    });
  }
  const listed = await listStoreCategories(userId);
  return listed.find((item) => item.id === publicId({ ...row, legacy_mongo_id: row.legacy_mongo_id })) || listed.find((item) => item.name === (data.name || row.name));
}

async function deleteStoreCategory(userId, id) {
  const { rows } = await loadRows(userId);
  const row = rows.find((item) => publicId(item) === String(id));
  if (!row) throw new ApiError(404, 'Category not found');
  const productCount = Number(row.product_count || 0);
  if (productCount > 0) {
    throw new ApiError(409, 'This category still has products.', { productCount });
  }
  await forgetCategory(userId, row.name);
  if (row.category_type === 'CUSTOM') {
    await prisma.contractor_material_categories.deleteMany({ where: { material_category_id: row.id } });
    try {
      await prisma.material_categories.delete({ where: { id: row.id } });
    } catch (error) {
      if (error.code === 'P2003') {
        throw new ApiError(409, 'This category still has products.', { productCount });
      }
      throw error;
    }
  }
  return { deleted: true, id: publicId(row) };
}

module.exports = {
  listStoreCategories,
  createStoreCategory,
  updateStoreCategory,
  deleteStoreCategory,
};
