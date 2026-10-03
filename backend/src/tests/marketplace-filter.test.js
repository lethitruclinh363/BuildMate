const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureMongo, mongoSkip } = require('./helpers/mongo');
const { applyMarketplaceFilters } = require('../services/location.service');
const marketplace = require('../services/marketplace.service');

describe('marketplace filters', () => {
  const rows = [
    { storeName: 'A', category: 'Waterproofing', rating: 4.9, storeType: 'BOTH', services: [{ category: 'Painting', name: 'Repaint' }] },
    { storeName: 'B', category: 'Electrical', rating: 3.2, storeType: 'SERVICES', services: [{ category: 'Electrical', name: 'Outlet' }] },
    { storeName: 'C', category: 'Steel', rating: 4.6, storeType: 'MATERIALS', services: [] },
  ];

  it('filters by rating, category and store type', () => {
    assert.equal(applyMarketplaceFilters(rows, { minRating: 4.5 }).length, 2);
    assert.equal(applyMarketplaceFilters(rows, { category: 'Electrical' })[0].storeName, 'B');
    assert.equal(applyMarketplaceFilters(rows, { storeType: 'MATERIALS' }).map((r) => r.storeName).join(','), 'A,C');
  });
});

describe('marketplace catalog LIVE+APPROVED gate', { timeout: 90000 }, () => {
  let dbReady = false;
  const cleanup = { users: [], stores: [], services: [], materials: [], profiles: [] };

  before(async () => {
    dbReady = await ensureMongo();
  });

  after(async () => {
    if (!dbReady) return;
    const { User } = require('../models/User');
    const { Store } = require('../models/Store');
    const { Service } = require('../models/Service');
    const { Material } = require('../models/Material');
    const { ContractorProfile } = require('../models/ContractorProfile');
    await Promise.all([
      User.deleteMany({ _id: { $in: cleanup.users } }),
      Store.deleteMany({ _id: { $in: cleanup.stores } }),
      Service.deleteMany({ _id: { $in: cleanup.services } }),
      Material.deleteMany({ _id: { $in: cleanup.materials } }),
      ContractorProfile.deleteMany({ _id: { $in: cleanup.profiles } }),
    ]);
    const { stopMongo } = require('./helpers/mongo');
    await stopMongo();
  });

  it('hides catalog from draft/pending contractors and keeps approved LIVE stores', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }

    const { User, ROLES, USER_STATUS } = require('../models/User');
    const { Store, STORE_STATUS } = require('../models/Store');
    const { Service } = require('../models/Service');
    const { Material } = require('../models/Material');
    const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');

    const stamp = Date.now();
    const approvedUser = await User.create({
      name: 'Approved Co',
      email: `mkt.ok.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.ACTIVE,
    });
    const pendingUser = await User.create({
      name: 'Pending Co',
      email: `mkt.pending.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.PENDING_VERIFICATION,
    });
    cleanup.users.push(approvedUser._id, pendingUser._id);

    const okProfile = await ContractorProfile.create({
      userId: approvedUser._id,
      businessName: 'OK Yard',
      verificationStatus: VERIFICATION_STATUS.APPROVED,
    });
    const pendingProfile = await ContractorProfile.create({
      userId: pendingUser._id,
      businessName: 'Pending Yard',
      verificationStatus: VERIFICATION_STATUS.SUBMITTED,
    });
    cleanup.profiles.push(okProfile._id, pendingProfile._id);

    okProfile.materialCategories = [{ name: 'Cement', type: 'SYSTEM' }];
    await okProfile.save();

    const liveStore = await Store.create({
      contractorId: approvedUser._id,
      name: 'Live Approved Store',
      description: 'Waterproofing crew for Can Tho homes',
      phone: '0901234567',
      avatar: '/uploads/crew.png',
      coverImage: '/uploads/cover.png',
      address: 'Can Tho',
      city: 'Can Tho',
      storeType: 'BOTH',
      status: STORE_STATUS.LIVE,
      location: { type: 'Point', coordinates: [105.746, 10.045] },
    });
    const pendingStore = await Store.create({
      contractorId: pendingUser._id,
      name: 'Pending Store',
      address: 'Can Tho',
      city: 'Can Tho',
      storeType: 'BOTH',
      status: STORE_STATUS.LIVE,
      location: { type: 'Point', coordinates: [105.75, 10.05] },
    });
    cleanup.stores.push(liveStore._id, pendingStore._id);

    const okService = await Service.create({
      storeId: liveStore._id,
      contractorId: approvedUser._id,
      name: 'Visible Waterproof',
      category: 'Waterproofing',
      basePrice: 500000,
      isActive: true,
    });
    const hiddenService = await Service.create({
      storeId: pendingStore._id,
      contractorId: pendingUser._id,
      name: 'Hidden Waterproof',
      category: 'Waterproofing',
      basePrice: 400000,
      isActive: true,
    });
    cleanup.services.push(okService._id, hiddenService._id);

    const okMaterial = await Material.create({
      storeId: liveStore._id,
      contractorId: approvedUser._id,
      name: 'Visible Cement',
      category: 'Cement',
      price: 90000,
      isActive: true,
    });
    const hiddenMaterial = await Material.create({
      storeId: pendingStore._id,
      contractorId: pendingUser._id,
      name: 'Hidden Cement',
      category: 'Cement',
      price: 80000,
      isActive: true,
    });
    cleanup.materials.push(okMaterial._id, hiddenMaterial._id);

    const services = await marketplace.searchServices({ category: 'Waterproofing' });
    const materials = await marketplace.searchMaterials({ category: 'Cement' });

    assert.equal(services.some((s) => s.name === 'Visible Waterproof'), true);
    assert.equal(services.some((s) => s.name === 'Hidden Waterproof'), false);
    assert.equal(materials.some((m) => m.name === 'Visible Cement'), true);
    assert.equal(materials.some((m) => m.name === 'Hidden Cement'), false);

    await assert.rejects(() => marketplace.getPublicStore(pendingStore._id), (err) => err.statusCode === 404);
    const pub = await marketplace.getPublicStore(liveStore._id);
    assert.equal(pub.visibility, 'LIVE');
    assert.equal(pub.store.name, 'Live Approved Store');

    const quietUser = await User.create({
      name: 'Quiet Co',
      email: `mkt.quiet.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.ACTIVE,
    });
    cleanup.users.push(quietUser._id);
    const quietProfile = await ContractorProfile.create({
      userId: quietUser._id,
      businessName: 'Quiet Yard',
      verificationStatus: VERIFICATION_STATUS.APPROVED,
    });
    cleanup.profiles.push(quietProfile._id);
    const quietStore = await Store.create({
      contractorId: quietUser._id,
      name: 'Quiet Approved Store',
      description: 'Approved crew that has not activated yet',
      phone: '0901234567',
      avatar: '/uploads/quiet.png',
      address: 'Can Tho',
      city: 'Can Tho',
      storeType: 'SERVICES',
      status: STORE_STATUS.INACTIVE,
      location: { type: 'Point', coordinates: [105.74, 10.04] },
    });
    cleanup.stores.push(quietStore._id);
    const quietService = await Service.create({
      storeId: quietStore._id,
      contractorId: quietUser._id,
      name: 'Inactive Waterproof',
      category: 'Waterproofing',
      basePrice: 300000,
      isActive: true,
    });
    cleanup.services.push(quietService._id);

    const after = await marketplace.searchServices({ category: 'Waterproofing' });
    assert.equal(after.some((item) => item.name === 'Inactive Waterproof'), false);
    const hidden = await marketplace.getPublicStore(quietStore._id);
    assert.equal(hidden.visibility, 'INACTIVE');
    assert.equal(hidden.services.length, 0);
  });
});
