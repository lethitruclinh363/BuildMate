const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { prisma } = require('../config/prisma');
const { ROLES, USER_STATUS } = require('../models/user.model');
const { userRepository } = require('../repositories/userRepository');
const { createUser, deleteFixtureUsers } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { signToken } = require('../utils/jwt');
const { startTestServer, api } = require('./helpers/http');

const deliveredCodes = [];
const emailProvider = require('../providers/emailProvider');
emailProvider.sendVerificationEmail = async ({ otp }) => {
  deliveredCodes.push(otp);
  return { sent: true, skipped: false };
};
emailProvider.sendResetPasswordEmail = async ({ otp }) => {
  deliveredCodes.push(otp);
  return { sent: true, skipped: false };
};

const authService = require('../services/authService');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
let dbReady = false;
let server;
const createdIds = [];
let seq = 0;

before(async () => {
  dbReady = testDatabaseReady();
  emailProvider.sendVerificationEmail = async ({ otp }) => {
    deliveredCodes.push(otp);
    return { sent: true, skipped: false };
  };
  emailProvider.sendResetPasswordEmail = async ({ otp }) => {
    deliveredCodes.push(otp);
    return { sent: true, skipped: false };
  };
  if (dbReady) {
    try {
      server = await startTestServer();
    } catch (err) {
      dbReady = false;
      console.error('[auth-flow-01] isolated test database unreachable:', err.message);
    }
  }
});

