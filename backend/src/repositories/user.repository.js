const { BaseRepository } = require('./base.repository');
const { User } = require('../models/user.model');

/**
 * Chỉ nói chuyện với collection `users`.
 * Không chứa OTP / JWT / kiểm tra role — những thứ đó ở Service.
 */
class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  findByEmail(email) {
    return this.findOne({ email });
  }

  findByPhone(phoneNumber) {
    const value = String(phoneNumber || '').trim();
    if (!value) return null;
    return this.findOne({
      $or: [{ phoneNumber: value }, { phone: value }],
    });
  }

  findByEmailWithPassword(email) {
    return this.model.findOne({ email }).select('+password +tokenVersion');
  }

  findByIdWithPassword(id) {
    return this.model.findById(id).select('+password +tokenVersion');
  }

  findByIdForAuth(id) {
    return this.model.findById(id).select('+tokenVersion');
  }

  incrementTokenVersion(id) {
    return this.model.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true }).select('+tokenVersion');
  }

  findByEmailForVerify(email) {
    return this.model
      .findOne({ email })
      .select('+verificationCode +verificationExpire +verificationAttempts +verificationSentAt');
  }

  findByEmailForReset(email) {
    return this.model
      .findOne({ email })
      .select('+resetPasswordToken +resetPasswordExpire +resetPasswordAttempts +resetPasswordSentAt');
  }

  issueVerificationOtp({ userId, codeHash, expiresAt, sentAt, cooldownBefore }) {
    return this.model.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { verificationSentAt: null },
          { verificationSentAt: { $lte: cooldownBefore } },
        ],
      },
      {
        $set: {
          verificationCode: codeHash,
          verificationExpire: expiresAt,
          verificationSentAt: sentAt,
          verificationAttempts: 0,
        },
      },
      { new: true }
    );
  }

  issueResetPasswordOtp({ userId, codeHash, expiresAt, sentAt, cooldownBefore }) {
    return this.model.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { resetPasswordSentAt: null },
          { resetPasswordSentAt: { $lte: cooldownBefore } },
        ],
      },
      {
        $set: {
          resetPasswordToken: codeHash,
          resetPasswordExpire: expiresAt,
          resetPasswordSentAt: sentAt,
          resetPasswordAttempts: 0,
        },
      },
      { new: true }
    );
  }

  incrementOtpAttempts({ userId, kind, codeHash, now, maxAttempts }) {
    const fields = kind === 'verification'
      ? { code: 'verificationCode', expiry: 'verificationExpire', attempts: 'verificationAttempts' }
      : { code: 'resetPasswordToken', expiry: 'resetPasswordExpire', attempts: 'resetPasswordAttempts' };

    return this.model.findOneAndUpdate(
      {
        _id: userId,
        [fields.code]: codeHash,
        [fields.expiry]: { $gt: now },
        $or: [
          { [fields.attempts]: { $lt: maxAttempts } },
          { [fields.attempts]: { $exists: false } },
        ],
      },
      { $inc: { [fields.attempts]: 1 } },
      { new: true }
    ).select(`+${fields.attempts}`);
  }

  consumeVerificationOtp({ userId, codeHash, now, maxAttempts, activeStatus }) {
    return this.model.findOneAndUpdate(
      {
        _id: userId,
        verificationCode: codeHash,
        verificationExpire: { $gt: now },
        $or: [
          { verificationAttempts: { $lt: maxAttempts } },
          { verificationAttempts: { $exists: false } },
        ],
      },
      {
        $set: {
          emailVerified: true,
          status: activeStatus,
          verificationCode: '',
          verificationExpire: null,
          verificationAttempts: 0,
        },
      },
      { new: true }
    );
  }

  consumeResetPasswordOtp({ userId, codeHash, now, maxAttempts }) {
    return this.model.findOneAndUpdate(
      {
        _id: userId,
        resetPasswordToken: codeHash,
        resetPasswordExpire: { $gt: now },
        $or: [
          { resetPasswordAttempts: { $lt: maxAttempts } },
          { resetPasswordAttempts: { $exists: false } },
        ],
      },
      {
        $set: {
          resetPasswordToken: '',
          resetPasswordExpire: null,
          resetPasswordAttempts: 0,
        },
      },
      { new: true }
    );
  }
}

const userRepository = new UserRepository();

module.exports = { UserRepository, userRepository };
