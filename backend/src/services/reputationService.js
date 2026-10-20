const { prisma } = require('../config/prisma');
const { scoreReputation, materialScoreInput } = require('./reputationScore');

function presentOrder(row) {
  return {
    id: String(row.id),
    status: row.status,
    customerId: String(row.customer_user_id),
    contractorId: String(row.contractor_user_id),
    cancelledBy: row.cancelled_by == null ? null : String(row.cancelled_by),
    cancelReason: row.cancel_reason || '',
    customerEmail: row.users_service_orders_customer_user_idTousers?.email || '',
    orderCode: row.order_code || '',
    title: row.title || '',
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    estimatedDays: row.quotations?.estimated_days,
  };
}

const contractorOrderSelect = {
  id: true,
  status: true,
  customer_user_id: true,
  contractor_user_id: true,
  cancelled_by: true,
  cancel_reason: true,
  order_code: true,
  title: true,
  created_at: true,
  completed_at: true,
  updated_at: true,
  quotations: { select: { estimated_days: true } },
  users_service_orders_customer_user_idTousers: { select: { email: true } },
};

async function loadContractorScore(ownerIds) {
  const ids = [...new Set(ownerIds.filter((id) => id != null))];
  if (!ids.length) return new Map();
  const [orders, reviews, complaints] = await Promise.all([
    prisma.service_orders.findMany({
      where: { contractor_user_id: { in: ids } },
      select: contractorOrderSelect,
    }),
    prisma.reviews.findMany({
      where: { target_user_id: { in: ids }, target_type: 'CONTRACTOR' },
      select: { target_user_id: true, service_order_id: true, rating: true, created_at: true },
    }),
    prisma.complaints.findMany({
      where: { against_user_id: { in: ids } },
      select: { against_user_id: true, service_order_id: true, status: true, updated_at: true },
    }),
  ]);
  const ordersByOwner = new Map();
  const reviewsByOwner = new Map();
  const complaintsByOwner = new Map();
  for (const row of orders) {
    const key = String(row.contractor_user_id);
    const list = ordersByOwner.get(key) || [];
    list.push(row);
    ordersByOwner.set(key, list);
  }
  for (const row of reviews) {
    const key = String(row.target_user_id);
    const list = reviewsByOwner.get(key) || [];
    list.push(row);
    reviewsByOwner.set(key, list);
  }
  for (const row of complaints) {
    const key = String(row.against_user_id);
    const list = complaintsByOwner.get(key) || [];
    list.push(row);
    complaintsByOwner.set(key, list);
  }
  const scores = new Map();
  for (const id of ids) {
    const key = String(id);
    scores.set(key, scoreReputation({
      orders: (ordersByOwner.get(key) || []).map(presentOrder),
      reviews: (reviewsByOwner.get(key) || []).map((row) => ({
        orderId: String(row.service_order_id),
        rating: row.rating,
        createdAt: row.created_at,
      })),
      complaints: (complaintsByOwner.get(key) || []).map((row) => ({
        orderId: String(row.service_order_id),
        status: row.status,
        updatedAt: row.updated_at,
      })),
    }));
  }
  return scores;
}

async function forContractor(contractorLegacyId) {
  const user = await prisma.users.findFirst({
    where: { legacy_mongo_id: String(contractorLegacyId || '') },
    select: { id: true },
  });
  if (!user) return scoreReputation({});
  const scores = await loadContractorScore([user.id]);
  return scores.get(String(user.id)) || scoreReputation({});
}

const materialOrderSelect = {
  id: true,
  order_code: true,
  customer_user_id: true,
  store_owner_user_id: true,
  payment_status: true,
  status: true,
  customer_note: true,
  created_at: true,
  updated_at: true,
  users_material_orders_customer_user_idTousers: { select: { email: true } },
  material_order_status_history: {
    select: { status: true, actor_role: true, note: true, created_at: true },
    orderBy: { created_at: 'asc' },
  },
};

async function loadMaterialScore(ownerIds) {
  const ids = [...new Set(ownerIds.filter((id) => id != null))];
  if (!ids.length) return new Map();
  const [orders, reviews] = await Promise.all([
    prisma.material_orders.findMany({
      where: { store_owner_user_id: { in: ids } },
      select: materialOrderSelect,
    }),
    prisma.reviews.findMany({
      where: { target_user_id: { in: ids }, target_type: 'MATERIAL_STORE' },
      select: { target_user_id: true, material_order_id: true, rating: true, created_at: true },
    }),
  ]);
  const ordersByOwner = new Map();
  const reviewsByOwner = new Map();
  for (const row of orders) {
    const key = String(row.store_owner_user_id);
    const list = ordersByOwner.get(key) || [];
    list.push(row);
    ordersByOwner.set(key, list);
  }
  for (const row of reviews) {
    const key = String(row.target_user_id);
    const list = reviewsByOwner.get(key) || [];
    list.push(row);
    reviewsByOwner.set(key, list);
  }
  const scores = new Map();
  for (const id of ids) {
    const key = String(id);
    scores.set(key, scoreReputation(materialScoreInput(ordersByOwner.get(key) || [], reviewsByOwner.get(key) || [])));
  }
  return scores;
}

async function forMaterialStore(ownerLegacyId) {
  const user = await prisma.users.findFirst({
    where: { legacy_mongo_id: String(ownerLegacyId || '') },
    select: { id: true },
  });
  if (!user) return scoreReputation({});
  const scores = await loadMaterialScore([user.id]);
  return scores.get(String(user.id)) || scoreReputation({});
}

async function scoresForMaterialOwners(ownerIds) {
  return loadMaterialScore(ownerIds);
}

async function scoresForContractorOwners(ownerIds) {
  return loadContractorScore(ownerIds);
}

module.exports = {
  forContractor,
  forMaterialStore,
  scoresForMaterialOwners,
  scoresForContractorOwners,
};
