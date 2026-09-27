const mongoose = require('mongoose');
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
        delete ret.verificationCode;
        delete ret.verificationExpire;
        delete ret.resetPasswordToken;
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

userSchema.pre('validate', function syncName(next) {
  if (this.name && !this.fullName) this.fullName = this.name;
  if (this.fullName && !this.name) this.name = this.fullName;
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

module.exports = { User, ROLES, USER_STATUS };
