const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/prisma');
const { ensureSaleColumns } = require('./column-ensure');
const { listingOf, saleStateOf } = require('../utils/material-sale');
const { legacyClause, enumClause, compareClause } = require('./scopedQuery');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function legacyOf(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function money(value) {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (/^\d+(\.\d+)?$/.test(raw)) return raw;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function duplicate(error) {
  if (error?.code === 'P2002') {
    const wrapped = new Error('Duplicate catalog value');
    wrapped.code = 11000;
    throw wrapped;
  }
  throw error;
}

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    if (expected.$in) return expected.$in.map((item) => String(item)).includes(String(actual));
    if (expected.$nin) return !expected.$nin.map((item) => String(item)).includes(String(actual ?? ''));
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return String(actual ?? '') !== String(expected.$ne ?? '');
    if (Object.prototype.hasOwnProperty.call(expected, '$gt')) return Number(actual) > Number(expected.$gt);
    if (expected.$exists === false) return actual == null || actual === '';
    if (expected.$regex) return new RegExp(expected.$regex, expected.$options || '').test(String(actual || ''));
    return false;
  }
  return String(actual ?? '') === String(expected ?? '');
}

function valueAt(doc, key) {
  return String(key).split('.').reduce((current, part) => (current == null ? undefined : current[part]), doc);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    return matchValue(valueAt(doc, key), value);
  });
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const a = left[key];
      const b = right[key];
      if (a == null && b == null) continue;
      if (a instanceof Date || b instanceof Date || key.toLowerCase().includes('at')) {
        const delta = new Date(a || 0).getTime() - new Date(b || 0).getTime();
        if (delta) return direction < 0 ? -delta : delta;
        continue;
      }
      const delta = String(a ?? '').localeCompare(String(b ?? ''));
      if (delta) return direction < 0 ? -delta : delta;
    }
    return 0;
  });
}

function chain(loader) {
  const state = { sort: null, populate: null, lean: false, limit: null };
  const exec = async () => {
    let rows = await loader(state);
    if (state.sort) rows = sortRows(rows, state.sort);
    if (state.limit != null) rows = rows.slice(0, state.limit);
    if (state.populate) {
      rows = await Promise.all(rows.map(async (row) => {
        const user = await userSnapshot(legacyOf(row[state.populate]));
        if (user) row[state.populate] = user;
        return row;
      }));
    }
    if (state.lean) rows = rows.map((row) => (row.toPlain ? row.toPlain() : row));
    return rows;
  };
  const query = {
    sort(value) { state.sort = value; return query; },
    populate(path) { state.populate = path; return query; },
    lean() { state.lean = true; return query; },
    select() { return query; },
    limit(value) { state.limit = Number(value); return query; },
    then(resolve, reject) { return exec().then(resolve, reject); },
    catch(reject) { return exec().catch(reject); },
  };
  return query;
}

async function userRow(legacyId) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  return prisma.users.findFirst({ where: { legacy_mongo_id: id }, include: { roles: true } });
}

async function userSnapshot(legacyId) {
  const row = await userRow(legacyId);
  if (!row) return null;
  return { _id: row.legacy_mongo_id, id: row.legacy_mongo_id, name: row.full_name, email: row.email, status: row.account_status };
}

async function categoryId(name, tx = prisma) {
  const label = text(name || 'General repair', 80) || 'General repair';
  const found = await tx.service_categories.findUnique({ where: { name: label } });
  if (found) return found.id;
  const created = await tx.service_categories.create({ data: { name: label } });
  return created.id;
}

class PgCatalog {
  constructor(data) {
    Object.assign(this, data);
    this._id = data._id;
    this.type = data.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM';
  }

  toPublic() {
    const code = this.code || '';
    return {
      id: this._id,
      name: this.name,
      category: this.category,
      description: this.description || '',
      type: this.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM',
      status: this.status === 'APPROVED' ? 'ACTIVE' : this.status,
      catalogKey: code || String(this._id),
      serviceId: code || String(this._id),
      labelKey: code.includes('::') ? code.split('::').pop() : '',
      proposedBy: this.proposedBy || null,
    };
  }

  toPlain() {
    return { ...this, _id: this._id };
  }

  async save() {
    await persistCatalog(this);
    return this;
  }
}

