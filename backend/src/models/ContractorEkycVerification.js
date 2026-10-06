const mongoose = require('mongoose');
const { EKYC_STATUS, FACE_DECISIONS, emptyOcr, toPublic } = require('../services/ekycStatus');

const ocrSchema = new mongoose.Schema(
  {
    idNumber: { type: String, default: '' },
    fullName: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    gender: { type: String, default: '' },
    hometown: { type: String, default: '' },
    passed: { type: Boolean, default: false },
    issues: { type: [String], default: [] },
  },
  { _id: false }
);

const livenessSchema = new mongoose.Schema(
  {
    passed: { type: Boolean, default: false },
    centerImage: { type: String, default: '' },
    leftImage: { type: String, default: '' },
    rightImage: { type: String, default: '' },
    upImage: { type: String, default: '' },
    downImage: { type: String, default: '' },
  },
  { _id: false }
);

const faceMatchSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: [...FACE_DECISIONS, ''], default: '' },
    matched: { type: Boolean, default: false },
    distance: { type: Number, default: null },
    threshold: { type: Number, default: null },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decision: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    status: { type: String, default: '' },
    ocr: { type: ocrSchema, default: () => emptyOcr() },
    liveness: { type: livenessSchema, default: () => ({}) },
    cardImages: {
      front: { type: String, default: '' },
      back: { type: String, default: '' },
    },
    faceMatch: { type: faceMatchSchema, default: null },
    adminReview: { type: reviewSchema, default: null },
    submittedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const contractorEkycSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    referenceCode: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(EKYC_STATUS),
      default: EKYC_STATUS.NOT_STARTED,
      index: true,
    },
    frontDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    backDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    cardImages: {
      front: { type: String, default: '' },
      back: { type: String, default: '' },
    },
    ocr: { type: ocrSchema, default: () => emptyOcr() },
    liveness: { type: livenessSchema, default: () => ({}) },
    faceMatch: { type: faceMatchSchema, default: null },
    faceTemplate: { type: [Number], default: undefined, select: false },
    submittedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    retakeReason: { type: String, default: '' },
    adminReview: { type: reviewSchema, default: null },
    attempts: { type: [attemptSchema], default: [] },
  },
  { timestamps: true }
);

contractorEkycSchema.methods.toPublic = function toPublicRecord() {
  return toPublic(this);
};

const ContractorEkycVerification = mongoose.model('ContractorEkycVerification', contractorEkycSchema);

module.exports = { ContractorEkycVerification, EKYC_STATUS };
