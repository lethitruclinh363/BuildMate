const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { legacyClause, enumClause } = require('./scopedQuery');

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

function withPull(items) {
  const list = Array.isArray(items) ? [...items] : [];
  list.pull = (id) => {
    const index = list.findIndex((item) => String(item._id) === String(id));
    if (index >= 0) list.splice(index, 1);
    return list;
  };
  list.id = (id) => list.find((item) => String(item._id) === String(id)) || null;
  return list;
}

function portfolioOf(raw) {
  const source = raw || {};
  return {
    avatar: source.avatar || '',
    teamLogo: source.teamLogo || '',
    workshop: source.workshop || '',
    construction: [...(source.construction || [])],
    certificates: [...(source.certificates || [])],
    projects: withPull(source.projects || []),
  };
}

class PgProfile {
  constructor(data) {
    Object.assign(this, data);
    this.portfolio = portfolioOf(data.portfolio);
    this.documents = [...(data.documents || [])];
    this.services = [...(data.services || [])];
    this.materialCategories = [...(data.materialCategories || [])];
    this.serviceAreas = [...(data.serviceAreas || [])];
    this.completedSteps = Array.from({ length: 6 }, (_, index) => data.completedSteps?.[index] === true);
  }

  markModified() {}

  toPublic() {
    return {
      id: this._id,
      userId: legacyOf(this.userId),
      businessName: this.businessName,
      representativeName: this.representativeName,
      contactPhone: this.contactPhone,
      contactEmail: this.contactEmail,
      workerCount: this.workerCount,
      taxCode: this.taxCode,
      address: this.address,
      city: this.city,
      description: this.description,
      yearsExperience: this.yearsExperience,
      serviceAreas: this.serviceAreas,
      materialCategories: (this.materialCategories || []).map((item) => {
        const type = item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
        return {
          name: item.name,
          type,
          categoryId: type === 'CUSTOM' ? item.categoryId || null : null,
          status: item.status || 'APPROVED',
        };
      }),
      services: (this.services || []).map((item) => {
        const type = item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
        return {
          category: item.category || '',
          name: item.name,
          type,
          serviceId: type === 'CUSTOM' ? item.serviceId || null : item.serviceId || `${item.category}::${item.name}`,
          status: item.status || (type === 'CUSTOM' ? 'PENDING_APPROVAL' : 'APPROVED'),
        };
      }),
      portfolio: {
        avatar: this.portfolio?.avatar || '',
        teamLogo: this.portfolio?.teamLogo || '',
        workshop: this.portfolio?.workshop || '',
        construction: this.portfolio?.construction || [],
        certificates: this.portfolio?.certificates || [],
        projects: (this.portfolio?.projects || []).map((project) => ({
          id: String(project._id),
          serviceId: project.serviceId || '',
          serviceNameSnapshot: project.serviceNameSnapshot || '',
          description: project.description || '',
          images: project.images || [],
        })),
      },
      completedSteps: this.completedSteps,
      verificationStatus: this.verificationStatus,
      documents: this.documents,
      rejectionReason: this.rejectionReason,
      submittedAt: this.submittedAt,
      reviewedAt: this.reviewedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, userId: legacyOf(this.userId) };
  }

  async save() {
    await persistProfile(this);
    return this;
  }
}

class PgStore {
  constructor(data) {
    Object.assign(this, data);
    this.gallery = [...(data.gallery || [])];
    this.crewPhotos = [...(data.crewPhotos || [])];
    this.publicCertificates = [...(data.publicCertificates || [])];
    this.serviceAreas = [...(data.serviceAreas || [])];
    this.location = data.location || { type: 'Point', coordinates: [105.787, 10.045] };
  }

  set(data) {
    Object.assign(this, data);
    return this;
  }

