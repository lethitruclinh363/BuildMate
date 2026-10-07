/**
 * Copy Catalog, Service, ServiceSuggestion, MaterialCategory, and Material
 * from MongoDB into the existing PostgreSQL tables.
 * Does not truncate, delete, or update MongoDB.
 */
const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');
const { prisma } = require('../../src/config/prisma');

const CATALOG_STATUS = new Set(['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE']);
const CATALOG_TYPE = new Set(['SYSTEM', 'CUSTOM']);
const SERVICE_UNIT = new Set(['JOB', 'HOUR', 'M2', 'DAY']);
const COMPLETION = new Set(['INCOMPLETE', 'COMPLETED']);
const OFFERING_TYPE = new Set(['SYSTEM', 'CUSTOM', 'LEGACY']);
const SUGGESTION_STATUS = new Set(['PENDING', 'APPROVED', 'REJECTED', 'CONVERTED']);
const CATEGORY_TYPE = new Set(['SYSTEM', 'CUSTOM']);
const CATEGORY_STATUS = new Set(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function idOf(value) {
  if (!value) return '';
  return String(value);
}

function money(value, scale = 2) {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (/^\d+(\.\d+)?$/.test(raw)) return raw;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toFixed(scale);
}

function imagesOf(doc) {
  const list = Array.isArray(doc.images) ? doc.images.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (!list.length && doc.image) list.push(String(doc.image));
  return list;
}

function skip(report, bucket, mongoId, reason, extra = {}) {
  const entry = { collection: bucket, mongo_id: mongoId, reason, ...extra };
  report.skipped.push(entry);
  if (/not in PostgreSQL/.test(reason)) report.orphans.push(entry);
}

function note(report, bucket, mongoId, reason, extra = {}) {
  report.orphans.push({ collection: bucket, mongo_id: mongoId, reason, inserted_without_reference: true, ...extra });
}

async function collection(mongo, names) {
  const existing = new Set((await mongo.db.listCollections().toArray()).map((item) => item.name));
  const name = names.find((item) => existing.has(item));
  if (!name) return [];
  return mongo.db.collection(name).find({}).toArray();
}

async function counts(pg) {
  const tables = [
    'service_categories',
    'catalog_services',
    'services',
    'service_images',
    'service_suggestions',
    'material_categories',
    'materials',
    'material_images',
  ];
  const out = {};
  for (const table of tables) {
    out[table] = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.${table}`)).rows[0].count);
  }
  return out;
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'catalog-service-material-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo: {},
    postgres_before: {},
    inserted: {},
    already_mapped: {},
    linked_existing: {},
    skipped: [],
    orphans: [],
    collisions: [],
    price_mismatches: [],
    postgres_after: {},
    mongo_after: {},
    mongo_writes: false,
  };
  const inserted = {
    catalog_services: 0,
    services: 0,
    service_suggestions: 0,
    material_categories: 0,
    materials: 0,
  };
  const already = { ...inserted };
  const linked = { catalog_services: 0, material_categories: 0 };
  report.inserted = inserted;
  report.already_mapped = already;
  report.linked_existing = linked;

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const mongoBefore = {
      catalogservices: (await collection(mongo, ['catalogservices'])).length,
      services: (await collection(mongo, ['services'])).length,
      servicesuggestions: (await collection(mongo, ['servicesuggestions'])).length,
      materialcategories: (await collection(mongo, ['materialcategories'])).length,
      materials: (await collection(mongo, ['materials'])).length,
    };
    report.mongo = mongoBefore;
    report.postgres_before = await counts(pg);

    const catalogs = await collection(mongo, ['catalogservices']);
    const services = await collection(mongo, ['services']);
    const suggestions = await collection(mongo, ['servicesuggestions']);
    const categories = await collection(mongo, ['materialcategories']);
    const materials = await collection(mongo, ['materials']);
    const catalogIds = new Set(catalogs.map((doc) => idOf(doc._id)));
    const categoryIds = new Set(categories.map((doc) => idOf(doc._id)));

    const users = new Map((await prisma.users.findMany({
      where: { legacy_mongo_id: { not: null } },
      select: { id: true, legacy_mongo_id: true },
    })).map((row) => [row.legacy_mongo_id, row.id]));
    const stores = new Map((await prisma.stores.findMany({
      where: { legacy_mongo_id: { not: null } },
      select: { id: true, legacy_mongo_id: true, owner_user_id: true },
    })).map((row) => [row.legacy_mongo_id, row]));
    const profiles = new Map((await prisma.contractor_profiles.findMany({
      where: { legacy_mongo_id: { not: null } },
      select: { id: true, legacy_mongo_id: true },
    })).map((row) => [row.legacy_mongo_id, row.id]));

    await prisma.$transaction(async (tx) => {
      const categoryName = new Map();
      async function serviceCategoryId(name) {
        const label = text(name, 80);
        if (!label) return null;
        if (categoryName.has(label)) return categoryName.get(label);
        const found = await tx.service_categories.findUnique({ where: { name: label } });
        const row = found || await tx.service_categories.create({ data: { name: label } });
        categoryName.set(label, row.id);
        return row.id;
      }

      const pgCatalog = await tx.catalog_services.findMany();
      const catalogByLegacy = new Map(pgCatalog.filter((row) => row.legacy_mongo_id).map((row) => [row.legacy_mongo_id, row]));
      const catalogByCode = new Map(pgCatalog.filter((row) => row.code).map((row) => [row.code, row]));
      const catalogByNorm = new Map(pgCatalog.map((row) => [row.normalized_name, row]));
      const claimedCatalog = new Set();

      for (const doc of catalogs) {
        const mongoId = idOf(doc._id);
        if (catalogByLegacy.has(mongoId)) {
          already.catalog_services += 1;
          claimedCatalog.add(String(catalogByLegacy.get(mongoId).id));
          continue;
        }
        const code = text(doc.code, 160);
        const normalized = text(doc.normalizedName || doc.name, 120).toLowerCase();
        const status = doc.status;
        const type = doc.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM';
        if (!CATALOG_STATUS.has(status) || !CATALOG_TYPE.has(type) || !normalized || !text(doc.name, 80) || !text(doc.category, 80)) {
          skip(report, 'catalogservices', mongoId, 'invalid catalog fields', { status, type, category: doc.category || '' });
          continue;
        }
        const anchor = (code && catalogByCode.get(code)) || catalogByNorm.get(normalized) || null;
        const proposed = doc.proposedBy ? users.get(idOf(doc.proposedBy)) : null;
        const reviewed = doc.reviewedBy ? users.get(idOf(doc.reviewedBy)) : null;
        if (doc.proposedBy && !proposed) note(report, 'catalogservices', mongoId, 'proposedBy user is not in PostgreSQL', { user_id: idOf(doc.proposedBy) });
        if (doc.reviewedBy && !reviewed) note(report, 'catalogservices', mongoId, 'reviewedBy user is not in PostgreSQL', { user_id: idOf(doc.reviewedBy) });
        const data = {
          legacy_mongo_id: mongoId,
          service_category_id: await serviceCategoryId(doc.category),
          name: text(doc.name, 80),
          normalized_name: normalized,
          folded_name: text(doc.foldedName, 120),
          code: code || null,
          description: text(doc.description, 500),
          catalog_type: type,
          status,
          proposed_by: proposed || null,
          reviewed_by: reviewed || null,
          reviewed_at: doc.reviewedAt || null,
          updated_at: doc.updatedAt || new Date(),
        };
        if (anchor) {
          if (claimedCatalog.has(String(anchor.id)) || (anchor.legacy_mongo_id && catalogIds.has(anchor.legacy_mongo_id) && anchor.legacy_mongo_id !== mongoId)) {
            report.collisions.push({ collection: 'catalogservices', mongo_id: mongoId, postgres_id: String(anchor.id), reason: 'catalog anchor already belongs to another Mongo document' });
            continue;
          }
          try {
            const row = await tx.catalog_services.update({ where: { id: anchor.id }, data });
            claimedCatalog.add(String(row.id));
            catalogByLegacy.set(mongoId, row);
            linked.catalog_services += 1;
          } catch (error) {
            if (error?.code !== 'P2002') throw error;
            const row = await tx.catalog_services.update({
              where: { id: anchor.id },
              data: { legacy_mongo_id: mongoId, updated_at: new Date() },
            });
            claimedCatalog.add(String(row.id));
            catalogByLegacy.set(mongoId, row);
            linked.catalog_services += 1;
            report.collisions.push({ collection: 'catalogservices', mongo_id: mongoId, postgres_id: String(anchor.id), reason: 'kept existing unique catalog fields and attached legacy id' });
          }
          continue;
        }
        const row = await tx.catalog_services.create({ data: { ...data, created_at: doc.createdAt || new Date() } });
        claimedCatalog.add(String(row.id));
        catalogByLegacy.set(mongoId, row);
        if (row.code) catalogByCode.set(row.code, row);
        catalogByNorm.set(row.normalized_name, row);
        inserted.catalog_services += 1;
      }

      const pgCategories = await tx.material_categories.findMany();
      const categoryByLegacy = new Map(pgCategories.filter((row) => row.legacy_mongo_id).map((row) => [row.legacy_mongo_id, row]));
      const claimedCategory = new Set();

      for (const doc of categories) {
        const mongoId = idOf(doc._id);
        if (categoryByLegacy.has(mongoId)) {
          already.material_categories += 1;
          claimedCategory.add(String(categoryByLegacy.get(mongoId).id));
          continue;
        }
        const type = doc.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM';
        const status = doc.status || 'APPROVED';
        const ownerLegacy = idOf(doc.ownerId);
        const owner = ownerLegacy ? users.get(ownerLegacy) : null;
        const store = doc.storeId ? stores.get(idOf(doc.storeId)) : null;
        if (!CATEGORY_TYPE.has(type) || !CATEGORY_STATUS.has(status) || !text(doc.name, 80) || !text(doc.normalizedName, 120) || !text(doc.foldedName, 120)) {
          skip(report, 'materialcategories', mongoId, 'invalid material category fields', { status, type });
          continue;
        }
        if (type === 'CUSTOM' && !owner) {
          skip(report, 'materialcategories', mongoId, 'custom category owner is not in PostgreSQL', { user_id: ownerLegacy });
          continue;
        }
        if (doc.storeId && !store) note(report, 'materialcategories', mongoId, 'category store is not in PostgreSQL', { store_id: idOf(doc.storeId) });
        const anchor = pgCategories.find((row) => {
          if (claimedCategory.has(String(row.id))) return false;
          if (type === 'SYSTEM') return row.category_type === 'SYSTEM' && row.owner_user_id == null && (row.name === text(doc.name, 80) || row.folded_name === text(doc.foldedName, 120));
          return row.category_type === 'CUSTOM' && row.owner_user_id === owner && (row.normalized_name === text(doc.normalizedName, 120) || row.folded_name === text(doc.foldedName, 120));
        });
        const data = {
          legacy_mongo_id: mongoId,
          name: text(doc.name, 80),
          normalized_name: text(doc.normalizedName, 120),
          folded_name: text(doc.foldedName, 120),
          category_type: type,
          status,
          owner_user_id: type === 'SYSTEM' ? null : owner,
          store_id: store?.id || null,
          updated_at: doc.updatedAt || new Date(),
        };
        if (anchor) {
          if (anchor.legacy_mongo_id && categoryIds.has(anchor.legacy_mongo_id) && anchor.legacy_mongo_id !== mongoId) {
            report.collisions.push({ collection: 'materialcategories', mongo_id: mongoId, postgres_id: String(anchor.id), reason: 'category anchor already belongs to another Mongo document' });
            continue;
          }
          try {
            const row = await tx.material_categories.update({ where: { id: anchor.id }, data });
            claimedCategory.add(String(row.id));
            categoryByLegacy.set(mongoId, row);
            linked.material_categories += 1;
          } catch (error) {
            if (error?.code !== 'P2002') throw error;
            const row = await tx.material_categories.update({ where: { id: anchor.id }, data: { legacy_mongo_id: mongoId, updated_at: new Date() } });
            claimedCategory.add(String(row.id));
            categoryByLegacy.set(mongoId, row);
            linked.material_categories += 1;
            report.collisions.push({ collection: 'materialcategories', mongo_id: mongoId, reason: 'kept existing unique category fields and attached legacy id' });
          }
          continue;
        }
        const row = await tx.material_categories.create({ data: { ...data, created_at: doc.createdAt || new Date() } });
        claimedCategory.add(String(row.id));
        categoryByLegacy.set(mongoId, row);
        pgCategories.push(row);
        inserted.material_categories += 1;
      }

      const serviceLegacy = new Set((await tx.services.findMany({ select: { legacy_mongo_id: true } })).map((row) => row.legacy_mongo_id).filter(Boolean));
      for (const doc of services) {
        const mongoId = idOf(doc._id);
        if (serviceLegacy.has(mongoId)) {
          already.services += 1;
          continue;
        }
        const store = stores.get(idOf(doc.storeId));
        const owner = users.get(idOf(doc.contractorId));
        const unit = doc.unit || 'JOB';
        const completion = doc.completionStatus || 'COMPLETED';
        const catalogType = doc.catalogType || 'LEGACY';
        if (!store || !owner) {
          skip(report, 'services', mongoId, !store ? 'service store is not in PostgreSQL' : 'service contractor is not in PostgreSQL', {
            store_id: idOf(doc.storeId),
            user_id: idOf(doc.contractorId),
          });
          continue;
        }
        if (!SERVICE_UNIT.has(unit) || !COMPLETION.has(completion) || !OFFERING_TYPE.has(catalogType) || !text(doc.name, 120) || !text(doc.category, 80)) {
          skip(report, 'services', mongoId, 'invalid service fields', { unit, completion, catalogType, category: doc.category || '' });
          continue;
        }
        const catalogKey = text(doc.catalogKey, 160);
        const catalog = catalogKey
          ? catalogByLegacy.get(catalogKey) || [...catalogByLegacy.values()].find((row) => row.code === catalogKey) || catalogByCode.get(catalogKey)
          : null;
        if (catalogKey && !catalog) note(report, 'services', mongoId, 'catalog reference is not in PostgreSQL', { catalog_key: catalogKey });
        const price = doc.basePrice == null || doc.basePrice === '' ? null : money(doc.basePrice);
        if (doc.basePrice != null && doc.basePrice !== '' && price == null) {
          skip(report, 'services', mongoId, 'service price is not numeric');
          continue;
        }
        const pictures = imagesOf(doc);
        await tx.services.create({
          data: {
            legacy_mongo_id: mongoId,
            store_id: store.id,
            contractor_user_id: owner,
            service_category_id: await serviceCategoryId(doc.category),
            catalog_service_id: catalog?.id || null,
            name: text(doc.name, 120),
            catalog_key: catalogKey,
            catalog_type: catalogType,
            completion_status: completion,
            description: text(doc.description, 1000),
            base_price: price,
            unit,
            estimated_hours: money(doc.estimatedHours || 4),
            primary_image_url: doc.image || pictures[0] || '',
            price_range_min: money(doc.priceRange?.min || 0),
            price_range_max: money(doc.priceRange?.max || 0),
            is_active: doc.isActive !== false,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            service_images: { create: pictures.map((file, index) => ({ file_url: file, sort_order: index })) },
          },
        });
        serviceLegacy.add(mongoId);
        inserted.services += 1;
      }

      const materialLegacy = new Set((await tx.materials.findMany({ select: { legacy_mongo_id: true } })).map((row) => row.legacy_mongo_id).filter(Boolean));
      const liveCategories = await tx.material_categories.findMany({
        include: { users: { select: { legacy_mongo_id: true } } },
      });
      for (const doc of materials) {
        const mongoId = idOf(doc._id);
        if (materialLegacy.has(mongoId)) {
          already.materials += 1;
          continue;
        }
        const store = stores.get(idOf(doc.storeId));
        if (!store) {
          skip(report, 'materials', mongoId, 'material store is not in PostgreSQL', { store_id: idOf(doc.storeId) });
          continue;
        }
        const label = text(doc.category, 80);
        const owned = liveCategories.find((row) => row.name === label && row.users?.legacy_mongo_id && stores.get(idOf(doc.storeId))?.owner_user_id === row.owner_user_id);
        const system = liveCategories.find((row) => row.name === label && row.category_type === 'SYSTEM' && row.owner_user_id == null);
        const category = owned || system || liveCategories.find((row) => row.name === label);
        if (!category) {
          skip(report, 'materials', mongoId, 'material category is not in PostgreSQL', { category: label });
          continue;
        }
        const price = money(doc.price);
        if (price == null || !text(doc.name, 120)) {
          skip(report, 'materials', mongoId, 'invalid material price or name');
          continue;
        }
        const pictures = imagesOf(doc);
        await tx.materials.create({
          data: {
            legacy_mongo_id: mongoId,
            store_id: store.id,
            material_category_id: category.id,
            name: text(doc.name, 120),
            sku: text(doc.sku, 100),
            unit: text(doc.unit || 'bag', 50) || 'bag',
            price,
            stock: money(doc.stock || 0, 3),
            min_order_qty: money(doc.minOrderQty || 1, 3),
            primary_image_url: doc.image || pictures[0] || '',
            description: text(doc.description, 800),
            is_active: doc.isActive !== false,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            material_images: { create: pictures.map((file, index) => ({ file_url: file, sort_order: index })) },
          },
        });
        materialLegacy.add(mongoId);
        inserted.materials += 1;
      }

      const suggestionLegacy = new Set((await tx.service_suggestions.findMany({ select: { legacy_mongo_id: true } })).map((row) => row.legacy_mongo_id).filter(Boolean));
      const catalogRows = await tx.catalog_services.findMany({ select: { id: true, legacy_mongo_id: true, code: true } });
      for (const doc of suggestions) {
        const mongoId = idOf(doc._id);
        if (suggestionLegacy.has(mongoId)) {
          already.service_suggestions += 1;
          continue;
        }
        const requester = users.get(idOf(doc.requesterId));
        const status = doc.status || 'PENDING';
        if (!requester || !SUGGESTION_STATUS.has(status) || text(doc.description, 500).length < 1) {
          skip(report, 'servicesuggestions', mongoId, !requester ? 'suggestion requester is not in PostgreSQL' : 'invalid suggestion fields', {
            user_id: idOf(doc.requesterId),
            status,
          });
          continue;
        }
        const provider = doc.providerId ? profiles.get(idOf(doc.providerId)) : null;
        const reviewer = doc.reviewedBy ? users.get(idOf(doc.reviewedBy)) : null;
        const convertedKey = idOf(doc.convertedServiceId);
        const converted = convertedKey ? catalogRows.find((row) => row.legacy_mongo_id === convertedKey || row.code === convertedKey) : null;
        if (doc.providerId && !provider) note(report, 'servicesuggestions', mongoId, 'suggestion provider profile is not in PostgreSQL', { profile_id: idOf(doc.providerId) });
        if (doc.reviewedBy && !reviewer) note(report, 'servicesuggestions', mongoId, 'suggestion reviewer is not in PostgreSQL', { user_id: idOf(doc.reviewedBy) });
        if (convertedKey && !converted) note(report, 'servicesuggestions', mongoId, 'converted catalog service is not in PostgreSQL', { catalog_id: convertedKey });
        await tx.service_suggestions.create({
          data: {
            legacy_mongo_id: mongoId,
            requester_user_id: requester,
            requester_role: 'CONTRACTOR',
            provider_profile_id: provider || null,
            team_name: text(doc.teamName, 100),
            description: text(doc.description, 500),
            status,
            reviewed_by: reviewer || null,
            reviewed_at: doc.reviewedAt || null,
            admin_note: text(doc.adminNote, 500),
            converted_catalog_service_id: converted?.id || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        suggestionLegacy.add(mongoId);
        inserted.service_suggestions += 1;
      }
    }, { timeout: 180000, maxWait: 20000 });

    report.committed = true;
    report.postgres_after = await counts(pg);
    const mongoAfter = {
      catalogservices: (await collection(mongo, ['catalogservices'])).length,
      services: (await collection(mongo, ['services'])).length,
      servicesuggestions: (await collection(mongo, ['servicesuggestions'])).length,
      materialcategories: (await collection(mongo, ['materialcategories'])).length,
      materials: (await collection(mongo, ['materials'])).length,
    };
    report.mongo_after = mongoAfter;
    report.mongo_writes = JSON.stringify(mongoBefore) !== JSON.stringify(mongoAfter);

    const duplicates = await pg.query(`
      SELECT 'catalog_services' AS table_name, legacy_mongo_id FROM public.catalog_services WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'services', legacy_mongo_id FROM public.services WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'service_suggestions', legacy_mongo_id FROM public.service_suggestions WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'material_categories', legacy_mongo_id FROM public.material_categories WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'materials', legacy_mongo_id FROM public.materials WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    `);
    report.duplicate_legacy_ids = duplicates.rows.length;

    const mappedPrices = await prisma.materials.findMany({
      where: { legacy_mongo_id: { in: materials.map((doc) => idOf(doc._id)) } },
      select: { legacy_mongo_id: true, price: true },
    });
    const priceById = new Map(mappedPrices.map((row) => [row.legacy_mongo_id, Number(row.price)]));
    for (const doc of materials) {
      const actual = priceById.get(idOf(doc._id));
      if (actual == null) continue;
      if (Math.abs(actual - Number(doc.price)) > 0.001) {
        report.price_mismatches.push({ mongo_id: idOf(doc._id), mongo_price: doc.price, postgres_price: actual });
      }
    }
    report.verification_pass = report.duplicate_legacy_ids === 0 && report.price_mismatches.length === 0 && report.mongo_writes === false;
  } catch (error) {
    report.error = error.message;
    report.committed = false;
    throw error;
  } finally {
    writeReport(report);
    await prisma.$disconnect().catch(() => {});
    await closeConnections(pg);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
