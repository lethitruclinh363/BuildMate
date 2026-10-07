function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function testDatabaseReady() {
  if (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.PGHOST) return true;
  return false;
}

function assertTestDatabase() {
  if (!testDatabaseReady()) {
    throw new Error('PostgreSQL is not configured for tests');
  }
  if (process.env.BUILDMATE_TEST_DATABASE !== 'isolated') return;
  const current = databaseName(process.env.DATABASE_URL || '');
  const expected = databaseName(process.env.TEST_DATABASE_URL || '');
  const productionName = (process.env.PGDATABASE || 'BuilMate').toLowerCase();
  if (!current || current.toLowerCase() !== expected.toLowerCase() || current.toLowerCase() === 'builmate' || current.toLowerCase() === productionName) {
    throw new Error('Refusing to create or delete fixtures on production database BuilMate');
  }
}

function fixtureEmail(email) {
  return String(email || '').toLowerCase().endsWith('@buildmate.test');
}

async function deleteFixtureUsers(legacyIds) {
  assertTestDatabase();
  const ids = [...new Set((legacyIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (!ids.length) return;
  const { prisma } = require('../../config/prisma');
  const users = await prisma.users.findMany({
    where: {
      legacy_mongo_id: { in: ids },
      email: { endsWith: '@buildmate.test' },
    },
    select: { id: true },
  });
  const userIds = users.map((row) => row.id);
  if (!userIds.length) return;

  const orders = await prisma.service_orders.findMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
      ],
    },
    select: { id: true, location_id: true },
  });
  const orderIds = orders.map((row) => row.id);
  if (orderIds.length) {
    await prisma.complaints.deleteMany({ where: { service_order_id: { in: orderIds } } });
    await prisma.commissions.deleteMany({ where: { service_order_id: { in: orderIds } } });
    await prisma.service_orders.deleteMany({ where: { id: { in: orderIds } } });
  }

  const stores = await prisma.stores.findMany({
    where: { owner_user_id: { in: userIds } },
    select: { id: true, location_id: true },
  });
  const storeIds = stores.map((row) => row.id);
  if (storeIds.length) {
    await prisma.materials.deleteMany({ where: { store_id: { in: storeIds } } });
    await prisma.services.deleteMany({ where: { store_id: { in: storeIds } } });
    await prisma.stores.deleteMany({ where: { id: { in: storeIds } } });
  }

  await prisma.messages.deleteMany({ where: { sender_user_id: { in: userIds } } });
  await prisma.quotations.deleteMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
      ],
    },
  });
  await prisma.chat_rooms.deleteMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
      ],
    },
  });
  const requests = await prisma.repair_requests.findMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
      ],
    },
    select: { location_id: true },
  });
  await prisma.repair_requests.deleteMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
      ],
    },
  });
  const locationIds = [
    ...orders.map((row) => row.location_id),
    ...stores.map((row) => row.location_id),
    ...requests.map((row) => row.location_id),
  ].filter(Boolean);
  if (locationIds.length) {
    await prisma.locations.deleteMany({ where: { id: { in: locationIds } } }).catch(() => {});
  }
  await prisma.audit_logs.deleteMany({ where: { actor_user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
}

async function captureCommissionRules() {
  const { prisma } = require('../../config/prisma');
  const rows = await prisma.commission_rules.findMany({ select: { id: true, is_active: true } });
  const maxId = rows.reduce((max, row) => (row.id > max ? row.id : max), 0n);
  return { rows, maxId };
}

async function restoreCommissionRules(snapshot) {
  if (!snapshot) return;
  const { prisma } = require('../../config/prisma');
  await prisma.commission_rules.deleteMany({ where: { id: { gt: snapshot.maxId } } });
  for (const row of snapshot.rows) {
    await prisma.commission_rules.update({
      where: { id: row.id },
      data: { is_active: row.is_active },
    });
  }
}

module.exports = {
  assertTestDatabase,
  deleteFixtureUsers,
  testDatabaseReady,
  captureCommissionRules,
  restoreCommissionRules,
  fixtureEmail,
};