  toPublic() {
    return {
      id: this._id,
      contractorId: legacyOf(this.contractorId),
      name: this.name,
      slogan: this.slogan || '',
      description: this.description || '',
      phone: this.phone || '',
      contactName: this.contactName || '',
      contactEmail: this.contactEmail || '',
      address: this.address || '',
      city: this.city || '',
      storeType: this.storeType,
      coverImage: this.coverImage || '',
      avatar: this.avatar || '',
      logo: this.logo || '',
      gallery: this.gallery || [],
      crewPhotos: this.crewPhotos || [],
      publicCertificates: this.publicCertificates || [],
      achievements: this.achievements || '',
      showroomNote: this.showroomNote || '',
      deliveryNote: this.deliveryNote || '',
      deliveryEnabled: Boolean(this.deliveryEnabled),
      baseDeliveryFee: Number(this.baseDeliveryFee || 0),
      freeDeliveryRadiusKm: Number(this.freeDeliveryRadiusKm || 0),
      deliveryFeePerKm: Number(this.deliveryFeePerKm || 0),
      minimumOrderAmount: Number(this.minimumOrderAmount || 0),
      displayYears: this.displayYears,
      displayWorkerCount: this.displayWorkerCount,
      serviceAreas: this.serviceAreas || [],
      publicSeeded: Boolean(this.publicSeeded),
      openingHours: this.openingHours,
      serviceRadiusKm: Number(this.serviceRadiusKm || 0),
      category: this.category,
      verified: Boolean(this.verified),
      rating: Number(this.rating || 0),
      reviewCount: this.reviewCount || 0,
      materialRating: Number(this.materialRating || 0),
      materialReviewCount: this.materialReviewCount || 0,
      status: this.status,
      location: this.location,
      locationConfirmed: Boolean(this.locationConfirmed),
      locationSource: this.locationSource || '',
      locationConfirmedAt: this.locationConfirmedAt || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, contractorId: legacyOf(this.contractorId) };
  }

  async save() {
    await persistStore(this);
    return this;
  }
}

async function userRow(legacyId) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  return prisma.users.findFirst({ where: { legacy_mongo_id: id }, include: { roles: true } });
}

function userSnapshot(row) {
  if (!row) return null;
  return {
    _id: row.legacy_mongo_id,
    id: row.legacy_mongo_id,
    name: row.full_name,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone_number || '',
    avatar: row.avatar_url || '',
    status: row.account_status,
    role: row.roles.code,
    preferredLanguage: row.preferred_language || undefined,
  };
}

function profileFromRows(row) {
  const location = row.locations;
  const services = (row.contractor_profile_services || []).map((item) => ({
    category: item.catalog_services?.service_categories?.name || '',
    name: item.catalog_services?.name || '',
    type: item.catalog_services?.catalog_type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    serviceId: item.catalog_services?.code || item.catalog_services?.legacy_mongo_id || '',
    status: item.selection_status || 'APPROVED',
  }));
  const materialCategories = (row.contractor_material_categories || []).map((item) => ({
    name: item.material_categories?.name || '',
    type: item.material_categories?.category_type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    categoryId: item.material_categories?.category_type === 'CUSTOM' ? item.material_categories?.legacy_mongo_id || null : null,
    status: item.selection_status || 'APPROVED',
  }));
  const media = row.contractor_portfolio_media || [];
  const projects = (row.contractor_portfolio_projects || []).map((project) => ({
    _id: project.legacy_mongo_sub_id || String(project.id),
    serviceId: project.legacy_service_key || project.catalog_services?.code || '',
    serviceNameSnapshot: project.service_name_snapshot || '',
    description: project.description || '',
    images: (project.contractor_portfolio_project_images || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => image.file_url),
  }));
  const steps = Array.from({ length: 6 }, () => false);
  for (const step of row.contractor_profile_steps || []) {
    if (step.step_no >= 1 && step.step_no <= 6) steps[step.step_no - 1] = step.is_completed === true;
  }
  return new PgProfile({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    userId: row.users_contractor_profiles_user_idTousers?.legacy_mongo_id || '',
    businessName: row.business_name || '',
    representativeName: row.representative_name || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    workerCount: row.worker_count || 0,
    taxCode: row.tax_code || '',
    address: location?.formatted_address || '',
    city: location?.city || '',
    description: row.description || '',
    yearsExperience: row.years_experience || 0,
    serviceAreas: (row.contractor_service_areas || []).map((area) => area.area_name),
    materialCategories,
    services,
    verificationStatus: row.verification_status,
    portfolio: {
      avatar: row.portfolio_avatar_url || '',
      teamLogo: row.team_logo_url || '',
      workshop: row.workshop_url || '',
      construction: media.filter((item) => item.media_type === 'CONSTRUCTION').sort((a, b) => a.sort_order - b.sort_order).map((item) => item.file_url),
      certificates: media.filter((item) => item.media_type === 'CERTIFICATE').sort((a, b) => a.sort_order - b.sort_order).map((item) => item.file_url),
      projects,
    },
    documents: (row.contractor_documents || []).map((doc) => ({
      _id: doc.legacy_mongo_sub_id || String(doc.id),
      type: doc.document_type,
      url: doc.file_url,
      originalName: doc.original_name || '',
      mimeType: doc.mime_type || '',
      size: Number(doc.file_size || 0),
      uploadedAt: doc.uploaded_at,
    })),
    completedSteps: steps,
    rejectionReason: row.rejection_reason || '',
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.users_contractor_profiles_reviewed_byTousers?.legacy_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationId: row.location_id,
  });
}