class PgService {
  constructor(data) {
    Object.assign(this, data);
    this.images = [...(data.images || [])];
    this.priceRange = data.priceRange || { min: 0, max: 0 };
  }

  toPublic() {
    const price = Number(this.basePrice) > 0 ? Number(this.basePrice) : null;
    return {
      id: this._id,
      storeId: legacyOf(this.storeId),
      contractorId: legacyOf(this.contractorId),
      name: this.name,
      category: this.category,
      description: this.description,
      catalogKey: this.catalogKey || '',
      catalogType: this.catalogType || 'LEGACY',
      completionStatus: this.completionStatus || 'COMPLETED',
      basePrice: price,
      unit: this.unit,
      estimatedHours: Number(this.estimatedHours),
      image: this.image,
      images: this.images?.length ? this.images : this.image ? [this.image] : [],
      priceRange: price ? (Number(this.priceRange?.max) > 0 ? { min: Number(this.priceRange.min), max: Number(this.priceRange.max) } : { min: price, max: price }) : null,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, basePrice: this.basePrice, priceRange: this.priceRange, images: this.images, image: this.image };
  }

  async save() {
    await persistService(this);
    return this;
  }

  async deleteOne() {
    if (this.pgId) await prisma.services.delete({ where: { id: this.pgId } });
  }
}

class PgMaterial {
  constructor(data) {
    Object.assign(this, data);
    this.images = [...(data.images || [])];
  }

  toPublic() {
    return {
      id: this._id,
      storeId: legacyOf(this.storeId),
      name: this.name,
      category: this.category,
      categoryId: this.categoryId || null,
      sku: this.sku,
      unit: this.unit,
      price: Number(this.price),
      stock: Number(this.stock),
      minOrderQty: Number(this.minOrderQty),
      image: this.image,
      images: this.images?.length ? this.images : this.image ? [this.image] : [],
      description: this.description,
      isActive: this.isActive,
      listingStatus: listingOf(this),
      saleAvailability: this.saleAvailability === 'MANUALLY_UNAVAILABLE' ? 'MANUALLY_UNAVAILABLE' : 'AVAILABLE',
      restockExpectedOn: this.restockExpectedOn || null,
      statusNote: this.statusNote || '',
      saleState: saleStateOf(this),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, price: this.price, images: this.images, image: this.image };
  }

  async save() {
    await persistMaterial(this);
    return this;
  }
}

class PgCategory {
  constructor(data) {
    Object.assign(this, data);
  }

  toPlain() {
    return { ...this, _id: this._id };
  }

  async save() {
    await persistCategory(this);
    return this;
  }
}

class PgSuggestion {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    const requester = this.requesterId && this.requesterId.name ? this.requesterId : null;
    return {
      id: String(this._id),
      requesterId: String(requester ? requester._id : this.requesterId),
      requesterName: requester?.name || '',
      requesterRole: this.requesterRole,
      providerId: this.providerId ? String(legacyOf(this.providerId)) : '',
      teamName: this.teamName || '',
      description: this.description,
      status: this.status,
      adminNote: this.adminNote || '',
      convertedServiceId: this.convertedServiceId ? String(legacyOf(this.convertedServiceId)) : '',
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      reviewedAt: this.reviewedAt,
    };
  }

  async save() {
    await persistSuggestion(this);
    return this;
  }
}

const catalogInclude = {
  service_categories: true,
  users_catalog_services_proposed_byTousers: { select: { legacy_mongo_id: true } },
  users_catalog_services_reviewed_byTousers: { select: { legacy_mongo_id: true } },
};

