
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://buildmate_test:1A3BKsrO1X_nz4Qf@127.0.0.1:55432/BuilMate_test' } } });

async function main() {
  const users = await prisma.users.findMany({ select: { id: true, email: true, role: true, status: true }, take: 15 });
  console.log('Users found:', JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => prisma[" \]());
