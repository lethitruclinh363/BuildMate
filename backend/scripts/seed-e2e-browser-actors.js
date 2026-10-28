#!/usr/bin/env node
/**
 * Idempotent browser-E2E fixtures on BuilMate_test only.
 * Does not print passwords. Does not touch BuilMate.
 */
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
} = require('../src/tests/helpers/database-safety');

loadTestEnv();
const url = requireIsolatedTestDatabase();
process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
process.env.BUILDMATE_TEST_DATABASE = 'isolated';
process.env.DATABASE_PROVIDER = 'postgres';
process.env.NODE_ENV = 'test';
process.env.EMAIL_HOST = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

const { userRepository } = require('../src/repositories/userRepository');
const { ContractorProfile, Store } = require('../src/repositories/partnerAccess');
const { Service, Material } = require('../src/repositories/offeringAccess');
const { VERIFICATION_STATUS } = require('../src/models/ContractorProfile');
const { STORE_STATUS, STORE_TYPE } = require('../src/models/Store');
const { PROFILE_STATUS } = require('../src/models/user.model');
const { ensureSystemCatalog } = require('../src/services/catalogService');
const { ensureDefaultPolicies } = require('../src/services/policy.service');
const { ensureE2ePlaceholderFile } = require('./test-db/ensure-e2e-placeholder');

const CAN_THO = { type: 'Point', coordinates: [105.7469, 10.0452] };
const PLACEHOLDER = '/uploads/e2e-placeholder.png';

async function requireActor(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) throw new Error(`Missing seed actor ${email}. Run seed-test-actors.js first.`);
  return user;
}

async function approveUser(user) {
  if (user.profileStatus !== PROFILE_STATUS.APPROVED) {
    await userRepository.updateById(user._id, { profileStatus: PROFILE_STATUS.APPROVED });
  }
}

async function ensureProfile(user, fields) {
  let profile = await ContractorProfile.findOne({ userId: user._id });
  if (!profile) {
    profile = await ContractorProfile.create({
      userId: user._id,
      verificationStatus: VERIFICATION_STATUS.APPROVED,
      reviewedAt: new Date(),
      ...fields,
    });
    return profile;
  }
  profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
  profile.rejectionReason = '';
  Object.assign(profile, fields);
  await profile.save();
  return profile;
}

async function ensureStore(user, fields) {
  let store = await Store.findOne({ contractorId: user._id });
  if (!store) {
    return Store.create({
      contractorId: user._id,
      verified: true,
      status: STORE_STATUS.LIVE,
      location: CAN_THO,
      locationConfirmed: true,
      locationSource: 'MANUAL_PIN',
      locationConfirmedAt: new Date(),
      city: 'Can Tho',
      avatar: PLACEHOLDER,
      coverImage: PLACEHOLDER,
      openingHours: '07:00 – 18:00',
      ...fields,
    });
  }
  Object.assign(store, {
    verified: true,
    status: STORE_STATUS.LIVE,
    location: CAN_THO,
    locationConfirmed: true,
    locationSource: 'MANUAL_PIN',
    ...fields,
  });
  await store.save();
  return store;
}

async function ensureService(store, owner, spec) {
  const existing = await Service.findOne({ storeId: store._id, name: spec.name });
  if (existing) {
    existing.isActive = true;
    existing.basePrice = spec.basePrice;
    await existing.save();
    return existing;
  }
  return Service.create({
    storeId: store._id,
    contractorId: owner._id,
    isActive: true,
    ...spec,
  });
}

async function ensureMaterial(store, spec) {
  const existing = await Material.findOne({ storeId: store._id, name: spec.name });
  if (existing) {
    existing.price = spec.price;
    existing.stock = spec.stock;
    existing.isActive = true;
    if (!existing.images?.length) existing.images = [PLACEHOLDER];
    await existing.save();
    return existing;
  }
  return Material.create({
    storeId: store._id,
    isActive: true,
    images: [PLACEHOLDER],
    ...spec,
  });
}

