const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAiStatus, canSubmitEkyc, toPublic, archiveAttempt } = require('../services/ekycStatus');
const { sniffImage, resolvePrivate } = require('../services/ekycStorage');
const { createEkycClient } = require('../services/ekycAiClient');
const { ApiError } = require('../utils/ApiError');

describe('eKYC status', () => {
  it('fails when OCR or liveness does not pass', () => {
    assert.equal(resolveAiStatus({ ocrPassed: false, livenessPassed: true, faceDecision: 'MATCH' }), 'AI_FAILED');
    assert.equal(resolveAiStatus({ ocrPassed: true, livenessPassed: false, faceDecision: 'MATCH' }), 'AI_FAILED');
  });

  it('passes only on a technical match', () => {
    assert.equal(resolveAiStatus({ ocrPassed: true, livenessPassed: true, faceDecision: 'MATCH' }), 'AI_PASSED');
  });

  it('sends review cases to an administrator', () => {
    assert.equal(
      resolveAiStatus({ ocrPassed: true, livenessPassed: true, faceDecision: 'REVIEW_REQUIRED' }),
      'AI_REVIEW_REQUIRED'
    );
    assert.equal(
      resolveAiStatus({ ocrPassed: true, livenessPassed: true, faceDecision: 'NOT_MATCH' }),
      'AI_REVIEW_REQUIRED'
    );
  });

  it('allows submission only after a passing or review result', () => {
    assert.equal(canSubmitEkyc('AI_PASSED'), true);
    assert.equal(canSubmitEkyc('AI_REVIEW_REQUIRED'), true);
    assert.equal(canSubmitEkyc('AI_FAILED'), false);
    assert.equal(canSubmitEkyc('IN_PROGRESS'), false);
  });

  it('never exposes the face template', () => {
    const pub = toPublic({
      status: 'AI_PASSED',
      faceTemplate: [0.1, 0.2, 0.3],
      ocr: { idNumber: '012345678901', passed: true },
      liveness: { passed: true, centerImage: 'a/center.jpg' },
      faceMatch: { decision: 'MATCH', matched: true, distance: 0.2, threshold: 0.3 },
    });
    assert.equal(Object.hasOwn(pub, 'faceTemplate'), false);
    assert.equal(JSON.stringify(pub).includes('0.1'), false);
    assert.equal(pub.liveness.hasCenter, true);
    assert.equal(pub.liveness.centerImage, undefined);
  });

  it('keeps retake history without the embedding', () => {
    const archived = archiveAttempt({
      status: 'SUBMITTED',
      faceTemplate: [9, 9, 9],
      liveness: { passed: true, centerImage: 'user/center.jpg' },
      cardImages: { front: 'user/front.jpg', back: 'user/back.jpg' },
      faceMatch: { decision: 'MATCH', matched: true, distance: 0.1, threshold: 0.3 },
    });
    assert.equal(Object.hasOwn(archived, 'faceTemplate'), false);
    assert.equal(archived.liveness.centerImage, 'user/center.jpg');
    assert.equal(archived.cardImages.front, 'user/front.jpg');
  });
});

describe('eKYC private files', () => {
  it('recognizes jpeg png and webp', () => {
    assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])), 'image/jpeg');
    assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    assert.equal(sniffImage(webp), 'image/webp');
    assert.equal(sniffImage(Buffer.alloc(0)), null);
  });

  it('rejects paths that leave the private folder', () => {
    assert.throws(() => resolvePrivate('../uploads/secret.jpg'), ApiError);
    assert.throws(() => resolvePrivate(''), ApiError);
  });
});

describe('eKYC AI client', () => {
  it('calls the existing OCR endpoint with image urls and no internal token', async () => {
    const calls = [];
    const client = createEkycClient({
      baseUrl: 'http://ekyc.local',
      token: 'secret-token',
      timeoutMs: 1000,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, text: async () => JSON.stringify({ id_card_number: '012345678901' }) };
      },
    });
    const body = await client.verifyEkyc({
      frontImageUrl: 'http://files.local/front.jpg',
      backImageUrl: 'http://files.local/back.jpg',
    });
    assert.equal(calls[0].url, 'http://ekyc.local/api/v1/ai/verify-ekyc');
    assert.equal(calls[0].options.headers['X-Internal-Token'], undefined);
    assert.equal(body.id_card_number, '012345678901');
  });

  it('sends the internal token only to the new upload and portrait endpoints', async () => {
    const calls = [];
    const client = createEkycClient({
      baseUrl: 'http://ekyc.local',
      token: 'secret-token',
      timeoutMs: 1000,
      fetchImpl: async (url, options) => {
        calls.push({ url, token: options.headers['X-Internal-Token'] });
        return { ok: true, text: async () => JSON.stringify({ decision: 'MATCH', embedding: [1, 2, 3] }) };
      },
    });
    const image = { buffer: Buffer.from([0xff, 0xd8, 0xff]), mime: 'image/jpeg' };
    await client.verifyEkycUpload(image, image);
    await client.matchIdPortrait(image, image);
    await client.checkReadiness(image);
    assert.equal(calls[0].url, 'http://ekyc.local/api/v1/ai/verify-ekyc-upload');
    assert.equal(calls[0].token, 'secret-token');
    assert.equal(calls[1].url, 'http://ekyc.local/api/v1/face/match-id-portrait');
    assert.equal(calls[1].token, 'secret-token');
    assert.equal(calls[2].url, 'http://ekyc.local/api/v1/face/check-readiness');
    assert.equal(calls[2].token, undefined);
  });

  it('does not copy an embedding into a failed-request error', async () => {
    const client = createEkycClient({
      baseUrl: 'http://ekyc.local',
      token: 'secret-token',
      timeoutMs: 1000,
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ detail: 'bad image', embedding: [1, 2, 3] }),
      }),
    });
    await assert.rejects(
      () => client.checkReadiness({ buffer: Buffer.from([1]), mime: 'image/jpeg' }),
      (err) => err instanceof ApiError && err.message === 'bad image' && !String(err.message).includes('1,2')
    );
  });
});
