const { prisma } = require('../config/prisma');
const { scoreReputation } = require('./reputationScore');

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

async function forContractor(contractorLegacyId) {
  const user = await prisma.users.findFirst({
    where: { legacy_mongo_id: String(contractorLegacyId || '') },
    select: { id: true },
  });
  if (!user) return scoreReputation({});

  const [orders, reviews, complaints] = await Promise.all([
    prisma.service_orders.findMany({
      where: { contractor_user_id: user.id },
      select: {
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
      },
    }),
    prisma.reviews.findMany({
      where: { target_user_id: user.id, target_type: 'CONTRACTOR' },
      select: { service_order_id: true, rating: true, created_at: true },
    }),
    prisma.complaints.findMany({
      where: { against_user_id: user.id },
      select: { service_order_id: true, status: true, updated_at: true },
    }),
  ]);

  return scoreReputation({
    orders: orders.map(presentOrder),
    reviews: reviews.map((row) => ({
      orderId: String(row.service_order_id),
      rating: row.rating,
      createdAt: row.created_at,
    })),
    complaints: complaints.map((row) => ({
      orderId: String(row.service_order_id),
      status: row.status,
      updatedAt: row.updated_at,
    })),
  });
}

module.exports = { forContractor };