const profileInclude = {
  locations: true,
  users_contractor_profiles_user_idTousers: { select: { legacy_mongo_id: true } },
  users_contractor_profiles_reviewed_byTousers: { select: { legacy_mongo_id: true } },
  contractor_documents: true,
  contractor_service_areas: true,
  contractor_profile_steps: true,
  contractor_portfolio_media: true,
  contractor_profile_services: { include: { catalog_services: { include: { service_categories: true } } } },
  contractor_material_categories: { include: { material_categories: true } },
  contractor_portfolio_projects: {
    include: {
      catalog_services: true,
      contractor_portfolio_project_images: true,
    },
  },
};

function storeFromRow(row) {
  const media = row.store_media || [];
  const urls = (type) => media.filter((item) => item.media_type === type).sort((a, b) => a.sort_order - b.sort_order).map((item) => item.file_url);
  const lat = row.locations?.latitude == null ? 10.045 : Number(row.locations.latitude);
  const lng = row.locations?.longitude == null ? 105.787 : Number(row.locations.longitude);
  return new PgStore({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    contractorId: row.users?.legacy_mongo_id || '',
    name: row.name,
    slogan: row.slogan || '',
    description: row.description || '',
    phone: row.phone || '',
    contactName: row.contact_name || '',
    contactEmail: row.contact_email || '',
    address: row.locations?.formatted_address || '',
    city: row.locations?.city || '',
    storeType: row.store_type,
    coverImage: row.cover_image_url || '',
    avatar: row.avatar_url || '',
    logo: row.logo_url || '',
    gallery: urls('GALLERY'),
    crewPhotos: urls('CREW_PHOTO'),
    publicCertificates: urls('PUBLIC_CERTIFICATE'),
    achievements: row.achievements || '',
    showroomNote: row.showroom_note || '',
    deliveryNote: row.delivery_note || '',
    deliveryEnabled: row.delivery_enabled,
    baseDeliveryFee: Number(row.base_delivery_fee || 0),
    freeDeliveryRadiusKm: Number(row.free_delivery_radius_km || 0),
    deliveryFeePerKm: Number(row.delivery_fee_per_km || 0),
    minimumOrderAmount: Number(row.minimum_order_amount || 0),
    displayYears: row.display_years,
    displayWorkerCount: row.display_worker_count,
    serviceAreas: (row.store_service_areas || []).map((area) => area.area_name),
    publicSeeded: row.public_seeded,
    openingHours: row.opening_hours,
    serviceRadiusKm: Number(row.service_radius_km || 0),
    category: row.category,
    verified: row.verified,
    rating: Number(row.rating || 0),
    reviewCount: row.review_count || 0,
    materialRating: Number(row.material_rating || 0),
    materialReviewCount: row.material_review_count || 0,
    status: row.status,
    location: { type: 'Point', coordinates: [lng, lat] },
    locationConfirmed: Boolean(row.locations?.is_confirmed),
    locationSource: row.locations?.location_source || '',
    locationConfirmedAt: row.locations?.confirmed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationId: row.location_id,
  });
}

const storeInclude = {
  locations: true,
  users: { select: { legacy_mongo_id: true } },
  store_media: true,
  store_service_areas: true,
};

async function allProfiles() {
  const rows = await prisma.contractor_profiles.findMany({ include: profileInclude });
  return rows.map(profileFromRows);
}

async function allStores() {
  const rows = await prisma.stores.findMany({ include: storeInclude });
  return rows.map(storeFromRow);
}

