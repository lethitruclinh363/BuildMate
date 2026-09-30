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
    return this.model.findOne({ email }).select('+password');
  }

  findByIdWithPassword(id) {
    return this.model.findById(id).select('+password');
  }

  findByEmailForVerify(email) {
    return this.model.findOne({ email }).select('+verificationCode +verificationExpire');
  }

  findByEmailForReset(email) {
    return this.model
      .findOne({ email })
      .select('+resetPasswordToken +resetPasswordExpire');
  }
}

const userRepository = new UserRepository();

module.exports = { UserRepository, userRepository };
