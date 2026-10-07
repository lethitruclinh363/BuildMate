

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const locationCorrectionSchema = new mongoose.Schema(
  {
    normalizedAddress: { type: String, required: true, unique: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    providerRefId: { type: String, default: '', index: true },
    confirmedCount: { type: Number, default: 0, min: 0 },
    lastConfirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

locationCorrectionSchema.index({ location: '2dsphere' });

const LocationCorrection = mongoose.model('LocationCorrection', locationCorrectionSchema);
  built = { LocationCorrection };
  return built;
}

module.exports = {
  get LocationCorrection() { return build().LocationCorrection; },
};