function sameId(actual, expected) {
  if (expected && typeof expected === 'object' && expected.$in) {
    return expected.$in.map((item) => legacyOf(item)).includes(legacyOf(actual));
  }
  return legacyOf(actual) === legacyOf(expected);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    if (key === 'userId') return sameId(doc.userId, value);
    if (key === 'contractorId') return sameId(doc.contractorId, value);
    if (key === '_id') return sameId(doc._id, value);
    if (key === 'verificationStatus') return doc.verificationStatus === value;
    if (key === 'status') return doc.status === value;
    if (key === 'storeType' && value && value.$in) return value.$in.includes(doc.storeType);
    if (key === 'storeType' && value && value.$ne) return doc.storeType !== value.$ne;
    if (key === 'storeType') return doc.storeType === value;
    if (key === 'services.serviceId') return (doc.services || []).some((item) => String(item.serviceId) === String(value));
    return true;
  });
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((a, b) => {
    for (const [key, direction] of keys) {
      const left = a[key] ? new Date(a[key]).getTime() : 0;
      const right = b[key] ? new Date(b[key]).getTime() : 0;
      if (left !== right) return direction < 0 ? right - left : left - right;
    }
    return 0;
  });
}

function chain(loader, single) {
  const state = { sort: null, populate: false, lean: false };
  const exec = async () => {
    let rows = await loader();
    if (state.sort) rows = sortRows(rows, state.sort);
    if (state.populate) {
      rows = await Promise.all(rows.map(async (row) => {
        const user = userSnapshot(await userRow(row.userId || row.contractorId));
        if (user && row.userId !== undefined) row.userId = user;
        return row;
      }));
    }
    if (state.lean) rows = rows.map((row) => (row.toPlain ? row.toPlain() : row));
    return single ? rows[0] || null : rows;
  };
  const query = {
    sort(value) { state.sort = value; return query; },
    populate() { state.populate = true; return query; },
    lean() { state.lean = true; return query; },
    select() { return query; },
    then(resolve, reject) { return exec().then(resolve, reject); },
  };
  return query;
}

async function ensureCategory(tx, name) {
  const label = text(name || 'General', 80) || 'General';
  const found = await tx.service_categories.findUnique({ where: { name: label } });
  if (found) return found.id;
  const created = await tx.service_categories.create({ data: { name: label } });
  return created.id;
}

async function ensureCatalog(tx, service) {
  const code = text(service.serviceId || `${service.category}::${service.name}`, 160);
  const byCode = code ? await tx.catalog_services.findFirst({ where: { code } }) : null;
  if (byCode) return byCode.id;
  if (/^[0-9a-f]{24}$/i.test(code)) {
    const byLegacy = await tx.catalog_services.findFirst({ where: { legacy_mongo_id: code } });
    if (byLegacy) return byLegacy.id;
  }
  const categoryId = await ensureCategory(tx, service.category);
  const normalized = (code || text(service.name, 80) || 'service').toLowerCase().slice(0, 120);
  const created = await tx.catalog_services.create({
    data: {
      legacy_mongo_id: /^[0-9a-f]{24}$/i.test(code) ? code : null,
      service_category_id: categoryId,
      name: text(service.name || 'Service', 80) || 'Service',
      normalized_name: normalized,
      folded_name: normalized,
      code: code || null,
      catalog_type: service.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
      status: service.status === 'REJECTED' ? 'REJECTED' : service.status === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'APPROVED',
    },
  });
  return created.id;
}

async function ensureMaterial(tx, item, ownerId) {
  const legacy = /^[0-9a-f]{24}$/i.test(String(item.categoryId || '')) ? String(item.categoryId) : '';
  if (legacy) {
    const found = await tx.material_categories.findFirst({ where: { legacy_mongo_id: legacy } });
    if (found) return found.id;
  }
  const name = text(item.name, 80);
  const custom = item.type === 'CUSTOM';
  const foundName = await tx.material_categories.findFirst({
    where: {
      name,
      category_type: custom ? 'CUSTOM' : 'SYSTEM',
      owner_user_id: custom ? ownerId : null,
    },
  });
  if (foundName) return foundName.id;
  const normalized = name.toLowerCase().slice(0, 120) || 'category';
  const created = await tx.material_categories.create({
    data: {
      legacy_mongo_id: legacy || newId(),
      name: name || 'Category',
      normalized_name: custom ? `${normalized}-${String(ownerId)}`.slice(0, 120) : normalized,
      folded_name: normalized,
      category_type: custom ? 'CUSTOM' : 'SYSTEM',
      status: item.status || 'APPROVED',
      owner_user_id: custom ? ownerId : null,
    },
  });
  return created.id;
}

