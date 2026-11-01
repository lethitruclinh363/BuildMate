const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  offeringIdentity,
  matchesCatalogName,
  publicPricedServiceMatch,
} = require('../constants/contractorServices');
const { createUser, deleteFixtureUsers } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { STORE_STATUS } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ROLES } = require('../models/user.model');
const { REPAIR_CATEGORY } = require('../models/RepairRequest');
const { ApiError } = require('../utils/ApiError');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('contractor service identity', () => {
  it('maps a Vietnamese catalog name to the shared system service', () => {
    const identity = offeringIdentity({ type: 'SYSTEM', category: 'Electrical', name: 'Lắp đèn' });
    assert.equal(identity.catalogKey, 'Electrical::Lighting');
    assert.equal(identity.name, 'Lighting');
    assert.equal(identity.catalogType, 'SYSTEM');
  });

  it('keeps a pending custom proposal out of contractor offerings', () => {
    assert.equal(
      offeringIdentity({
        type: 'CUSTOM',
        name: 'Thi công mái kính',
        category: 'Construction',
        serviceId: 'a'.repeat(24),
        status: 'PENDING_APPROVAL',
      }),
      null
    );
  });

  it('links an approved custom name by its catalog id', () => {
    const id = 'b'.repeat(24);
    const identity = offeringIdentity({
      type: 'CUSTOM',
      name: 'Thi công mái kính',
      category: 'Construction',
      serviceId: id,
      status: 'APPROVED',
    });
    assert.equal(identity.catalogKey, id);
    assert.equal(identity.catalogType, 'CUSTOM');
  });

  it('recognizes a legacy priced row that already uses the catalog name', () => {
    const identity = offeringIdentity({ type: 'SYSTEM', category: 'Electrical', name: 'Lighting' });
    assert.equal(matchesCatalogName(' lắp   đèn ', identity), true);
    assert.equal(matchesCatalogName('Sơn trong nhà', identity), false);
  });
});

describe('public priced services', () => {
  it('requires an active completed service with a real price', () => {
    assert.deepEqual(publicPricedServiceMatch(), {
      isActive: true,
      basePrice: { $gt: 0 },
      completionStatus: { $ne: 'INCOMPLETE' },
    });
  });
});

describe('customer request offerings stay on the contractor', () => {
  const { offeringMatchesCatalog } = require('../constants/contractorServices');

  it('matches the contractor catalogKey and rejects another crew’s key', () => {
    const offered = { catalogKey: 'Electrical::Wiring', category: 'Electrical', name: 'Wiring', id: 'svc-a' };
    assert.equal(offeringMatchesCatalog(offered, 'Electrical::Wiring'), true);
    assert.equal(offeringMatchesCatalog(offered, 'svc-a'), true);
    assert.equal(offeringMatchesCatalog(offered, 'Plumbing::Toilet installation'), false);
    assert.equal(offeringMatchesCatalog(offered, ''), false);
  });
});

