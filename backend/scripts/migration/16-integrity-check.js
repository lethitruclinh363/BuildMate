const { prisma } = require('../../src/config/prisma');

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0].count);
}

async function main() {
  const tables = await count(
    `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const legacyTables = (await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'legacy_mongo_id'
  `).map((row) => row.table_name);
  let duplicateLegacy = 0;
  for (const table of legacyTables) {
    duplicateLegacy += await count(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT legacy_mongo_id FROM public.${table}
         WHERE legacy_mongo_id IS NOT NULL
         GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
       ) d`
    );
  }
  const invalidRole = await count(`
    SELECT COUNT(*)::int AS count
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE r.code IS NULL OR r.code NOT IN ('ADMIN', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER')
  `);
  const invalidFk = await count(`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND NOT convalidated`);
  const monetary = await count(`
    SELECT COUNT(*)::int AS count
    FROM material_orders
    WHERE material_subtotal + shipping_fee <> total_amount
       OR deposit_amount + remaining_amount <> total_amount
       OR platform_fee_amount + store_deposit_amount <> deposit_amount
  `);
  const serviceMoney = await count(`
    SELECT COUNT(*)::int AS count
    FROM service_orders o
    JOIN quotations q ON q.id = o.quotation_id
    WHERE o.amount <> q.total_cost
  `);
  const orderPayment = await count(`
    SELECT COUNT(*)::int AS count
    FROM payments p
    JOIN service_orders o ON o.id = p.service_order_id
    WHERE p.customer_user_id <> o.customer_user_id
       OR p.contractor_user_id <> o.contractor_user_id
  `);
  const commission = await count(`
    SELECT COUNT(*)::int AS count
    FROM commissions c
    JOIN payments p ON p.id = c.payment_id
    WHERE c.service_order_id <> p.service_order_id
       OR c.contractor_user_id <> p.contractor_user_id
  `);
  const materialCommission = await count(`
    SELECT COUNT(*)::int AS count
    FROM material_commissions c
    JOIN material_order_payments p ON p.id = c.material_order_payment_id
    WHERE c.material_order_id <> p.material_order_id
  `);
  const nullAuditActors = await count(`SELECT COUNT(*)::int AS count FROM audit_logs WHERE actor_user_id IS NULL`);
  const fixtureUsers = await count(`SELECT COUNT(*)::int AS count FROM users WHERE email LIKE '%@buildmate.test'`);
  const report = {
    tables,
    duplicateLegacy,
    invalidRole,
    invalidFk,
    monetary: monetary + serviceMoney,
    orderPayment,
    commission: commission + materialCommission,
    nullAuditActors,
    fixtureUsers,
  };
  console.log(JSON.stringify(report));
  const pass = report.duplicateLegacy === 0
    && report.invalidRole === 0
    && report.invalidFk === 0
    && report.monetary === 0
    && report.orderPayment === 0
    && report.commission === 0;
  await prisma.$disconnect();
  if (!pass) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
