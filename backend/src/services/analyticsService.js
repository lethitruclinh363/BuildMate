const { ROLES } = require('../models/User');
const { userRepository } = require('../repositories/userRepository');
const { ORDER_STATUS } = require('../models/Order');
const { PAYMENT_STATUS } = require('../models/Payment');
const { COMMISSION_STATUS } = require('../models/Commission');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { Order, Payment, Commission, Review, Complaint } = require('../repositories/commerceAccess');

const TTL_MS = 60 * 1000;
let cache = { at: 0, data: null };

function invalidateAnalyticsCache() {
  cache = { at: 0, data: null };
}

async function computeAnalytics() {
  const [
    totalUsers,
    customerCount,
    contractorCount,
    adminCount,
    totalOrders,
    completedOrders,
    cancelledOrders,
    paidAgg,
    commissionAgg,
    reviewAgg,
    complaintsOpen,
    complaintsProcessing,
    complaintsResolved,
    complaintsRejected,
    complaintsTotal,
  ] = await Promise.all([
    userRepository.countAll(),
    userRepository.countByRole(ROLES.CUSTOMER),
    userRepository.countByRole(ROLES.CONTRACTOR),
    userRepository.countByRole(ROLES.ADMIN),
    Order.countDocuments(),
    Order.countDocuments({ status: ORDER_STATUS.CUSTOMER_ACCEPTED }),
    Order.countDocuments({ status: ORDER_STATUS.CANCELLED }),
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
  ]);

  const paid = paidAgg[0] || { revenue: 0, count: 0 };
  const commission = commissionAgg[0] || { platform: 0, contractor: 0, count: 0 };
  const reviews = reviewAgg[0] || { avg: 0, count: 0 };

  let materialGmv = 0;
  let materialCompleted = 0;
  try {
    const { MaterialOrder } = require('../repositories/materialOrderAccess');
    const materialRows = await MaterialOrder.find({
      status: { $in: ['COMPLETED', 'CUSTOMER_RECEIVED'] },
    }).select('totalAmount platformFeeAmount');
    materialCompleted = materialRows.length;
    materialGmv = materialRows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  } catch (_err) {
    materialGmv = 0;
  }

  const adminFinanceService = require('./adminFinanceService');
  const ledger = await adminFinanceService.buildLedger();

  return {
    users: {
      total: totalUsers,
      customer: customerCount,
      contractor: contractorCount,
      admin: adminCount,
    },
    orders: {
      total: totalOrders,
      completed: completedOrders,
      cancelled: cancelledOrders,
    },
    finance: {
      revenue: commission.platform,
      capturedDeposits: paid.revenue,
      paidCount: paid.count,
      commission: commission.platform,
      contractorEarning: commission.contractor,
      materialGmv: ledger.materialGmv,
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
  };
}

async function getAnalytics() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await computeAnalytics();
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getAnalytics, invalidateAnalyticsCache, computeAnalytics };