describe('contractor offering pause, resume and delete', () => {
  it('keeps completionStatus separate from listing isActive', () => {
    const service = readBe('services/serviceService.js');
    assert.match(service, /const wasCompleted = item\.completionStatus === 'COMPLETED'/);
    assert.match(service, /if \(!wasCompleted\) item\.isActive = true/);
    assert.doesNotMatch(service, /item\.completionStatus = 'COMPLETED';\s*item\.isActive = true/);
    assert.match(service, /async function setAvailability/);
    assert.match(service, /Complete this service before listing it/);
  });

  it('pauses by isActive and still uses publicPricedServiceMatch for customers', () => {
    const service = readBe('services/serviceService.js');
    const page = readFe('pages/contractor/ContractorServicesPage.tsx');
    const api = readFe('lib/partner-api.ts');
    assert.match(service, /item\.isActive = false/);
    assert.match(service, /listCustomerOfferings[\s\S]*publicPricedServiceMatch/);
    assert.match(service, /assertContractorOffersCatalog/);
    assert.match(api, /setServiceAvailability/);
    assert.match(api, /\/contractor\/services\/\$\{id\}\/availability/);
    assert.match(page, /servicePage\.pause/);
    assert.match(page, /servicePage\.resume/);
    assert.match(page, /filterAll/);
    assert.match(page, /filterActive/);
    assert.match(page, /filterPaused/);
    assert.match(readBe('routes/contractorRoutes.js'), /services\/:id\/availability/);
  });

  it('deletes an unused offering without touching the admin catalog', () => {
    const service = readBe('services/serviceService.js');
    const page = readFe('pages/contractor/ContractorServicesPage.tsx');
    assert.match(service, /Pause this service instead\. It already has repair jobs/);
    assert.match(service, /unlinkProfileService/);
    assert.match(service, /item\.deleteOne\(\)/);
    assert.doesNotMatch(service, /if \(item\.catalogKey\)[\s\S]{0,80}Register a service from the BuildMate catalog/);
    assert.doesNotMatch(service, /CatalogService\.delete|catalog_services\.delete/);
    assert.match(page, /servicePage\.delete/);
    assert.match(readBe('routes/contractorRoutes.js'), /router\.delete\('\/services\/:id'/);
  });

  it('scopes pause and delete to the owner storefront', () => {
    const routes = readBe('routes/contractorRoutes.js');
    const controller = readBe('controllers/serviceController.js');
    assert.match(routes, /catalogWrite/);
    assert.match(controller, /req\.store\._id/);
    assert.match(controller, /setAvailability\(req\.store\._id, req\.params\.id, req\.body\.isActive\)/);
    assert.match(controller, /deleteService\(req\.store\._id, req\.user\.id, req\.params\.id\)/);
  });

  it('hides paused offerings from the customer request form', () => {
    const page = readFe('pages/customer/CreateRepairRequestPage.tsx');
    assert.match(page, /item\.isActive === true/);
    assert.match(page, /catalogServiceId/);
    assert.match(readBe('services/repairService.js'), /assertContractorOffersCatalog/);
  });
});

describe('contractor offering availability runtime', { timeout: 90000 }, () => {
  const cleanup = { users: [] };

  after(async () => {
    if (!testDatabaseReady() || !cleanup.users.length) return;
    await deleteFixtureUsers(cleanup.users);
  });

  it('pauses, hides from customers, resumes, and refuses delete when jobs exist', async (t) => {
    if (!testDatabaseReady()) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { ContractorProfile, Store } = require('../repositories/partnerAccess');
    const { Service } = require('../repositories/offeringAccess');
    const { RepairRequest } = require('../repositories/conversationAccess');
    const { prisma } = require('../config/prisma');
    const serviceService = require('../services/serviceService');

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      t.skip('PostgreSQL test database is not reachable');
      return;
    }

    await prisma.service_categories.upsert({
      where: { name: 'Electrical' },
      update: {},
      create: { name: 'Electrical' },
    });

    const stamp = Date.now();
    const owner = await createUser({
      name: 'Offering Owner',
      email: `svc.owner.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    const other = await createUser({
      name: 'Other Crew',
      email: `svc.other.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    const customer = await createUser({
      name: 'Offering Customer',
      email: `svc.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    cleanup.users.push(owner._id, other._id, customer._id);

    await ContractorProfile.create({
      userId: owner._id,
      businessName: 'Owner Crew',
      verificationStatus: VERIFICATION_STATUS.APPROVED,
    });
    await ContractorProfile.create({
      userId: other._id,
      businessName: 'Other Crew',
      verificationStatus: VERIFICATION_STATUS.APPROVED,
    });

    const ownerStore = await Store.create({
      contractorId: owner._id,
      name: 'Owner Service Store',
      description: 'Electrical crew for pause tests',
      phone: '0901234567',
      avatar: '/uploads/crew.png',
      address: 'Can Tho',
      city: 'Can Tho',
      storeType: 'SERVICES',
      status: STORE_STATUS.LIVE,
      location: { type: 'Point', coordinates: [105.746, 10.045] },
      locationConfirmed: true,
    });
    const otherStore = await Store.create({
      contractorId: other._id,
      name: 'Other Service Store',
      address: 'Can Tho',
      city: 'Can Tho',
      storeType: 'SERVICES',
      status: STORE_STATUS.LIVE,
      location: { type: 'Point', coordinates: [105.75, 10.05] },
    });

    const catalogKey = 'Electrical::Wiring';
    const offering = await Service.create({
      storeId: ownerStore._id,
      contractorId: owner._id,
      name: 'Wiring',
      category: 'Electrical',
      catalogKey,
      catalogType: 'SYSTEM',
      completionStatus: 'COMPLETED',
      basePrice: 100000,
      unit: 'JOB',
      isActive: true,
    });
    const unused = await Service.create({
      storeId: ownerStore._id,
      contractorId: owner._id,
      name: 'Lighting',
      category: 'Electrical',
      catalogKey: 'Electrical::Lighting',
      catalogType: 'SYSTEM',
      completionStatus: 'COMPLETED',
      basePrice: 120000,
      unit: 'JOB',
      isActive: true,
    });

    const listed = await serviceService.listServices(ownerStore._id, owner._id);
    assert.equal(listed.some((row) => String(row.id) === String(offering._id)), true);

    const catalogBefore = await prisma.catalog_services.count();
    const activePublic = await Service.find({ storeId: ownerStore._id, ...publicPricedServiceMatch() });
    assert.equal(activePublic.some((row) => String(row._id || row.id) === String(offering._id)), true);

    const paused = await serviceService.setAvailability(ownerStore._id, offering._id, false);
    assert.equal(paused.isActive, false);

    const hidden = await serviceService.listCustomerOfferings(owner._id);
    assert.equal(hidden.some((row) => String(row._id || row.id) === String(offering._id)), false);

    const publicRows = await Service.find({ storeId: ownerStore._id, ...publicPricedServiceMatch() });
    assert.equal(publicRows.some((row) => String(row._id || row.id) === String(offering._id)), false);

    await assert.rejects(
      () => serviceService.assertContractorOffersCatalog(owner._id, catalogKey),
      (err) => err instanceof ApiError && err.statusCode === 400
    );

    const keptAfterEdit = await serviceService.updateService(ownerStore._id, offering._id, { basePrice: 100000 });
    assert.equal(keptAfterEdit.isActive, false);

    const resumed = await serviceService.setAvailability(ownerStore._id, offering._id, true);
    assert.equal(resumed.isActive, true);
    const visible = await serviceService.listCustomerOfferings(owner._id);
    assert.equal(visible.some((row) => String(row._id || row.id) === String(offering._id)), true);
    await serviceService.assertContractorOffersCatalog(owner._id, catalogKey);

    const deleted = await serviceService.deleteService(ownerStore._id, owner._id, unused._id);
    assert.equal(deleted.deleted, true);
    const afterDelete = await serviceService.listServices(ownerStore._id, owner._id);
    assert.equal(afterDelete.some((row) => String(row.id) === String(unused._id)), false);

    const job = await RepairRequest.create({
      customerId: customer._id,
      contractorId: owner._id,
      storeId: ownerStore._id,
      category: REPAIR_CATEGORY.ELECTRIC,
      serviceName: offering.name,
      catalogServiceId: catalogKey,
      title: `Keep history ${stamp}`,
      description: 'Existing job must survive a paused offering.',
      address: '12 Nguyen Van Cu, Ninh Kieu',
    });

    await assert.rejects(
      () => serviceService.deleteService(ownerStore._id, owner._id, offering._id),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
    await assert.rejects(
      () => serviceService.setAvailability(otherStore._id, offering._id, false),
      (err) => err instanceof ApiError && err.statusCode === 404
    );
    await assert.rejects(
      () => serviceService.deleteService(otherStore._id, other._id, offering._id),
      (err) => err instanceof ApiError && err.statusCode === 404
    );

    const stillThere = await Service.findOne({ _id: offering._id, storeId: ownerStore._id });
    assert.equal(Boolean(stillThere), true);
    const keptJob = await RepairRequest.findById(job._id);
    assert.equal(String(keptJob?.title || ''), `Keep history ${stamp}`);
    const catalogAfter = await prisma.catalog_services.count();
    assert.equal(catalogAfter, catalogBefore);
  });
});
