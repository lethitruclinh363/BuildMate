const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { ROLES } = require('../models/user.model');
const { createUser, deleteFixtureUsers } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { requireIsolatedTestDatabase } = require('./helpers/database-safety');
const { prisma } = require('../config/prisma');
const { userRepository } = require('../repositories/userRepository');
const {
  EMAIL_ALREADY_EXISTS,
  PHONE_ALREADY_EXISTS,
  ACCOUNT_IDENTITY_CONFLICT,
  normalizeEmail,
  phoneLookupValues,
} = require('../utils/identity');
const { classifyError } = require('../utils/httpError');
const { signToken } = require('../utils/jwt');
const { ensureContractorProfile } = require('../middleware/contractorMiddleware');

const emailProvider = require('../providers/emailProvider');
emailProvider.sendVerificationEmail = async () => ({ sent: true, skipped: false });

const authService = require('../services/authService');
const userService = require('../services/userService');
const { startTestServer, api } = require('./helpers/http');

let dbReady = false;
let server;
const createdIds = [];
let seq = 0;

before(async () => {
  requireIsolatedTestDatabase();
  dbReady = testDatabaseReady();
  emailProvider.sendVerificationEmail = async () => ({ sent: true, skipped: false });
  if (dbReady) server = await startTestServer();
});

after(async () => {
  await deleteFixtureUsers(createdIds);
  if (server) await server.close();
});

function skipIfDatabaseUnavailable(t) {
  if (dbReady) return false;
  t.skip('PostgreSQL test database is not available');
  return true;
}

function stamp() {
  seq += 1;
  return `${Date.now()}${seq}${Math.random().toString(16).slice(2, 8)}`;
}

function uniqueEmail(label) {
  return `uniq-${label}-${stamp()}@buildmate.test`;
}

function uniquePhone() {
  const tail = crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
  return `05${tail}`;
}

function registerBody(overrides = {}) {
  return {
    name: 'Uniq Test User',
    email: uniqueEmail('ok'),
    password: 'BuildMate123!',
    phoneNumber: uniquePhone(),
    role: ROLES.CUSTOMER,
    acceptedPolicy: true,
    policyLanguage: 'vi',
    ...overrides,
  };
}

async function remember(email) {
  const user = await userRepository.findByEmail(email);
  if (user?._id) createdIds.push(user._id);
  return user;
}

