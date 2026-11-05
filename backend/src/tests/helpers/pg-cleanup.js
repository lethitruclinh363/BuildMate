const {
  databaseName,
  isBlockedDatabaseName,
  requireIsolatedTestDatabase,
} = require('./database-safety');

function testDatabaseReady() {
  try {
    requireIsolatedTestDatabase();
    return process.env.BUILDMATE_TEST_DATABASE === 'isolated';
  } catch {
    return false;
  }
}

function assertTestDatabase() {
  const expected = requireIsolatedTestDatabase();
  if (process.env.BUILDMATE_TEST_DATABASE !== 'isolated') {
    throw new Error('Refusing to create or delete fixtures without an isolated TEST_DATABASE_URL');
  }
  const current = databaseName(process.env.DATABASE_URL || '');
  if (
    !current
    || current.toLowerCase() !== databaseName(expected).toLowerCase()
    || isBlockedDatabaseName(current)
  ) {
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
  const lists = await prisma.material_requirement_lists.findMany({
    where: {
      OR: [
        { customer_user_id: { in: userIds } },
        { contractor_user_id: { in: userIds } },
        ...(storeIds.length ? [{ store_id: { in: storeIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const listIds = lists.map((row) => row.id);
  if (listIds.length) {
    const quotes = await prisma.material_quotes.findMany({
      where: { list_id: { in: listIds } },
      select: { id: true },
    });
    const quoteIds = quotes.map((row) => row.id);
    if (quoteIds.length) {
      await prisma.material_quote_items.deleteMany({ where: { quote_id: { in: quoteIds } } });
      await prisma.material_quotes.deleteMany({ where: { id: { in: quoteIds } } });
    }
    await prisma.material_requirement_items.deleteMany({ where: { list_id: { in: listIds } } });
    await prisma.material_requirement_lists.deleteMany({ where: { id: { in: listIds } } });
  }
  await prisma.notifications.deleteMany({ where: { user_id: { in: userIds } } });
  if (storeIds.length) {
    await prisma.materials.deleteMany({ where: { store_id: { in: storeIds } } });
    await prisma.material_categories.deleteMany({
      where: { OR: [{ store_id: { in: storeIds } }, { owner_user_id: { in: userIds } }] },
    });
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
  await prisma.contractor_profiles.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
}

async function captureCommissionRules() {
  assertTestDatabase();
  const { prisma } = require('../../config/prisma');
  const rows = await prisma.commission_rules.findMany({ select: { id: true, is_active: true } });
  const maxId = rows.reduce((max, row) => (row.id > max ? row.id : max), 0n);
  return { rows, maxId };
}

async function restoreCommissionRules(snapshot) {
  if (!snapshot) return;
  assertTestDatabase();
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
