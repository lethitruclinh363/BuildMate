const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAiStatus, canSubmitEkyc, toPublic, archiveAttempt, ocrRequiredComplete, isValidCitizenDob, mapOcrResult, preflightOcrFields } = require('../services/ekycStatus');
const { createLivenessSession } = require('../services/ekycLivenessSession');
const { sniffImage, resolvePrivate } = require('../services/ekycStorage');
const { createEkycClient } = require('../services/ekycAiClient');
const { ApiError } = require('../utils/ApiError');

function readRepo(rel) {
  return fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf8');
}

describe('eKYC status', () => {
  it('OCR-05/06/07 rejects a final OCR result missing name, id or date of birth', () => {
    assert.deepEqual(
      preflightOcrFields(mapOcrResult({ id_card_number: '012345678901', full_name: '', date_of_birth: '01/01/1990', validation_passed: true })),
      ['MISSING_NAME']
    );
    assert.deepEqual(
      preflightOcrFields(mapOcrResult({ id_card_number: '123', full_name: 'NGUYEN VAN A', date_of_birth: '01/01/1990', validation_passed: true })),
      ['MISSING_ID']
    );
    assert.deepEqual(
      preflightOcrFields(mapOcrResult({ id_card_number: '012345678901', full_name: 'NGUYEN VAN A', date_of_birth: '31/02/1990', validation_passed: true })),
      ['MISSING_DOB']
    );
    assert.deepEqual(
      preflightOcrFields(mapOcrResult({
        id_card_number: '012345678901',
        full_name: 'NGUYEN VAN A',
        date_of_birth: '01/01/1990',
        validation_passed: true,
      })),
      []
    );
  });

  it('does not treat OCR as complete when required fields are empty or partial', () => {
    assert.equal(ocrRequiredComplete({ idNumber: '', fullName: 'NGUYEN VAN A', dateOfBirth: '01/01/1990' }), false);
    assert.equal(ocrRequiredComplete({ idNumber: '012345678901', fullName: '', dateOfBirth: '01/01/1990' }), false);
    assert.equal(ocrRequiredComplete({ idNumber: '012345678901', fullName: 'NGUYEN VAN A', dateOfBirth: '1990' }), false);
    assert.equal(ocrRequiredComplete({ idNumber: '012345678901', fullName: 'NGUYEN VAN A', dateOfBirth: '01/01/1990' }), true);
    assert.equal(isValidCitizenDob('31/02/1990'), false);
    assert.equal(isValidCitizenDob('00/01/1990'), false);
    assert.equal(ocrRequiredComplete({ idNumber: '012345678901', fullName: 'NGUYEN VAN A', dateOfBirth: '31/02/1990' }), false);
    assert.equal(ocrRequiredComplete({ idNumber: '012345678901', fullName: 'NGUYEN VAN A', dateOfBirth: '01/01/2099' }), false);
    const pub = toPublic({
      status: 'AI_PASSED',
      ocr: { idNumber: '', fullName: '', dateOfBirth: '', passed: true },
      liveness: { passed: true, centerImage: 'a/center.jpg' },
      faceMatch: { decision: 'MATCH', matched: true, distance: 0.2, threshold: 0.3 },
    });
    assert.equal(pub.ocr.passed, false);
    assert.equal(toPublic({ cardImages: { front: 'u/front.jpg', back: '' } }).hasFront, true);
    assert.equal(toPublic({ cardImages: { front: '', back: 'u/back.jpg' } }).hasBack, true);
    assert.equal(toPublic({ cardImages: { front: '', back: '' } }).hasFront, false);
  });

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
  it('calls the OCR endpoint with the internal token', async () => {
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
    assert.equal(calls[0].options.headers['X-Internal-Token'], 'secret-token');
    assert.equal(body.id_card_number, '012345678901');
  });

  it('sends the internal token to OCR, face, and portrait endpoints', async () => {
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
    await client.validateFrame({ frame: image, step: 'center' });
    await client.enroll({ selfie: image, left: image, right: image, up: image, down: image });
    assert.equal(calls[0].url, 'http://ekyc.local/api/v1/ai/verify-ekyc-upload');
    assert.equal(calls[0].token, 'secret-token');
    assert.equal(calls[1].url, 'http://ekyc.local/api/v1/face/match-id-portrait');
    assert.equal(calls[1].token, 'secret-token');
    assert.equal(calls[2].url, 'http://ekyc.local/api/v1/face/check-readiness');
    assert.equal(calls[2].token, 'secret-token');
    assert.equal(calls[3].url, 'http://ekyc.local/api/v1/face/validate-frame');
    assert.equal(calls[3].token, 'secret-token');
    assert.equal(calls[4].url, 'http://ekyc.local/api/v1/face/enroll');
    assert.equal(calls[4].token, 'secret-token');
    await client.verifyEkycUpload(image, null);
    assert.equal(calls[5].url, 'http://ekyc.local/api/v1/ai/verify-ekyc-upload');
    assert.equal(calls[5].token, 'secret-token');
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

describe('eKYC liveness session', () => {
  it('enforces pose order, rejects replay, and expires', () => {
    let ts = 1_000_000;
    const session = createLivenessSession({ ttlMs: 5_000, minGapMs: 10, now: () => ts });
    const frames = ['a', 'b', 'c', 'd', 'e'].map((value) => Buffer.from(value));
    assert.throws(() => session.assertStep('u1', 'left', frames[1]), ApiError);
    const first = session.assertStep('u1', 'center', frames[0]);
    session.markPassed('u1', first.digest);
    ts += 20;
    assert.throws(() => session.assertStep('u1', 'right', frames[2]), ApiError);
    const left = session.assertStep('u1', 'left', frames[1]);
    session.markPassed('u1', left.digest);
    ts += 20;
    assert.throws(() => session.assertStep('u1', 'right', frames[1]), (err) => (
      err instanceof ApiError && /Reuse of a previous frame/.test(err.message)
    ));
    const right = session.assertStep('u1', 'right', frames[2]);
    session.markPassed('u1', right.digest);
    ts += 20;
    const up = session.assertStep('u1', 'up', frames[3]);
    session.markPassed('u1', up.digest);
    ts += 20;
    const down = session.assertStep('u1', 'down', frames[4]);
    session.markPassed('u1', down.digest);
    session.assertCompleted('u1');
    ts += 6_000;
    assert.throws(() => session.assertCompleted('u1'), ApiError);
  });
});

describe('eKYC partner wiring', () => {
  it('opens contractor eKYC routes to material store owners', () => {
    const routes = readRepo('backend/src/routes/contractorRoutes.js');
    assert.match(routes, /authorize\(ROLES\.CONTRACTOR, ROLES\.MATERIAL_STORE_OWNER\)/);
    assert.match(routes, /router\.get\('\/ekyc'/);
  });

  it('requires submitted eKYC before a store owner can send the application', () => {
    const src = readRepo('backend/src/services/contractorService.js');
    assert.match(
      src,
      /user\?\.role === 'CONTRACTOR' \|\| user\?\.role === 'MATERIAL_STORE_OWNER'/
    );
    assert.match(src, /Complete identity verification before submitting/);
  });

  it('uses the six-step wizard for both partner roles', () => {
    const page = readRepo('frontend/src/pages/partner/PartnerOnboardingPage.tsx');
    assert.match(page, /id="onboard-ekyc"/);
    assert.doesNotMatch(page, /storeOwner \? \(\s*<>\s*<VerifySlot[\s\S]*CCCD_FRONT/);
    assert.match(page, /ekyc\?\.status === 'SUBMITTED'/);
    const wizard = readRepo('frontend/src/features/ekyc/ContractorEkycWizard.tsx');
    assert.match(wizard, /ocrReady\(record\)/);
    assert.match(wizard, /liveness\.passed/);
    assert.match(wizard, /faceMatch\?\.decision/);
    assert.match(wizard, /validDob/);
  });

  it('keeps the CCCD camera mounted and defers OCR until process', () => {
    const camera = readRepo('frontend/src/features/ekyc/EkycCamera.tsx');
    assert.match(camera, /<video/);
    assert.match(camera, /setCaptureIssue\(quality\)/);
    assert.match(camera, /canCapture = cameraState === 'ready' && !capturing && !busy && !shot && readable/);
    assert.match(camera, /inspectLiveVideo/);
    assert.match(camera, /isAcceptedImageFile/);
    assert.match(camera, /event\.target\.value = ''/);
    assert.doesNotMatch(camera, /stopStream\(streamRef\.current\);\s*[\s\S]{0,80}setCaptureIssue/);
    const quality = readRepo('frontend/src/features/ekyc/cardQuality.ts');
    assert.match(quality, /mode: 'upload'/);
    assert.match(quality, /createImageBitmap/);
    assert.match(quality, /imageOrientation/);
    const geometry = readRepo('frontend/src/features/ekyc/cardGeometry.ts');
    assert.match(geometry, /STABLE_FRAMES = 1/);
    const status = readRepo('backend/src/services/ekycStatus.js');
    assert.match(status, /hasFront/);
    const service = readRepo('backend/src/services/contractorEkycService.js');
    const saveCardFn = service.slice(service.indexOf('async function saveCard'), service.indexOf('async function checkReadiness'));
    const processFn = service.slice(service.indexOf('async function processVerification'), service.indexOf('async function restartAttempt'));
    assert.doesNotMatch(saveCardFn, /verifyEkycUpload/);
    assert.doesNotMatch(saveCardFn, /assertFrontReadable/);
    assert.match(processFn, /verifyEkycUpload/);
    assert.match(service, /async function restartAttempt/);
    assert.match(service, /saveIfCurrent/);
    const routes = readRepo('backend/src/routes/contractorRoutes.js');
    assert.match(routes, /\/ekyc\/restart/);
    const wizard = readRepo('frontend/src/features/ekyc/ContractorEkycWizard.tsx');
    assert.match(wizard, /restartWizard/);
    assert.match(wizard, /processGen/);
    const python = readRepo('ekyc-service/app/api/v1/endpoints/ekyc.py');
    assert.match(python, /back_image: Annotated\[UploadFile \| None/);
  });

  it('RESET-01/02 exposes a partner restart that clears previous document ids', () => {
    const service = readRepo('backend/src/services/contractorEkycService.js');
    assert.match(service, /record\.frontDocumentId = null/);
    assert.match(service, /record\.backDocumentId = null/);
    assert.match(service, /removeEkycImage/);
    assert.match(service, /Submitted identity verification cannot be restarted/);
    const api = readRepo('frontend/src/features/ekyc/ekyc.api.ts');
    assert.match(api, /\/contractor\/ekyc\/restart/);
  });

  it('restores onboarding and eKYC steps from sessionStorage keyed by user', () => {
    const nav = readRepo('frontend/src/features/ekyc/ekycNav.ts');
    assert.match(nav, /buildmate-partner-nav:/);
    assert.match(nav, /sessionStorage/);
    assert.match(nav, /clearPartnerNav/);
    const page = readRepo('frontend/src/pages/partner/PartnerOnboardingPage.tsx');
    assert.match(page, /restoreOnboardingStep/);
    assert.match(page, /setProfile\(next\)/);
    assert.match(page, /userId=\{currentUser\?\.id \|\| ''\}/);
  });

  it('does not keep hotel check-in copy in the partner wizard', () => {
    const vi = readRepo('frontend/src/locales/vi/ekyc.json');
    const en = readRepo('frontend/src/locales/en/ekyc.json');
    assert.equal(/FaceID|Hotel Check-in|check-in/i.test(vi), false);
    assert.equal(/FaceID|Hotel Check-in|check-in/i.test(en), false);
    const main = readRepo('ekyc-service/main.py');
    assert.equal(/FaceID|Spring Boot|check-in/i.test(main), false);
  });
});