after(async () => {
  if (createdIds.length) await deleteFixtureUsers(createdIds);
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
  return `flow01-${label}-${stamp()}@buildmate.test`;
}

function uniquePhone() {
  return `09${crypto.randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
}

function registerBody(overrides = {}) {
  return {
    name: 'Flow 01 User',
    email: uniqueEmail('reg'),
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

function readFrontend(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

describe('Flow 01 register schema (no database)', () => {
  const { registerSchema, loginSchema } = require('../validators/auth.validator');

  it('accepts the three public roles and rejects ADMIN', () => {
    for (const role of [ROLES.CUSTOMER, ROLES.CONTRACTOR, ROLES.MATERIAL_STORE_OWNER]) {
      const parsed = registerSchema.safeParse({
        name: 'Schema User',
        email: 'schema@example.com',
        password: 'BuildMate123!',
        phoneNumber: '0912345678',
        acceptedPolicy: true,
        role,
      });
      assert.equal(parsed.success, true, role);
    }
    const admin = registerSchema.safeParse({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'BuildMate123!',
      phoneNumber: '0912345678',
      acceptedPolicy: true,
      role: ROLES.ADMIN,
    });
    assert.equal(admin.success, false);
  });

  it('rejects invalid email, weak password, invalid phone and missing policy', () => {
    const base = {
      name: 'Schema User',
      email: 'schema@example.com',
      password: 'BuildMate123!',
      phoneNumber: '0912345678',
      acceptedPolicy: true,
      role: ROLES.CUSTOMER,
    };
    assert.equal(registerSchema.safeParse({ ...base, email: 'bad' }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, password: 'weak' }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, phoneNumber: '123' }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, acceptedPolicy: false }).success, false);
    assert.equal(registerSchema.safeParse({ ...base, name: '' }).success, false);
    assert.equal(loginSchema.safeParse({ email: 'bad', password: 'x' }).success, false);
    assert.equal(loginSchema.safeParse({ email: 'ok@example.com', password: '' }).success, false);
  });
});

describe('Flow 01 frontend session and forgot-password guards', () => {
  it('keeps forgot-password OTP on the same page and does not resync countdown every tick', () => {
    const src = readFrontend('pages/auth/ForgotPassword.tsx');
    assert.equal(src.includes("navigate('/verify-email"), false);
    assert.equal(src.includes('step === 3'), false);
    assert.match(src, /otpSent/);
    assert.equal(
      src.includes('[email, countdown]'),
      false,
      'ForgotPassword cooldown effect must not depend on countdown (resets the timer each tick)'
    );
  });

  it('does not start a 60s cooldown when verify-email resend fails for a non-429 error', () => {
    const src = readFrontend('pages/auth/VerifyEmail.tsx');
    const resendStart = src.indexOf('async function onResend');
    const resend = src.slice(resendStart, src.indexOf('return (', resendStart));
    assert.ok(resend.includes('setOtpCooldown'));
    assert.match(resend, /status === 429/);
  });

  it('only clears the restored session on 401/403 from /user/profile', () => {
    const src = readFrontend('context/AuthContext.tsx');
    const restoreStart = src.indexOf('async function restore');
    const restore = src.slice(restoreStart, src.indexOf('void restore()', restoreStart));
    assert.match(restore, /status === 401/);
    assert.match(restore, /status === 403/);
    assert.equal(
      /catch \{\s*if \(!cancelled\) applySession\(null, null\);/.test(restore),
      false,
      'Network/5xx on profile restore must keep the existing session'
    );
  });

  it('notifies the auth context when a mid-session 401 clears local storage', () => {
    const src = readFrontend('lib/api.ts');
    assert.match(src, /buildmate-session-cleared/);
    const ctx = readFrontend('context/AuthContext.tsx');
    assert.match(ctx, /buildmate-session-cleared/);
  });
});

describe('Flow 01 register, OTP, login, RBAC', () => {
  it('registers Customer, Contractor and Material Store and rejects ADMIN self-registration', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const origin = server.origin;

    for (const role of [ROLES.CUSTOMER, ROLES.CONTRACTOR, ROLES.MATERIAL_STORE_OWNER]) {
      const body = registerBody({ role, name: `Flow ${role}` });
      const res = await api(origin, { method: 'POST', path: '/api/auth/register', body });
      assert.equal(res.status, 201, res.json?.message);
      const user = await remember(body.email);
      assert.equal(user.role, role);
      assert.equal(user.status, USER_STATUS.PENDING_EMAIL);
      assert.equal(user.emailVerified, false);
    }

    const adminAttempt = await api(origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: registerBody({ role: ROLES.ADMIN }),
    });
    assert.equal(adminAttempt.status, 422);
  });

  it('rejects missing fields, invalid email, weak password, invalid phone and missing policy', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const origin = server.origin;
    const valid = registerBody();

    const empty = await api(origin, { method: 'POST', path: '/api/auth/register', body: {} });
    assert.equal(empty.status, 422);

    const badEmail = await api(origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: { ...valid, email: 'not-an-email' },
    });
    assert.equal(badEmail.status, 422);

    const weakPassword = await api(origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: { ...registerBody(), password: 'weak' },
    });
    assert.equal(weakPassword.status, 422);

    const badPhone = await api(origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: { ...registerBody(), phoneNumber: '123' },
    });
    assert.equal(badPhone.status, 422);

    const noPolicy = await api(origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: { ...registerBody(), acceptedPolicy: false },
    });
    assert.equal(noPolicy.status, 422);
  });

  it('rejects a duplicate email with 409', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const first = registerBody();
    const created = await api(server.origin, { method: 'POST', path: '/api/auth/register', body: first });
    assert.equal(created.status, 201);
    await remember(first.email);

    const dup = await api(server.origin, {
      method: 'POST',
      path: '/api/auth/register',
      body: registerBody({ email: first.email }),
    });
    assert.equal(dup.status, 409);
  });

  it('rejects an expired verification OTP and rejects reuse after success', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    deliveredCodes.length = 0;
    const body = registerBody();
    await authService.register(body);
    const user = await remember(body.email);
    const code = deliveredCodes[0];
    assert.ok(code);

    await prisma.users.updateMany({
      where: { legacy_mongo_id: String(user._id) },
      data: { verification_expires_at: new Date(Date.now() - 1000) },
    });
    await assert.rejects(authService.verifyEmail({ email: body.email, code }), /expired/i);

    deliveredCodes.length = 0;
    const fresh = registerBody({ name: 'Reuse OTP' });
    await authService.register(fresh);
    await remember(fresh.email);
    const freshCode = deliveredCodes[0];
    await authService.verifyEmail({ email: fresh.email, code: freshCode });
    await assert.rejects(authService.verifyEmail({ email: fresh.email, code: freshCode }), /already verified|already used|No verification code/i);
  });

  it('blocks login until email is verified, then issues a JWT; ADMIN cannot use public login', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    deliveredCodes.length = 0;
    const body = registerBody();
    await authService.register(body);
    await remember(body.email);

    const unverified = await api(server.origin, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: body.email, password: body.password },
    });
    assert.equal(unverified.status, 403);

    await authService.verifyEmail({ email: body.email, code: deliveredCodes[0] });
    const loggedIn = await api(server.origin, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: body.email, password: body.password },
    });
    assert.equal(loggedIn.status, 200, loggedIn.json?.message);
    assert.ok(loggedIn.json.data.token);
    assert.equal(loggedIn.json.data.user.role, ROLES.CUSTOMER);

    const admin = await createUser({
      name: 'Flow Admin',
      email: uniqueEmail('admin'),
      password: 'Admin@1234',
      role: ROLES.ADMIN,
    });
    createdIds.push(admin._id);
    const publicAdmin = await api(server.origin, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: admin.email, password: 'Admin@1234' },
    });
    assert.equal(publicAdmin.status, 401);

    const customerOnAdmin = await api(server.origin, {
      method: 'POST',
      path: '/api/admin/auth/login',
      body: { email: body.email, password: body.password },
    });
    assert.equal(customerOnAdmin.status, 403);
  });

  it('backend rejects cross-role API access and expired JWTs', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const customer = await createUser({
      name: 'RBAC Customer',
      email: uniqueEmail('cust'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    const contractor = await createUser({
      name: 'RBAC Contractor',
      email: uniqueEmail('co'),
      password: 'BuildMate123!',
      role: ROLES.CONTRACTOR,
      phone: uniquePhone(),
    });
    const store = await createUser({
      name: 'RBAC Store',
      email: uniqueEmail('st'),
      password: 'BuildMate123!',
      role: ROLES.MATERIAL_STORE_OWNER,
      phone: uniquePhone(),
    });
    createdIds.push(customer._id, contractor._id, store._id);

    const customerToken = signToken(customer);
    const contractorToken = signToken(contractor);
    const storeToken = signToken(store);

    assert.equal(
      (await api(server.origin, { path: '/api/contractor/workspace', token: customerToken })).status,
      403
    );
    assert.equal(
      (await api(server.origin, { path: '/api/material-store/workspace', token: customerToken })).status,
      403
    );
    assert.equal(
      (await api(server.origin, { path: '/api/material-store/workspace', token: contractorToken })).status,
      403
    );
    assert.equal(
      (await api(server.origin, { path: '/api/contractor/workspace', token: storeToken })).status,
      403
    );
    assert.equal(
      (await api(server.origin, { path: '/api/admin/customers', token: customerToken })).status,
      403
    );
    assert.equal((await api(server.origin, { path: '/api/user/profile' })).status, 401);

    const expired = jwt.sign(
      { id: String(customer._id), role: customer.role, tokenVersion: customer.tokenVersion || 0 },
      env.jwtSecret,
      { expiresIn: '1ms', algorithm: 'HS256' }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const expiredRes = await api(server.origin, { path: '/api/user/profile', token: expired });
    assert.equal(expiredRes.status, 401);
  });

  it('logout revokes the token so a later request needs a new login', async (t) => {
    if (skipIfDatabaseUnavailable(t)) return;
    const user = await createUser({
      name: 'Logout User',
      email: uniqueEmail('out'),
      password: 'BuildMate123!',
      role: ROLES.CUSTOMER,
      phone: uniquePhone(),
    });
    createdIds.push(user._id);
    const token = signToken(user);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token })).status, 200);
    assert.equal((await api(server.origin, { method: 'POST', path: '/api/auth/logout', token })).status, 200);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token })).status, 401);
    const again = await authService.login({ email: user.email, password: 'BuildMate123!' });
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: again.token })).status, 200);
  });
});