async function main() {
  const db = new URL(url);
  if (decodeURIComponent(db.pathname.replace(/^\//, '')).toLowerCase() !== 'builmate_test') {
    throw new Error('Refusing to seed browser fixtures outside BuilMate_test');
  }

  ensureE2ePlaceholderFile();
  await ensureDefaultPolicies();
  await ensureSystemCatalog();

  const customer = await requireActor('demo.customer@buildmate.test');
  const contractor = await requireActor('demo.contractor@buildmate.test');
  const storeOwner = await requireActor('demo.store@buildmate.test');
  const admin = await requireActor('demo.admin@buildmate.test');

  await approveUser(customer);
  await approveUser(contractor);
  await approveUser(storeOwner);
  await approveUser(admin);

  const contractorProfile = await ensureProfile(contractor, {
    businessName: 'Demo Can Tho Crew',
    representativeName: 'Demo Contractor',
    contactPhone: '0901000002',
    contactEmail: contractor.email,
    description: 'Test crew for browser E2E plumbing jobs in Can Tho.',
    yearsExperience: 5,
    workerCount: 4,
    city: 'Can Tho',
    address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
    serviceAreas: ['Ninh Kieu', 'Can Tho'],
  });
  contractorProfile.services = [{
    name: 'Pipe leak',
    category: 'Plumbing',
    type: 'SYSTEM',
    status: 'APPROVED',
    catalogKey: 'Plumbing::Pipe leak',
  }];
  await contractorProfile.save();

  const contractorStore = await ensureStore(contractor, {
    name: 'Demo Can Tho Crew',
    description: 'Approved plumbing crew used only on BuilMate_test.',
    phone: '0901000002',
    address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
    storeType: STORE_TYPE.SERVICES,
    category: 'Plumbing',
    serviceAreas: ['Ninh Kieu', 'Can Tho'],
  });
  await ensureService(contractorStore, contractor, {
    name: 'Pipe leak repair',
    category: 'Plumbing',
    basePrice: 1500000,
    unit: 'JOB',
    description: 'Stop a household pipe leak.',
  });

  const storeProfile = await ensureProfile(storeOwner, {
    businessName: 'Demo Can Tho Materials',
    representativeName: 'Demo Store Owner',
    contactPhone: '0901000003',
    contactEmail: storeOwner.email,
    description: 'Test material store for browser E2E COD checkout.',
    city: 'Can Tho',
    address: '88 Hoa Binh, Ninh Kieu, Can Tho',
    materialCategories: [{ name: 'Cement', type: 'SYSTEM', status: 'APPROVED' }],
  });
  await storeProfile.save();

  const materialStore = await ensureStore(storeOwner, {
    name: 'Demo Can Tho Materials',
    description: 'Approved material store used only on BuilMate_test.',
    phone: '0901000003',
    address: '88 Hoa Binh, Ninh Kieu, Can Tho',
    storeType: STORE_TYPE.MATERIALS,
    category: 'Cement',
    deliveryEnabled: true,
    baseDeliveryFee: 100000,
    deliveryFeePerKm: 0,
    freeDeliveryRadiusKm: 50,
    serviceAreas: ['Ninh Kieu', 'Can Tho'],
  });
  await ensureMaterial(materialStore, {
    name: 'Demo Portland Cement',
    category: 'Cement',
    sku: 'E2E-CEM-50',
    unit: 'bag',
    price: 2000000,
    stock: 20,
    minOrderQty: 1,
    description: '50kg cement bag for COD browser E2E.',
  });

  console.log(JSON.stringify({
    database: decodeURIComponent(db.pathname.replace(/^\//, '')),
    host: db.hostname,
    port: db.port,
    actors: {
      customer: customer.email,
      contractor: contractor.email,
      store: storeOwner.email,
      admin: admin.email,
    },
    contractorId: contractor._id,
    contractorStoreId: contractorStore._id,
    materialStoreId: materialStore._id,
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
