const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections, asBool } = require('../lib/connections');
const { loadPublicSchema } = require('../lib/schema');
const {
  ident, oid, text, dateOrNull, numOrNull, column, requireColumn, setColumn,
  requireTable, unfilledRequired, insertRow, loadLegacyMap, coordinates,
} = require('../lib/rows');

const PARENTS = [
  'catalog_services',
  'contractor_profiles',
  'stores',
  'services',
  'service_suggestions',
  'material_categories',
  'materials',
  'contractor_ekyc_verifications',
];

const REQUIRED_TABLES = [
  ...PARENTS,
  'service_categories',
  'contractor_profile_steps',
  'contractor_documents',
  'contractor_service_areas',
  'contractor_profile_services',
  'contractor_material_categories',
  'contractor_portfolio_media',
  'contractor_portfolio_projects',
  'contractor_portfolio_project_images',
  'material_images',
  'ekyc_ocr_issues',
  'ekyc_liveness_frames',
  'ekyc_attempts',
];

const FORBIDDEN = new Set(['worker_profiles', 'contractor_workers', 'worker_assignments']);
const STORE_DEFAULT = { lng: 105.787, lat: 10.045 };

function readCollection(mongo, name) {
  return mongo.db.collection(name).find({}).sort({ _id: 1 }).toArray();
}

function storeCoordinates(doc) {
  const point = coordinates(doc);
  if (!point) return null;
  const isDefault = point.lat === STORE_DEFAULT.lat && point.lng === STORE_DEFAULT.lng;
  if (!doc.locationConfirmed && isDefault) return null;
  return point;
}

function imageList(doc) {
  const urls = Array.isArray(doc.images) ? doc.images.map(text).filter(Boolean) : [];
  const primary = text(doc.image);
  if (primary && !urls.includes(primary)) urls.unshift(primary);
  return urls;
}

function validate(source) {
  const problems = [];
  const seenStoreOwner = new Map();
  for (const doc of source.stores) {
    const owner = oid(doc.contractorId);
    if (!owner) problems.push(`store ${oid(doc._id)}: missing contractorId`);
    else if (seenStoreOwner.has(owner)) problems.push(`store ${oid(doc._id)}: duplicate owner ${owner}`);
    else seenStoreOwner.set(owner, oid(doc._id));
    if (!text(doc.name)) problems.push(`store ${oid(doc._id)}: missing name`);
  }
  const emails = new Map();
  for (const doc of source.catalog) {
    const key = text(doc.normalizedName || doc.name);
    if (!key) problems.push(`catalog ${oid(doc._id)}: missing name`);
    const folded = (text(doc.normalizedName) || text(doc.name) || '').toLowerCase();
    if (emails.has(folded)) problems.push(`catalog ${oid(doc._id)}: duplicate normalized name`);
    else emails.set(folded, oid(doc._id));
  }
  for (const doc of source.profiles) {
    if (!oid(doc.userId)) problems.push(`contractor profile ${oid(doc._id)}: missing userId`);
  }
  for (const doc of source.services) {
    if (!oid(doc.storeId) || !oid(doc.contractorId)) problems.push(`service ${oid(doc._id)}: missing storeId or contractorId`);
  }
  for (const doc of source.materials) {
    if (!oid(doc.storeId)) problems.push(`material ${oid(doc._id)}: missing storeId`);
  }
  for (const doc of source.ekyc) {
    if (!oid(doc.userId) || !oid(doc.contractorId)) problems.push(`ekyc ${oid(doc._id)}: missing userId or contractorId`);
  }
  for (const doc of source.suggestions) {
    if (doc.requesterRole && doc.requesterRole !== 'CONTRACTOR') {
      problems.push(`suggestion ${oid(doc._id)}: unsupported requesterRole ${doc.requesterRole}`);
    }
  }
  return problems;
}

function assertSchema(schema) {
  for (const table of REQUIRED_TABLES) requireTable(schema, table);
  for (const table of FORBIDDEN) {
    if (schema[table]) {
      // Present is allowed. This phase must not write to it.
    }
  }
  for (const table of PARENTS) requireColumn(schema, table, ['legacy_mongo_id'], 'legacy_mongo_id');
  requireColumn(schema, 'contractor_documents', ['legacy_mongo_id'], 'legacy_mongo_id');
  requireColumn(schema, 'contractor_portfolio_projects', ['legacy_mongo_id'], 'legacy_mongo_id');
}

async function migratedCount(pg) {
  let total = 0;
  for (const table of PARENTS) {
    const result = await pg.query(`SELECT COUNT(*)::int AS count FROM public.${ident(table)} WHERE legacy_mongo_id IS NOT NULL`);
    total += result.rows[0].count;
  }
  return total;
}

async function loadUsers(pg) {
  return loadLegacyMap(pg, 'users');
}

async function ensureCategory(pg, schema, cache, name) {
  const label = text(name);
  if (!label) return null;
  const key = label.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const nameCol = requireColumn(schema, 'service_categories', ['name', 'label', 'title'], 'category name');
  const row = { [nameCol]: label };
  setColumn(schema, 'service_categories', row, ['code', 'slug'], label);
  const missing = unfilledRequired(schema, 'service_categories', row);
  if (missing.length) {
    throw new Error(`service_categories has no row for "${label}" and cannot insert one. Missing required columns: ${missing.join(', ')}`);
  }
  const id = await insertRow(pg, 'service_categories', row);
  cache.set(key, id);
  return id;
}

async function loadCategories(pg, schema) {
  const nameCol = requireColumn(schema, 'service_categories', ['name', 'label', 'title'], 'category name');
  const codeCol = column(schema, 'service_categories', ['code', 'slug']);
  const result = await pg.query(
    `SELECT id, ${ident(nameCol)} AS name${codeCol ? `, ${ident(codeCol)} AS code` : ''} FROM public.service_categories`,
  );
  const cache = new Map();
  for (const row of result.rows) {
    if (row.name) cache.set(String(row.name).toLowerCase(), row.id);
    if (row.code) cache.set(String(row.code).toLowerCase(), row.id);
  }
  return cache;
}

