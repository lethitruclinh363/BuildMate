/**
 * Insert MongoDB contractor profiles and stores that are not already in PostgreSQL.
 * Does not update or delete existing PostgreSQL rows.
 */
const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');
const { PgProfile, PgStore, backfillBatch } = require('../../src/repositories/partner.postgres');

function text(value) {
  return value == null ? '' : String(value).trim();
}

function point(doc) {
  const coords = doc?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return { type: 'Point', coordinates: [105.787, 10.045] };
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { type: 'Point', coordinates: [105.787, 10.045] };
  }
  return { type: 'Point', coordinates: [lng, lat] };
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'contractor-store-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo_contractors: 0,
    mongo_stores: 0,
    postgres_contractors_before: 0,
    postgres_stores_before: 0,
    contractors_inserted: 0,
    stores_inserted: 0,
    contractors_already_mapped: 0,
    stores_already_mapped: 0,
    collisions: [],
    orphans: [],
    postgres_contractors_after: 0,
    postgres_stores_after: 0,
  };

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const profiles = await mongo.db.collection('contractorprofiles').find({}).toArray();
    const stores = await mongo.db.collection('stores').find({}).toArray();
    const pgProfiles = (await pg.query(
      `SELECT p.legacy_mongo_id, u.legacy_mongo_id AS user_legacy
       FROM public.contractor_profiles p
       JOIN public.users u ON u.id = p.user_id`
    )).rows;
    const pgStores = (await pg.query(
      `SELECT s.legacy_mongo_id, u.legacy_mongo_id AS user_legacy
       FROM public.stores s
       JOIN public.users u ON u.id = s.owner_user_id`
    )).rows;
    const users = new Set((await pg.query(`SELECT legacy_mongo_id FROM public.users WHERE legacy_mongo_id IS NOT NULL`)).rows.map((row) => row.legacy_mongo_id));
    const profileByLegacy = new Map(pgProfiles.map((row) => [row.legacy_mongo_id, row]));
    const profileByUser = new Map(pgProfiles.map((row) => [row.user_legacy, row]));
    const storeByLegacy = new Map(pgStores.map((row) => [row.legacy_mongo_id, row]));
    const storeByUser = new Map(pgStores.map((row) => [row.user_legacy, row]));

    const profileDocs = [];
    const storeDocs = [];
    for (const doc of profiles) {
      const mongoId = String(doc._id);
      const userId = String(doc.userId || '');
      if (profileByLegacy.has(mongoId)) {
        report.contractors_already_mapped += 1;
        continue;
      }
      if (!users.has(userId)) {
        report.orphans.push({ kind: 'contractor', mongo_id: mongoId, user_id: userId });
        continue;
      }
      const existing = profileByUser.get(userId);
      if (existing && existing.legacy_mongo_id !== mongoId) {
        report.collisions.push({ kind: 'contractor', mongo_id: mongoId, postgres_legacy_mongo_id: existing.legacy_mongo_id });
        continue;
      }
      profileDocs.push(new PgProfile({
        _id: mongoId,
        userId,
        businessName: text(doc.businessName),
        representativeName: text(doc.representativeName),
        contactPhone: text(doc.contactPhone),
        contactEmail: text(doc.contactEmail),
        workerCount: doc.workerCount || 0,
        taxCode: text(doc.taxCode),
        address: text(doc.address),
        city: text(doc.city),
        description: text(doc.description),
        yearsExperience: doc.yearsExperience || 0,
        serviceAreas: doc.serviceAreas || [],
        materialCategories: doc.materialCategories || [],
        services: doc.services || [],
        verificationStatus: doc.verificationStatus || 'DRAFT',
        portfolio: doc.portfolio || {},
        documents: (doc.documents || []).map((item) => ({
          _id: String(item._id),
          type: item.type,
          url: item.url,
          originalName: item.originalName || '',
          mimeType: item.mimeType || '',
          size: item.size || 0,
          uploadedAt: item.uploadedAt,
        })),
        completedSteps: doc.completedSteps || [],
        rejectionReason: doc.rejectionReason || '',
        submittedAt: doc.submittedAt || null,
        reviewedAt: doc.reviewedAt || null,
        reviewedBy: doc.reviewedBy ? String(doc.reviewedBy) : null,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
        projects: undefined,
      }));
      const built = profileDocs[profileDocs.length - 1];
      built.portfolio = {
        ...(doc.portfolio || {}),
        projects: (doc.portfolio?.projects || []).map((project) => ({
          _id: String(project._id),
          serviceId: project.serviceId || '',
          serviceNameSnapshot: project.serviceNameSnapshot || '',
          description: project.description || '',
          images: project.images || [],
        })),
      };
    }

    for (const doc of stores) {
      const mongoId = String(doc._id);
      const userId = String(doc.contractorId || '');
      if (storeByLegacy.has(mongoId)) {
        report.stores_already_mapped += 1;
        continue;
      }
      if (!users.has(userId)) {
        report.orphans.push({ kind: 'store', mongo_id: mongoId, user_id: userId });
        continue;
      }
      const existing = storeByUser.get(userId);
      if (existing && existing.legacy_mongo_id !== mongoId) {
        report.collisions.push({ kind: 'store', mongo_id: mongoId, postgres_legacy_mongo_id: existing.legacy_mongo_id });
        continue;
      }
      storeDocs.push(new PgStore({
        _id: mongoId,
        contractorId: userId,
        name: text(doc.name) || 'BuildMate partner',
        slogan: text(doc.slogan),
        description: text(doc.description),
        phone: text(doc.phone),
        contactName: text(doc.contactName),
        contactEmail: text(doc.contactEmail),
        address: text(doc.address),
        city: text(doc.city),
        storeType: doc.storeType || 'SERVICES',
        coverImage: doc.coverImage || '',
        avatar: doc.avatar || '',
        logo: doc.logo || '',
        gallery: doc.gallery || [],
        crewPhotos: doc.crewPhotos || [],
        publicCertificates: doc.publicCertificates || [],
        achievements: text(doc.achievements),
        showroomNote: text(doc.showroomNote),
        deliveryNote: text(doc.deliveryNote),
        deliveryEnabled: Boolean(doc.deliveryEnabled),
        baseDeliveryFee: doc.baseDeliveryFee || 0,
        freeDeliveryRadiusKm: doc.freeDeliveryRadiusKm || 0,
        deliveryFeePerKm: doc.deliveryFeePerKm || 0,
        minimumOrderAmount: doc.minimumOrderAmount || 0,
        displayYears: doc.displayYears ?? null,
        displayWorkerCount: doc.displayWorkerCount ?? null,
        serviceAreas: doc.serviceAreas || [],
        publicSeeded: Boolean(doc.publicSeeded),
        openingHours: doc.openingHours || '07:00 – 18:00',
        serviceRadiusKm: doc.serviceRadiusKm || 5,
        category: doc.category || 'General repair',
        verified: Boolean(doc.verified),
        rating: doc.rating || 0,
        reviewCount: doc.reviewCount || 0,
        materialRating: doc.materialRating || 0,
        materialReviewCount: doc.materialReviewCount || 0,
        status: doc.status || 'INACTIVE',
        location: point(doc),
        locationConfirmed: Boolean(doc.locationConfirmed),
        locationSource: doc.locationSource || '',
        locationConfirmedAt: doc.locationConfirmedAt || null,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
      }));
    }

    report.mongo_contractors = profiles.length;
    report.mongo_stores = stores.length;
    report.postgres_contractors_before = pgProfiles.length;
    report.postgres_stores_before = pgStores.length;
    report.postgres_contractors_after = pgProfiles.length;
    report.postgres_stores_after = pgStores.length;

    if (report.collisions.length) {
      report.abort_reason = 'Owner collision with an existing PostgreSQL row. No INSERT was committed.';
      writeReport(report);
      console.log(`ABORT collisions=${report.collisions.length}`);
      process.exitCode = 1;
      return;
    }

    await backfillBatch(profileDocs, storeDocs);
    report.committed = true;
    report.contractors_inserted = profileDocs.length;
    report.stores_inserted = storeDocs.length;

    const verify = await pg.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.contractor_profiles WHERE legacy_mongo_id IS NOT NULL) AS legacy_contractors,
        (SELECT COUNT(*)::int FROM public.stores WHERE legacy_mongo_id IS NOT NULL) AS legacy_stores,
        (SELECT COUNT(*)::int FROM public.contractor_profiles p LEFT JOIN public.users u ON u.id = p.user_id WHERE u.id IS NULL) AS orphan_contractor_users,
        (SELECT COUNT(*)::int FROM public.stores s LEFT JOIN public.users u ON u.id = s.owner_user_id WHERE u.id IS NULL) AS orphan_store_users,
        (SELECT COUNT(*)::int FROM public.contractor_profiles p LEFT JOIN public.locations l ON l.id = p.location_id WHERE p.location_id IS NOT NULL AND l.id IS NULL) AS orphan_contractor_locations,
        (SELECT COUNT(*)::int FROM public.stores s LEFT JOIN public.locations l ON l.id = s.location_id WHERE s.location_id IS NOT NULL AND l.id IS NULL) AS orphan_store_locations,
        (SELECT COUNT(*)::int FROM (SELECT user_id FROM public.contractor_profiles GROUP BY user_id HAVING COUNT(*) > 1) d) AS duplicate_contractor_owner,
        (SELECT COUNT(*)::int FROM (SELECT owner_user_id FROM public.stores GROUP BY owner_user_id HAVING COUNT(*) > 1) d) AS duplicate_store_owner,
        (SELECT COUNT(*)::int FROM public.contractor_documents) AS documents,
        (SELECT COUNT(*)::int FROM public.contractor_profile_steps) AS steps,
        (SELECT COUNT(*)::int FROM public.contractor_service_areas) AS contractor_areas,
        (SELECT COUNT(*)::int FROM public.contractor_profile_services) AS profile_services,
        (SELECT COUNT(*)::int FROM public.contractor_material_categories) AS material_categories,
        (SELECT COUNT(*)::int FROM public.contractor_portfolio_media) AS portfolio_media,
        (SELECT COUNT(*)::int FROM public.contractor_portfolio_projects) AS portfolio_projects,
        (SELECT COUNT(*)::int FROM public.store_media) AS store_media,
        (SELECT COUNT(*)::int FROM public.store_service_areas) AS store_areas
    `);
    report.verification = verify.rows[0];
    report.postgres_contractors_after = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.contractor_profiles`)).rows[0].count);
    report.postgres_stores_after = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.stores`)).rows[0].count);
    const status = await pg.query(`
      SELECT 'contractor' AS kind, verification_status AS status, COUNT(*)::int AS count
      FROM public.contractor_profiles GROUP BY verification_status
      UNION ALL
      SELECT 'store', status, COUNT(*)::int FROM public.stores GROUP BY status
    `);
    report.statuses = status.rows;
    const checks = report.verification;
    const expectedContractors = profiles.length - report.orphans.filter((item) => item.kind === 'contractor').length;
    const expectedStores = stores.length - report.orphans.filter((item) => item.kind === 'store').length;
    report.verification_pass = checks.orphan_contractor_users === 0
      && checks.orphan_store_users === 0
      && checks.orphan_contractor_locations === 0
      && checks.orphan_store_locations === 0
      && checks.duplicate_contractor_owner === 0
      && checks.duplicate_store_owner === 0
      && checks.legacy_contractors === expectedContractors
      && checks.legacy_stores === expectedStores;
    writeReport(report);
    console.log(`mongo_contractors=${report.mongo_contractors}`);
    console.log(`mongo_stores=${report.mongo_stores}`);
    console.log(`contractors_inserted=${report.contractors_inserted}`);
    console.log(`stores_inserted=${report.stores_inserted}`);
    console.log(`postgres_contractors_after=${report.postgres_contractors_after}`);
    console.log(`postgres_stores_after=${report.postgres_stores_after}`);
    console.log(`orphans=${report.orphans.length}`);
    console.log(`verification=${report.verification_pass ? 'PASS' : 'FAIL'}`);
    if (!report.verification_pass) process.exitCode = 1;
  } catch (error) {
    report.abort_reason = error.message;
    writeReport(report);
    console.error(`BACKFILL FAILED: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closeConnections(pg);
  }
}

main();
