const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyError } = require('../utils/httpError');
const {
  normalizeEmail,
  normalizeVnMobile,
  storedVnMobile,
  isValidVnMobile,
  phoneLookupValues,
  EMAIL_ALREADY_EXISTS,
  PHONE_ALREADY_EXISTS,
} = require('../utils/identity');

describe('account identity helpers', () => {
  it('normalizes email without changing plus or dots', () => {
    assert.equal(normalizeEmail('  Test.Name+tag@Gmail.com '), 'test.name+tag@gmail.com');
  });

  it('treats 0, 84 and +84 mobile numbers as the same local number', () => {
    assert.equal(normalizeVnMobile('0901234567'), '0901234567');
    assert.equal(normalizeVnMobile('+84901234567'), '0901234567');
    assert.equal(normalizeVnMobile('84901234567'), '0901234567');
    assert.equal(isValidVnMobile(normalizeVnMobile('+84901234567')), true);
    const variants = phoneLookupValues('+84901234567');
    assert.ok(variants.includes('0901234567'));
    assert.ok(variants.includes('+84901234567'));
    assert.ok(variants.includes('84901234567'));
    assert.equal(storedVnMobile('+84901234567'), '0901234567');
    assert.equal(storedVnMobile('not-a-phone'), null);
  });

  it('maps Prisma unique conflicts to 409 instead of 500', () => {
    const namedEmail = classifyError({ code: 'P2002', meta: { constraint: 'uq_users_email_lower' } });
    assert.equal(namedEmail.status, 409);
    assert.equal(namedEmail.details.code, EMAIL_ALREADY_EXISTS);

    const emailErr = classifyError({ code: 'P2002', meta: { target: ['email'] } });
    assert.equal(emailErr.status, 409);
    assert.equal(emailErr.details.code, EMAIL_ALREADY_EXISTS);
    assert.equal(emailErr.details.field, 'email');
    assert.match(emailErr.message, /email/i);

    const phoneErr = classifyError({ code: 'P2002', meta: { constraint: 'uq_users_phone_number_nonempty' } });
    assert.equal(phoneErr.status, 409);
    assert.equal(phoneErr.details.code, PHONE_ALREADY_EXISTS);
    assert.equal(phoneErr.details.field, 'phone');

    const pgErr = classifyError({ code: '23505', meta: { constraint: 'uq_users_email_lower' } });
    assert.equal(pgErr.status, 409);
    assert.equal(pgErr.details.code, EMAIL_ALREADY_EXISTS);
    assert.doesNotMatch(String(pgErr.message), /prisma|sql|constraint failed/i);

    const wrapped = classifyError({
      code: 'P2002',
      meta: { modelName: 'users' },
      cause: { code: '23505', constraint: 'uq_users_email_lower', message: 'duplicate key value violates unique constraint "uq_users_email_lower"' },
    });
    assert.equal(wrapped.status, 409);
    assert.equal(wrapped.details.code, EMAIL_ALREADY_EXISTS);
  });
});