function catalogFromRow(row) {
  return new PgCatalog({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    name: row.name,
    normalizedName: row.normalized_name,
    foldedName: row.folded_name || '',
    code: row.code || '',
    category: row.service_categories?.name || '',
    description: row.description || '',
    type: row.catalog_type,
    status: row.status,
    proposedBy: row.users_catalog_services_proposed_byTousers?.legacy_mongo_id || null,
    reviewedBy: row.users_catalog_services_reviewed_byTousers?.legacy_mongo_id || null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allCatalog() {
  return (await prisma.catalog_services.findMany({ include: catalogInclude })).map(catalogFromRow);
}

function serviceFromRow(row) {
  const images = (row.service_images || []).sort((a, b) => a.sort_order - b.sort_order).map((item) => item.file_url);
  return new PgService({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    storeId: row.stores?.legacy_mongo_id || '',
    contractorId: row.users?.legacy_mongo_id || '',
    name: row.name,
    category: row.service_categories?.name || '',
    catalogKey: row.catalog_key || '',
    catalogType: row.catalog_type,
    completionStatus: row.completion_status,
    description: row.description || '',
    basePrice: row.base_price == null ? null : Number(row.base_price),
    unit: row.unit,
    estimatedHours: Number(row.estimated_hours),
    image: row.primary_image_url || '',
    images,
    priceRange: { min: Number(row.price_range_min || 0), max: Number(row.price_range_max || 0) },
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allServices() {
  return (await prisma.services.findMany({
    include: { service_images: true, service_categories: true, stores: { select: { legacy_mongo_id: true } }, users: { select: { legacy_mongo_id: true } } },
  })).map(serviceFromRow);
}

async function overlaySaleColumns(rows) {
  if (!rows.length) return rows;
  await ensureSaleColumns();
  const extras = await prisma.$queryRaw`
    SELECT id, listing_status, sale_availability, restock_expected_on, status_note
    FROM materials
    WHERE id IN (${Prisma.join(rows.map((row) => row.id))})
  `;
  const byId = new Map(extras.map((row) => [String(row.id), row]));
  for (const row of rows) {
    const extra = byId.get(String(row.id));
    if (!extra) continue;
    row.listing_status = extra.listing_status;
    row.sale_availability = extra.sale_availability;
    row.restock_expected_on = extra.restock_expected_on;
    row.status_note = extra.status_note;
  }
  return rows;
}

function materialFromRow(row) {
  const images = (row.material_images || []).sort((a, b) => a.sort_order - b.sort_order).map((item) => item.file_url);
  return new PgMaterial({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    storeId: row.stores?.legacy_mongo_id || '',
    category: row.material_categories?.name || '',
    categoryId: row.material_categories?.legacy_mongo_id || (row.material_categories?.id != null ? String(row.material_categories.id) : null),
    name: row.name,
    sku: row.sku || '',
    unit: row.unit,
    price: Number(row.price),
    stock: Number(row.stock),
    minOrderQty: Number(row.min_order_qty),
    image: row.primary_image_url || '',
    images,
    description: row.description || '',
    isActive: row.is_active,
    listingStatus: row.listing_status || (row.is_active === false ? 'PAUSED' : 'ACTIVE'),
    saleAvailability: row.sale_availability || 'AVAILABLE',
    restockExpectedOn: row.restock_expected_on || null,
    statusNote: row.status_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allMaterials() {
  await ensureSaleColumns();
  const rows = await prisma.materials.findMany({
    include: { material_images: true, material_categories: true, stores: { select: { legacy_mongo_id: true } } },
  });
  await overlaySaleColumns(rows);
  return rows.map(materialFromRow);
}

function categoryFromRow(row) {
  return new PgCategory({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    name: row.name,
    normalizedName: row.normalized_name,
    foldedName: row.folded_name,
    type: row.category_type,
    status: row.status,
    ownerId: row.users?.legacy_mongo_id || null,
    storeId: row.stores?.legacy_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allCategories() {
  return (await prisma.material_categories.findMany({
    include: { users: { select: { legacy_mongo_id: true } }, stores: { select: { legacy_mongo_id: true } } },
  })).map(categoryFromRow);
}

function suggestionFromRow(row) {
  return new PgSuggestion({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    requesterId: row.users_service_suggestions_requester_user_idTousers?.legacy_mongo_id || '',
    requesterRole: row.requester_role,
    providerId: row.contractor_profiles?.legacy_mongo_id || null,
    teamName: row.team_name || '',
    description: row.description,
    status: row.status,
    reviewedBy: row.users_service_suggestions_reviewed_byTousers?.legacy_mongo_id || null,
    reviewedAt: row.reviewed_at,
    adminNote: row.admin_note || '',
    convertedServiceId: row.catalog_services?.legacy_mongo_id || row.catalog_services?.code || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allSuggestions() {
  return (await prisma.service_suggestions.findMany({
    include: {
      users_service_suggestions_requester_user_idTousers: { select: { legacy_mongo_id: true } },
      users_service_suggestions_reviewed_byTousers: { select: { legacy_mongo_id: true } },
      contractor_profiles: { select: { legacy_mongo_id: true } },
      catalog_services: { select: { legacy_mongo_id: true, code: true } },
    },
  })).map(suggestionFromRow);
}

async function persistCatalog(doc) {
  const proposed = doc.proposedBy ? await userRow(doc.proposedBy) : null;
  const reviewed = doc.reviewedBy ? await userRow(doc.reviewedBy) : null;
  const data = {
    service_category_id: await categoryId(doc.category),
    name: text(doc.name, 80),
    normalized_name: text(doc.normalizedName || doc.name, 120).toLowerCase(),
    folded_name: text(doc.foldedName, 120),
    code: text(doc.code, 160) || null,
    description: text(doc.description, 500),
    catalog_type: doc.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM',
    status: doc.status || 'PENDING_APPROVAL',
    proposed_by: proposed?.id || null,
    reviewed_by: reviewed?.id || null,
    reviewed_at: doc.reviewedAt || null,
    updated_at: new Date(),
  };
  try {
    const row = doc.pgId
      ? await prisma.catalog_services.update({ where: { id: doc.pgId }, data })
      : await prisma.catalog_services.create({
          data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
        });
    doc.pgId = row.id;
    doc._id = row.legacy_mongo_id || doc._id;
  } catch (error) {
    duplicate(error);
  }
}

async function persistService(doc) {
  const store = await prisma.stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) } });
  const owner = await userRow(doc.contractorId);
  if (!store || !owner) throw new Error('Service store or contractor is not in PostgreSQL');
  const catalog = doc.catalogKey
    ? await prisma.catalog_services.findFirst({ where: { OR: [{ code: doc.catalogKey }, { legacy_mongo_id: doc.catalogKey }] } })
    : null;
  const images = doc.images?.length ? doc.images : doc.image ? [doc.image] : [];
  const data = {
    store_id: store.id,
    contractor_user_id: owner.id,
    service_category_id: await categoryId(doc.category),
    catalog_service_id: catalog?.id || null,
    name: text(doc.name, 120),
    catalog_key: text(doc.catalogKey, 160),
    catalog_type: doc.catalogType || 'LEGACY',
    completion_status: doc.completionStatus || 'COMPLETED',
    description: text(doc.description, 1000),
    base_price: doc.basePrice == null || doc.basePrice === '' ? null : money(doc.basePrice),
    unit: doc.unit || 'JOB',
    estimated_hours: money(doc.estimatedHours || 4),
    primary_image_url: doc.image || images[0] || '',
    price_range_min: money(doc.priceRange?.min || 0),
    price_range_max: money(doc.priceRange?.max || 0),
    is_active: doc.isActive !== false,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await prisma.services.update({ where: { id: doc.pgId }, data })
    : await prisma.services.create({ data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() } });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await prisma.service_images.deleteMany({ where: { service_id: row.id } });
  for (let index = 0; index < images.length; index += 1) {
    if (!images[index]) continue;
    await prisma.service_images.create({ data: { service_id: row.id, file_url: images[index], sort_order: index } });
  }
}

async function resolveMaterialCategory(name, storeLegacy) {
  const label = text(name, 80);
  const store = storeLegacy ? await prisma.stores.findFirst({ where: { legacy_mongo_id: legacyOf(storeLegacy) }, select: { owner_user_id: true } }) : null;
  if (store) {
    const owned = await prisma.material_categories.findFirst({ where: { name: label, owner_user_id: store.owner_user_id } });
    if (owned) return owned;
  }
  return prisma.material_categories.findFirst({ where: { name: label, category_type: 'SYSTEM', owner_user_id: null } });
}

async function persistMaterial(doc) {
  await ensureSaleColumns();
  const store = await prisma.stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) } });
  if (!store) throw new Error('Material store is not in PostgreSQL');
  const category = await resolveMaterialCategory(doc.category, doc.storeId);
  if (!category) throw new Error(`Material category is not in PostgreSQL: ${doc.category}`);
  doc.category = category.name;
  doc.categoryId = category.legacy_mongo_id || String(category.id);
  const primary = String(doc.image || '').trim();
  const kept = (Array.isArray(doc.images) ? doc.images : [])
    .map((url) => String(url || '').trim())
    .filter((url) => url && url !== primary);
  const images = primary ? [primary, ...kept] : [];
  doc.image = primary;
  doc.images = images;
  const listing = listingOf(doc);
  const availability = doc.saleAvailability === 'MANUALLY_UNAVAILABLE' ? 'MANUALLY_UNAVAILABLE' : 'AVAILABLE';
  doc.listingStatus = listing;
  doc.saleAvailability = availability;
  // Publication is separate from the sale lifecycle. Pause and discontinue stay public.
  // Only an explicit unpublish (soft delete) removes the product from customer lists.
  doc.isActive = doc.unpublish === true ? false : true;
  const restock = doc.restockExpectedOn ? new Date(doc.restockExpectedOn) : null;
  doc.restockExpectedOn = restock && !Number.isNaN(restock.getTime()) ? restock : null;
  doc.statusNote = text(doc.statusNote, 400);
  const data = {
    store_id: store.id,
    material_category_id: category.id,
    name: text(doc.name, 120),
    sku: text(doc.sku, 100),
    unit: text(doc.unit || 'bag', 50),
    price: money(doc.price || 0),
    stock: money(doc.stock || 0),
    min_order_qty: money(doc.minOrderQty || 1),
    primary_image_url: primary,
    description: text(doc.description, 800),
    is_active: doc.isActive !== false,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await prisma.materials.update({ where: { id: doc.pgId }, data })
    : await prisma.materials.create({ data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() } });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await prisma.$executeRaw`
    UPDATE materials
    SET listing_status = ${listing},
        sale_availability = ${availability},
        restock_expected_on = ${doc.restockExpectedOn},
        status_note = ${doc.statusNote}
    WHERE id = ${row.id}
  `;
  await prisma.material_images.deleteMany({ where: { material_id: row.id } });
  for (let index = 0; index < images.length; index += 1) {
    if (!images[index]) continue;
    await prisma.material_images.create({ data: { material_id: row.id, file_url: images[index], sort_order: index } });
  }
}

async function persistCategory(doc) {
  const custom = doc.type === 'CUSTOM';
  const owner = custom ? await userRow(doc.ownerId) : null;
  if (custom && !owner) throw new Error('Custom material category owner is not in PostgreSQL');
  const store = doc.storeId ? await prisma.stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) } }) : null;
  const data = {
    name: text(doc.name, 80),
    normalized_name: text(doc.normalizedName, 120),
    folded_name: text(doc.foldedName, 120),
    category_type: custom ? 'CUSTOM' : 'SYSTEM',
    status: doc.status || 'APPROVED',
    owner_user_id: custom ? owner.id : null,
    store_id: store?.id || null,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await prisma.material_categories.update({ where: { id: doc.pgId }, data })
    : await prisma.material_categories.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

async function persistSuggestion(doc) {
  const requester = await userRow(doc.requesterId);
  if (!requester) throw new Error('Suggestion requester is not in PostgreSQL');
  const provider = doc.providerId
    ? await prisma.contractor_profiles.findFirst({ where: { legacy_mongo_id: legacyOf(doc.providerId) } })
    : null;
  const reviewer = doc.reviewedBy ? await userRow(doc.reviewedBy) : null;
  const converted = doc.convertedServiceId
    ? await prisma.catalog_services.findFirst({
        where: { OR: [{ legacy_mongo_id: legacyOf(doc.convertedServiceId) }, { code: String(doc.convertedServiceId) }] },
      })
    : null;
  const data = {
    requester_user_id: requester.id,
    requester_role: doc.requesterRole || 'CONTRACTOR',
    provider_profile_id: provider?.id || null,
    team_name: text(doc.teamName, 100),
    description: text(doc.description, 500),
    status: doc.status || 'PENDING',
    reviewed_by: reviewer?.id || null,
    reviewed_at: doc.reviewedAt || null,
    admin_note: text(doc.adminNote, 500),
    converted_catalog_service_id: converted?.id || null,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await prisma.service_suggestions.update({ where: { id: doc.pgId }, data })
    : await prisma.service_suggestions.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

function relationLegacy(value) {
  return legacyClause(value);
}

function materialWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'storeId') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.stores = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'isActive' && typeof value === 'boolean') {
      where.is_active = value;
    } else if (key === 'price') {
      const price = compareClause(value);
      if (!price) return null;
      where.price = price;
    } else {
      return null;
    }
  }
  return where;
}

function serviceWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'storeId') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.stores = { legacy_mongo_id: id };
    } else if (key === 'contractorId') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.users = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'isActive' && typeof value === 'boolean') {
      where.is_active = value;
    } else if (key === 'basePrice') {
      const price = compareClause(value);
      if (!price) return null;
      where.base_price = price;
    } else if (key === 'completionStatus') {
      const status = enumClause(value);
      if (status == null) return null;
      where.completion_status = status;
    } else {
      return null;
    }
  }
  return where;
}

function categoryWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'ownerId') {
      const id = relationLegacy(value);
      if (id == null) return null;
      where.users = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = relationLegacy(value);
      if (id == null) return null;
      if (/^\d+$/.test(id)) {
        where.OR = [{ legacy_mongo_id: id }, { id: BigInt(id) }];
      } else {
        where.legacy_mongo_id = id;
      }
    } else if (key === 'type') {
      const kind = enumClause(value);
      if (kind == null) return null;
      where.category_type = kind;
    } else if (key === 'status') {
      const status = enumClause(value);
      if (status == null) return null;
      where.status = status;
    } else {
      return null;
    }
  }
  return where;
}

function catalogWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === '_id' || key === 'code') {
      if (key === 'code' && typeof value === 'string') {
        where.code = value;
      } else if (key === '_id') {
        const id = relationLegacy(value);
        if (id == null) return null;
        where.legacy_mongo_id = id;
      } else {
        return null;
      }
    } else if (key === 'status') {
      const status = enumClause(value);
      if (status == null) return null;
      where.status = status;
    } else {
      return null;
    }
  }
  return where;
}

function model(loader, Factory, prepare, scope) {
  async function rowsFor(filter) {
    if (scope) {
      const where = scope.where(filter);
      if (where) return scope.rows(where);
    }
    return (await loader()).filter((row) => matches(row, filter));
  }
  return {
    find(filter = {}) {
      return chain(async () => rowsFor(filter));
    },
    findOne(filter = {}) {
      const query = this.find(filter);
      const exec = query.then.bind(query);
      query.then = (resolve, reject) => exec((rows) => resolve(rows[0] || null), reject);
      query.catch = (reject) => Promise.resolve(query).catch(reject);
      return query;
    },
    findById(id) {
      return this.findOne({ _id: id });
    },
    async create(data) {
      const doc = prepare(new Factory({ ...data, _id: data._id }));
      await doc.save();
      return doc;
    },
    async countDocuments(filter = {}) {
      if (scope) {
        const where = scope.where(filter);
        if (where) return scope.count(where);
      }
      return (await loader()).filter((row) => matches(row, filter)).length;
    },
    async deleteMany(filter = {}) {
      const rows = await rowsFor(filter);
      for (const row of rows) {
        if (row.deleteOne) await row.deleteOne();
        else if (row.pgId && Factory === PgMaterial) await prisma.materials.delete({ where: { id: row.pgId } });
      }
      return { deletedCount: rows.length };
    },
    async findOneAndUpdate(filter, update) {
      const doc = await this.findOne(filter);
      if (!doc) return null;
      Object.assign(doc, update.$set || update);
      await doc.save();
      return doc;
    },
    async findOneAndDelete(filter) {
      const doc = await this.findOne(filter);
      if (!doc?.pgId) return doc;
      if (doc.deleteOne) await doc.deleteOne();
      else await prisma.materials.delete({ where: { id: doc.pgId } });
      return doc;
    },
    async aggregate(pipeline) {
      let rows = (await loader()).map((row) => (row.toPlain ? row.toPlain() : { ...row }));
      for (const stage of pipeline) {
        if (stage.$match) rows = rows.filter((row) => matches(row, stage.$match));
        else if (stage.$limit) rows = rows.slice(0, stage.$limit);
        else if (stage.$lookup) rows = await attachLookup(rows, stage.$lookup);
        else if (stage.$unwind) rows = unwind(rows, stage.$unwind);
        else if (stage.$group) rows = groupRows(rows, stage.$group);
      }
      return rows;
    },
  };
}

