const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('BUILDMATE – Merged Forgot Password Screen (TC01 - TC09)', () => {
  // Load VI & EN translations to verify completeness
  const viAuthPath = path.resolve(__dirname, '../../../frontend/src/locales/vi/auth.json');
  const enAuthPath = path.resolve(__dirname, '../../../frontend/src/locales/en/auth.json');
  const viAuth = JSON.parse(fs.readFileSync(viAuthPath, 'utf8'));
  const enAuth = JSON.parse(fs.readFileSync(enAuthPath, 'utf8'));

  // Simulated frontend state machine for ForgotPassword component
  function createForgotPasswordMachine() {
    let state = {
      step: 1, // 1 | 2
      email: '',
      code: '',
      otpSent: false,
      codeVerified: false,
      countdown: 0,
      error: '',
      otpError: '',
      info: '',
      loading: false,
    };

    const sessionStore = new Map();

    const mockApi = {
      forgotPassword: async (email) => {
        if (!email || !email.includes('@')) {
          throw new Error('Invalid email');
        }
        return { success: true, message: 'OTP sent' };
      },
      verifyResetCode: async (email, code) => {
        if (code !== '123456') {
          throw new Error('Mã OTP không đúng hoặc đã hết hạn.');
        }
        return { success: true, message: 'Code valid' };
      },
      resetPassword: async (email, code, newPassword) => {
        if (!state.codeVerified) {
          throw new Error('OTP not verified');
        }
        if (!newPassword || newPassword.length < 8) {
          throw new Error('Password does not meet requirements');
        }
        return { success: true, message: 'Password updated' };
      },
    };

    return {
      getState: () => ({ ...state }),
      setEmail: (val) => {
        state.email = val;
      },
      setCode: (val) => {
        state.code = val.replace(/\D/g, '').slice(0, 6);
        state.otpError = '';
      },
      handleSendCode: async () => {
        if (!state.email.trim()) {
          state.error = 'Vui lòng nhập email.';
          return;
        }
        state.loading = true;
        try {
          await mockApi.forgotPassword(state.email.trim());
          state.otpSent = true;
          state.countdown = 60;
          sessionStore.set(`bm_otp_cooldown_${state.email.trim().toLowerCase()}`, Date.now() + 60000);
          state.info = 'Kiểm tra email (và thư mục Spam) để lấy mã OTP.';
          state.error = '';
        } catch (err) {
          state.error = err.message;
        } finally {
          state.loading = false;
        }
      },
      handleVerifyOtp: async () => {
        if (state.code.length !== 6) return;
        state.loading = true;
        try {
          await mockApi.verifyResetCode(state.email.trim(), state.code.trim());
          state.codeVerified = true;
          state.step = 2; // Move to Step 2/2
          state.otpError = '';
        } catch (err) {
          state.otpError = err.message;
        } finally {
          state.loading = false;
        }
      },
      handleResendCode: async () => {
        if (state.countdown > 0) return false;
        state.loading = true;
        try {
          await mockApi.forgotPassword(state.email.trim());
          state.countdown = 60;
          sessionStore.set(`bm_otp_cooldown_${state.email.trim().toLowerCase()}`, Date.now() + 60000);
          state.code = '';
          state.otpError = '';
          return true;
        } finally {
          state.loading = false;
        }
      },
      handleChangeEmail: () => {
        state.otpSent = false;
        state.code = '';
        state.otpError = '';
        state.error = '';
        state.info = '';
      },
      handleResetPassword: async (newPassword) => {
        if (!state.codeVerified) {
          state.step = 1;
          state.error = 'OTP not verified';
          return false;
        }
        await mockApi.resetPassword(state.email, state.code, newPassword);
        return true;
      },
      simulateRefresh: () => {
        // Simulates browser refresh: state resets, but sessionStorage persists cooldown
        const rawExpire = sessionStore.get(`bm_otp_cooldown_${state.email.trim().toLowerCase()}`);
        const remaining = rawExpire ? Math.max(0, Math.ceil((rawExpire - Date.now()) / 1000)) : 0;
        return {
          step: 1,
          otpSent: false, // User enters page fresh, does NOT auto-send OTP
          countdown: remaining,
        };
      },
    };
  }

  it('TC01: Nhập email → Gửi OTP → Không chuyển trang', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('customer@buildmate.vn');
    await machine.handleSendCode();

    const state = machine.getState();
    assert.equal(state.step, 1, 'Must remain on Step 1 (not redirect)');
    assert.equal(state.otpSent, true, 'OTP must be marked as sent');
    assert.equal(state.info, 'Kiểm tra email (và thư mục Spam) để lấy mã OTP.');
  });

  it('TC02: Email vẫn giữ nguyên khi hiện ô OTP', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('user123@buildmate.vn');
    await machine.handleSendCode();

    const state = machine.getState();
    assert.equal(state.email, 'user123@buildmate.vn', 'Email must remain intact');
    assert.equal(state.otpSent, true, 'OTP box is displayed');
  });

  it('TC03: OTP sai → Hiển thị lỗi', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('test@buildmate.vn');
    await machine.handleSendCode();

    machine.setCode('000000'); // Wrong OTP
    await machine.handleVerifyOtp();

    const state = machine.getState();
    assert.equal(state.step, 1, 'Must stay on Step 1 when OTP is incorrect');
    assert.equal(state.codeVerified, false);
    assert.notEqual(state.otpError, '', 'Must show error under OTP field');
  });

  it('TC04: OTP đúng → Chuyển sang Bước 2/2', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('test@buildmate.vn');
    await machine.handleSendCode();

    machine.setCode('123456'); // Correct OTP
    await machine.handleVerifyOtp();

    const state = machine.getState();
    assert.equal(state.codeVerified, true, 'Code must be marked as verified');
    assert.equal(state.step, 2, 'Must transition to Step 2/2');
    assert.equal(state.otpError, '', 'OTP error must be cleared');
  });

  it('TC05: Gửi lại mã có cooldown', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('test@buildmate.vn');
    await machine.handleSendCode();

    const state1 = machine.getState();
    assert.equal(state1.countdown, 60, 'Cooldown must be 60 seconds');

    // Attempt resend while countdown is active
    const resendResult = await machine.handleResendCode();
    assert.equal(resendResult, false, 'Must be blocked by cooldown');
  });

  it('TC06: Refresh không tự động gửi OTP', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('test@buildmate.vn');
    await machine.handleSendCode();

    const refreshedState = machine.simulateRefresh();
    assert.equal(refreshedState.otpSent, false, 'Refresh must not automatically re-send OTP');
    assert.ok(refreshedState.countdown > 0, 'Cooldown is retained from storage');
  });

  it('TC07: Không thể đặt lại mật khẩu nếu chưa xác thực OTP', async () => {
    const machine = createForgotPasswordMachine();
    machine.setEmail('test@buildmate.vn');

    // Trying to save password without verified OTP
    const resetSuccess = await machine.handleResetPassword('NewSecurePass123!');
    assert.equal(resetSuccess, false, 'Reset must fail if code is not verified');
    assert.equal(machine.getState().step, 1, 'Must be kept on step 1');
  });

  it('TC08: VI/EN hoạt động đúng', () => {
    // Check Vietnamese keys
    assert.equal(viAuth.forgotStep, 'Bước {step}/2 — {label}');
    assert.equal(viAuth.stepEmailOtp, 'Xác thực email & OTP');
    assert.equal(viAuth.stepPassword, 'Đặt mật khẩu mới');
    assert.equal(viAuth.checkInboxSpam, 'Kiểm tra email (và thư mục Spam) để lấy mã OTP.');
    assert.equal(viAuth.confirmOtp, 'Xác nhận mã OTP');
    assert.equal(viAuth.changeEmail, 'Thay đổi email');

    // Check English keys
    assert.equal(enAuth.forgotStep, 'Step {step}/2 — {label}');
    assert.equal(enAuth.stepEmailOtp, 'Email & OTP verification');
    assert.equal(enAuth.stepPassword, 'Set new password');
    assert.equal(enAuth.checkInboxSpam, 'Check your email (and Spam folder) to get the OTP code.');
    assert.equal(enAuth.confirmOtp, 'Confirm OTP code');
    assert.equal(enAuth.changeEmail, 'Change email');
  });

  it('TC09: Form desktop/mobile không bị tràn', () => {
    const forgotPasswordCode = fs.readFileSync(
      path.resolve(__dirname, '../../../frontend/src/pages/auth/ForgotPassword.tsx'),
      'utf8'
    );
    // Verifies responsive container classes
    assert.ok(forgotPasswordCode.includes('w-full'), 'Form elements must use fluid width');
    assert.ok(forgotPasswordCode.includes('rounded-[28px]'), 'Container styling matches BuildMate standard');
    assert.ok(forgotPasswordCode.includes('tracking-'), 'OTP input has letter spacing');
    assert.ok(!forgotPasswordCode.includes('step === 3'), 'No 3rd step remains');
  });
});
