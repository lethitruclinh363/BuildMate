const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ensureMongo, mongoSkip, stopMongo } = require('./helpers/mongo');
const { User, ROLES, USER_STATUS } = require('../models/user.model');

const deliveredVerificationCodes = [];
const deliveredResetCodes = [];
const emailProvider = require('../providers/email.provider');
emailProvider.sendVerificationEmail = async ({ otp }) => {
  deliveredVerificationCodes.push(otp);
  return { sent: true, skipped: false };
};
emailProvider.sendResetPasswordEmail = async ({ otp }) => {
  deliveredResetCodes.push(otp);
  return { sent: true, skipped: false };
};

const authService = require('../services/auth.service');

let dbReady = false;
const testEmails = [];

before(async () => {
  dbReady = await ensureMongo();
});

after(async () => {
  if (testEmails.length) await User.deleteMany({ email: { $in: testEmails } });
  await stopMongo();
});

function skipIfMongoUnavailable(t) {
  if (dbReady) return false;
  t.skip(mongoSkip());
  return true;
}

async function createPendingUser(label) {
  const email = `otp-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@buildmate.test`;
  testEmails.push(email);
  return User.create({
    name: 'OTP Test User',
    email,
    password: 'BuildMate123!',
    role: ROLES.CUSTOMER,
    status: USER_STATUS.PENDING_EMAIL,
    emailVerified: false,
  });
}

describe('OTP protections', () => {
  it('hashes email codes, throttles resend, and locks after five incorrect attempts', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    deliveredVerificationCodes.length = 0;
    const user = await createPendingUser('verify');

    await authService.resendCode({ email: user.email });
    const saved = await User.findById(user._id).select('+verificationCode +verificationAttempts');
    const deliveredCode = deliveredVerificationCodes[0];
    const wrongCode = deliveredCode === '000000' ? '000001' : '000000';

    assert.equal(deliveredVerificationCodes.length, 1);
    assert.match(saved.verificationCode, /^[a-f\d]{64}$/);
    assert.notEqual(saved.verificationCode, deliveredCode);
    await assert.rejects(authService.resendCode({ email: user.email }), /wait before requesting/);
    assert.equal(deliveredVerificationCodes.length, 1);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await assert.rejects(authService.verifyEmail({ email: user.email, code: wrongCode }), /Invalid verification code/);
    }
    await assert.rejects(authService.verifyEmail({ email: user.email, code: wrongCode }), /Too many incorrect/);
    await assert.rejects(authService.verifyEmail({ email: user.email, code: deliveredCode }), /Too many incorrect/);
  });

  it('hashes reset codes, hides cooldown responses, and consumes a valid code once', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    deliveredResetCodes.length = 0;
    const user = await createPendingUser('reset');

    await authService.forgotPassword({ email: user.email });
    const saved = await User.findById(user._id).select('+resetPasswordToken +resetPasswordAttempts');
    const deliveredCode = deliveredResetCodes[0];
    const wrongCode = deliveredCode === '000000' ? '000001' : '000000';
    assert.equal(deliveredResetCodes.length, 1);
    assert.match(saved.resetPasswordToken, /^[a-f\d]{64}$/);
    assert.notEqual(saved.resetPasswordToken, deliveredCode);

    await authService.forgotPassword({ email: user.email });
    assert.equal(deliveredResetCodes.length, 1);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await assert.rejects(authService.verifyResetCode({ email: user.email, code: wrongCode }), /Invalid reset code/);
    }
    await assert.rejects(authService.verifyResetCode({ email: user.email, code: wrongCode }), /Too many incorrect/);
    await assert.rejects(
      authService.resetPassword({ email: user.email, code: deliveredCode, newPassword: 'ChangedPass123!' }),
      /Too many incorrect/
    );
  });

  it('allows a valid reset code once and rejects its reuse', async (t) => {
    if (skipIfMongoUnavailable(t)) return;
    deliveredResetCodes.length = 0;
    const user = await createPendingUser('consume');
    await authService.forgotPassword({ email: user.email });
    const deliveredCode = deliveredResetCodes[0];

    await authService.resetPassword({ email: user.email, code: deliveredCode, newPassword: 'ChangedPass123!' });
    await assert.rejects(
      authService.resetPassword({ email: user.email, code: deliveredCode, newPassword: 'AnotherPass123!' }),
      /No reset code/
    );
    const updated = await User.findById(user._id).select('+password');
    assert.equal(await updated.comparePassword('ChangedPass123!'), true);
  });
});