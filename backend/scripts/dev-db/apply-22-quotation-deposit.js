const { prisma } = require('../../src/config/prisma');

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE payments ADD COLUMN IF NOT EXISTS quotation_id BIGINT');
  await prisma.$executeRawUnsafe('ALTER TABLE payments ALTER COLUMN service_order_id DROP NOT NULL');
  await prisma.$executeRawUnsafe(`
    UPDATE payments p
    SET quotation_id = so.quotation_id
    FROM service_orders so
    WHERE p.service_order_id = so.id AND p.quotation_id IS NULL
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_quotation_type
    ON payments (quotation_id, payment_type)
    WHERE quotation_id IS NOT NULL
  `);
  console.log('quotation deposit payment columns ready');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
