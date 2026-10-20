const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PASSWORD_RULE,
  PASSWORD_MESSAGE,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');
const { validate } = require('../utils/validator');

// Simulated frontend validation helper functions matching Register & ForgotPassword
function validatePasswordFields(password, confirm, t) {
  const passwordMessage = !password
    ? t('auth.passwordRequired')
    : PASSWORD_RULE.test(password)
      ? ''
      : t('auth.passwordRule');
  const confirmMessage = !confirm
    ? t('auth.confirmRequired')
    : confirm === password
      ? ''
      : t('auth.passwordMismatch');

  const formValid = !passwordMessage && !confirmMessage;
  return { passwordMessage, confirmMessage, formValid };
}

const mockI18n = (key) => key;

describe('Password Validation Consistency (Register & Reset Password)', () => {
  it('TC01: rejects invalid passwords (<8 chars, missing uppercase, missing lowercase, missing number)', () => {
    const invalidPasswords = [
      '', // empty
      '12345678', // only digits
      'short1A', // < 8 characters
      'alllowercase123', // missing uppercase
      'ALLUPPERCASE123', // missing lowercase
      'NoDigitsHere!', // missing digit
    ];

    for (const pass of invalidPasswords) {
      // Backend schema rejection
      const regResult = passwordSchema.safeParse(pass);
      assert.equal(regResult.success, false, `Expected password "${pass}" to be rejected by passwordSchema`);

      const resetResult = resetPasswordSchema.safeParse({
        email: 'test@example.com',
        code: '123456',
        newPassword: pass,
      });
      assert.equal(resetResult.success, false, `Expected resetPasswordSchema to reject "${pass}"`);

      // Frontend form rejection
      const { passwordMessage, formValid } = validatePasswordFields(pass, pass, mockI18n);
      assert.notEqual(passwordMessage, '', `Expected password "${pass}" to produce error message`);
      assert.equal(formValid, false, `Expected form to be invalid for password "${pass}"`);
    }
  });

  it('TC02: accepts valid passwords (>=8 chars, with uppercase, lowercase, digit)', () => {
    const validPasswords = [
      'ValidPass123',
      'ComplexP@ssw0rd',
      'BuildMate2026',
      'Aa1bbbbbb',
    ];

    for (const pass of validPasswords) {
      // Backend schema acceptance
      const result = passwordSchema.safeParse(pass);
      assert.equal(result.success, true, `Expected password "${pass}" to be valid`);

      const resetResult = resetPasswordSchema.safeParse({
        email: 'test@example.com',
        code: '123456',
        newPassword: pass,
      });
      assert.equal(resetResult.success, true, `Expected resetPasswordSchema to accept "${pass}"`);
      assert.equal(resetResult.data.newPassword, pass);

      // Frontend form acceptance
      const { passwordMessage, confirmMessage, formValid } = validatePasswordFields(pass, pass, mockI18n);
      assert.equal(passwordMessage, '');
      assert.equal(confirmMessage, '');
      assert.equal(formValid, true);
    }
  });

  it('TC03: reports error when confirm password does not match new password', () => {
    const password = 'ValidPassword123';
    const wrongConfirms = ['DifferentPass123', 'validpassword123', 'ValidPassword124', ''];

    for (const confirm of wrongConfirms) {
      const { confirmMessage, formValid } = validatePasswordFields(password, confirm, mockI18n);
      assert.notEqual(confirmMessage, '', `Expected confirm error when confirm is "${confirm}"`);
      assert.equal(formValid, false, 'Form must not be valid when confirm password does not match');
      if (confirm) {
        assert.equal(confirmMessage, 'auth.passwordMismatch');
      } else {
        assert.equal(confirmMessage, 'auth.confirmRequired');
      }
    }
  });

  it('TC04: allows submit only when both password and confirm are valid and match', () => {
    // Valid and match
    const validState = validatePasswordFields('ValidPass123', 'ValidPass123', mockI18n);
    assert.equal(validState.passwordMessage, '');
    assert.equal(validState.confirmMessage, '');
    assert.equal(validState.formValid, true);

    // Valid format but do not match -> cannot submit
    const mismatchState = validatePasswordFields('ValidPass123', 'ValidPass456', mockI18n);
    assert.equal(mismatchState.formValid, false);

    // Match but invalid format -> cannot submit
    const weakMatchState = validatePasswordFields('12345678', '12345678', mockI18n);
    assert.equal(weakMatchState.formValid, false);
  });

  it('TC05: validate middleware returns 422 with proper error message when Reset Password API receives invalid password', () => {
    const middleware = validate(resetPasswordSchema);
    const req = {
      body: {
        email: 'user@example.com',
        code: '123456',
        newPassword: 'weak',
      },
    };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 422);
    assert.equal(jsonResponse.success, false);
    assert.equal(jsonResponse.message, PASSWORD_MESSAGE);
    assert.ok(jsonResponse.details.newPassword);
    assert.ok(jsonResponse.details.newPassword.includes(PASSWORD_MESSAGE));
  });

  it('TC06: registerSchema and resetPasswordSchema share the exact same password rule and schema', () => {
    // Both use the exact same passwordSchema definition
    assert.equal(registerSchema.shape.password, passwordSchema);
    assert.equal(resetPasswordSchema.shape.newPassword, passwordSchema);
    assert.ok(PASSWORD_RULE instanceof RegExp);
    assert.equal(
      PASSWORD_MESSAGE,
      'Password must be at least 8 characters and include uppercase, lowercase, and a number'
    );
  });
});
