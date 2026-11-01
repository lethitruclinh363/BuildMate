const { ORDER_STATUS } = require('../models/Order');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { RepairRequest } = require('../repositories/conversationAccess');
const { COMMISSION_STATUS } = require('../models/Commission');
const { REVIEW_TARGET } = require('../models/Review');
const { Order, Commission, Review } = require('../repositories/commerceAccess');
const { OPEN_ORDER_STATUSES } = require('../utils/order.rules');

const RECENT_LIMIT = 5;
const MONTH_WINDOW = 6;

const READY_TO_START_STATUSES = [ORDER_STATUS.DEPOSIT_PAID];
const IN_PROGRESS_STATUSES = [ORDER_STATUS.STARTED, ORDER_STATUS.IN_PROGRESS];

function monthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildMonthBuckets(count = MONTH_WINDOW) {
  const buckets = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    buckets.push(monthKey(d));
  }
  return buckets;
}

function startOfCurrentMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Dashboard aggregates for the authenticated contractor only.
 * Uses counts + limited lists — never returns unbounded collections.
 */
async function getDashboardStats(contractorId) {
  const oid = String(contractorId);
  const months = buildMonthBuckets();
  const monthStart = startOfCurrentMonth();
  const windowStart = new Date(`${months[0]}-01T00:00:00.000Z`);

  const [
    pendingRequests,
    openOrders,
    inProgressOrders,
    monthNetAgg,
    avgRatingAgg,
    revenueAgg,
    ordersAgg,
    recentRequests,
    needsAssign,
  ] = await Promise.all([
    RepairRequest.countDocuments({ contractorId: oid, status: REQUEST_STATUS.PENDING }),
    Order.countDocuments({ contractorId: oid, status: { $in: OPEN_ORDER_STATUSES } }),
    Order.countDocuments({ contractorId: oid, status: { $in: IN_PROGRESS_STATUSES } }),
    Commission.aggregate([
      {
        $match: {
          contractorId: oid,
          status: COMMISSION_STATUS.POSTED,
          createdAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, net: { $sum: '$contractorAmount' } } },
    ]),
    Review.aggregate([
      {
        $match: {
          targetUserId: oid,
          targetType: REVIEW_TARGET.CONTRACTOR,
        },
      },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      {
        $match: {
          contractorId: oid,
          status: COMMISSION_STATUS.POSTED,
          createdAt: { $gte: windowStart },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          net: { $sum: '$contractorAmount' },
          gross: { $sum: { $add: ['$contractorAmount', '$platformAmount'] } },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          contractorId: oid,
          createdAt: { $gte: windowStart },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    RepairRequest.find({ contractorId: oid })
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .select('title status address category createdAt')
      .lean(),
    Order.find({ contractorId: oid, status: { $in: READY_TO_START_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .select('orderCode title status amount createdAt')
      .lean(),
  ]);

  const revenueMap = Object.fromEntries(
    revenueAgg.map((row) => {
      const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
      return [key, { net: row.net || 0, gross: row.gross || 0 }];
    })
  );
  const ordersMap = Object.fromEntries(
    ordersAgg.map((row) => {
      const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
      return [key, row.count || 0];
    })
  );

  const ratingRow = avgRatingAgg[0];
  const avgRating =
    ratingRow && ratingRow.count > 0 ? Math.round(ratingRow.avg * 10) / 10 : null;

  return {
    pendingRequests,
    openOrders,
    inProgressOrders,
    monthNetRevenue: monthNetAgg[0]?.net || 0,
    avgRating,
    revenueByMonth: months.map((month) => ({
      month,
      net: revenueMap[month]?.net || 0,
      gross: revenueMap[month]?.gross || 0,
    })),
    ordersByMonth: months.map((month) => ({
      month,
      count: ordersMap[month] || 0,
    })),
    recentRequests: recentRequests.map((row) => ({
      id: String(row._id),
      title: row.title,
      status: row.status,
      address: row.address || '',
      category: row.category,
      createdAt: row.createdAt,
    })),
    needsAssign: needsAssign.map((row) => ({
      id: String(row._id),
      orderCode: row.orderCode,
      title: row.title,
      status: row.status,
      amount: row.amount,
      createdAt: row.createdAt,
    })),
  };
}

module.exports = { getDashboardStats, RECENT_LIMIT, MONTH_WINDOW };
