const EKYC_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  AI_CHECKING: 'AI_CHECKING',
  AI_PASSED: 'AI_PASSED',
  AI_REVIEW_REQUIRED: 'AI_REVIEW_REQUIRED',
  AI_FAILED: 'AI_FAILED',
  SUBMITTED: 'SUBMITTED',
});

const FACE_DECISIONS = Object.freeze(['MATCH', 'REVIEW_REQUIRED', 'NOT_MATCH']);
const SUBMITTABLE = new Set([EKYC_STATUS.AI_PASSED, EKYC_STATUS.AI_REVIEW_REQUIRED]);

function resolveAiStatus({ ocrPassed, livenessPassed, faceDecision }) {
  if (!ocrPassed || !livenessPassed) return EKYC_STATUS.AI_FAILED;
  if (faceDecision === 'MATCH') return EKYC_STATUS.AI_PASSED;
  if (faceDecision === 'REVIEW_REQUIRED' || faceDecision === 'NOT_MATCH') {
    return EKYC_STATUS.AI_REVIEW_REQUIRED;
  }
  return EKYC_STATUS.AI_FAILED;
}

function canSubmitEkyc(status) {
  return SUBMITTABLE.has(status);
}

function emptyOcr() {
  return {
    idNumber: '',
    fullName: '',
    dateOfBirth: '',
    gender: '',
    hometown: '',
    passed: false,
    issues: [],
  };
}

function toPublic(doc) {
  const source = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  const ocr = source.ocr || {};
  const liveness = source.liveness || {};
  const faceMatch = source.faceMatch || null;
  return {
    id: source._id || source.id || null,
    contractorId: source.contractorId || null,
    userId: source.userId || null,
    referenceCode: source.referenceCode || '',
    status: source.status || EKYC_STATUS.NOT_STARTED,
    frontDocumentId: source.frontDocumentId || null,
    backDocumentId: source.backDocumentId || null,
    ocr: {
      idNumber: ocr.idNumber || '',
      fullName: ocr.fullName || '',
      dateOfBirth: ocr.dateOfBirth || '',
      gender: ocr.gender || '',
      hometown: ocr.hometown || '',
      passed: Boolean(ocr.passed),
      errors: Array.isArray(ocr.issues) ? ocr.issues : Array.isArray(ocr.errors) ? ocr.errors : [],
    },
    liveness: {
      passed: Boolean(liveness.passed),
      hasCenter: Boolean(liveness.centerImage),
      hasLeft: Boolean(liveness.leftImage),
      hasRight: Boolean(liveness.rightImage),
      hasUp: Boolean(liveness.upImage),
      hasDown: Boolean(liveness.downImage),
    },
    faceMatch: faceMatch && faceMatch.decision
      ? {
          decision: faceMatch.decision || '',
          matched: Boolean(faceMatch.matched),
          distance: faceMatch.distance ?? null,
          threshold: faceMatch.threshold ?? null,
        }
      : null,
    submittedAt: source.submittedAt || null,
    processedAt: source.processedAt || null,
    retakeReason: source.retakeReason || '',
    adminReview: source.adminReview
      ? {
          reviewedBy: source.adminReview.reviewedBy || null,
          reviewedAt: source.adminReview.reviewedAt || null,
          decision: source.adminReview.decision || '',
          note: source.adminReview.note || '',
        }
      : null,
    attemptCount: Array.isArray(source.attempts) ? source.attempts.length : 0,
  };
}

function archiveAttempt(doc) {
  const source = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  return {
    status: source.status || EKYC_STATUS.NOT_STARTED,
    ocr: source.ocr || emptyOcr(),
    liveness: {
      passed: Boolean(source.liveness?.passed),
      centerImage: source.liveness?.centerImage || '',
      leftImage: source.liveness?.leftImage || '',
      rightImage: source.liveness?.rightImage || '',
      upImage: source.liveness?.upImage || '',
      downImage: source.liveness?.downImage || '',
    },
    cardImages: {
      front: source.cardImages?.front || '',
      back: source.cardImages?.back || '',
    },
    faceMatch: source.faceMatch || null,
    adminReview: source.adminReview || null,
    submittedAt: source.submittedAt || null,
    processedAt: source.processedAt || null,
    archivedAt: new Date(),
  };
}

module.exports = {
  EKYC_STATUS,
  FACE_DECISIONS,
  resolveAiStatus,
  canSubmitEkyc,
  emptyOcr,
  toPublic,
  archiveAttempt,
};
