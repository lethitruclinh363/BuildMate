const test = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');
const { userRepository } = require('../repositories/userRepository');
const accountIdentity = require('../services/accountIdentity');
const policyService = require('../services/policy.service');
const profileStatusService = require('../services/profileStatusService');
const jwt = require('../utils/jwt');
const googleAuthService = require('../services/googleAuthService');

test('Google authentication only creates and authenticates customer accounts', async () => {
  const originals = [];
  const stub = (target, key, value) => {
    originals.push([target, key, target[key]]);
    target[key] = value;
  };
  const originalClientId = env.googleClientId;
  let claims;
  let verificationError;
  let userByEmail = null;
  let createdUser;
  let createdPayload;
  let verifiedAudience;

  try {
    env.googleClientId = 'test-client-id';
    stub(OAuth2Client.prototype, 'verifyIdToken', async ({ audience }) => {
      verifiedAudience = audience;
      if (verificationError) throw verificationError;
      return { getPayload: () => claims };
    });
    stub(userRepository, 'findByEmail', async () => userByEmail);
    stub(userRepository, 'create', async (payload) => {
      createdPayload = payload;
      createdUser = {
        ...payload,
        _id: 'customer-id',
        toPublic() {
          return { id: this._id, email: this.email, role: this.role };
        },
      };
      return createdUser;
    });
    stub(accountIdentity, 'assertAccountIdentityAvailable', async ({ email, phone }) => ({ email, phone }));
    stub(policyService, 'acceptanceForLanguage', async () => ({ acceptanceVersion: 'terms-1;privacy-1' }));
    stub(profileStatusService, 'syncUserProfileStatus', async () => {});
    stub(jwt, 'signToken', () => 'buildmate-token');

    claims = {
      sub: 'google-subject',
      email: 'new.customer@gmail.com',
      email_verified: true,
      nonce: 'request-nonce',
      name: 'New Customer',
      picture: 'https://example.test/avatar.png',
    };

    await assert.rejects(
      googleAuthService.login({ credential: 'google-token', nonce: 'wrong-nonce' }),
      (error) => error.statusCode === 401 && error.details.code === 'GOOGLE_CREDENTIAL_INVALID'
    );
    assert.equal(verifiedAudience, 'test-client-id');

    verificationError = new Error('signature check failed');
    await assert.rejects(
      googleAuthService.login({ credential: 'invalid-token', nonce: 'request-nonce' }),
      (error) => error.statusCode === 401 && error.details.code === 'GOOGLE_CREDENTIAL_INVALID'
    );

    verificationError = Object.assign(new Error('Google request failed'), { code: 'ECONNRESET' });
    await assert.rejects(
      googleAuthService.login({ credential: 'google-token', nonce: 'request-nonce' }),
      (error) => error.statusCode === 503 && error.details.code === 'GOOGLE_VERIFICATION_UNAVAILABLE'
    );
    verificationError = null;

    const registration = await googleAuthService.login({
      credential: 'google-token',
      nonce: 'request-nonce',
    });
    assert.deepEqual(registration, {
      requiresRegistration: true,
      email: 'new.customer@gmail.com',
      name: 'New Customer',
      avatar: 'https://example.test/avatar.png',
    });

    userByEmail = { role: 'CONTRACTOR' };
    await assert.rejects(
      googleAuthService.login({ credential: 'google-token', nonce: 'request-nonce' }),
      (error) => error.statusCode === 403 && error.details.code === 'GOOGLE_CUSTOMER_ONLY'
    );

    userByEmail = {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      emailVerified: true,
      toPublic: () => ({ id: 'existing-customer', role: 'CUSTOMER' }),
    };
    const existingSession = await googleAuthService.login({
      credential: 'google-token',
      nonce: 'request-nonce',
    });
    assert.equal(existingSession.requiresRegistration, false);
    assert.equal(existingSession.token, 'buildmate-token');
    assert.equal(existingSession.user.id, 'existing-customer');

    userByEmail = null;
    const newSession = await googleAuthService.login({
      credential: 'google-token',
      nonce: 'request-nonce',
      phoneNumber: '0912345678',
      acceptedPolicy: true,
      policyLanguage: 'vi',
    });
    assert.equal(newSession.requiresRegistration, false);
    assert.equal(newSession.user.role, 'CUSTOMER');
    assert.equal(createdPayload.status, 'ACTIVE');
    assert.equal(createdPayload.emailVerified, true);
    assert.equal(createdPayload.acceptedPolicy, true);
    assert.equal(createdPayload.acceptedPolicyVersion, 'terms-1;privacy-1');
    assert.equal(createdPayload.phoneNumber, '0912345678');
    assert.equal(createdPayload.role, 'CUSTOMER');
  } finally {
    for (const [target, key, original] of originals.reverse()) target[key] = original;
    env.googleClientId = originalClientId;
  }
});
