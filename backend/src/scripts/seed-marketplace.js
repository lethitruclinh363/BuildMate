const mongoose = require('mongoose');
const { User, ROLES, USER_STATUS } = require('../models/User');
const { removeRelated } = require('./remove-demo-users');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Store, STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { Service } = require('../models/Service');
const { Material } = require('../models/Material');

const DEMO_PASSWORD = 'Demo@1234';

const DEMO_ACTORS = [
  {
    name: 'Lan Nguyen',
    email: 'oscar.d@example.net',
    phone: '0901000001',
    role: ROLES.CUSTOMER,
  },
  {
    name: 'An Phu Construction',
    email: 'paula.r@example.org',
    phone: '0901000002',
    role: ROLES.CONTRACTOR,
  },
  {
    name: 'Can Tho Materials',
    email: 'yosef.c@example.com',
    phone: '0901000003',
    role: ROLES.MATERIAL_STORE_OWNER,
  },
];

const ALLOWED_ROLES = new Set(Object.values(ROLES));

const RETIRED_DEMO_EMAILS = [
  'carol.w@example.org',
  'marco.r@example.org',
  'hannah.h@example.com',
  'alice.j@example.com',
  'xavier.y@example.org',
  'yosef.c@example.com',
  'laura.c@example.net',
  'ursula.b@example.com',
];

async function purgeWorkerDemo() {
  const db = mongoose.connection.db;
  const users = await db.collection('users').deleteMany({
    $or: [{ role: 'WORKER' }, { email: 'worker@buildmate.vn' }, { role: { $nin: [...ALLOWED_ROLES] } }],
  });

  const dropped = [];
  for (const name of ['workers', 'workerprofiles', 'workassignments', 'assignments']) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) continue;
    await db.collection(name).drop();
    dropped.push(name);
  }

  console.log(
    '[seed] Removed worker users',
    users.deletedCount,
    dropped.length ? `collections ${dropped.join(', ')}` : ''
  );
}

async function upsertDemoUser(data) {
  let user = await User.findOne({ email: data.email });
  if (!user) {
    user = await User.create({
      ...data,
      password: DEMO_PASSWORD,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
    });
    console.log('[seed] Created', data.role, data.email);
    return user;
  }

  user.name = data.name;
  user.fullName = data.name;
  user.role = data.role;
  user.phone = data.phone;
  user.status = USER_STATUS.ACTIVE;
  user.emailVerified = true;
  await user.save();
  return user;
}

async function upsertApprovedProfile(user, fields) {
  return ContractorProfile.findOneAndUpdate(
    { userId: user._id },
    {
      userId: user._id,
      verificationStatus: VERIFICATION_STATUS.APPROVED,
      reviewedAt: new Date(),
      rejectionReason: '',
      ...fields,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertStore(owner, fields) {
  return Store.findOneAndUpdate(
    { contractorId: owner._id },
    {
      contractorId: owner._id,
      verified: true,
      status: STORE_STATUS.LIVE,
      city: 'Can Tho',
      ...fields,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function ensureService(store, owner, spec) {
  const existing = await Service.findOne({ storeId: store._id, name: spec.name });
  if (existing) return existing;
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
    await Material.updateOne({ _id: existing._id }, { $unset: { contractorId: '' } });
    return existing;
  }
  return Material.create({
    storeId: store._id,
    isActive: true,
    ...spec,
  });
}

async function seedMarketplace() {
  const retired = await User.find({ email: { $in: RETIRED_DEMO_EMAILS } }).select('_id email');
  if (retired.length) {
    await removeRelated(retired.map((user) => user._id));
    console.log('[seed] Removed retired demo users', retired.map((user) => user.email).join(', '));
  }
  await purgeWorkerDemo();

  const users = {};
  for (const actor of DEMO_ACTORS) {
    users[actor.role] = await upsertDemoUser(actor);
  }

  const contractor = users[ROLES.CONTRACTOR];
  const materialOwner = users[ROLES.MATERIAL_STORE_OWNER];

  await upsertApprovedProfile(contractor, {
    businessName: 'An Phu Construction',
    address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
    description: 'Waterproofing and home repair for Ninh Kieu.',
    yearsExperience: 8,
    serviceAreas: ['Ninh Kieu', 'Can Tho'],
  });

  await upsertApprovedProfile(materialOwner, {
    businessName: 'Can Tho Materials',
    address: '45 Mau Than, Ninh Kieu, Can Tho',
    description: 'Waterproof coatings, pipe, and paint for local repair jobs.',
    yearsExperience: 6,
    serviceAreas: ['Ninh Kieu', 'Can Tho'],
  });

  const contractorStore = await upsertStore(contractor, {
    name: 'An Phu Construction',
    slogan: 'Home repair in Ninh Kieu',
    description: 'Contractor store for waterproofing and general repair.',
    phone: contractor.phone,
    address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
    storeType: STORE_TYPE.SERVICES,
    category: 'Waterproofing',
    openingHours: '07:00 – 17:30',
    serviceRadiusKm: 8,
    location: { type: 'Point', coordinates: [105.748, 10.046] },
  });

  const materialStore = await upsertStore(materialOwner, {
    name: 'Can Tho Materials',
    slogan: 'Materials for repair jobs',
    description: 'Material store supplying coatings, pipe, and paint.',
    phone: materialOwner.phone,
    address: '45 Mau Than, Ninh Kieu, Can Tho',
    storeType: STORE_TYPE.MATERIALS,
    category: 'Waterproof coat',
    openingHours: '07:30 – 18:00',
    serviceRadiusKm: 12,
    location: { type: 'Point', coordinates: [105.755, 10.044] },
  });

  await ensureService(contractorStore, contractor, {
    name: 'Bathroom waterproofing',
    category: 'Waterproofing',
    description: 'Membrane check, coating, and flood test.',
    basePrice: 2800000,
    unit: 'JOB',
    estimatedHours: 16,
  });

  await Material.deleteMany({ storeId: contractorStore._id });
  await Service.deleteMany({ storeId: materialStore._id });

  await ensureMaterial(materialStore, {
    name: 'Kova CT-11A coating',
    category: 'Waterproof coat',
    sku: 'KOVA-CT11A',
    unit: 'pail',
    price: 385000,
    stock: 24,
  });
  await ensureMaterial(materialStore, {
    name: 'Sika 107 slurry',
    category: 'Waterproof coat',
    sku: 'SIKA-107',
    unit: 'set',
    price: 520000,
    stock: 12,
  });
  await Material.updateMany({ storeId: materialStore._id }, { $unset: { contractorId: '' } });

  console.log('[seed] Demo users ready: customer, contractor, material store, admin');
}

module.exports = { seedMarketplace, DEMO_ACTORS };