function mustUser(users, mongoId, label) {
  const id = oid(mongoId);
  if (!id) return null;
  const pgId = users.get(id);
  if (!pgId) throw new Error(`${label}: Mongo user ${id} has no PostgreSQL users.legacy_mongo_id. Phase 1 user was not migrated.`);
  return pgId;
}

async function insertLocation(pg, schema, point, confirmed, createdAt, updatedAt) {
  requireTable(schema, 'locations');
  const row = {};
  setColumn(schema, 'locations', row, ['latitude'], point.lat);
  setColumn(schema, 'locations', row, ['longitude'], point.lng);
  setColumn(schema, 'locations', row, ['is_confirmed', 'location_confirmed'], Boolean(confirmed));
  setColumn(schema, 'locations', row, ['created_at'], createdAt);
  setColumn(schema, 'locations', row, ['updated_at'], updatedAt);
  const missing = unfilledRequired(schema, 'locations', row);
  if (missing.length) throw new Error(`locations insert missing required columns: ${missing.join(', ')}`);
  return insertRow(pg, 'locations', row);
}

function putTimestamps(schema, table, row, doc) {
  setColumn(schema, table, row, ['created_at'], dateOrNull(doc.createdAt) || new Date());
  setColumn(schema, table, row, ['updated_at'], dateOrNull(doc.updatedAt) || dateOrNull(doc.createdAt) || new Date());
}

function guardRow(schema, table, row) {
  const missing = unfilledRequired(schema, table, row);
  if (missing.length) throw new Error(`${table} insert missing required columns: ${missing.join(', ')}`);
}

