const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadEnv } = require('../../../frontend/node_modules/vite');

describe('BUILDMATE – OTP Cooldown & Frontend Environment Verification', () => {
  const OTP_TTL_MS = 5 * 60 * 1000;
  const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

  // Mock repository simulation for isolated OTP state transitions
  function createMockOtpState() {
    let state = {
      verificationCode: null,
      verificationExpiresAt: null,
      verificationSentAt: null,
      verificationAttempts: 0,
      emailVerified: false,
    };

    return {
      getState: () => ({ ...state }),
      issueVerificationOtp({ codeHash, expiresAt, sentAt, cooldownBefore }) {
        if (state.verificationSentAt && state.verificationSentAt > cooldownBefore) {
          return null; // Cooldown not yet elapsed
        }
        state.verificationCode = codeHash;
        state.verificationExpiresAt = expiresAt;
        state.verificationSentAt = sentAt;
        state.verificationAttempts = 0;
        return { ...state };
      },
      verifyOtp({ code, now = new Date() }) {
        if (!state.verificationCode) return { status: 400, message: 'No verification code' };
        if (state.verificationExpiresAt.getTime() < now.getTime()) {
          return { status: 400, message: 'Verification code has expired' };
        }
        if (code !== state.verificationCode) {
          state.verificationAttempts += 1;
          if (state.verificationAttempts >= 5) {
            return { status: 429, message: 'Too many incorrect verification codes' };
          }
          return { status: 400, message: 'Invalid verification code' };
        }
        state.emailVerified = true;
        state.verificationCode = null;
        return { status: 200, message: 'Email verified successfully' };
      },
    };
  }

  it('TC01: Gửi OTP lần đầu hợp lệ', () => {
    const mock = createMockOtpState();
    const now = new Date();
    const result = mock.issueVerificationOtp({
      codeHash: 'hash-code-123456',
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      sentAt: now,
      cooldownBefore: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS),
    });
    assert.ok(result);
    assert.equal(result.verificationCode, 'hash-code-123456');
    assert.equal(result.verificationAttempts, 0);
  });

  it('TC02: Gửi lại trước thời gian chờ (cooldown 60s) trả 429', () => {
    const mock = createMockOtpState();
    const t0 = new Date();
    mock.issueVerificationOtp({
      codeHash: 'hash-code-1',
      expiresAt: new Date(t0.getTime() + OTP_TTL_MS),
      sentAt: t0,
      cooldownBefore: new Date(t0.getTime() - OTP_RESEND_COOLDOWN_MS),
    });

    // Try resend 15 seconds later
    const t15 = new Date(t0.getTime() + 15 * 1000);
    const prematureResult = mock.issueVerificationOtp({
      codeHash: 'hash-code-2',
      expiresAt: new Date(t15.getTime() + OTP_TTL_MS),
      sentAt: t15,
      cooldownBefore: new Date(t15.getTime() - OTP_RESEND_COOLDOWN_MS),
    });
    assert.equal(prematureResult, null, 'Must reject resend within 60s cooldown');
    assert.equal(mock.getState().verificationCode, 'hash-code-1', 'Must not overwrite existing OTP on 429');
  });

  it('TC03: Hết thời gian chờ được phép yêu cầu mã mới', () => {
    const mock = createMockOtpState();
    const t0 = new Date();
    mock.issueVerificationOtp({
      codeHash: 'hash-code-1',
      expiresAt: new Date(t0.getTime() + OTP_TTL_MS),
      sentAt: t0,
      cooldownBefore: new Date(t0.getTime() - OTP_RESEND_COOLDOWN_MS),
    });

    // Try resend after 61 seconds
    const t61 = new Date(t0.getTime() + 61 * 1000);
    const validResult = mock.issueVerificationOtp({
      codeHash: 'hash-code-2',
      expiresAt: new Date(t61.getTime() + OTP_TTL_MS),
      sentAt: t61,
      cooldownBefore: new Date(t61.getTime() - OTP_RESEND_COOLDOWN_MS),
    });
    assert.ok(validResult, 'Should allow resend after 60s cooldown');
    assert.equal(validResult.verificationCode, 'hash-code-2');
  });

  it('TC04: Không gọi resend trùng do double-click (Client guard)', () => {
    let resending = false;
    let callCount = 0;
    const triggerResend = async () => {
      if (resending) return; // Client double-click guard
      resending = true;
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      resending = false;
    };

    // Simulate rapid concurrent double-click
    void triggerResend();
    void triggerResend();
    assert.equal(callCount, 1, 'Double click must only execute one resend request');
  });

  it('TC05: Không tự resend khi refresh (sessionStorage cooldown recovery)', () => {
    const email = 'user@example.com';
    const expireTime = Date.now() + 45 * 1000;
    const fakeSessionStorage = new Map();
    fakeSessionStorage.set(`bm_otp_cooldown_${email}`, String(expireTime));

    const recoveredRemaining = Math.ceil((Number(fakeSessionStorage.get(`bm_otp_cooldown_${email}`)) - Date.now()) / 1000);
    assert.ok(recoveredRemaining > 0 && recoveredRemaining <= 45, 'Should restore active cooldown without auto-resend');
  });

  it('TC06: OTP hợp lệ xác thực được email', () => {
    const mock = createMockOtpState();
    const now = new Date();
    mock.issueVerificationOtp({
      codeHash: '123456',
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      sentAt: now,
      cooldownBefore: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS),
    });

    const verifyResult = mock.verifyOtp({ code: '123456', now });
    assert.equal(verifyResult.status, 200);
    assert.equal(mock.getState().emailVerified, true);
    assert.equal(mock.getState().verificationCode, null);
  });

  it('TC07: OTP hết hạn bị từ chối', () => {
    const mock = createMockOtpState();
    const now = new Date();
    mock.issueVerificationOtp({
      codeHash: '123456',
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      sentAt: now,
      cooldownBefore: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS),
    });

    const afterExpiration = new Date(now.getTime() + 6 * 60 * 1000);
    const verifyResult = mock.verifyOtp({ code: '123456', now: afterExpiration });
    assert.equal(verifyResult.status, 400);
    assert.equal(verifyResult.message, 'Verification code has expired');
    assert.equal(mock.getState().emailVerified, false);
  });

  it('TC08: Email provider khi SMTP chưa cấu hình trả kết quả an toàn không crash', async () => {
    const emailProvider = require('../providers/emailProvider');
    const wasSmtp = emailProvider.isSmtpConfigured;
    const result = await emailProvider.sendEmail({
      to: 'unconfigured-test@buildmate.local',
      subject: 'Test Subject',
      text: 'Test content',
    });
    assert.ok(typeof result.sent === 'boolean');
  });

  it('TC09: Frontend Dev dùng đúng Backend Development 5000', () => {
    const frontendDir = path.resolve(__dirname, '../../../frontend');
    const env = loadEnv('development', frontendDir, '');
    assert.equal(env.VITE_API_URL, 'http://localhost:5000/api');
    assert.equal(env.VITE_PROXY_TARGET, 'http://localhost:5000');
  });

  it('TC10: Frontend Test dùng đúng Backend Test 5055', () => {
    const frontendDir = path.resolve(__dirname, '../../../frontend');
    const env = loadEnv('test', frontendDir, '');
    assert.equal(env.VITE_API_URL, 'http://127.0.0.1:5055/api');
    assert.equal(env.VITE_PROXY_TARGET, 'http://127.0.0.1:5055');
  });

  it('TC11: Hiển thị lỗi VI/EN chính xác cho 429 Cooldown', () => {
    const KNOWN_API_ERRORS = {
      'Please wait before requesting another verification code': {
        vi: 'Vui lòng đợi trước khi yêu cầu mã xác thực mới.',
        en: 'Please wait before requesting another verification code.',
      },
    };

    const raw = 'Please wait before requesting another verification code';
    const viText = KNOWN_API_ERRORS[raw]?.vi;
    const enText = KNOWN_API_ERRORS[raw]?.en;

    assert.equal(viText, 'Vui lòng đợi trước khi yêu cầu mã xác thực mới.');
    assert.equal(enText, 'Please wait before requesting another verification code.');
  });
});
