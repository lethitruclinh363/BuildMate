const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { otpEmailHtml, renderPartnerApprovalEmail } = require('../providers/email.provider');

describe('BuildMate email layout', () => {
  it('keeps the OTP message inside the shared navy header', () => {
    const html = otpEmailHtml({ name: 'Yang Tu', otp: '123456', purpose: 'verify' });
    assert.match(html, /BuildMate/);
    assert.match(html, /HỆ ĐIỀU HÀNH XÂY DỰNG/);
    assert.match(html, /background:#1b2a4a/);
    assert.match(html, />BM</);
    assert.match(html, /MÃ XÁC THỰC/);
    assert.match(html, /123456/);
    assert.equal(html.includes('Congratulations'), false);
  });

  it('sends a Vietnamese approval email with the same header', () => {
    const message = renderPartnerApprovalEmail({ name: 'Yang Tu', language: 'vi' });
    assert.equal(message.subject, 'Chúc mừng! Hồ sơ đối tác BuildMate của bạn đã được phê duyệt');
    assert.match(message.html, /Xin chào Yang Tu/);
    assert.match(message.html, /Chúc mừng bạn!/);
    assert.match(message.html, /HỆ ĐIỀU HÀNH XÂY DỰNG/);
    assert.match(message.html, /Đăng nhập vào BuildMate →/);
    assert.match(message.html, /display:inline-block;padding:14px 28px/);
    assert.match(message.html, /max-width:560px/);
    assert.equal(message.html.includes('Your BuildMate partner application has been approved'), false);
    assert.match(message.text, /Cảm ơn bạn đã đồng hành cùng BuildMate/);
  });

  it('sends an English approval email without Vietnamese copy', () => {
    const message = renderPartnerApprovalEmail({ name: 'Yang Tu', language: 'en' });
    assert.equal(message.subject, 'Congratulations! Your BuildMate Partner Account Has Been Approved');
    assert.match(message.html, /Hello Yang Tu/);
    assert.match(message.html, /LOCAL BUILDING PLATFORM/);
    assert.match(message.html, /Sign in to BuildMate →/);
    assert.match(message.html, /You are now an official BuildMate partner/);
    assert.equal(message.html.includes('Chúc mừng'), false);
    assert.equal(message.html.includes('HỆ ĐIỀU HÀNH'), false);
  });
});