async function saveLocation(tx, currentId, fields) {
  const data = {
    formatted_address: text(fields.address) || null,
    city: text(fields.city, 120) || null,
    latitude: fields.lat == null ? null : fields.lat,
    longitude: fields.lng == null ? null : fields.lng,
    location_source: fields.locationSource || null,
    is_confirmed: Boolean(fields.locationConfirmed),
    confirmed_at: fields.locationConfirmed ? fields.locationConfirmedAt || new Date() : null,
    updated_at: new Date(),
  };
  if (currentId) {
    await tx.locations.update({ where: { id: currentId }, data });
    return currentId;
  }
  const created = await tx.locations.create({ data: { ...data, created_at: fields.createdAt || new Date() } });
  return created.id;
}

async function persistProfile(profile, outerTx) {
  const owner = await userRow(profile.userId);
  if (!owner) throw new Error('Contractor profile owner is not in PostgreSQL');
  const reviewer = profile.reviewedBy ? await userRow(profile.reviewedBy) : null;
  const run = async (tx) => {
    const locationId = await saveLocation(tx, profile.locationId, {
      address: profile.address,
      city: profile.city,
      createdAt: profile.createdAt,
    });
    const data = {
      user_id: owner.id,
      location_id: locationId,
      business_name: text(profile.businessName, 150),
      representative_name: text(profile.representativeName, 150),
      contact_phone: text(profile.contactPhone, 30),
      contact_email: text(profile.contactEmail, 255),
      worker_count: Number(profile.workerCount) || 0,
      tax_code: text(profile.taxCode, 100),
      description: text(profile.description, 1200),
      years_experience: Number(profile.yearsExperience) || 0,
      verification_status: profile.verificationStatus || 'DRAFT',
      portfolio_avatar_url: profile.portfolio?.avatar || '',
      team_logo_url: profile.portfolio?.teamLogo || '',
      workshop_url: profile.portfolio?.workshop || '',
      rejection_reason: profile.rejectionReason || '',
      submitted_at: profile.submittedAt || null,
      reviewed_at: profile.reviewedAt || null,
      reviewed_by: reviewer?.id || null,
      updated_at: new Date(),
    };
    let row;
    if (profile.pgId) {
      row = await tx.contractor_profiles.update({ where: { id: profile.pgId }, data });
    } else {
      // user_id is unique. Two first-time saves (React StrictMode fires the
      // workspace request twice) must update the row that won the race.
      row = await tx.contractor_profiles.upsert({
        where: { user_id: owner.id },
        update: data,
        create: {
          ...data,
          legacy_mongo_id: profile._id || newId(),
          created_at: profile.createdAt || new Date(),
        },
      });
      profile.pgId = row.id;
      profile._id = row.legacy_mongo_id;
    }
    profile.locationId = locationId;
    const profileId = row.id;
    const { ensureSaleColumns } = require('./column-ensure');
    await ensureSaleColumns();
    const keptListings = await tx.$queryRaw`
      SELECT material_category_id, listing_status
      FROM contractor_material_categories
      WHERE contractor_profile_id = ${profileId}
    `;
    await tx.contractor_documents.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_service_areas.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_profile_steps.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_profile_services.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_material_categories.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_portfolio_media.deleteMany({ where: { contractor_profile_id: profileId } });
    await tx.contractor_portfolio_projects.deleteMany({ where: { contractor_profile_id: profileId } });

    for (const doc of profile.documents || []) {
      if (!doc._id) doc._id = newId();
      await tx.contractor_documents.create({
        data: {
          legacy_mongo_sub_id: String(doc._id).slice(0, 24),
          contractor_profile_id: profileId,
          document_type: doc.type,
          file_url: doc.url,
          original_name: text(doc.originalName),
          mime_type: text(doc.mimeType, 150),
          file_size: BigInt(Number(doc.size) || 0),
          uploaded_at: doc.uploadedAt || new Date(),
        },
      });
    }
    const seenAreas = new Set();
    for (const area of profile.serviceAreas || []) {
      const name = text(area, 150);
      if (!name || seenAreas.has(name)) continue;
      seenAreas.add(name);
      await tx.contractor_service_areas.create({ data: { contractor_profile_id: profileId, area_name: name } });
    }
    for (let index = 0; index < 6; index += 1) {
      await tx.contractor_profile_steps.create({
        data: { contractor_profile_id: profileId, step_no: index + 1, is_completed: profile.completedSteps?.[index] === true },
      });
    }
    const seenServices = new Set();
    for (const service of profile.services || []) {
      if (!service.name) continue;
      const catalogId = await ensureCatalog(tx, service);
      if (seenServices.has(String(catalogId))) continue;
      seenServices.add(String(catalogId));
      await tx.contractor_profile_services.create({
        data: {
          contractor_profile_id: profileId,
          catalog_service_id: catalogId,
          selection_status: service.status || 'APPROVED',
        },
      });
    }
    const seenMaterials = new Set();
    for (const item of profile.materialCategories || []) {
      if (!item.name) continue;
      const categoryId = await ensureMaterial(tx, item, owner.id);
      if (seenMaterials.has(String(categoryId))) continue;
      seenMaterials.add(String(categoryId));
      await tx.contractor_material_categories.create({
        data: {
          contractor_profile_id: profileId,
          material_category_id: categoryId,
          selection_status: item.status || 'APPROVED',
        },
      });
    }
    for (const kept of keptListings || []) {
      if (kept.listing_status !== 'HIDDEN') continue;
      await tx.$executeRaw`
        UPDATE contractor_material_categories
        SET listing_status = 'HIDDEN'
        WHERE contractor_profile_id = ${profileId}
          AND material_category_id = ${kept.material_category_id}
      `;
    }
    const media = [
      ...(profile.portfolio?.construction || []).map((url, index) => ({ media_type: 'CONSTRUCTION', file_url: url, sort_order: index })),
      ...(profile.portfolio?.certificates || []).map((url, index) => ({ media_type: 'CERTIFICATE', file_url: url, sort_order: index })),
    ];
    for (const item of media) {
      if (!item.file_url) continue;
      await tx.contractor_portfolio_media.create({ data: { contractor_profile_id: profileId, ...item } });
    }
    for (const project of profile.portfolio?.projects || []) {
      if (!project._id) project._id = newId();
      let catalogId = null;
      if (project.serviceId) {
        const linked = await tx.catalog_services.findFirst({ where: { code: String(project.serviceId).slice(0, 160) } });
        catalogId = linked?.id || null;
      }
      const created = await tx.contractor_portfolio_projects.create({
        data: {
          legacy_mongo_sub_id: String(project._id).slice(0, 24),
          contractor_profile_id: profileId,
          catalog_service_id: catalogId,
          legacy_service_key: text(project.serviceId, 120),
          service_name_snapshot: text(project.serviceNameSnapshot, 80),
          description: text(project.description, 500),
        },
      });
      for (let index = 0; index < (project.images || []).length; index += 1) {
        if (!project.images[index]) continue;
        await tx.contractor_portfolio_project_images.create({
          data: { portfolio_project_id: created.id, file_url: project.images[index], sort_order: index },
        });
      }
    }
  };
  if (outerTx) await run(outerTx);
  else await prisma.$transaction(run);
}

