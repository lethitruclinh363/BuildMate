const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOtpEmail } = require('../providers/emailProvider');

const safetyNotice = 'Vì an toàn tài khoản, tuyệt đối không chia sẻ mã này với bất kỳ ai.';

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
      assert.match(html, /chỉ sử dụng được một lần/);
      assert.match(text, /chỉ sử dụng được một lần/);
      assert.match(html, /có hiệu lực trong <strong>5 phút<\/strong>/);
      assert.match(text, /có hiệu lực trong 5 phút/);
      assert.doesNotMatch(html, /bất kì ai/);
      assert.doesNotMatch(text, /bất kì ai/);
      assert.doesNotMatch(html, /Nếu bạn không đăng ký BuildMate|Nếu bạn không yêu cầu đặt lại mật khẩu/);
      assert.doesNotMatch(text, /chỉ dùng một lần/);
    });
  }
});