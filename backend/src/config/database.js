/**
 * Kết nối cơ sở dữ liệu PostgreSQL qua Prisma ORM.
 *
 * File này quản lý vòng đời kết nối DB: kết nối khi startup và đóng kết nối an toàn khi shutdown.
 */
const { prisma } = require('./prisma');

async function connectDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  console.log('[db] PostgreSQL runtime connected');
}

async function disconnectDatabase() {
  await prisma.$disconnect().catch(() => {});
}

module.exports = { connectDatabase, disconnectDatabase };
