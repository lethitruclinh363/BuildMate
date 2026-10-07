/**
 * Catalog, Service, and Material runtime check.
 * Does not print passwords or connection strings.
 */
const crypto = require('crypto');
process.env.DATABASE_PROVIDER = 'postgres';

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { prisma } = require('../../src/config/prisma');
const { userRepository } = require('../../src/repositories/userRepository');
const adminAuth = require('../../src/services/adminAuthService');
const contractorService = require('../../src/services/contractorService');
const storeService = require('../../src/services/storeService');
const adminService = require('../../src/services/adminService');
const catalogService = require('../../src/services/catalogService');
const serviceService = require('../../src/services/serviceService');
const materialService = require('../../src/services/materialService');
const materialCategoryService = require('../../src/services/material-category.service');
const suggestionService = require('../../src/services/serviceSuggestionService');
const marketplaceService = require('../../src/services/marketplaceService');
const activationService = require('../../src/services/activation.service');
const { Service } = require('../../src/repositories/offeringAccess');
const { ApiError } = require('../../src/utils/ApiError');

const stamp = String(Date.now()).slice(-8);
const password = 'AuthPg1a';
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function mongoCounts() {
  const db = mongoose.connection.db;
  const names = ['catalogservices', 'services', 'servicesuggestions', 'materialcategories', 'materials'];
  const counts = {};
  for (const name of names) counts[name] = await db.collection(name).countDocuments();
  return counts;
}

