const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
<<<<<<< HEAD
const { buildOtpEmail } = require('../providers/emailProvider');
=======
const { buildOtpEmail } = require('../providers/email.provider');
>>>>>>> origin/Duc

const safetyNotice = 'Vì an toàn cho tài khoản, tuyệt đối không cung cấp mã này với bất kì ai';

describe('OTP email templates', () => {
  for (const purpose of ['verify', 'reset']) {
    it(`uses the corrected warning and single-use wording for ${purpose} emails`, () => {
      const { subject, html, text } = buildOtpEmail({
        name: 'Nguyen Truong Thanh',
        otp: '123456',
        purpose,
      });

      assert.ok(subject);
      assert.match(html, new RegExp(safetyNotice));
      assert.match(text, new RegExp(safetyNotice));
      assert.match(html, /chỉ sử dụng một lần/);
      assert.match(text, /chỉ sử dụng một lần/);
      assert.doesNotMatch(html, /Nếu bạn không đăng ký BuildMate|Nếu bạn không yêu cầu đặt lại mật khẩu/);
      assert.doesNotMatch(text, /chỉ dùng một lần/);
    });
  }
});