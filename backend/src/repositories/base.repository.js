/**
 * Lớp nền Repository — chỗ DUY NHẤT (theo kiến trúc) được gọi Mongoose.
 *
 * Service không viết User.findOne(...) trực tiếp.
 * Service gọi: userRepository.findByEmail(email)
 *
 * UserRepository kế thừa class này. Auth / User service gọi repository,
 * không gọi User.findOne(...) trực tiếp.
 *
 * Không nhét JWT, không nhét if/else nghiệp vụ vào đây.
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  findById(id) {
    return this.model.findById(id);
  }

  findOne(filter) {
    return this.model.findOne(filter);
  }

  find(filter = {}, options = {}) {
    const query = this.model.find(filter);
    if (options.sort) query.sort(options.sort);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    return query;
  }

  create(payload) {
    return this.model.create(payload);
  }

  updateById(id, updates) {
    return this.model.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
  }

  save(document) {
    return document.save();
  }

  deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }
}

module.exports = { BaseRepository };
