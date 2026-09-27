/**
 * Kết nối MongoDB (Mongoose).
 *
 * Luồng Sprint 1:
 *   Route → Controller → Service → Repository → Model → Database
 *
 * File này chỉ lo "mở cửa" vào DB. Không chứa business logic.
 */
const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDatabase() {
  // Bỏ query filter kiểu Mongo cũ ($where, ...) để tránh lỗi ngầm.
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongoUri, {
    // Dev: tự tạo index. Prod: nên tạo index bằng script, không autoIndex mỗi lần start.
    autoIndex: !env.isProd,
  });

  // Index thanh toán đã có từ sprint tài chính — giữ nguyên, không đổi hành vi.
  const { ensurePaymentIndexes } = require('../models/Payment');
  await ensurePaymentIndexes();

  console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
}

mongoose.connection.on('error', (err) => {
  console.error('[db] Connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[db] Disconnected from MongoDB');
});

async function disconnectDatabase() {
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
