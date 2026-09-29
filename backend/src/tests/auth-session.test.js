const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { ensureMongo, mongoSkip, stopMongo } = require('./helpers/mongo');
const { env } = require('../config/env');
const { User, ROLES, USER_STATUS } = require('../models/user.model');

const resetCodes = [];
const emailProvider = require('../providers/email.provider');
emailProvider.sendResetPasswordEmail = async ({ otp }) => {
  resetCodes.push(otp);
  return { sent: true, skipped: false };
};

const { signToken } = require('../utils/jwt');
const authService = require('../services/auth.service');
const { startTestServer, api } = require('./helpers/http');

let dbReady = false;
let server;
const testEmails = [];

before(async () => {
  dbReady = await ensureMongo();
  if (dbReady) server = await startTestServer();
});

after(async () => {
  if (testEmails.length) await User.deleteMany({ email: { $in: testEmails } });
  if (server) await server.close();
  await stopMongo();
});

function skipIfMongoUnavailable(t) {
  if (dbReady) return false;
  t.skip(mongoSkip());
  return true;
}

async function createActiveUser(label, role = ROLES.CUSTOMER) {
  const email = `session-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@buildmate.test`;
  testEmails.push(email);
  const user = await User.create({
    name: 'Session Test User',
    email,
    password: 'BuildMate123!',
    role,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  return { user, email };
}

describe('JWT session revocation', () => {
  it('logout invalidates the current token and authenticated password change revokes old sessions', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    const { user, email } = await createActiveUser('user');
    const oldToken = signToken(user);
    const otherSessionToken = jwt.sign(
      { id: String(user._id), role: user.role, tokenVersion: user.tokenVersion || 0 },
      env.jwtSecret,
      { expiresIn: '7d', algorithm: 'HS256', jwtid: 'parallel-session' }
    );

    assert.equal((await api(server.origin, { path: '/api/user/profile', token: oldToken })).status, 200);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: otherSessionToken })).status, 200);
    assert.equal((await api(server.origin, { method: 'POST', path: '/api/auth/logout', token: oldToken })).status, 200);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: oldToken })).status, 401);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: otherSessionToken })).status, 401);

    const afterLogout = await authService.login({ email, password: 'BuildMate123!' });
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: afterLogout.token })).status, 200);
    const changed = await api(server.origin, {
      method: 'PATCH',
      path: '/api/user/password',
      token: afterLogout.token,
      body: { currentPassword: 'BuildMate123!', newPassword: 'ChangedPass123!' },
    });
    assert.equal(changed.status, 200);
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: afterLogout.token })).status, 401);

    const afterChange = await authService.login({ email, password: 'ChangedPass123!' });
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: afterChange.token })).status, 200);
  });

  it('password reset invalidates previously issued user tokens', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    resetCodes.length = 0;
    const { user, email } = await createActiveUser('reset');
    const oldToken = signToken(user);

    await authService.forgotPassword({ email });
    await authService.resetPassword({ email, code: resetCodes[0], newPassword: 'ResetPass123!' });

    assert.equal((await api(server.origin, { path: '/api/user/profile', token: oldToken })).status, 401);
    const afterReset = await authService.login({ email, password: 'ResetPass123!' });
    assert.equal((await api(server.origin, { path: '/api/user/profile', token: afterReset.token })).status, 200);
  });

  it('Admin logout invalidates the Admin JWT server-side', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    const { user } = await createActiveUser('admin', ROLES.ADMIN);
    const token = signToken(user);

    assert.equal((await api(server.origin, { path: '/api/admin/auth/me', token })).status, 200);
    assert.equal((await api(server.origin, { method: 'POST', path: '/api/admin/auth/logout', token })).status, 200);
    assert.equal((await api(server.origin, { path: '/api/admin/auth/me', token })).status, 401);
  });
});