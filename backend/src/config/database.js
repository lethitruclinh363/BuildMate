/**
 * Kết nối MongoDB (Mongoose).
 *
 * Luồng Sprint 1:
 *   Route → Controller → Service → Repository → Model → Database
 *
 * File này chỉ lo "mở cửa" vào DB. Không chứa business logic.
 */
const { env } = require('./env');

async function connectDatabase() {
  if (env.databaseProvider === 'postgres') {
    const { prisma } = require('./prisma');
    await prisma.$queryRaw`SELECT 1`;
    console.log('[db] PostgreSQL runtime enabled');
    return;
  }

  const mongoose = require('mongoose');
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    autoIndex: !env.isProd,
  });
  const { ensurePaymentIndexes } = require('../models/Payment');
  await ensurePaymentIndexes();
  console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
}

async function disconnectDatabase() {
  if (env.databaseProvider === 'postgres') {
    const { prisma } = require('./prisma');
    await prisma.$disconnect().catch(() => {});
    return;
  }
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState) await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
