const { ROLES } = require('../models/User');
const { userRepository } = require('../repositories/userRepository');
const { ORDER_STATUS } = require('../models/Order');
const { PAYMENT_STATUS, PAYMENT_TYPE } = require('../models/Payment');
const { COMMISSION_STATUS } = require('../models/Commission');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { STORE_STATUS, STORE_TYPE } = require('../models/Store');
const { Order, Payment, Commission, Review, Complaint } = require('../repositories/commerceAccess');
const { Store } = require('../repositories/partnerAccess');
const { roundVnd } = require('../utils/contractor-finance');
const { buildAdminSeries } = require('../utils/admin-analytics-series');

const TTL_MS = 60 * 1000;
let cache = { at: 0, data: null };

function invalidateAnalyticsCache() {
  cache = { at: 0, data: null };
}

function idOf(row) {
  return String(row?._id || row?.id || '');
}

async function countLiveStores(storeType) {
  try {
    return await Store.countDocuments({
      status: STORE_STATUS.LIVE,
      storeType: { $in: storeType },
    });
  } catch (_err) {
    return 0;
  }
}

async function computeAnalytics() {
  const [
    totalUsers,
    customerCount,
    contractorCount,
    storeOwnerCount,
    adminCount,
    customers,
    contractors,
    allOrders,
    deposits,
    postedCommissions,
    paidAgg,
    commissionAgg,
    reviewAgg,
    complaintsOpen,
    complaintsProcessing,
    complaintsResolved,
    complaintsRejected,
    complaintsTotal,
    liveContractorStores,
    liveMaterialStores,
  ] = await Promise.all([
    userRepository.countAll(),
    userRepository.countByRole(ROLES.CUSTOMER),
    userRepository.countByRole(ROLES.CONTRACTOR),
    userRepository.countByRole(ROLES.MATERIAL_STORE_OWNER),
    userRepository.countByRole(ROLES.ADMIN),
    userRepository.listByRole(ROLES.CUSTOMER),
    userRepository.listByRole(ROLES.CONTRACTOR),
    Order.find({}),
    Payment.find({ type: PAYMENT_TYPE.DEPOSIT }),
    Commission.find({ status: COMMISSION_STATUS.POSTED }),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.PAID } },
      { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match: { status: COMMISSION_STATUS.POSTED } },
      {
        $group: {
          _id: null,
          platform: { $sum: '$platformAmount' },
          contractor: { $sum: '$contractorAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
    Complaint.countDocuments({ status: COMPLAINT_STATUS.OPEN }),
    Complaint.countDocuments({ status: COMPLAINT_STATUS.PROCESSING }),
    Complaint.countDocuments({ status: COMPLAINT_STATUS.RESOLVED }),
    Complaint.countDocuments({ status: COMPLAINT_STATUS.REJECTED }),
    Complaint.countDocuments(),
    countLiveStores([STORE_TYPE.SERVICES, STORE_TYPE.BOTH]),
    countLiveStores([STORE_TYPE.MATERIALS, STORE_TYPE.BOTH]),
  ]);

  const paid = paidAgg[0] || { revenue: 0, count: 0 };
  const commission = commissionAgg[0] || { platform: 0, contractor: 0, count: 0 };
  const reviews = reviewAgg[0] || { avg: 0, count: 0 };

  const totalOrders = allOrders.length;
  const completedOrders = allOrders.filter((row) => row.status === ORDER_STATUS.CUSTOMER_ACCEPTED).length;
  const cancelledOrders = allOrders.filter((row) => row.status === ORDER_STATUS.CANCELLED).length;
  const byStatus = {};
  for (const row of allOrders) {
    const status = String(row.status || 'UNKNOWN');
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const adminFinanceService = require('./adminFinanceService');
  const escrowService = require('./escrowService');
  const ledger = await adminFinanceService.buildLedger();

  const orderById = new Map(allOrders.map((order) => [idOf(order), order]));
  const quotedOrders = new Set();
  const gmvEvents = [];
  const depositEvents = [];
  for (const payment of deposits) {
    const orderId = String(payment.orderId);
    const order = orderById.get(orderId);
    const { finance } = escrowService.financeOf(payment);
    if (order && order.status !== ORDER_STATUS.CANCELLED && !quotedOrders.has(orderId)) {
      quotedOrders.add(orderId);
      gmvEvents.push({
        at: payment.createdAt || order.createdAt,
        amount: roundVnd(finance.totalAmount),
      });
    }
    if (payment.status === PAYMENT_STATUS.PAID || payment.status === PAYMENT_STATUS.REFUNDED) {
      depositEvents.push({
        at: payment.createdAt,
        amount: roundVnd(payment.amount || finance.depositAmount),
      });
    }
  }

  const materialCompleted = 0;
  const gmv = roundVnd(ledger.acceptedQuoteTotal || 0);
  const series = buildAdminSeries(new Date(), {
    orders: allOrders,
    gmvEvents,
    depositEvents,
    commissionEvents: postedCommissions.map((row) => ({
      at: row.createdAt,
      platformAmount: roundVnd(row.platformAmount),
      contractorAmount: roundVnd(row.contractorAmount),
    })),
    customers,
    contractors,
  });

  return {
    users: {
      total: totalUsers,
      customer: customerCount,
      contractor: contractorCount,
      storeOwner: storeOwnerCount,
      admin: adminCount,
      liveContractor: liveContractorStores,
      liveStore: liveMaterialStores,
    },
    orders: {
      total: totalOrders,
      completed: completedOrders,
      cancelled: cancelledOrders,
      inProgress: Math.max(totalOrders - completedOrders - cancelledOrders, 0),
      materialTotal: 0,
      materialCompleted,
      byStatus,
    },
    finance: {
      revenue: commission.platform,
      gmv,
      capturedDeposits: paid.revenue,
      paidCount: paid.count,
      commission: commission.platform,
      contractorEarning: commission.contractor,
      materialGmv: 0,
      materialCompleted,
      materialPlatformRevenue: 0,
      ledger,
    },
    reviews: {
      total: reviews.count,
      average: reviews.count ? Math.round(reviews.avg * 10) / 10 : 0,
    },
    complaints: {
      total: complaintsTotal,
      open: complaintsOpen,
      processing: complaintsProcessing,
      resolved: complaintsResolved,
      rejected: complaintsRejected,
    },
    series,
  };
}

async function getAnalytics() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await computeAnalytics();
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getAnalytics, invalidateAnalyticsCache, computeAnalytics };