describe('global account uniqueness', () => {
  it('TC01 registers a new email and phone', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const body = registerBody();
    const result = await authService.register(body);
    const user = await remember(body.email);
    assert.ok(result.message);
    assert.ok(user);
    assert.equal(user.email, body.email);
    assert.equal(user.phoneNumber, body.phoneNumber);
  });

  it('TC02 rejects a duplicate email in the same role', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const existing = await createUser({
      name: 'Existing Customer',
      email: uniqueEmail('same-role'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: existing.email, phoneNumber: uniquePhone(), role: ROLES.CUSTOMER })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
  });

  it('TC03 rejects a duplicate phone in the same role', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phone = uniquePhone();
    const existing = await createUser({
      name: 'Existing Phone',
      email: uniqueEmail('same-phone'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone,
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: uniqueEmail('other'), phoneNumber: phone, role: ROLES.CUSTOMER })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
  });

  it('TC04 rejects a contractor registering with a customer email', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const existing = await createUser({
      name: 'Customer Email',
      email: uniqueEmail('cust-mail'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: existing.email, role: ROLES.CONTRACTOR })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
  });

  it('TC05 rejects a store owner registering with a contractor email', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const existing = await createUser({
      name: 'Contractor Email',
      email: uniqueEmail('con-mail'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: existing.email, role: ROLES.MATERIAL_STORE_OWNER })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
  });

  it('TC06 rejects a customer registering with a store-owner phone', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phone = uniquePhone();
    const existing = await createUser({
      name: 'Store Phone',
      email: uniqueEmail('store-phone'),
      password: 'BuildMate123!',
      role: ROLES.MATERIAL_STORE_OWNER,
      phone,
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ phoneNumber: phone, role: ROLES.CUSTOMER })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
  });

  it('TC07 detects the same email with different casing', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const email = uniqueEmail('case');
    const existing = await createUser({
      name: 'Case Email',
      email,
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: email.toUpperCase() })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
  });

  it('TC08 detects the same phone in 0 and +84 form', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phone = uniquePhone();
    const existing = await createUser({
      name: 'Plus84 Phone',
      email: uniqueEmail('plus84'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone,
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ phoneNumber: `+84${phone.slice(1)}` })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
  });

  it('TC09 rejects when both email and phone already exist', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phone = uniquePhone();
    const existing = await createUser({
      name: 'Both Taken',
      email: uniqueEmail('both'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone,
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: existing.email, phoneNumber: phone, role: ROLES.CONTRACTOR })),
      (err) => err.statusCode === 409 && (err.details.code === EMAIL_ALREADY_EXISTS || err.details.field?.includes?.('email'))
    );
  });

  it('TC10-TC12 protect profile email and phone updates without blocking the same user', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();
    const userA = await createUser({
      name: 'User A',
      email: uniqueEmail('a'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: phoneA,
    });
    const userB = await createUser({
      name: 'User B',
      email: uniqueEmail('b'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: phoneB,
    });
    createdIds.push(userA._id, userB._id);

    await assert.rejects(
      userService.updateProfile(userA._id, { email: userB.email }, userA),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
    await assert.rejects(
      userService.updateProfile(userA._id, { phone: phoneB }, userA),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
    const kept = await userService.updateProfile(userA._id, { name: 'User A kept', phone: phoneA, email: userA.email }, userA);
    assert.equal(kept.email, userA.email);
    assert.equal(kept.phone, phoneA);
    assert.equal(kept.name, 'User A kept');
  });

  it('TC13 two concurrent registers with the same email keep one user and return 409', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const email = uniqueEmail('race-email');
    const raced = await Promise.allSettled([
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
    ]);
    const rows = await prisma.users.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, legacy_mongo_id: true, email: true },
    });
    rows.forEach((row) => createdIds.push(row.legacy_mongo_id));
    const emailWins = raced.filter((item) => item.status === 'fulfilled').length;
    const emailLosses = raced.filter((item) => item.status === 'rejected' && item.reason?.statusCode === 409).length;
    assert.equal(emailWins, 1);
    assert.equal(emailLosses, 1);
    assert.equal(rows.length, 1);
    assert.equal(normalizeEmail(rows[0].email), normalizeEmail(email));
  });

  it('TC14 two concurrent registers with the same phone keep one user and return 409', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const sharedPhone = uniquePhone();
    const phoneRace = await Promise.allSettled([
      authService.register(registerBody({ email: uniqueEmail('race-p1'), phoneNumber: sharedPhone })),
      authService.register(registerBody({ email: uniqueEmail('race-p2'), phoneNumber: sharedPhone })),
    ]);
    const rows = await prisma.users.findMany({
      where: { phone_number: { in: phoneLookupValues(sharedPhone) } },
      select: { id: true, legacy_mongo_id: true, phone_number: true },
    });
    rows.forEach((row) => createdIds.push(row.legacy_mongo_id));
    const phoneWins = phoneRace.filter((item) => item.status === 'fulfilled').length;
    const phoneLosses = phoneRace.filter((item) => item.status === 'rejected' && item.reason?.statusCode === 409).length;
    assert.equal(phoneWins, 1);
    assert.equal(phoneLosses, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone_number, sharedPhone);
  });

  it('TC13-TC16 HTTP duplicate email does not leak SQL', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;

    const httpBody = registerBody();
    const created = await api(server.origin, { method: 'POST', path: '/api/auth/register', body: httpBody });
    await remember(httpBody.email);
    assert.equal(created.status, 201);
    const again = await api(server.origin, { method: 'POST', path: '/api/auth/register', body: { ...httpBody, phoneNumber: uniquePhone() } });
    assert.equal(again.status, 409);
    assert.equal(again.json.code, EMAIL_ALREADY_EXISTS);
    assert.equal(again.json.field, 'email');
    assert.equal(again.json.success, false);
    assert.equal(typeof again.json.message, 'string');
    assert.doesNotMatch(String(again.json.message), /prisma|P2002|constraint|sql/i);
  });

  it('TC15 concurrent workspace loads do not create a second contractor profile', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const contractor = await createUser({
      name: 'Workspace Contractor',
      email: uniqueEmail('ws'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: uniquePhone(),
    });
    createdIds.push(contractor._id);
    await Promise.all([
      ensureContractorProfile(contractor._id),
      ensureContractorProfile(contractor._id),
    ]);
    const token = signToken(contractor);
    await Promise.all([
      api(server.origin, { path: '/api/contractor/workspace', token }),
      api(server.origin, { path: '/api/contractor/workspace', token }),
    ]);
    const user = await prisma.users.findFirst({ where: { legacy_mongo_id: String(contractor._id) }, select: { id: true } });
    const count = await prisma.contractor_profiles.count({ where: { user_id: user.id } });
    assert.equal(count, 1);
  });

  it('TC19 still blocks an existing account from registering again under another role', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const existing = await createUser({
      name: 'Role Switch',
      email: uniqueEmail('role-switch'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: existing.email, role: ROLES.MATERIAL_STORE_OWNER })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
  });

  it('TC15-TC16 treat email case and VN phone 0/+84/84 as the same login identity', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const email = uniqueEmail('case-fold');
    const phone = uniquePhone();
    const existing = await createUser({
      name: 'Case Fold',
      email,
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone,
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email: email.toUpperCase(), role: ROLES.CONTRACTOR })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
    await assert.rejects(
      authService.register(registerBody({ phoneNumber: `+84${phone.slice(1)}`, role: ROLES.CONTRACTOR })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
    await assert.rejects(
      authService.register(registerBody({ phoneNumber: `84${phone.slice(1)}`, role: ROLES.MATERIAL_STORE_OWNER })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
    const emailCount = await prisma.users.count({ where: { email: { equals: email, mode: 'insensitive' } } });
    const phoneCount = await prisma.users.count({ where: { phone_number: { in: phoneLookupValues(phone) } } });
    assert.equal(emailCount, 1);
    assert.equal(phoneCount, 1);
  });

  it('TC17-TC18 block the same email or phone across customer, contractor, and store owner', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const sharedEmail = uniqueEmail('cross-actor-email');
    const sharedPhone = uniquePhone();
    const customer = await createUser({
      name: 'Cross Email Customer',
      email: sharedEmail,
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    const contractor = await createUser({
      name: 'Cross Phone Contractor',
      email: uniqueEmail('cross-actor-phone'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: sharedPhone,
    });
    createdIds.push(customer._id, contractor._id);
    await assert.rejects(
      authService.register(registerBody({ email: sharedEmail, role: ROLES.CONTRACTOR })),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
    await assert.rejects(
      authService.register(registerBody({ phoneNumber: sharedPhone, role: ROLES.MATERIAL_STORE_OWNER })),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
  });

  it('TC19 maps P2002 and PostgreSQL 23505 to 409 without a SQL leak', () => {
    const prismaErr = classifyError({ code: 'P2002', meta: { constraint: 'uq_users_phone_number_nonempty' } });
    assert.equal(prismaErr.status, 409);
    assert.equal(prismaErr.details.code, PHONE_ALREADY_EXISTS);
    const pgErr = classifyError({ code: '23505', constraint: 'uq_users_email_lower', message: 'duplicate key value violates unique constraint "uq_users_email_lower"' });
    assert.equal(pgErr.status, 409);
    assert.equal(pgErr.details.code, EMAIL_ALREADY_EXISTS);
    assert.doesNotMatch(String(pgErr.message), /prisma|sql|stack/i);
    const unknownUsers = classifyError({ code: 'P2002', meta: { modelName: 'users' } });
    assert.equal(unknownUsers.status, 409);
    assert.ok([EMAIL_ALREADY_EXISTS, ACCOUNT_IDENTITY_CONFLICT].includes(unknownUsers.details.code));
  });

  it('TC20 a rejected contractor register does not leave a partner profile', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const email = uniqueEmail('no-orphan-profile');
    const existing = await createUser({
      name: 'Existing Customer For Profile',
      email,
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(existing._id);
    await assert.rejects(
      authService.register(registerBody({ email, role: ROLES.CONTRACTOR, phoneNumber: uniquePhone() })),
      (err) => err.statusCode === 409
    );
    const user = await prisma.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    const profiles = await prisma.contractor_profiles.count({ where: { user_id: user.id } });
    const userCount = await prisma.users.count({ where: { email: { equals: email, mode: 'insensitive' } } });
    assert.equal(userCount, 1);
    assert.equal(profiles, 0);
  });

  it('TC21-TC22 allow a user to keep their own email/phone and block another account identity', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const phoneA = uniquePhone();
    const phoneB = uniquePhone();
    const userA = await createUser({
      name: 'Self Update A',
      email: uniqueEmail('self-a'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: phoneA,
    });
    const userB = await createUser({
      name: 'Self Update B',
      email: uniqueEmail('self-b'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: phoneB,
    });
    createdIds.push(userA._id, userB._id);
    const kept = await userService.updateProfile(userA._id, { email: userA.email.toUpperCase(), phone: `+84${phoneA.slice(1)}` }, userA);
    assert.equal(kept.email, userA.email);
    assert.equal(kept.phone, phoneA);
    await assert.rejects(
      userService.updateProfile(userA._id, { email: userB.email }, userA),
      (err) => err.statusCode === 409 && err.details.code === EMAIL_ALREADY_EXISTS
    );
    await assert.rejects(
      userService.updateProfile(userA._id, { phone: `84${phoneB.slice(1)}` }, userA),
      (err) => err.statusCode === 409 && err.details.code === PHONE_ALREADY_EXISTS
    );
  });

  it('TC23 a second concurrent email race still leaves a single row', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const email = uniqueEmail('rerun-race');
    const first = await Promise.allSettled([
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
    ]);
    const second = await Promise.allSettled([
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
      authService.register(registerBody({ email, phoneNumber: uniquePhone() })),
    ]);
    const rows = await prisma.users.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { legacy_mongo_id: true },
    });
    rows.forEach((row) => createdIds.push(row.legacy_mongo_id));
    assert.equal(first.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(second.filter((item) => item.status === 'fulfilled').length, 0);
    assert.equal(second.filter((item) => item.status === 'rejected' && item.reason?.statusCode === 409).length, 2);
    assert.equal(rows.length, 1);
  });

  it('TC24 BuilMate_test has valid expression UNIQUE indexes for email and phone', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const rows = await prisma.$queryRaw`
      SELECT i.relname AS indexname,
             ix.indisunique AS is_unique,
             ix.indisvalid AS is_valid,
             pg_get_indexdef(ix.indexrelid) AS indexdef
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND i.relname IN ('uq_users_email_lower', 'uq_users_phone_number_nonempty')
      ORDER BY i.relname
    `;
    assert.equal(rows.length, 2);
    const emailIndex = rows.find((row) => row.indexname === 'uq_users_email_lower');
    const phoneIndex = rows.find((row) => row.indexname === 'uq_users_phone_number_nonempty');
    assert.equal(emailIndex.is_unique, true);
    assert.equal(emailIndex.is_valid, true);
    assert.match(String(emailIndex.indexdef), /UNIQUE/i);
    assert.match(String(emailIndex.indexdef), /lower\(\(?email/i);
    assert.equal(phoneIndex.is_unique, true);
    assert.equal(phoneIndex.is_valid, true);
    assert.match(String(phoneIndex.indexdef), /UNIQUE/i);
    assert.match(String(phoneIndex.indexdef), /phone_number/i);
    assert.match(String(phoneIndex.indexdef), /WHERE/i);
    assert.match(String(phoneIndex.indexdef), /btrim/i);
  });
});
