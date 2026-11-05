import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampEkycStep, ekycFloorStep, restoreEkycStep } from './ekycNav.ts';

function record(partial: Record<string, unknown> = {}) {
  return {
    id: '1',
    referenceCode: 'R',
    status: 'IN_PROGRESS',
    ocr: { idNumber: '', fullName: '', dateOfBirth: '', gender: '', hometown: '', passed: false, errors: [] },
    liveness: { passed: false, hasCenter: false, hasLeft: false, hasRight: false, hasUp: false, hasDown: false },
    faceMatch: null,
    submittedAt: null,
    processedAt: null,
    retakeReason: '',
    attemptCount: 0,
    frontDocumentId: null,
    backDocumentId: null,
    ...partial,
  } as Parameters<typeof restoreEkycStep>[0];
}

describe('restoreEkycStep', () => {
  it('keeps CCCD front when no document is saved', () => {
    assert.equal(restoreEkycStep(record(), 2), 2);
  });

  it('does not invent a later step from frontend state alone', () => {
    assert.equal(restoreEkycStep(record(), 4), 2);
    assert.equal(restoreEkycStep(null, 3), 1);
  });

  it('advances to back after a saved front document', () => {
    assert.equal(restoreEkycStep(record({ frontDocumentId: 'front-1' }), 2), 3);
  });

  it('restores liveness after both sides are saved and does not restore processing', () => {
    const both = record({ frontDocumentId: 'f', backDocumentId: 'b' });
    assert.equal(restoreEkycStep(both, 2), 4);
    assert.equal(restoreEkycStep(both, 5), 4);
    assert.equal(restoreEkycStep(both, 4), 4);
  });

  it('restores the result step from backend status', () => {
    assert.equal(restoreEkycStep(record({ status: 'AI_PASSED' }), 2), 6);
    assert.equal(ekycFloorStep(record({ status: 'SUBMITTED' })), 6);
  });

  it('maps a stale processing step away from 5', () => {
    assert.equal(clampEkycStep(5), 4);
    assert.equal(clampEkycStep(2), 2);
  });

  it('NAV-01 stays on the front step when backend has no card', () => {
    assert.equal(restoreEkycStep(record({ status: 'IN_PROGRESS' }), 2), 2);
  });

  it('NAV-02 restores the back step after a confirmed front even without a document id', () => {
    assert.equal(restoreEkycStep(record({ hasFront: true, status: 'IN_PROGRESS' }), 2), 3);
  });

  it('NAV-03 restores liveness after both sides are confirmed', () => {
    assert.equal(restoreEkycStep(record({ hasFront: true, hasBack: true, status: 'IN_PROGRESS' }), 3), 4);
  });

  it('RESET-01 after a restart does not keep a later stored step', () => {
    assert.equal(restoreEkycStep(record({ status: 'NOT_STARTED', hasFront: false, hasBack: false }), 6), 2);
    assert.equal(restoreEkycStep(record({ status: 'NOT_STARTED' }), 3), 2);
  });
});
