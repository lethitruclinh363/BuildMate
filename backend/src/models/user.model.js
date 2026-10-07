const bcrypt = require('bcryptjs');

// Platform actors. ADMIN is seed-only.
const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  CONTRACTOR: 'CONTRACTOR',
  MATERIAL_STORE_OWNER: 'MATERIAL_STORE_OWNER',
  ADMIN: 'ADMIN',
});

const USER_STATUS = Object.freeze({
  PENDING_EMAIL: 'PENDING_EMAIL',
  ACTIVE: 'ACTIVE',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  // Legacy values still stored by seed / older documents
  INACTIVE: 'INACTIVE',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  BANNED: 'BANNED',
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROFILE_STATUS = Object.freeze({
  INCOMPLETE: 'INCOMPLETE',
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const userSchema = new mongoose.Schema(
  {
    // Display name. Older code used `name`; both fields stay in sync (see hooks).
    fullName: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    name: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [EMAIL_REGEX, 'Enter a valid email'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    acceptedPolicy: {
      type: Boolean,
      default: false,
    },
    acceptedPolicyVersion: {
      type: String,
      trim: true,
      default: '',
    },
    acceptedPolicyAt: {
      type: Date,
      default: null,
    },
    profileStatus: {
      type: String,
      enum: Object.values(PROFILE_STATUS),
      default: PROFILE_STATUS.INCOMPLETE,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    tokenVersion: { type: Number, default: 0, min: 0, select: false },
    avatar: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING_EMAIL,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: {
      type: String,
      select: false,
      default: '',
    },
    verificationAttempts: { type: Number, default: 0, min: 0, select: false },
    verificationSentAt: { type: Date, default: null, select: false },
    verificationExpire: {
      type: Date,
      select: false,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      select: false,
      default: '',
    },
    resetPasswordAttempts: { type: Number, default: 0, min: 0, select: false },
    resetPasswordSentAt: { type: Date, default: null, select: false },
    resetPasswordExpire: {
      type: Date,
      select: false,
      default: null,
    },
    refreshToken: {
      type: String,
      select: false,
      default: '',
    },
    preferredLanguage: {
      type: String,
      enum: ['vi', 'en'],
    },
    // Same GeoJSON shape as PLATFORM (nearby search later)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.tokenVersion;
        delete ret.verificationCode;
        delete ret.verificationAttempts;
        delete ret.verificationSentAt;
        delete ret.verificationExpire;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordAttempts;
        delete ret.resetPasswordSentAt;
        delete ret.resetPasswordExpire;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ role: 1, status: 1 });
userSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNumber: { $gt: '' } },
  }
);

function syncPhoneFields(target) {
  if (!target) return;
  const hasPhone = target.phoneNumber !== undefined || target.phone !== undefined;
  if (!hasPhone) return;
  const phoneValue = String(target.phoneNumber || target.phone || '').trim();
  if (!phoneValue) return;
  target.phoneNumber = phoneValue;
  target.phone = phoneValue;
}

userSchema.pre('validate', function syncName(next) {
  if (this.name && !this.fullName) this.fullName = this.name;
  if (this.fullName && !this.name) this.name = this.fullName;
  syncPhoneFields(this);
  if (!this.fullName) {
    return next(new Error('fullName is required'));
  }
  return next();
});

userSchema.pre('findOneAndUpdate', function syncNameOnUpdate(next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.name && !set.fullName) set.fullName = set.name;
  if (set.fullName && !set.name) set.name = set.fullName;
  syncPhoneFields(set);
  return next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  // Register hashes in AuthService; skip if this is already a bcrypt hash.
  if (typeof this.password === 'string' && this.password.startsWith('$2')) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  const displayName = this.fullName || this.name;
  return {
    id: this._id,
    fullName: displayName,
    name: displayName,
    email: this.email,
    phone: this.phone,
    phoneNumber: this.phoneNumber || this.phone || '',
    acceptedPolicy: Boolean(this.acceptedPolicy),
    acceptedPolicyVersion: this.acceptedPolicyVersion || '',
    acceptedPolicyAt: this.acceptedPolicyAt,
    profileStatus: this.profileStatus || PROFILE_STATUS.INCOMPLETE,
    avatar: this.avatar,
    role: this.role,
    status: this.status,
    emailVerified: this.emailVerified,
    preferredLanguage: this.preferredLanguage || undefined,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
  built = { User };
  return built;
}

module.exports = {
  ROLES,
  USER_STATUS,
  PROFILE_STATUS,
  get User() { return build().User; },
};
