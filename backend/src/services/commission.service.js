const { CommissionRule } = require('../models/CommissionRule');
const { Commission, COMMISSION_STATUS } = require('../models/Commission');
const { ApiError } = require('../utils/ApiError');
const { notify, NOTIFICATION_TYPE } = require('./notification.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');

function roundVnd(value) {
  return Math.round(Number(value) || 0);
}

async function getActiveRule() {
  let rule = await CommissionRule.findOne({ active: true }).sort({ createdAt: -1 });
  if (!rule) {
    rule = await CommissionRule.create({
      name: 'Default platform fee',
      percentage: 5,
      active: true,
    });
  }
  return rule;
}

async function setActivePercentage(percentage, name = 'Platform fee') {
  const rate = Number(percentage);
  if (!Number.isFinite(rate) || rate < 0 || rate > 30) {
    throw new ApiError(422, 'Commission percentage must be between 0 and 30');
  }
  await CommissionRule.updateMany({ active: true }, { active: false });
  const rule = await CommissionRule.create({
    name,
    percentage: rate,
    active: true,
  });
  return rule.toPublic();
}

async function createForPaidPayment(payment, actorId = null) {
  const existing = await Commission.findOne({ paymentId: payment._id });
  if (existing) return existing;

  const rule = await getActiveRule();
  const platformAmount = roundVnd((payment.amount * rule.percentage) / 100);
  const contractorAmount = payment.amount - platformAmount;

  let doc;
  try {
    doc = await Commission.create({
      paymentId: payment._id,
      orderId: payment.orderId,
      contractorId: payment.contractorId,
      rateSnapshot: rule.percentage,
      platformAmount,
      contractorAmount,
      status: COMMISSION_STATUS.POSTED,
    });
  } catch (err) {
    if (err.code === 11000) {
      return Commission.findOne({ paymentId: payment._id });
    }
    throw err;
  }

  await notify({
    userId: payment.contractorId,
    title: 'Commission posted',
    message: `Earning ${contractorAmount.toLocaleString('vi-VN')}đ after platform fee`,
    type: NOTIFICATION_TYPE.COMMISSION_CREATED,
    link: '/contractor/earnings',
    meta: { paymentId: String(payment._id), orderId: String(payment.orderId), commissionId: String(doc._id) },
  });

  await writeAudit({
    actorId,
    actorRole: 'SYSTEM',
    action: AUDIT_ACTION.COMMISSION_CREATED,
    entityType: 'Commission',
    entityId: doc._id,
    meta: { paymentId: String(payment._id), rateSnapshot: rule.percentage, platformAmount, contractorAmount },
  });

  return doc;
}

async function reverseForPayment(paymentId) {
  const row = await Commission.findOne({ paymentId });
  if (!row) return null;
  if (row.status === COMMISSION_STATUS.REVERSED) return row;
  row.status = COMMISSION_STATUS.REVERSED;
  await row.save();
  return row;
}

async function earningsForContractor(contractorId) {
  const rows = await Commission.find({ contractorId, status: COMMISSION_STATUS.POSTED }).sort({ createdAt: -1 });
  const totalCommission = rows.reduce((sum, row) => sum + row.platformAmount, 0);
  const netEarning = rows.reduce((sum, row) => sum + row.contractorAmount, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.platformAmount + row.contractorAmount, 0);
  return {
    totalRevenue,
    totalCommission,
    netEarning,
    transactions: rows.map((row) => row.toPublic()),
  };
}

module.exports = {
  getActiveRule,
  setActivePercentage,
  createForPaidPayment,
  reverseForPayment,
  earningsForContractor,
  COMMISSION_STATUS,
  roundVnd,
};
