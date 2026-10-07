/**
 * Contractor and Store runtime check. Does not print passwords.
 */
const crypto = require('crypto');
process.env.DATABASE_PROVIDER = 'postgres';

const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { prisma } = require('../../src/config/prisma');
const { userRepository } = require('../../src/repositories/userRepository');
const authService = require('../../src/services/authService');
const adminAuth = require('../../src/services/adminAuthService');
const contractorService = require('../../src/services/contractorService');
const storeService = require('../../src/services/storeService');
const adminService = require('../../src/services/adminService');
const marketplaceService = require('../../src/services/marketplaceService');
const mongoose = require('mongoose');

const stamp = String(Date.now()).slice(-7);
const password = 'AuthPg1a';
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const original = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) original(...args);
  };

  await connectDatabase();
  const mongoProfilesBefore = await mongoose.connection.db.collection('contractorprofiles').countDocuments();
  const mongoStoresBefore = await mongoose.connection.db.collection('stores').countDocuments();
  const contractor = await userRepository.create({
    fullName: 'Runtime Contractor',
    email: `runtime.contractor.${stamp}@example.com`,
    password,
    phoneNumber: `09${stamp}1`,
    role: 'CONTRACTOR',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });
  const login = await authService.login({ email: contractor.email, password });
  record('contractor login', Boolean(login.token) && login.user.role === 'CONTRACTOR', login.user.role);

  const initial = await contractorService.getProfile(contractor._id);
  record('get own profile', initial.userId === contractor._id && initial.verificationStatus === 'DRAFT', initial.verificationStatus);

  await contractorService.updateProfile(contractor._id, {
    businessName: 'Runtime Construction',
    representativeName: 'Runtime Owner',
    contactPhone: `09${stamp}1`,
    contactEmail: contractor.email,
    workerCount: 4,
    address: '12 Nguyen Van Cu',
    city: 'Can Tho',
    description: 'Runtime contractor profile for PostgreSQL',
    yearsExperience: 6,
    serviceAreas: ['Ninh Kieu'],
    services: [{ category: 'Electrical', name: 'Wiring', type: 'SYSTEM' }],
  });
  const file = { url: '/uploads/runtime.jpg', originalName: 'runtime.jpg', mimeType: 'image/jpeg', size: 1200 };
  for (const type of ['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'CERTIFICATE']) {
    await contractorService.addDocument(contractor._id, file, type);
  }
  await contractorService.addPortfolioFile(contractor._id, file, 'avatar');
  await contractorService.addPortfolioFile(contractor._id, file, 'teamLogo');
  await contractorService.addPortfolioFile(contractor._id, file, 'workshop');
  const withProject = await contractorService.createPortfolioProject(contractor._id);
  const projectId = withProject.portfolio.projects[0].id;
  await contractorService.updatePortfolioProject(contractor._id, projectId, {
    serviceId: 'Electrical::Wiring',
    description: 'Installed new wiring',
  });
  await contractorService.addProjectImage(contractor._id, projectId, file);
  const updated = await contractorService.updateProfile(contractor._id, {
    completedSteps: [true, true, true, true, true, true],
  });
  record(
    'update profile and onboarding',
    updated.businessName === 'Runtime Construction' && updated.completedSteps.every(Boolean) && updated.documents.length === 4,
    updated.businessName
  );

  const owner = await prisma.users.findFirst({ where: { legacy_mongo_id: contractor._id }, select: { id: true } });
  const profileRow = await prisma.contractor_profiles.findFirst({ where: { user_id: owner.id }, select: { id: true } });
  await prisma.contractor_ekyc_verifications.create({
    data: {
      legacy_mongo_id: crypto.randomBytes(12).toString('hex'),
      contractor_profile_id: profileRow.id,
      user_id: owner.id,
      status: 'SUBMITTED',
    },
  });
  const submitted = await contractorService.submitVerification(contractor._id, { acceptedTerms: true });
  record('submit profile', submitted.verificationStatus === 'SUBMITTED', submitted.verificationStatus);

  const admin = await prisma.users.findFirst({
    where: { email: 'ivan.p@example.net' },
    select: { legacy_mongo_id: true },
  });
  await adminAuth.login({ email: 'ivan.p@example.net', password: 'Admin@1234' });
  const rejected = await adminService.reject(submitted.id, admin.legacy_mongo_id, 'Need a clearer certificate');
  record('admin reject', rejected.verificationStatus === 'REJECTED', rejected.verificationStatus);

  await contractorService.updateProfile(contractor._id, { description: 'Runtime contractor profile updated after review' });
  const resubmitted = await contractorService.submitVerification(contractor._id, { acceptedTerms: true });
  const approved = await adminService.approve(resubmitted.id, admin.legacy_mongo_id);
  record('admin approve', approved.verificationStatus === 'APPROVED', approved.verificationStatus);

  const publicContractor = await marketplaceService.getPublicContractor(contractor._id);
  record('public contractor profile', Boolean(publicContractor.visibility), publicContractor.visibility);

  const ownStore = await storeService.getStore(contractor._id);
  const savedStore = await storeService.updateStore(contractor._id, {
    name: ownStore.name,
    phone: `09${stamp}1`,
    address: '12 Nguyen Van Cu',
    city: 'Can Tho',
    description: 'Runtime storefront with delivery',
    deliveryEnabled: true,
    baseDeliveryFee: 15000,
    freeDeliveryRadiusKm: 2,
    deliveryFeePerKm: 5000,
    minimumOrderAmount: 100000,
    lat: 10.045,
    lng: 105.787,
    locationConfirmed: true,
    locationSource: 'GPS',
    serviceAreas: ['Ninh Kieu'],
  });
  const reread = await storeService.getStore(contractor._id);
  record(
    'store update delivery and location',
    reread.deliveryEnabled === true && reread.baseDeliveryFee === 15000 && reread.locationConfirmed === true,
    reread.status
  );
  const publicStore = await marketplaceService.getPublicStore(savedStore.id);
  record('public store', Boolean(publicStore.store || publicStore.visibility), publicStore.visibility || 'hidden');

  const pgProfile = await prisma.contractor_profiles.findFirst({
    where: { user_id: owner.id },
    select: { business_name: true, verification_status: true },
  });
  const pgStore = await prisma.stores.findFirst({
    where: { legacy_mongo_id: ownStore.id },
    select: { delivery_enabled: true, base_delivery_fee: true },
  });
  const mongoProfile = await mongoose.connection.db.collection('contractorprofiles').countDocuments({ _id: new mongoose.Types.ObjectId(contractor._id) });
  const mongoStore = await mongoose.connection.db.collection('stores').countDocuments({ contractorId: new mongoose.Types.ObjectId(contractor._id) });
  const mongoProfilesAfter = await mongoose.connection.db.collection('contractorprofiles').countDocuments();
  const mongoStoresAfter = await mongoose.connection.db.collection('stores').countDocuments();
  record('postgres profile write', pgProfile?.business_name === 'Runtime Construction' && pgProfile?.verification_status === 'APPROVED', pgProfile?.verification_status || 'missing');
  record('postgres store write', pgStore?.delivery_enabled === true && Number(pgStore.base_delivery_fee) === 15000, 'delivery saved');
  record(
    'mongo contractor and store unchanged',
    mongoProfile === 0 && mongoStore === 0 && mongoProfilesAfter === mongoProfilesBefore && mongoStoresAfter === mongoStoresBefore,
    `profiles ${mongoProfilesBefore}->${mongoProfilesAfter}, stores ${mongoStoresBefore}->${mongoStoresAfter}`
  );
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