async function approvePartner(user, profileExtras) {
  await contractorService.updateProfile(user._id, {
    businessName: profileExtras.businessName,
    representativeName: 'Runtime Owner',
    contactPhone: user.phone,
    contactEmail: user.email,
    workerCount: 3,
    address: '12 Nguyen Van Cu',
    city: 'Can Tho',
    description: profileExtras.description,
    yearsExperience: 5,
    serviceAreas: ['Ninh Kieu'],
    ...profileExtras.profile,
  });
  const file = { url: '/uploads/runtime.jpg', originalName: 'runtime.jpg', mimeType: 'image/jpeg', size: 1200 };
  const role = user.role;
  const documentTypes = role === 'MATERIAL_STORE_OWNER'
    ? ['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'STORE_IMAGE']
    : ['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'CERTIFICATE'];
  for (const type of documentTypes) {
    await contractorService.addDocument(user._id, file, type);
  }
  if (role !== 'MATERIAL_STORE_OWNER') {
    await contractorService.addPortfolioFile(user._id, file, 'avatar');
    await contractorService.addPortfolioFile(user._id, file, 'teamLogo');
    await contractorService.addPortfolioFile(user._id, file, 'workshop');
    const withProject = await contractorService.createPortfolioProject(user._id);
    const projectId = withProject.portfolio.projects[0].id;
    await contractorService.updatePortfolioProject(user._id, projectId, {
      serviceId: 'Electrical::Wiring',
      description: 'Installed new wiring',
    });
    await contractorService.addProjectImage(user._id, projectId, file);
  }
  await contractorService.updateProfile(user._id, { completedSteps: [true, true, true, true, true, true] });
  const owner = await prisma.users.findFirst({ where: { legacy_mongo_id: user._id }, select: { id: true } });
  const profileRow = await prisma.contractor_profiles.findFirst({ where: { user_id: owner.id }, select: { id: true } });
  await prisma.contractor_ekyc_verifications.create({
    data: {
      legacy_mongo_id: crypto.randomBytes(12).toString('hex'),
      contractor_profile_id: profileRow.id,
      user_id: owner.id,
      status: 'SUBMITTED',
    },
  });
  const submitted = await contractorService.submitVerification(user._id, { acceptedTerms: true });
  const admin = await prisma.users.findFirst({
    where: { email: 'ivan.p@example.net' },
    select: { legacy_mongo_id: true },
  });
  return adminService.approve(submitted.id, admin.legacy_mongo_id);
}

async function main() {
  const original = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) original(...args);
  };

  await connectDatabase();
  await adminAuth.login({ email: 'ivan.p@example.net', password: 'Admin@1234' });
  const before = await mongoCounts();

  const catalog = await catalogService.listActive();
  const electrical = catalog.filter((item) => item.category === 'Electrical');
  const adminList = await catalogService.listForAdmin({ category: 'Electrical' });
  record('list catalog', catalog.length > 0 && electrical.length > 0, `catalog ${catalog.length}, electrical ${electrical.length}`);
  record(
    'filter catalog category',
    adminList.items.length > 0 && adminList.items.every((item) => item.category === 'Electrical'),
    `admin electrical ${adminList.items.length}`
  );
  const toggled = adminList.items[0];
  const inactive = await catalogService.setCatalogStatus(toggled.id, 'INACTIVE');
  const restored = await catalogService.setCatalogStatus(toggled.id, 'ACTIVE');
  record('admin catalog status', inactive.status === 'INACTIVE' && restored.status === 'ACTIVE', restored.status);

  const contractor = await userRepository.create({
    fullName: 'Catalog Runtime',
    email: `catalog.runtime.${stamp}@example.com`,
    password,
    phoneNumber: `08${stamp}`,
    role: 'CONTRACTOR',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });
  const approved = await approvePartner(contractor, {
    businessName: 'Catalog Runtime Co',
    description: 'Runtime contractor for catalog services',
    profile: { services: [{ category: 'Electrical', name: 'Wiring', type: 'SYSTEM' }] },
  });
  record('contractor approved with offerings', approved.verificationStatus === 'APPROVED', approved.verificationStatus);

  const store = await storeService.getStore(contractor._id);
  const own = await serviceService.listServices(store.id, contractor._id);
  const registered = await serviceService.registerService(store.id, contractor._id, 'Electrical::Wiring');
  const priced = await serviceService.updateService(store.id, registered.id, {
    basePrice: 250000,
    unit: 'JOB',
    estimatedHours: 3,
    description: 'Install new wiring',
    image: '/uploads/wiring-cover.jpg',
    images: ['/uploads/wiring-cover.jpg', '/uploads/wiring-detail.jpg'],
  });
  const imageCount = await prisma.service_images.count({
    where: { services: { legacy_mongo_id: priced.id } },
  });
  const priceRow = await prisma.services.findFirst({
    where: { legacy_mongo_id: priced.id },
    select: { base_price: true, catalog_service_id: true, is_active: true },
  });
  record(
    'service create update images price',
    own.length >= 1 && priced.basePrice === 250000 && priced.isActive === true && imageCount >= 1 && Number(priceRow.base_price) === 250000 && priceRow.catalog_service_id != null,
    `images ${imageCount}, price ${priceRow?.base_price}`
  );

  const legacy = await Service.create({
    storeId: store.id,
    contractorId: contractor._id,
    name: `Legacy runtime ${stamp}`,
    category: 'Electrical',
    catalogKey: '',
    catalogType: 'LEGACY',
    completionStatus: 'COMPLETED',
    basePrice: 10000,
    unit: 'JOB',
    isActive: true,
  });
  let deleteRefused = false;
  try {
    await serviceService.deleteService(store.id, priced.id);
  } catch (error) {
    deleteRefused = error instanceof ApiError && error.statusCode === 400;
  }
  const removed = await serviceService.deleteService(store.id, legacy._id);
  const deactivated = await serviceService.updateService(store.id, priced.id, { basePrice: 250000, image: '' });
  await prisma.services.update({ where: { legacy_mongo_id: priced.id }, data: { is_active: false } });
  const hidden = await serviceService.listServices(store.id, contractor._id);
  const hiddenRow = hidden.find((item) => item.id === priced.id);
  await serviceService.updateService(store.id, priced.id, {
    basePrice: 250000,
    image: '/uploads/wiring-cover.jpg',
    images: ['/uploads/wiring-cover.jpg'],
  });
  record(
    'service delete and deactivate',
    deleteRefused && removed.deleted === true && deactivated.isActive === true && hiddenRow?.isActive === false,
    `refused catalog delete ${deleteRefused}`
  );

  await storeService.updateStore(contractor._id, {
    name: 'Catalog Runtime Co',
    phone: contractor.phone,
    address: '12 Nguyen Van Cu',
    city: 'Can Tho',
    description: 'Runtime contractor storefront',
    avatar: '/uploads/runtime-avatar.jpg',
    logo: '/uploads/runtime-logo.jpg',
    openingHours: '07:00 – 18:00',
    serviceAreas: ['Ninh Kieu'],
    lat: 10.045,
    lng: 105.787,
    locationConfirmed: true,
    locationSource: 'GPS',
  });
  const readiness = await activationService.activate(contractor._id);
  const publicContractor = await marketplaceService.getPublicContractor(contractor._id);
  const publicServices = await marketplaceService.searchServices({ category: 'Electrical', store: store.id });
  const detail = publicServices.find((item) => item.id === priced.id);
  record(
    'public service list and detail',
    readiness.visible === true && publicContractor.visibility === 'LIVE' && detail?.basePrice === 250000 && (detail?.images || []).length >= 1,
    publicContractor.visibility
  );

  const materialOwner = await userRepository.create({
    fullName: 'Material Runtime',
    email: `material.runtime.${stamp}@example.com`,
    password,
    phoneNumber: `07${stamp}`,
    role: 'MATERIAL_STORE_OWNER',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });
  const materialApproved = await approvePartner(materialOwner, {
    businessName: 'Material Runtime Store',
    description: 'Runtime material store for PostgreSQL',
    profile: { materialCategories: [{ name: 'Cement', type: 'SYSTEM' }] },
  });
  record('material store approved', materialApproved.verificationStatus === 'APPROVED', materialApproved.verificationStatus);
  const materialStore = await storeService.getStore(materialOwner._id);
  const categoryName = `Runtime mix ${stamp}`;
  await materialCategoryService.registerStoreCategory(materialOwner._id, categoryName);
  const createdMaterial = await materialService.createMaterial(materialStore.id, {
    name: `Runtime cement ${stamp}`,
    category: categoryName,
    unit: 'bag',
    price: 99000.5,
    stock: 12,
    minOrderQty: 1,
    image: '/uploads/cement-a.jpg',
    images: ['/uploads/cement-a.jpg', '/uploads/cement-b.jpg'],
    description: 'Bagged cement for the runtime test',
  });
  const materialImages = await prisma.material_images.count({
    where: { materials: { legacy_mongo_id: createdMaterial.id } },
  });
  const materialPrice = await prisma.materials.findFirst({
    where: { legacy_mongo_id: createdMaterial.id },
    select: { price: true },
  });
  const updatedMaterial = await materialService.updateMaterial(materialStore.id, createdMaterial.id, {
    price: 100000,
    isActive: false,
  });
  const inactiveList = await materialService.listMaterials(materialStore.id);
  const inactiveRow = inactiveList.find((item) => item.id === createdMaterial.id);
  await materialService.updateMaterial(materialStore.id, createdMaterial.id, { isActive: true, price: 99000.5 });
  const spare = await materialService.createMaterial(materialStore.id, {
    name: `Runtime spare ${stamp}`,
    category: 'Cement',
    unit: 'bag',
    price: 15000,
    stock: 4,
    description: 'Spare bag to delete',
  });
  const deletedMaterial = await materialService.deleteMaterial(materialStore.id, spare.id);
  record(
    'material category images price deactivate',
    createdMaterial.category === categoryName && materialImages === 2 && Number(materialPrice.price) === 99000.5 && updatedMaterial.isActive === false && inactiveRow?.isActive === false && deletedMaterial.deleted === true,
    `price ${materialPrice?.price}`
  );

  await storeService.updateStore(materialOwner._id, {
    name: 'Material Runtime Store',
    phone: materialOwner.phone,
    address: '20 Hoa Binh',
    city: 'Can Tho',
    description: 'Runtime material showroom',
    avatar: '/uploads/store-avatar.jpg',
    coverImage: '/uploads/store-cover.jpg',
    openingHours: '07:00 – 18:00',
    lat: 10.045,
    lng: 105.787,
    locationConfirmed: true,
    locationSource: 'GPS',
  });
  const materialReady = await activationService.activate(materialOwner._id);
  const publicMaterials = await marketplaceService.searchMaterials({ store: materialStore.id });
  const publicMaterial = publicMaterials.find((item) => item.id === createdMaterial.id);
  const publicStore = await marketplaceService.getPublicStore(materialStore.id);
  record(
    'public material list and detail',
    materialReady.visible === true && publicMaterial?.price === 99000.5 && (publicStore.materials || []).some((item) => item.id === createdMaterial.id),
    materialReady.visible ? 'LIVE' : materialReady.checks.filter((item) => !item.ok).map((item) => item.key).join(',')
  );

  const suggestionProfile = await contractorService.getProfile(contractor._id);
  const suggestion = await suggestionService.createSuggestion({
    description: 'Add a glass roof installation service',
    user: { id: contractor._id },
    profile: suggestionProfile,
  });
  const rejected = await suggestionService.rejectSuggestion(suggestion.id, {
    adminNote: 'Not enough demand yet',
    adminId: (await prisma.users.findFirst({ where: { email: 'ivan.p@example.net' }, select: { legacy_mongo_id: true } })).legacy_mongo_id,
  });
  const pending = await suggestionService.createSuggestion({
    description: 'Add a ceiling insulation service',
    user: { id: contractor._id },
    profile: suggestionProfile,
  });
  const adminId = (await prisma.users.findFirst({ where: { email: 'ivan.p@example.net' }, select: { legacy_mongo_id: true } })).legacy_mongo_id;
  const converted = await suggestionService.convertSuggestion(pending.id, {
    name: `Ceiling insulation ${stamp}`,
    category: 'Construction',
    description: 'Insulate an existing ceiling',
    acknowledgeSimilar: true,
  }, adminId);
  record(
    'suggestion reject and convert',
    suggestion.status === 'PENDING' && rejected.status === 'REJECTED' && converted.suggestion.status === 'CONVERTED' && converted.service.status === 'ACTIVE',
    converted.suggestion.status
  );

  const custom = await materialCategoryService.createCustomCategory({ name: `Pending mix ${stamp}`, userId: materialOwner._id });
  const { MaterialCategory } = require('../../src/repositories/offeringAccess');
  const pendingCategory = await MaterialCategory.findById(custom.categoryId);
  pendingCategory.status = 'REJECTED';
  await pendingCategory.save();
  const afterReject = await materialCategoryService.listForOwner(materialOwner._id);
  pendingCategory.status = 'PENDING_APPROVAL';
  await pendingCategory.save();
  const adminCategories = await materialCategoryService.listForAdmin();
  const pendingRow = adminCategories.custom.find((item) => item.id === custom.categoryId);
  record(
    'custom category reject and pending',
    !afterReject.custom.some((item) => item.categoryId === custom.categoryId) && pendingRow?.status === 'PENDING_APPROVAL',
    pendingRow?.status || 'missing'
  );

  const sampleService = await mongoose.connection.db.collection('services').findOne();
  const sampleMaterial = await mongoose.connection.db.collection('materials').findOne();
  const sampleCatalog = await mongoose.connection.db.collection('catalogservices').findOne();
  const mappedService = sampleService
    ? await prisma.services.findFirst({ where: { legacy_mongo_id: String(sampleService._id) }, select: { id: true } })
    : null;
  const mappedMaterial = sampleMaterial
    ? await prisma.materials.findFirst({ where: { legacy_mongo_id: String(sampleMaterial._id) }, select: { id: true, price: true } })
    : null;
  const mappedCatalog = sampleCatalog
    ? await prisma.catalog_services.findFirst({ where: { legacy_mongo_id: String(sampleCatalog._id) }, select: { id: true } })
    : null;
  record('old mongo records mapped', Boolean(mappedService && mappedMaterial && mappedCatalog), 'service material catalog');

  const newServiceInMongo = await mongoose.connection.db.collection('services').countDocuments({ _id: new mongoose.Types.ObjectId(priced.id) });
  const newMaterialInMongo = await mongoose.connection.db.collection('materials').countDocuments({ _id: new mongoose.Types.ObjectId(createdMaterial.id) });
  const after = await mongoCounts();
  record(
    'new postgres rows absent from mongo',
    newServiceInMongo === 0 && newMaterialInMongo === 0 && JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(after)
  );

  const orphans = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM public.services s LEFT JOIN public.stores st ON st.id = s.store_id WHERE st.id IS NULL) AS services,
      (SELECT COUNT(*) FROM public.materials m LEFT JOIN public.stores st ON st.id = m.store_id WHERE st.id IS NULL) AS materials,
      (SELECT COUNT(*) FROM public.materials m LEFT JOIN public.material_categories c ON c.id = m.material_category_id WHERE c.id IS NULL) AS material_categories,
      (SELECT COUNT(*) FROM public.catalog_services c LEFT JOIN public.service_categories sc ON sc.id = c.service_category_id WHERE sc.id IS NULL) AS catalog_categories
  `;
  const orphanCount = Number(orphans[0].services) + Number(orphans[0].materials) + Number(orphans[0].material_categories) + Number(orphans[0].catalog_categories);
  const duplicates = await prisma.$queryRaw`
    SELECT COUNT(*) AS count FROM (
      SELECT legacy_mongo_id FROM public.catalog_services WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.services WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.materials WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.material_categories WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.service_suggestions WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    ) d
  `;
  record('orphan foreign keys and duplicate legacy ids', orphanCount === 0 && Number(duplicates[0].count) === 0, `orphans ${orphanCount}`);
}

main()
  .catch((error) => {
    record('runtime check', false, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((item) => !item.pass).length;
    process.stdout.write(`RESULT summary pass=${results.filter((item) => item.pass).length} fail=${failed}\n`);
    await prisma.$disconnect().catch(() => {});
    await disconnectDatabase().catch(() => {});
  });