async function attachLookup(rows, lookup) {
  if (lookup.from === 'stores') {
    const stores = await prisma.stores.findMany({
      include: {
        locations: true,
        users: { select: { legacy_mongo_id: true, account_status: true } },
        store_service_areas: true,
      },
    });
    const byLegacy = new Map(stores.map((row) => [row.legacy_mongo_id, row]));
    return rows.map((row) => ({
      ...row,
      storeDoc: byLegacy.get(legacyOf(row.storeId))
        ? {
            _id: byLegacy.get(legacyOf(row.storeId)).legacy_mongo_id,
            name: byLegacy.get(legacyOf(row.storeId)).name,
            status: byLegacy.get(legacyOf(row.storeId)).status,
            verified: byLegacy.get(legacyOf(row.storeId)).verified,
            contractorId: byLegacy.get(legacyOf(row.storeId)).users?.legacy_mongo_id || null,
            address: byLegacy.get(legacyOf(row.storeId)).locations?.formatted_address || '',
            city: byLegacy.get(legacyOf(row.storeId)).locations?.city || '',
            coverImage: byLegacy.get(legacyOf(row.storeId)).cover_image_url || '',
            avatar: byLegacy.get(legacyOf(row.storeId)).avatar_url || '',
            logo: byLegacy.get(legacyOf(row.storeId)).logo_url || '',
            description: byLegacy.get(legacyOf(row.storeId)).description || '',
            openingHours: byLegacy.get(legacyOf(row.storeId)).opening_hours || '',
            phone: byLegacy.get(legacyOf(row.storeId)).phone || '',
            serviceAreas: (byLegacy.get(legacyOf(row.storeId)).store_service_areas || []).map((area) => area.area_name),
            location: {
              coordinates: [
                Number(byLegacy.get(legacyOf(row.storeId)).locations?.longitude || 0),
                Number(byLegacy.get(legacyOf(row.storeId)).locations?.latitude || 0),
              ],
            },
            locationConfirmed: Boolean(byLegacy.get(legacyOf(row.storeId)).locations?.is_confirmed),
          }
        : null,
    }));
  }
  if (lookup.from === 'contractorprofiles') {
    const profiles = await prisma.contractor_profiles.findMany({
      include: {
        users_contractor_profiles_user_idTousers: { select: { legacy_mongo_id: true } },
        contractor_material_categories: { include: { material_categories: true } },
      },
    });
    const byUser = new Map(profiles.map((row) => [row.users_contractor_profiles_user_idTousers.legacy_mongo_id, row]));
    return rows.map((row) => {
      const ownerId = row.storeDoc?.contractorId;
      const profile = byUser.get(ownerId);
      return {
        ...row,
        profile: profile
          ? {
              verificationStatus: profile.verification_status,
              materialCategories: (profile.contractor_material_categories || []).map((item) => ({
                name: item.material_categories?.name || '',
                status: item.selection_status,
              })),
            }
          : null,
      };
    });
  }
  if (lookup.from === 'users') {
    const users = await prisma.users.findMany({ select: { legacy_mongo_id: true, account_status: true } });
    const byId = new Map(users.map((row) => [row.legacy_mongo_id, row]));
    return rows.map((row) => {
      const owner = byId.get(row.storeDoc?.contractorId);
      return { ...row, owner: owner ? { status: owner.account_status } : null };
    });
  }
  return rows;
}