async function persistStore(store, outerTx) {
  const owner = await userRow(store.contractorId);
  if (!owner) throw new Error('Store owner is not in PostgreSQL');
  const coords = store.location?.coordinates || [105.787, 10.045];
  const run = async (tx) => {
    const locationId = await saveLocation(tx, store.locationId, {
      address: store.address,
      city: store.city,
      lng: Number(coords[0]),
      lat: Number(coords[1]),
      locationSource: store.locationSource || null,
      locationConfirmed: store.locationConfirmed,
      locationConfirmedAt: store.locationConfirmedAt,
      createdAt: store.createdAt,
    });
    const data = {
      owner_user_id: owner.id,
      location_id: locationId,
      name: text(store.name, 100) || 'BuildMate partner',
      slogan: text(store.slogan, 140),
      description: text(store.description, 2000),
      phone: text(store.phone, 30),
      contact_name: text(store.contactName, 80),
      contact_email: text(store.contactEmail, 120),
      store_type: store.storeType || 'SERVICES',
      cover_image_url: store.coverImage || '',
      avatar_url: store.avatar || '',
      logo_url: store.logo || '',
      achievements: text(store.achievements, 500),
      showroom_note: text(store.showroomNote, 500),
      delivery_note: text(store.deliveryNote, 500),
      delivery_enabled: Boolean(store.deliveryEnabled),
      base_delivery_fee: store.baseDeliveryFee || 0,
      free_delivery_radius_km: store.freeDeliveryRadiusKm || 0,
      delivery_fee_per_km: store.deliveryFeePerKm || 0,
      minimum_order_amount: store.minimumOrderAmount || 0,
      display_years: store.displayYears == null ? null : Number(store.displayYears),
      display_worker_count: store.displayWorkerCount == null ? null : Number(store.displayWorkerCount),
      public_seeded: Boolean(store.publicSeeded),
      opening_hours: text(store.openingHours, 100) || '07:00 – 18:00',
      service_radius_km: store.serviceRadiusKm || 5,
      category: text(store.category, 120) || 'General repair',
      verified: Boolean(store.verified),
      rating: store.rating || 0,
      review_count: Number(store.reviewCount) || 0,
      material_rating: store.materialRating || 0,
      material_review_count: Number(store.materialReviewCount) || 0,
      status: store.status || 'INACTIVE',
      updated_at: new Date(),
    };
    let row;
    if (store.pgId) {
      row = await tx.stores.update({ where: { id: store.pgId }, data });
    } else {
      row = await tx.stores.upsert({
        where: { owner_user_id: owner.id },
        update: data,
        create: { ...data, legacy_mongo_id: store._id || newId(), created_at: store.createdAt || new Date() },
      });
      store.pgId = row.id;
      store._id = row.legacy_mongo_id;
    }
    store.locationId = locationId;
    await tx.store_media.deleteMany({ where: { store_id: row.id } });
    await tx.store_service_areas.deleteMany({ where: { store_id: row.id } });
    const media = [
      ...(store.gallery || []).map((url, index) => ({ media_type: 'GALLERY', file_url: url, sort_order: index })),
      ...(store.crewPhotos || []).map((url, index) => ({ media_type: 'CREW_PHOTO', file_url: url, sort_order: index })),
      ...(store.publicCertificates || []).map((url, index) => ({ media_type: 'PUBLIC_CERTIFICATE', file_url: url, sort_order: index })),
    ];
    for (const item of media) {
      if (!item.file_url) continue;
      await tx.store_media.create({ data: { store_id: row.id, ...item } });
    }
    const seenAreas = new Set();
    for (const area of store.serviceAreas || []) {
      const name = text(area, 150);
      if (!name || seenAreas.has(name)) continue;
      seenAreas.add(name);
      await tx.store_service_areas.create({ data: { store_id: row.id, area_name: name } });
    }
  };
  if (outerTx) await run(outerTx);
  else await prisma.$transaction(run);
}

function profileWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'userId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.users_contractor_profiles_user_idTousers = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'verificationStatus') {
      const status = enumClause(value);
      if (status == null) return null;
      where.verification_status = status;
    } else {
      return null;
    }
  }
  return where;
}

function storeWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'contractorId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.users = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'status') {
      const status = enumClause(value);
      if (status == null) return null;
      where.status = status;
    } else if (key === 'storeType') {
      const kind = enumClause(value);
      if (kind == null) return null;
      where.store_type = kind;
    } else {
      return null;
    }
  }
  return where;
}

async function profilesFor(filter) {
  const where = profileWhere(filter);
  if (!where) return null;
  const rows = await prisma.contractor_profiles.findMany({ where, include: profileInclude });
  return rows.map(profileFromRows);
}

async function storesFor(filter) {
  const where = storeWhere(filter);
  if (!where) return null;
  const rows = await prisma.stores.findMany({ where, include: storeInclude });
  return rows.map(storeFromRow);
}

const ContractorProfile = {
  find(filter) {
    return chain(async () => {
      const scoped = await profilesFor(filter);
      return scoped || (await allProfiles()).filter((row) => matches(row, filter));
    }, false);
  },
  findOne(filter) {
    return chain(async () => {
      const scoped = await profilesFor(filter);
      return scoped || (await allProfiles()).filter((row) => matches(row, filter));
    }, true);
  },
  findById(id) {
    return this.findOne({ _id: id });
  },
  async create(data) {
    const profile = new PgProfile({
      userId: legacyOf(data.userId),
      businessName: data.businessName || '',
      representativeName: data.representativeName || '',
      contactPhone: data.contactPhone || '',
      contactEmail: data.contactEmail || '',
      workerCount: data.workerCount || 0,
      taxCode: data.taxCode || '',
      address: data.address || '',
      city: data.city || '',
      description: data.description || '',
      yearsExperience: data.yearsExperience || 0,
      serviceAreas: data.serviceAreas || [],
      materialCategories: data.materialCategories || [],
      services: data.services || [],
      _id: data._id,
      verificationStatus: data.verificationStatus || 'DRAFT',
      portfolio: data.portfolio,
      documents: data.documents || [],
      completedSteps: data.completedSteps,
      rejectionReason: '',
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    });
    await profile.save();
    return profile;
  },
  async countDocuments(filter) {
    const where = profileWhere(filter);
    if (where) return prisma.contractor_profiles.count({ where });
    const rows = await allProfiles();
    return rows.filter((row) => matches(row, filter)).length;
  },
  async updateMany(filter, update) {
    const rows = (await allProfiles()).filter((row) => matches(row, filter));
    const set = update?.$set || {};
    for (const profile of rows) {
      for (const item of profile.services || []) {
        if (filter['services.serviceId'] && String(item.serviceId) !== String(filter['services.serviceId'])) continue;
        if (set['services.$[item].status'] !== undefined) item.status = set['services.$[item].status'];
        if (set['services.$[item].type'] !== undefined) item.type = set['services.$[item].type'];
        if (set['services.$[item].name'] !== undefined) item.name = set['services.$[item].name'];
        if (set['services.$[item].category'] !== undefined) item.category = set['services.$[item].category'];
      }
      await profile.save();
    }
    return { modifiedCount: rows.length };
  },
};