async function migrate(pg, schema, source, users) {
  const counts = {
    catalog_services: 0,
    service_categories_added: 0,
    contractor_profiles: 0,
    contractor_profile_steps: 0,
    contractor_documents: 0,
    contractor_service_areas: 0,
    contractor_profile_services: 0,
    contractor_material_categories: 0,
    contractor_portfolio_media: 0,
    contractor_portfolio_projects: 0,
    contractor_portfolio_project_images: 0,
    stores: 0,
    store_locations: 0,
    store_media: 0,
    store_service_areas: 0,
    services: 0,
    service_images: 0,
    service_suggestions: 0,
    material_categories: 0,
    materials: 0,
    material_images: 0,
    contractor_ekyc_verifications: 0,
    ekyc_ocr_issues: 0,
    ekyc_liveness_frames: 0,
    ekyc_attempts: 0,
  };
  const unresolved = [];
  const map = {
    catalog_services: {},
    contractor_profiles: {},
    stores: {},
    services: {},
    service_suggestions: {},
    material_categories: {},
    materials: {},
    contractor_ekyc_verifications: {},
    contractor_documents: {},
  };

  const categoriesBefore = await loadCategories(pg, schema);
  const categoryCountBefore = categoriesBefore.size;

  const catalogByCode = new Map();
  for (const doc of source.catalog) {
    const mongoId = oid(doc._id);
    const categoryId = await ensureCategory(pg, schema, categoriesBefore, doc.category);
    const row = { legacy_mongo_id: mongoId };
    const userProposed = doc.proposedBy ? mustUser(users, doc.proposedBy, `catalog ${mongoId} proposedBy`) : null;
    const userReviewed = doc.reviewedBy ? mustUser(users, doc.reviewedBy, `catalog ${mongoId} reviewedBy`) : null;
    setColumn(schema, 'catalog_services', row, ['category_id', 'service_category_id'], categoryId);
    setColumn(schema, 'catalog_services', row, ['category', 'category_name'], text(doc.category));
    if (!column(schema, 'catalog_services', ['category_id', 'service_category_id']) && !column(schema, 'catalog_services', ['category', 'category_name'])) {
      throw new Error('catalog_services has neither category_id nor category');
    }
    setColumn(schema, 'catalog_services', row, ['name'], text(doc.name));
    setColumn(schema, 'catalog_services', row, ['normalized_name'], text(doc.normalizedName));
    setColumn(schema, 'catalog_services', row, ['folded_name'], text(doc.foldedName));
    setColumn(schema, 'catalog_services', row, ['code', 'catalog_key'], text(doc.code));
    setColumn(schema, 'catalog_services', row, ['description'], text(doc.description));
    setColumn(schema, 'catalog_services', row, ['catalog_type', 'type'], text(doc.type));
    setColumn(schema, 'catalog_services', row, ['status'], text(doc.status));
    setColumn(schema, 'catalog_services', row, ['proposed_by', 'proposed_by_user_id'], userProposed);
    setColumn(schema, 'catalog_services', row, ['reviewed_by', 'reviewed_by_user_id'], userReviewed);
    setColumn(schema, 'catalog_services', row, ['reviewed_at'], dateOrNull(doc.reviewedAt));
    putTimestamps(schema, 'catalog_services', row, doc);
    guardRow(schema, 'catalog_services', row);
    const id = await insertRow(pg, 'catalog_services', row);
    map.catalog_services[mongoId] = String(id);
    if (text(doc.code)) catalogByCode.set(text(doc.code), id);
    counts.catalog_services += 1;
  }
  counts.service_categories_added = categoriesBefore.size - categoryCountBefore;

  function resolveCatalog(serviceId) {
    const raw = text(serviceId);
    if (!raw) return null;
    if (/^[0-9a-f]{24}$/i.test(raw) && map.catalog_services[raw]) return Number(map.catalog_services[raw]);
    return catalogByCode.get(raw) || null;
  }

  const materialByMongo = new Map();
  for (const doc of source.materialCategories) {
    const mongoId = oid(doc._id);
    const row = { legacy_mongo_id: mongoId };
    const owner = doc.ownerId ? mustUser(users, doc.ownerId, `material category ${mongoId} ownerId`) : null;
    setColumn(schema, 'material_categories', row, ['name'], text(doc.name));
    setColumn(schema, 'material_categories', row, ['normalized_name'], text(doc.normalizedName));
    setColumn(schema, 'material_categories', row, ['folded_name'], text(doc.foldedName));
    setColumn(schema, 'material_categories', row, ['category_type', 'type'], text(doc.type));
    setColumn(schema, 'material_categories', row, ['status'], text(doc.status));
    setColumn(schema, 'material_categories', row, ['owner_id', 'owner_user_id'], owner);
    putTimestamps(schema, 'material_categories', row, doc);
    const storeMongo = oid(doc.storeId);
    row.__storeMongo = storeMongo;
    materialByMongo.set(mongoId, { row, doc });
  }

  for (const doc of source.profiles) {
    const mongoId = oid(doc._id);
    const row = { legacy_mongo_id: mongoId };
    setColumn(schema, 'contractor_profiles', row, ['user_id', 'owner_user_id'], mustUser(users, doc.userId, `profile ${mongoId}`));
    setColumn(schema, 'contractor_profiles', row, ['business_name'], text(doc.businessName));
    setColumn(schema, 'contractor_profiles', row, ['representative_name'], text(doc.representativeName));
    setColumn(schema, 'contractor_profiles', row, ['contact_phone', 'phone'], text(doc.contactPhone));
    setColumn(schema, 'contractor_profiles', row, ['contact_email', 'email'], text(doc.contactEmail));
    setColumn(schema, 'contractor_profiles', row, ['worker_count'], numOrNull(doc.workerCount) ?? 0);
    setColumn(schema, 'contractor_profiles', row, ['tax_code'], text(doc.taxCode));
    setColumn(schema, 'contractor_profiles', row, ['address'], text(doc.address));
    setColumn(schema, 'contractor_profiles', row, ['city'], text(doc.city));
    setColumn(schema, 'contractor_profiles', row, ['description'], text(doc.description));
    setColumn(schema, 'contractor_profiles', row, ['years_experience'], numOrNull(doc.yearsExperience) ?? 0);
    setColumn(schema, 'contractor_profiles', row, ['verification_status', 'status'], text(doc.verificationStatus));
    setColumn(schema, 'contractor_profiles', row, ['rejection_reason'], text(doc.rejectionReason));
    setColumn(schema, 'contractor_profiles', row, ['submitted_at'], dateOrNull(doc.submittedAt));
    setColumn(schema, 'contractor_profiles', row, ['reviewed_at'], dateOrNull(doc.reviewedAt));
    setColumn(schema, 'contractor_profiles', row, ['reviewed_by', 'reviewed_by_user_id'], doc.reviewedBy ? mustUser(users, doc.reviewedBy, `profile ${mongoId} reviewedBy`) : null);
    setColumn(schema, 'contractor_profiles', row, ['portfolio_avatar', 'avatar_url'], text(doc.portfolio?.avatar));
    setColumn(schema, 'contractor_profiles', row, ['portfolio_team_logo', 'team_logo_url'], text(doc.portfolio?.teamLogo));
    setColumn(schema, 'contractor_profiles', row, ['portfolio_workshop', 'workshop_url'], text(doc.portfolio?.workshop));
    putTimestamps(schema, 'contractor_profiles', row, doc);
    guardRow(schema, 'contractor_profiles', row);
    const profileId = await insertRow(pg, 'contractor_profiles', row);
    map.contractor_profiles[mongoId] = String(profileId);
    counts.contractor_profiles += 1;

    const steps = Array.isArray(doc.completedSteps) ? doc.completedSteps : [];
    for (let index = 0; index < steps.length; index += 1) {
      const step = {};
      setColumn(schema, 'contractor_profile_steps', step, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_profile_steps', step, ['step_index', 'step_number', 'position'], index);
      setColumn(schema, 'contractor_profile_steps', step, ['is_completed', 'completed'], steps[index] === true);
      guardRow(schema, 'contractor_profile_steps', step);
      await insertRow(pg, 'contractor_profile_steps', step);
      counts.contractor_profile_steps += 1;
    }

    for (const document of doc.documents || []) {
      const documentMongo = oid(document._id);
      const child = { legacy_mongo_id: documentMongo };
      setColumn(schema, 'contractor_documents', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_documents', child, ['document_type', 'type'], text(document.type));
      setColumn(schema, 'contractor_documents', child, ['url', 'file_url'], text(document.url));
      setColumn(schema, 'contractor_documents', child, ['original_name'], text(document.originalName));
      setColumn(schema, 'contractor_documents', child, ['mime_type'], text(document.mimeType));
      setColumn(schema, 'contractor_documents', child, ['file_size', 'size_bytes', 'size'], numOrNull(document.size) ?? 0);
      setColumn(schema, 'contractor_documents', child, ['uploaded_at'], dateOrNull(document.uploadedAt));
      guardRow(schema, 'contractor_documents', child);
      const documentId = await insertRow(pg, 'contractor_documents', child);
      if (documentMongo) map.contractor_documents[documentMongo] = String(documentId);
      counts.contractor_documents += 1;
    }

    for (let index = 0; index < (doc.serviceAreas || []).length; index += 1) {
      const areaName = text(doc.serviceAreas[index]);
      if (!areaName) continue;
      const child = {};
      setColumn(schema, 'contractor_service_areas', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_service_areas', child, ['area_name', 'name', 'label'], areaName);
      setColumn(schema, 'contractor_service_areas', child, ['sort_order', 'position'], index);
      guardRow(schema, 'contractor_service_areas', child);
      await insertRow(pg, 'contractor_service_areas', child);
      counts.contractor_service_areas += 1;
    }

    for (const service of doc.services || []) {
      const child = {};
      const linked = resolveCatalog(service.serviceId);
      if (text(service.serviceId) && !linked) unresolved.push(`profile ${mongoId} service "${text(service.name)}" serviceId ${text(service.serviceId)} has no catalog row`);
      setColumn(schema, 'contractor_profile_services', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_profile_services', child, ['catalog_service_id', 'service_id'], linked);
      setColumn(schema, 'contractor_profile_services', child, ['category', 'category_name'], text(service.category));
      setColumn(schema, 'contractor_profile_services', child, ['name', 'service_name'], text(service.name));
      setColumn(schema, 'contractor_profile_services', child, ['catalog_type', 'type'], text(service.type));
      setColumn(schema, 'contractor_profile_services', child, ['service_code', 'catalog_key'], text(service.serviceId));
      setColumn(schema, 'contractor_profile_services', child, ['status'], text(service.status));
      guardRow(schema, 'contractor_profile_services', child);
      await insertRow(pg, 'contractor_profile_services', child);
      counts.contractor_profile_services += 1;
    }

    for (const category of doc.materialCategories || []) {
      const linked = /^[0-9a-f]{24}$/i.test(text(category.categoryId) || '') ? text(category.categoryId) : null;
      const child = {};
      setColumn(schema, 'contractor_material_categories', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_material_categories', child, ['name'], text(category.name));
      setColumn(schema, 'contractor_material_categories', child, ['category_type', 'type'], text(category.type));
      setColumn(schema, 'contractor_material_categories', child, ['status'], text(category.status));
      setColumn(schema, 'contractor_material_categories', child, ['category_code', 'source_category_id'], text(category.categoryId));
      child.__materialMongo = linked;
      counts.contractor_material_categories += 1;
      category.__row = child;
      category.__profileId = profileId;
    }

    async function addMedia(kind, url, sortOrder) {
      const fileUrl = text(url);
      if (!fileUrl) return;
      const child = {};
      setColumn(schema, 'contractor_portfolio_media', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_portfolio_media', child, ['media_type', 'kind', 'type'], kind);
      setColumn(schema, 'contractor_portfolio_media', child, ['url', 'file_url', 'image_url'], fileUrl);
      setColumn(schema, 'contractor_portfolio_media', child, ['sort_order', 'position'], sortOrder);
      guardRow(schema, 'contractor_portfolio_media', child);
      await insertRow(pg, 'contractor_portfolio_media', child);
      counts.contractor_portfolio_media += 1;
    }
    const portfolio = doc.portfolio || {};
    if (!column(schema, 'contractor_profiles', ['portfolio_avatar', 'avatar_url'])) await addMedia('AVATAR', portfolio.avatar, 0);
    if (!column(schema, 'contractor_profiles', ['portfolio_team_logo', 'team_logo_url'])) await addMedia('TEAM_LOGO', portfolio.teamLogo, 0);
    if (!column(schema, 'contractor_profiles', ['portfolio_workshop', 'workshop_url'])) await addMedia('WORKSHOP', portfolio.workshop, 0);
    for (let index = 0; index < (portfolio.construction || []).length; index += 1) await addMedia('CONSTRUCTION', portfolio.construction[index], index);
    for (let index = 0; index < (portfolio.certificates || []).length; index += 1) await addMedia('CERTIFICATE', portfolio.certificates[index], index);

    for (const project of portfolio.projects || []) {
      const projectMongo = oid(project._id);
      const child = { legacy_mongo_id: projectMongo };
      setColumn(schema, 'contractor_portfolio_projects', child, ['contractor_profile_id', 'profile_id'], profileId);
      setColumn(schema, 'contractor_portfolio_projects', child, ['service_code', 'catalog_key'], text(project.serviceId));
      setColumn(schema, 'contractor_portfolio_projects', child, ['catalog_service_id'], resolveCatalog(project.serviceId));
      setColumn(schema, 'contractor_portfolio_projects', child, ['service_name_snapshot', 'service_name'], text(project.serviceNameSnapshot));
      setColumn(schema, 'contractor_portfolio_projects', child, ['description'], text(project.description));
      guardRow(schema, 'contractor_portfolio_projects', child);
      const projectId = await insertRow(pg, 'contractor_portfolio_projects', child);
      counts.contractor_portfolio_projects += 1;
      for (let index = 0; index < (project.images || []).length; index += 1) {
        const fileUrl = text(project.images[index]);
        if (!fileUrl) continue;
        const image = {};
        setColumn(schema, 'contractor_portfolio_project_images', image, ['project_id', 'portfolio_project_id'], projectId);
        setColumn(schema, 'contractor_portfolio_project_images', image, ['url', 'image_url', 'file_url'], fileUrl);
        setColumn(schema, 'contractor_portfolio_project_images', image, ['sort_order', 'position'], index);
        guardRow(schema, 'contractor_portfolio_project_images', image);
        await insertRow(pg, 'contractor_portfolio_project_images', image);
        counts.contractor_portfolio_project_images += 1;
      }
    }
  }

  for (const doc of source.stores) {
    const mongoId = oid(doc._id);
    const point = storeCoordinates(doc);
    const locationId = point
      ? await insertLocation(pg, schema, point, doc.locationConfirmed === true, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt))
      : null;
    if (locationId) counts.store_locations += 1;
    const row = { legacy_mongo_id: mongoId };
    setColumn(schema, 'stores', row, ['contractor_id', 'owner_user_id', 'user_id'], mustUser(users, doc.contractorId, `store ${mongoId}`));
    setColumn(schema, 'stores', row, ['location_id'], locationId);
    setColumn(schema, 'stores', row, ['name'], text(doc.name));
    setColumn(schema, 'stores', row, ['slogan'], text(doc.slogan));
    setColumn(schema, 'stores', row, ['description'], text(doc.description));
    setColumn(schema, 'stores', row, ['phone', 'contact_phone'], text(doc.phone));
    setColumn(schema, 'stores', row, ['contact_name'], text(doc.contactName));
    setColumn(schema, 'stores', row, ['contact_email'], text(doc.contactEmail));
    setColumn(schema, 'stores', row, ['address'], text(doc.address));
    setColumn(schema, 'stores', row, ['city'], text(doc.city));
    setColumn(schema, 'stores', row, ['store_type'], text(doc.storeType));
    setColumn(schema, 'stores', row, ['cover_image', 'cover_image_url'], text(doc.coverImage));
    setColumn(schema, 'stores', row, ['avatar', 'avatar_url'], text(doc.avatar));
    setColumn(schema, 'stores', row, ['logo', 'logo_url'], text(doc.logo));
    setColumn(schema, 'stores', row, ['achievements'], text(doc.achievements));
    setColumn(schema, 'stores', row, ['showroom_note'], text(doc.showroomNote));
    setColumn(schema, 'stores', row, ['delivery_note'], text(doc.deliveryNote));
    setColumn(schema, 'stores', row, ['delivery_enabled'], Boolean(doc.deliveryEnabled));
    setColumn(schema, 'stores', row, ['base_delivery_fee'], numOrNull(doc.baseDeliveryFee) ?? 0);
    setColumn(schema, 'stores', row, ['free_delivery_radius_km'], numOrNull(doc.freeDeliveryRadiusKm) ?? 0);
    setColumn(schema, 'stores', row, ['delivery_fee_per_km'], numOrNull(doc.deliveryFeePerKm) ?? 0);
    setColumn(schema, 'stores', row, ['minimum_order_amount'], numOrNull(doc.minimumOrderAmount) ?? 0);
    setColumn(schema, 'stores', row, ['display_years'], numOrNull(doc.displayYears));
    setColumn(schema, 'stores', row, ['display_worker_count'], numOrNull(doc.displayWorkerCount));
    setColumn(schema, 'stores', row, ['public_seeded'], Boolean(doc.publicSeeded));
    setColumn(schema, 'stores', row, ['opening_hours'], text(doc.openingHours));
    setColumn(schema, 'stores', row, ['service_radius_km'], numOrNull(doc.serviceRadiusKm));
    setColumn(schema, 'stores', row, ['category', 'category_name'], text(doc.category));
    setColumn(schema, 'stores', row, ['verified', 'is_verified'], Boolean(doc.verified));
    setColumn(schema, 'stores', row, ['rating'], numOrNull(doc.rating) ?? 0);
    setColumn(schema, 'stores', row, ['review_count'], numOrNull(doc.reviewCount) ?? 0);
    setColumn(schema, 'stores', row, ['material_rating'], numOrNull(doc.materialRating) ?? 0);
    setColumn(schema, 'stores', row, ['material_review_count'], numOrNull(doc.materialReviewCount) ?? 0);
    setColumn(schema, 'stores', row, ['status'], text(doc.status));
    setColumn(schema, 'stores', row, ['location_confirmed'], Boolean(doc.locationConfirmed));
    setColumn(schema, 'stores', row, ['location_source'], text(doc.locationSource));
    setColumn(schema, 'stores', row, ['location_confirmed_at'], dateOrNull(doc.locationConfirmedAt));
    putTimestamps(schema, 'stores', row, doc);
    guardRow(schema, 'stores', row);
    const storeId = await insertRow(pg, 'stores', row);
    map.stores[mongoId] = String(storeId);
    counts.stores += 1;

    const mediaTable = ['store_media', 'store_images'].find((name) => schema[name]);
    async function addStoreMedia(kind, url, sortOrder) {
      const fileUrl = text(url);
      if (!fileUrl) return;
      if (!mediaTable) throw new Error(`Store ${mongoId} has ${kind} media but neither store_media nor store_images exists`);
      const child = {};
      setColumn(schema, mediaTable, child, ['store_id'], storeId);
      setColumn(schema, mediaTable, child, ['media_type', 'kind', 'image_type', 'type'], kind);
      setColumn(schema, mediaTable, child, ['url', 'image_url', 'file_url'], fileUrl);
      setColumn(schema, mediaTable, child, ['sort_order', 'position'], sortOrder);
      guardRow(schema, mediaTable, child);
      await insertRow(pg, mediaTable, child);
      counts.store_media += 1;
    }
    for (let index = 0; index < (doc.gallery || []).length; index += 1) await addStoreMedia('GALLERY', doc.gallery[index], index);
    for (let index = 0; index < (doc.crewPhotos || []).length; index += 1) await addStoreMedia('CREW', doc.crewPhotos[index], index);
    for (let index = 0; index < (doc.publicCertificates || []).length; index += 1) await addStoreMedia('CERTIFICATE', doc.publicCertificates[index], index);

    const areaTable = schema.store_service_areas ? 'store_service_areas' : null;
    for (let index = 0; index < (doc.serviceAreas || []).length; index += 1) {
      const areaName = text(doc.serviceAreas[index]);
      if (!areaName) continue;
      if (!areaTable) throw new Error(`Store ${mongoId} has serviceAreas but public.store_service_areas does not exist`);
      const child = {};
      setColumn(schema, areaTable, child, ['store_id'], storeId);
      setColumn(schema, areaTable, child, ['area_name', 'name', 'label'], areaName);
      setColumn(schema, areaTable, child, ['sort_order', 'position'], index);
      guardRow(schema, areaTable, child);
      await insertRow(pg, areaTable, child);
      counts.store_service_areas += 1;
    }
  }

  for (const [mongoId, packed] of materialByMongo) {
    const row = packed.row;
    const storeMongo = row.__storeMongo;
    delete row.__storeMongo;
    if (storeMongo) {
      if (!map.stores[storeMongo]) throw new Error(`material category ${mongoId}: store ${storeMongo} was not migrated`);
      setColumn(schema, 'material_categories', row, ['store_id'], Number(map.stores[storeMongo]));
    }
    guardRow(schema, 'material_categories', row);
    const id = await insertRow(pg, 'material_categories', row);
    map.material_categories[mongoId] = String(id);
    counts.material_categories += 1;
  }

  for (const doc of source.profiles) {
    for (const category of doc.materialCategories || []) {
      const child = category.__row;
      const profileId = category.__profileId;
      if (!child || !profileId) continue;
      const linkedMongo = child.__materialMongo;
      delete child.__materialMongo;
      if (linkedMongo) {
        if (!map.material_categories[linkedMongo]) unresolved.push(`profile ${oid(doc._id)} material categoryId ${linkedMongo} has no material_categories row`);
        else setColumn(schema, 'contractor_material_categories', child, ['material_category_id'], Number(map.material_categories[linkedMongo]));
      }
      if (!column(schema, 'contractor_material_categories', ['contractor_profile_id', 'profile_id'])) {
        throw new Error('contractor_material_categories has no profile foreign key');
      }
      guardRow(schema, 'contractor_material_categories', child);
      await insertRow(pg, 'contractor_material_categories', child);
    }
  }

  for (const doc of source.services) {
    const mongoId = oid(doc._id);
    const storeMongo = oid(doc.storeId);
    if (!map.stores[storeMongo]) throw new Error(`service ${mongoId}: store ${storeMongo} was not migrated`);
    const linked = resolveCatalog(doc.catalogKey);
    if (text(doc.catalogKey) && !linked) unresolved.push(`service ${mongoId} catalogKey ${text(doc.catalogKey)} has no catalog row`);
    const categoryId = await ensureCategory(pg, schema, categoriesBefore, doc.category);
    const row = { legacy_mongo_id: mongoId };
    setColumn(schema, 'services', row, ['store_id'], Number(map.stores[storeMongo]));
    setColumn(schema, 'services', row, ['contractor_id', 'contractor_user_id', 'user_id'], mustUser(users, doc.contractorId, `service ${mongoId}`));
    setColumn(schema, 'services', row, ['catalog_service_id'], linked);
    setColumn(schema, 'services', row, ['category_id', 'service_category_id'], categoryId);
    setColumn(schema, 'services', row, ['name'], text(doc.name));
    setColumn(schema, 'services', row, ['category', 'category_name'], text(doc.category));
    setColumn(schema, 'services', row, ['catalog_key'], text(doc.catalogKey));
    setColumn(schema, 'services', row, ['catalog_type'], text(doc.catalogType));
    setColumn(schema, 'services', row, ['completion_status'], text(doc.completionStatus));
    setColumn(schema, 'services', row, ['description'], text(doc.description));
    setColumn(schema, 'services', row, ['base_price'], numOrNull(doc.basePrice));
    setColumn(schema, 'services', row, ['unit'], text(doc.unit));
    setColumn(schema, 'services', row, ['estimated_hours'], numOrNull(doc.estimatedHours));
    setColumn(schema, 'services', row, ['image', 'image_url'], text(doc.image));
    setColumn(schema, 'services', row, ['price_min'], numOrNull(doc.priceRange?.min));
    setColumn(schema, 'services', row, ['price_max'], numOrNull(doc.priceRange?.max));
    setColumn(schema, 'services', row, ['is_active'], doc.isActive !== false);
    putTimestamps(schema, 'services', row, doc);
    guardRow(schema, 'services', row);
    const serviceId = await insertRow(pg, 'services', row);
    map.services[mongoId] = String(serviceId);
    counts.services += 1;
    if (schema.service_images) {
      const urls = imageList(doc);
      for (let index = 0; index < urls.length; index += 1) {
        const image = {};
        setColumn(schema, 'service_images', image, ['service_id'], serviceId);
        setColumn(schema, 'service_images', image, ['url', 'image_url', 'file_url'], urls[index]);
        setColumn(schema, 'service_images', image, ['sort_order', 'position'], index);
        guardRow(schema, 'service_images', image);
        await insertRow(pg, 'service_images', image);
        counts.service_images += 1;
      }
    }
  }

  for (const doc of source.suggestions) {
    const mongoId = oid(doc._id);
    const providerMongo = oid(doc.providerId);
    const convertedMongo = oid(doc.convertedServiceId);
    if (providerMongo && !map.contractor_profiles[providerMongo]) {
      throw new Error(`suggestion ${mongoId}: contractor profile ${providerMongo} was not migrated`);
    }
    if (convertedMongo && !map.catalog_services[convertedMongo]) {
      throw new Error(`suggestion ${mongoId}: catalog service ${convertedMongo} was not migrated`);
    }
    const row = { legacy_mongo_id: mongoId };
    setColumn(schema, 'service_suggestions', row, ['requester_id', 'requester_user_id'], mustUser(users, doc.requesterId, `suggestion ${mongoId}`));
    setColumn(schema, 'service_suggestions', row, ['requester_role'], text(doc.requesterRole));
    setColumn(schema, 'service_suggestions', row, ['contractor_profile_id', 'provider_id'], providerMongo ? Number(map.contractor_profiles[providerMongo]) : null);
    setColumn(schema, 'service_suggestions', row, ['team_name'], text(doc.teamName));
    setColumn(schema, 'service_suggestions', row, ['description'], text(doc.description));
    setColumn(schema, 'service_suggestions', row, ['status'], text(doc.status));
    setColumn(schema, 'service_suggestions', row, ['reviewed_by', 'reviewed_by_user_id'], doc.reviewedBy ? mustUser(users, doc.reviewedBy, `suggestion ${mongoId} reviewedBy`) : null);
    setColumn(schema, 'service_suggestions', row, ['reviewed_at'], dateOrNull(doc.reviewedAt));
    setColumn(schema, 'service_suggestions', row, ['admin_note'], text(doc.adminNote));
    setColumn(schema, 'service_suggestions', row, ['catalog_service_id', 'converted_service_id'], convertedMongo ? Number(map.catalog_services[convertedMongo]) : null);
    putTimestamps(schema, 'service_suggestions', row, doc);
    guardRow(schema, 'service_suggestions', row);
    map.service_suggestions[mongoId] = String(await insertRow(pg, 'service_suggestions', row));
    counts.service_suggestions += 1;
  }

  for (const doc of source.materials) {
    const mongoId = oid(doc._id);
    const storeMongo = oid(doc.storeId);
    if (!map.stores[storeMongo]) throw new Error(`material ${mongoId}: store ${storeMongo} was not migrated`);
    const row = { legacy_mongo_id: mongoId };
    setColumn(schema, 'materials', row, ['store_id'], Number(map.stores[storeMongo]));
    setColumn(schema, 'materials', row, ['name'], text(doc.name));
    setColumn(schema, 'materials', row, ['category', 'category_name'], text(doc.category));
    setColumn(schema, 'materials', row, ['sku'], text(doc.sku));
    setColumn(schema, 'materials', row, ['unit'], text(doc.unit));
    setColumn(schema, 'materials', row, ['price'], numOrNull(doc.price));
    setColumn(schema, 'materials', row, ['stock'], numOrNull(doc.stock) ?? 0);
    setColumn(schema, 'materials', row, ['min_order_qty'], numOrNull(doc.minOrderQty) ?? 1);
    setColumn(schema, 'materials', row, ['image', 'image_url'], text(doc.image));
    setColumn(schema, 'materials', row, ['description'], text(doc.description));
    setColumn(schema, 'materials', row, ['is_active'], doc.isActive !== false);
    putTimestamps(schema, 'materials', row, doc);
    guardRow(schema, 'materials', row);
    const materialId = await insertRow(pg, 'materials', row);
    map.materials[mongoId] = String(materialId);
    counts.materials += 1;
    const urls = imageList(doc);
    for (let index = 0; index < urls.length; index += 1) {
      const image = {};
      setColumn(schema, 'material_images', image, ['material_id'], materialId);
      setColumn(schema, 'material_images', image, ['url', 'image_url', 'file_url'], urls[index]);
      setColumn(schema, 'material_images', image, ['sort_order', 'position'], index);
      guardRow(schema, 'material_images', image);
      await insertRow(pg, 'material_images', image);
      counts.material_images += 1;
    }
  }

  async function insertEkyc(doc, attempt, parentId) {
    const target = attempt ? 'ekyc_attempts' : 'contractor_ekyc_verifications';
    const mongoId = oid((attempt || doc)._id);
    const row = {};
    if (!column(schema, target, ['legacy_mongo_id'])) {
      throw new Error(`${target} has no legacy_mongo_id column for ${mongoId}`);
    }
    row.legacy_mongo_id = mongoId;
    const sourceDoc = attempt || doc;
    if (!attempt) {
      const profileMongo = oid(doc.contractorId);
      if (!map.contractor_profiles[profileMongo]) throw new Error(`ekyc ${mongoId}: profile ${profileMongo} was not migrated`);
      setColumn(schema, target, row, ['contractor_profile_id', 'contractor_id'], Number(map.contractor_profiles[profileMongo]));
      setColumn(schema, target, row, ['user_id'], mustUser(users, doc.userId, `ekyc ${mongoId}`));
      setColumn(schema, target, row, ['reference_code'], text(doc.referenceCode));
      setColumn(schema, target, row, ['retake_reason'], text(doc.retakeReason));
      const front = oid(doc.frontDocumentId);
      const back = oid(doc.backDocumentId);
      if (front && !map.contractor_documents[front]) unresolved.push(`ekyc ${mongoId}: frontDocumentId ${front} has no contractor document`);
      if (back && !map.contractor_documents[back]) unresolved.push(`ekyc ${mongoId}: backDocumentId ${back} has no contractor document`);
      setColumn(schema, target, row, ['front_document_id'], front && map.contractor_documents[front] ? Number(map.contractor_documents[front]) : null);
      setColumn(schema, target, row, ['back_document_id'], back && map.contractor_documents[back] ? Number(map.contractor_documents[back]) : null);
    } else {
      setColumn(schema, target, row, ['ekyc_verification_id', 'verification_id', 'contractor_ekyc_verification_id'], parentId);
      setColumn(schema, target, row, ['archived_at'], dateOrNull(attempt.archivedAt));
    }
    setColumn(schema, target, row, ['status'], text(sourceDoc.status));
    setColumn(schema, target, row, ['card_front_url', 'front_image_url'], text(sourceDoc.cardImages?.front));
    setColumn(schema, target, row, ['card_back_url', 'back_image_url'], text(sourceDoc.cardImages?.back));
    setColumn(schema, target, row, ['ocr_id_number', 'id_number'], text(sourceDoc.ocr?.idNumber));
    setColumn(schema, target, row, ['ocr_full_name', 'full_name'], text(sourceDoc.ocr?.fullName));
    setColumn(schema, target, row, ['ocr_date_of_birth', 'date_of_birth'], text(sourceDoc.ocr?.dateOfBirth));
    setColumn(schema, target, row, ['ocr_gender', 'gender'], text(sourceDoc.ocr?.gender));
    setColumn(schema, target, row, ['ocr_hometown', 'hometown'], text(sourceDoc.ocr?.hometown));
    setColumn(schema, target, row, ['ocr_passed'], Boolean(sourceDoc.ocr?.passed));
    setColumn(schema, target, row, ['liveness_passed'], Boolean(sourceDoc.liveness?.passed));
    setColumn(schema, target, row, ['face_decision', 'face_match_decision'], text(sourceDoc.faceMatch?.decision));
    setColumn(schema, target, row, ['face_matched'], sourceDoc.faceMatch ? Boolean(sourceDoc.faceMatch.matched) : null);
    setColumn(schema, target, row, ['face_distance'], numOrNull(sourceDoc.faceMatch?.distance));
    setColumn(schema, target, row, ['face_threshold'], numOrNull(sourceDoc.faceMatch?.threshold));
    const faceCol = column(schema, target, ['face_template', 'face_embedding']);
    if (Array.isArray(sourceDoc.faceTemplate) && sourceDoc.faceTemplate.length && faceCol) {
      const meta = schema[target].columns[faceCol];
      if (meta.udtName === 'jsonb' || meta.dataType === 'jsonb') row[faceCol] = JSON.stringify(sourceDoc.faceTemplate);
      else if (meta.dataType === 'ARRAY') row[faceCol] = sourceDoc.faceTemplate;
      else throw new Error(`${target}.${faceCol} is ${meta.dataType}; faceTemplate was not converted`);
    } else if (Array.isArray(sourceDoc.faceTemplate) && sourceDoc.faceTemplate.length) {
      throw new Error(`${target} has faceTemplate data but no jsonb/array column`);
    }
    const review = sourceDoc.adminReview || {};
    setColumn(schema, target, row, ['reviewed_by', 'reviewed_by_user_id'], review.reviewedBy ? mustUser(users, review.reviewedBy, `${target} ${mongoId} reviewer`) : null);
    setColumn(schema, target, row, ['reviewed_at'], dateOrNull(review.reviewedAt));
    setColumn(schema, target, row, ['review_decision'], text(review.decision));
    setColumn(schema, target, row, ['review_note'], text(review.note));
    setColumn(schema, target, row, ['submitted_at'], dateOrNull(sourceDoc.submittedAt));
    setColumn(schema, target, row, ['processed_at'], dateOrNull(sourceDoc.processedAt));
    if (!attempt) putTimestamps(schema, target, row, doc);
    guardRow(schema, target, row);
    const id = await insertRow(pg, target, row);
    if (!attempt) {
      map.contractor_ekyc_verifications[mongoId] = String(id);
      counts.contractor_ekyc_verifications += 1;
    } else counts.ekyc_attempts += 1;

    const issues = sourceDoc.ocr?.issues || [];
    for (let index = 0; index < issues.length; index += 1) {
      const issueText = text(issues[index]);
      if (!issueText) continue;
      const issue = {};
      const fk = attempt
        ? ['ekyc_attempt_id', 'attempt_id']
        : ['ekyc_verification_id', 'verification_id', 'contractor_ekyc_verification_id'];
      setColumn(schema, 'ekyc_ocr_issues', issue, fk, id);
      setColumn(schema, 'ekyc_ocr_issues', issue, ['issue', 'issue_text', 'message'], issueText);
      setColumn(schema, 'ekyc_ocr_issues', issue, ['sort_order', 'position'], index);
      guardRow(schema, 'ekyc_ocr_issues', issue);
      await insertRow(pg, 'ekyc_ocr_issues', issue);
      counts.ekyc_ocr_issues += 1;
    }

    const frames = [
      ['CENTER', sourceDoc.liveness?.centerImage],
      ['LEFT', sourceDoc.liveness?.leftImage],
      ['RIGHT', sourceDoc.liveness?.rightImage],
      ['UP', sourceDoc.liveness?.upImage],
      ['DOWN', sourceDoc.liveness?.downImage],
    ];
    for (let index = 0; index < frames.length; index += 1) {
      const fileUrl = text(frames[index][1]);
      if (!fileUrl) continue;
      const frame = {};
      const fk = attempt
        ? ['ekyc_attempt_id', 'attempt_id']
        : ['ekyc_verification_id', 'verification_id', 'contractor_ekyc_verification_id'];
      setColumn(schema, 'ekyc_liveness_frames', frame, fk, id);
      setColumn(schema, 'ekyc_liveness_frames', frame, ['position', 'frame_type', 'direction'], frames[index][0]);
      setColumn(schema, 'ekyc_liveness_frames', frame, ['url', 'image_url', 'file_url'], fileUrl);
      setColumn(schema, 'ekyc_liveness_frames', frame, ['sort_order', 'position'], index);
      guardRow(schema, 'ekyc_liveness_frames', frame);
      await insertRow(pg, 'ekyc_liveness_frames', frame);
      counts.ekyc_liveness_frames += 1;
    }
    return id;
  }

  for (const doc of source.ekyc) {
    const ekycId = await insertEkyc(doc, null, null);
    for (const attempt of doc.attempts || []) await insertEkyc(doc, attempt, ekycId);
  }

  if (unresolved.length) {
    throw new Error(`Unmapped references:\n- ${unresolved.join('\n- ')}`);
  }
  return { counts, map };
}

async function main() {
  let pg;
  let schema;
  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    schema = await loadPublicSchema(pg);
    assertSchema(schema);
    const source = {
      profiles: await readCollection(mongo, 'contractorprofiles'),
      stores: await readCollection(mongo, 'stores'),
      catalog: await readCollection(mongo, 'catalogservices'),
      services: await readCollection(mongo, 'services'),
      suggestions: await readCollection(mongo, 'servicesuggestions'),
      materialCategories: await readCollection(mongo, 'materialcategories'),
      materials: await readCollection(mongo, 'materials'),
      ekyc: await readCollection(mongo, 'contractorekycverifications'),
    };
    const problems = validate(source);
    if (problems.length) {
      throw new Error(`Source validation failed. PostgreSQL was not changed.\n- ${problems.join('\n- ')}`);
    }
    const existing = await migratedCount(pg);
    if (existing > 0 && !asBool(process.env.MIGRATION_ALLOW_NONEMPTY, false)) {
      throw new Error(`PostgreSQL already has ${existing} provider/catalog legacy row(s). Set MIGRATION_ALLOW_NONEMPTY=true only for an intentional rerun.`);
    }
    const users = await loadUsers(pg);
    console.log(`Migrating provider/catalog: profiles=${source.profiles.length}, stores=${source.stores.length}, catalog=${source.catalog.length}, services=${source.services.length}`);
    await pg.query('BEGIN');
    const { counts, map } = await migrate(pg, schema, source, users);
    await pg.query('COMMIT');
    const output = path.resolve(__dirname, '../output/provider-catalog-map.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, map }, null, 2)}\n`);
    console.log(JSON.stringify(counts, null, 2));
    console.log('Provider/catalog migration COMMITTED.');
  } catch (err) {
    if (pg) {
      try { await pg.query('ROLLBACK'); } catch (_) {}
    }
    if (schema) {
      const gapPath = path.resolve(__dirname, '../output/provider-schema-gap.json');
      fs.mkdirSync(path.dirname(gapPath), { recursive: true });
      const interesting = {};
      for (const [name, meta] of Object.entries(schema)) {
        if (/contractor|store|catalog|service|material|ekyc|worker|location/.test(name)) {
          interesting[name] = { columns: Object.keys(meta.columns), fks: meta.fks };
        }
      }
      fs.writeFileSync(gapPath, `${JSON.stringify({ error: err.message, tables: interesting }, null, 2)}\n`);
    }
    throw err;
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nProvider/catalog migration FAILED:', err.message);
  process.exitCode = 1;
});
