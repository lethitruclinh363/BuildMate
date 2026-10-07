/**
 * Auth/User runtime check for DATABASE_PROVIDER=postgres.
 * Prints statuses only. Does not print passwords, tokens, or connection strings.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

process.env.DATABASE_PROVIDER = 'postgres';

const { env } = require('../../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { prisma } = require('../../src/config/prisma');
const authService = require('../../src/services/authService');
const userService = require('../../src/services/userService');
const { userRepository } = require('../../src/repositories/userRepository');
const { authenticate } = require('../../src/middleware/authMiddleware');
const { allowRole } = require('../../src/middleware/roleMiddleware');
const { signToken } = require('../../src/utils/jwt');
const { ROLES, USER_STATUS } = require('../../src/models/user.model');
const mongoose = require('mongoose');

const stamp = String(Date.now()).slice(-7);
const password = 'AuthPg1a';
const nextPassword = 'AuthPg2b';
const results = [];

function phone(digit) {
  return `09${stamp}${digit}`;
}

function email(role) {
  return `authpg.${role.toLowerCase()}.${stamp}@example.com`;
}

function hashOtp(purpose, code) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${purpose}:${code}`).digest('hex');
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectStatus(name, fn, status) {
  try {
    await fn();
    record(name, false, `expected ${status}, call succeeded`);
  } catch (error) {
    record(name, error.statusCode === status, `status ${error.statusCode || 'none'}: ${error.message}`);
  }
}

async function plant(address, purpose, code) {
  const hash = hashOtp(purpose, code);
  const expires = new Date(Date.now() + 5 * 60 * 1000);
  const data = purpose === 'verify'
    ? {
        verification_code: hash,
        verification_expires_at: expires,
        verification_attempts: 0,
        verification_sent_at: new Date(),
      }
    : {
        reset_password_token: hash,
        reset_password_expires_at: expires,
        reset_password_attempts: 0,
        reset_password_sent_at: new Date(),
      };
  await prisma.users.updateMany({ where: { email: address }, data });
}

async function asRequest(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  await new Promise((resolve, reject) => {
    authenticate(req, {}, (error) => (error ? reject(error) : resolve()));
  });
  return req;
}

async function roleStatus(req, ...allowed) {
  return new Promise((resolve) => {
    allowRole(...allowed)(req, {}, (error) => resolve(error ? error.statusCode : 200));
  });
}

async function registerAndVerify(role, digit) {
  const address = email(role);
  await authService.register({
    fullName: `Auth ${role}`,
    email: address,
    password,
    phoneNumber: phone(digit),
    role,
    acceptedPolicy: true,
    policyLanguage: 'vi',
  });
  await plant(address, 'verify', '111111');
  await authService.verifyEmail({ email: address, code: '111111' });
  return address;
}

async function main() {
  if (env.databaseProvider !== 'postgres') {
    throw new Error('DATABASE_PROVIDER is not postgres');
  }

  const originalLog = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) originalLog(...args);
  };

  await connectDatabase();
  const usersBefore = await prisma.users.count();
  record(
    'migrated account present',
    usersBefore > 0,
    usersBefore > 0 ? `${usersBefore} existing rows` : 'public.users was empty before this check'
  );

  const customerEmail = await registerAndVerify(ROLES.CUSTOMER, '1');
  const pgCustomer = await prisma.users.findFirst({
    where: { email: customerEmail },
    select: { legacy_mongo_id: true, account_status: true, email_verified: true },
  });
  const mongoCustomer = await mongoose.connection.db.collection('users').countDocuments({ email: customerEmail });
  record('register inserted PostgreSQL', Boolean(pgCustomer?.legacy_mongo_id), pgCustomer ? 'row found' : 'row missing');
  record('register did not write MongoDB users', mongoCustomer === 0, `mongo matches ${mongoCustomer}`);
  record(
    'verified account is active',
    pgCustomer?.email_verified === true && pgCustomer?.account_status === 'ACTIVE',
    `${pgCustomer?.account_status || 'missing'}`
  );

  await expectStatus('wrong password', () => authService.login({ email: customerEmail, password: 'WrongPass1' }), 401);

  const login = await authService.login({ email: customerEmail, password });
  record('customer login', Boolean(login.token) && login.user.role === ROLES.CUSTOMER && login.user.id === pgCustomer.legacy_mongo_id, login.user.role);

  const req = await asRequest(login.token);
  record('current user from token', req.user.id === pgCustomer.legacy_mongo_id && req.user.role === ROLES.CUSTOMER, req.user.role);

  const profile = await userService.getProfile(req.user.id);
  record('get profile', profile.email === customerEmail && profile.id === req.user.id, profile.role);

  const updated = await userService.updateProfile(
    req.user.id,
    { fullName: 'Auth Customer Updated', phone: phone('6'), preferredLanguage: 'vi' },
    req.user
  );
  const pgUpdated = await prisma.users.findFirst({
    where: { legacy_mongo_id: req.user.id },
    select: { full_name: true, phone_number: true, preferred_language: true },
  });
  record(
    'update profile',
    updated.fullName === 'Auth Customer Updated' && pgUpdated?.full_name === 'Auth Customer Updated' && pgUpdated?.preferred_language === 'vi',
    pgUpdated?.full_name || 'missing'
  );

  await authService.forgotPassword({ email: customerEmail });
  await plant(customerEmail, 'reset', '222222');
  await authService.resetPassword({ email: customerEmail, code: '222222', newPassword: nextPassword });
  await expectStatus('old password after reset', () => authService.login({ email: customerEmail, password }), 401);
  const resetLogin = await authService.login({ email: customerEmail, password: nextPassword });
  record('reset password login', Boolean(resetLogin.token), resetLogin.user.role);

  const contractorEmail = await registerAndVerify(ROLES.CONTRACTOR, '2');
  const contractorLogin = await authService.login({ email: contractorEmail, password });
  const contractorReq = await asRequest(contractorLogin.token);
  record('contractor login', contractorReq.user.role === ROLES.CONTRACTOR, contractorReq.user.role);
  record('contractor forbidden from customer route', (await roleStatus(contractorReq, ROLES.CUSTOMER)) === 403, '403 expected');

  const storeEmail = await registerAndVerify(ROLES.MATERIAL_STORE_OWNER, '3');
  const storeLogin = await authService.login({ email: storeEmail, password });
  const storeReq = await asRequest(storeLogin.token);
  record('store owner login', storeReq.user.role === ROLES.MATERIAL_STORE_OWNER, storeReq.user.role);
  record('store owner allowed on store route', (await roleStatus(storeReq, ROLES.MATERIAL_STORE_OWNER)) === 200, '200 expected');

  const storedHash = await bcrypt.hash(password, 12);
  const migrated = await userRepository.create({
    fullName: 'Migrated Hash',
    email: email('migrated'),
    password: storedHash,
    phoneNumber: phone('4'),
    role: ROLES.CUSTOMER,
    acceptedPolicy: true,
    profileStatus: 'APPROVED',
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  const storedRow = await prisma.users.findFirst({
    where: { legacy_mongo_id: migrated._id },
    select: { password_hash: true },
  });
  record('stored bcrypt hash was not rehashed', storedRow?.password_hash === storedHash, storedRow ? 'hash unchanged' : 'row missing');
  const migratedLogin = await authService.login({ email: email('migrated'), password });
  record('login with stored bcrypt hash', Boolean(migratedLogin.token), migratedLogin.user.role);

  const admin = await userRepository.create({
    fullName: 'Auth Admin',
    email: email('admin'),
    password,
    phoneNumber: phone('5'),
    role: ROLES.ADMIN,
    acceptedPolicy: true,
    profileStatus: 'APPROVED',
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  const adminReq = await asRequest(signToken(admin));
  record('admin token loads admin role', adminReq.user.role === ROLES.ADMIN, adminReq.user.role);
  record('admin allowed on admin route', (await roleStatus(adminReq, ROLES.ADMIN)) === 200, '200 expected');
  record('customer forbidden from admin route', (await roleStatus(req, ROLES.ADMIN)) === 403, '403 expected');
  await expectStatus('admin blocked on public login', () => authService.login({ email: email('admin'), password }), 401);

  const mongoAfter = await mongoose.connection.db.collection('users').countDocuments({
    email: { $in: [customerEmail, contractorEmail, storeEmail, email('admin'), email('migrated')] },
  });
  record('no tested account written to MongoDB', mongoAfter === 0, `mongo matches ${mongoAfter}`);
}

main()
  .catch((error) => {
    console.log = console.log.bind(console);
    record('runtime check', false, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((item) => !item.pass).length;
    console.log = console.log;
    process.stdout.write(`RESULT summary pass=${results.filter((item) => item.pass).length} fail=${failed}\n`);
    await prisma.$disconnect().catch(() => {});
    await disconnectDatabase().catch(() => {});
  });