const Store = {
  find(filter) {
    return chain(async () => {
      const scoped = await storesFor(filter);
      return scoped || (await allStores()).filter((row) => matches(row, filter));
    }, false);
  },
  findOne(filter) {
    return chain(async () => {
      const scoped = await storesFor(filter);
      return scoped || (await allStores()).filter((row) => matches(row, filter));
    }, true);
  },
  findById(id) {
    return this.findOne({ _id: id });
  },
  async create(data) {
    const store = new PgStore({
      _id: data._id,
      contractorId: legacyOf(data.contractorId),
      name: data.name,
      slogan: data.slogan || '',
      description: data.description || '',
      phone: data.phone || '',
      contactName: data.contactName || '',
      contactEmail: data.contactEmail || '',
      address: data.address || '',
      city: data.city || 'Can Tho',
      storeType: data.storeType || 'SERVICES',
      coverImage: data.coverImage || '',
      avatar: data.avatar || '',
      logo: data.logo || '',
      gallery: data.gallery || [],
      crewPhotos: data.crewPhotos || [],
      publicCertificates: data.publicCertificates || [],
      achievements: data.achievements || '',
      showroomNote: data.showroomNote || '',
      deliveryNote: data.deliveryNote || '',
      deliveryEnabled: Boolean(data.deliveryEnabled),
      baseDeliveryFee: data.baseDeliveryFee || 0,
      freeDeliveryRadiusKm: data.freeDeliveryRadiusKm || 0,
      deliveryFeePerKm: data.deliveryFeePerKm || 0,
      minimumOrderAmount: data.minimumOrderAmount || 0,
      displayYears: data.displayYears ?? null,
      displayWorkerCount: data.displayWorkerCount ?? null,
      serviceAreas: data.serviceAreas || [],
      publicSeeded: Boolean(data.publicSeeded),
      openingHours: data.openingHours || '07:00 – 18:00',
      serviceRadiusKm: data.serviceRadiusKm || 5,
      category: data.category || 'General repair',
      verified: Boolean(data.verified),
      rating: data.rating || 0,
      reviewCount: data.reviewCount || 0,
      materialRating: data.materialRating || 0,
      materialReviewCount: data.materialReviewCount || 0,
      status: data.status || 'INACTIVE',
      location: data.location || { type: 'Point', coordinates: [105.787, 10.045] },
      locationConfirmed: Boolean(data.locationConfirmed),
      locationSource: data.locationSource || '',
      locationConfirmedAt: data.locationConfirmedAt || null,
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    });
    await store.save();
    return store;
  },
  async findOneAndUpdate(filter, update) {
    const store = await this.findOne(filter);
    if (!store) return null;
    Object.assign(store, update.$set || update);
    await store.save();
    return store;
  },
  async findOneAndDelete(filter) {
    const store = await this.findOne(filter);
    if (!store) return null;
    await prisma.stores.delete({ where: { id: store.pgId } });
    return store;
  },
};

async function backfillBatch(profiles, stores) {
  await prisma.$transaction(async (tx) => {
    for (const profile of profiles) await persistProfile(profile, tx);
    for (const store of stores) await persistStore(store, tx);
  }, { timeout: 120000 });
}

module.exports = { ContractorProfile, Store, PgProfile, PgStore, backfillBatch };