function unwind(rows, spec) {
  const path = String(spec.path || spec).replace('$', '');
  const preserve = spec.preserveNullAndEmptyArrays === true;
  const next = [];
  for (const row of rows) {
    const value = path.split('.').reduce((current, key) => current?.[key], row);
    if (Array.isArray(value)) {
      if (!value.length && preserve) next.push(row);
      for (const item of value) next.push({ ...row, [path]: item });
    } else if (value == null) {
      if (preserve) next.push(row);
    } else next.push(row);
  }
  return next;
}

function groupRows(rows, spec) {
  const groups = new Map();
  for (const row of rows) {
    const id = spec._id.startsWith('$') ? row[spec._id.slice(1)] : spec._id;
    const key = String(id);
    if (!groups.has(key)) groups.set(key, { _id: id, count: 0, categories: [] });
    const group = groups.get(key);
    if (spec.count) group.count += 1;
    if (spec.categories?.$addToSet) {
      const value = row[spec.categories.$addToSet.slice(1)];
      if (value && !group.categories.includes(value)) group.categories.push(value);
    }
  }
  return [...groups.values()];
}

const materialInclude = {
  material_images: { select: { file_url: true, sort_order: true } },
  material_categories: { select: { id: true, name: true, legacy_mongo_id: true } },
  stores: { select: { legacy_mongo_id: true } },
};
const serviceInclude = {
  service_images: { select: { file_url: true, sort_order: true } },
  service_categories: { select: { name: true } },
  stores: { select: { legacy_mongo_id: true } },
  users: { select: { legacy_mongo_id: true } },
};
const categoryInclude = {
  users: { select: { legacy_mongo_id: true } },
  stores: { select: { legacy_mongo_id: true } },
};

