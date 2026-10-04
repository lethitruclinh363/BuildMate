const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeChatLocation } = require('../utils/chat-location');
const { sendMessageSchema } = require('../validators/sprint4.validator');

describe('chat location messages', () => {
  it('keeps a valid pin and strips control characters from the label', () => {
    const location = sanitizeChatLocation({
      lat: 10.045,
      lng: 105.746,
      address: ' Ninh Kiều ',
      label: 'Công trình\u0000 A',
    });
    assert.deepEqual(location, {
      lat: 10.045,
      lng: 105.746,
      address: 'Ninh Kiều',
      label: 'Công trình A',
    });
  });

  it('rejects coordinates outside the valid range', () => {
    assert.equal(sanitizeChatLocation({ lat: 95, lng: 105 }), null);
    assert.equal(sanitizeChatLocation({ lat: 10, lng: 200 }), null);
    assert.equal(sanitizeChatLocation(null), null);
  });

  it('still accepts a text message and requires a location for LOCATION', () => {
    assert.equal(sendMessageSchema.safeParse({ type: 'TEXT', content: 'Xin chào' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'IMAGE', content: '/uploads/a.jpg' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'LOCATION' }).success, false);
    const parsed = sendMessageSchema.safeParse({
      type: 'LOCATION',
      location: { lat: 10.03, lng: 105.78, address: 'Cần Thơ', label: 'Cửa hàng' },
    });
    assert.equal(parsed.success, true);
    assert.equal(sendMessageSchema.safeParse({ type: 'LOCATION', location: { lat: 10, lng: 190 } }).success, false);
  });
});