const CatalogService = model(allCatalog, PgCatalog, (doc) => doc, {
  where: catalogWhere,
  rows: (where) => prisma.catalog_services.findMany({ where, include: catalogInclude }).then((rows) => rows.map(catalogFromRow)),
  count: (where) => prisma.catalog_services.count({ where }),
});
const Service = model(allServices, PgService, (doc) => doc, {
  where: serviceWhere,
  rows: (where) => prisma.services.findMany({ where, include: serviceInclude }).then((rows) => rows.map(serviceFromRow)),
  count: (where) => prisma.services.count({ where }),
});
const Material = model(allMaterials, PgMaterial, (doc) => doc, {
  where: materialWhere,
  rows: async (where) => {
    await ensureSaleColumns();
    const rows = await prisma.materials.findMany({ where, include: materialInclude });
    await overlaySaleColumns(rows);
    return rows.map(materialFromRow);
  },
  count: (where) => prisma.materials.count({ where }),
});
Service.countPublicByStores = async function countPublicByStores(storeIds) {
  const ids = [...new Set((storeIds || []).map((id) => String(id || '')).filter(Boolean))];
  const counts = new Map();
  if (!ids.length) return counts;
  const rows = await prisma.services.findMany({
    where: {
      is_active: true,
      base_price: { gt: 0 },
      completion_status: { not: 'INCOMPLETE' },
      stores: { legacy_mongo_id: { in: ids } },
    },
    select: { stores: { select: { legacy_mongo_id: true } } },
  });
  for (const row of rows) {
    const key = row.stores?.legacy_mongo_id;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

Material.countStockByStores = async function countStockByStores(storeIds) {
  const ids = [...new Set((storeIds || []).map((id) => String(id || '')).filter(Boolean))];
  const counts = new Map();
  if (!ids.length) return counts;
  const rows = await prisma.materials.findMany({
    where: { is_active: true, stores: { legacy_mongo_id: { in: ids } } },
    select: { price: true, stores: { select: { legacy_mongo_id: true } } },
  });
  for (const row of rows) {
    const key = row.stores?.legacy_mongo_id;
    if (!key) continue;
    const current = counts.get(key) || { productCount: 0, priceCount: 0 };
    current.productCount += 1;
    if (Number(row.price) > 0) current.priceCount += 1;
    counts.set(key, current);
  }
  return counts;
};

Material.countReadiness = async function countReadiness(storeId) {
  const id = relationLegacy(storeId);
  if (typeof id !== 'string' || !id) return { productCount: 0, priceCount: 0 };
  const rows = await prisma.$queryRaw`
    SELECT
      count(*) FILTER (WHERE m.is_active)::int AS products,
      count(*) FILTER (WHERE m.is_active AND m.price > 0)::int AS priced
    FROM materials m
    JOIN stores s ON s.id = m.store_id
    WHERE s.legacy_mongo_id = ${id}
  `;
  return {
    productCount: Number(rows[0]?.products || 0),
    priceCount: Number(rows[0]?.priced || 0),
  };
};
const MaterialCategory = model(allCategories, PgCategory, (doc) => doc, {
  where: categoryWhere,
  rows: (where) => prisma.material_categories.findMany({ where, include: categoryInclude }).then((rows) => rows.map(categoryFromRow)),
  count: (where) => prisma.material_categories.count({ where }),
});
const ServiceSuggestion = model(allSuggestions, PgSuggestion, (doc) => doc);

module.exports = { CatalogService, Service, Material, MaterialCategory, ServiceSuggestion };
