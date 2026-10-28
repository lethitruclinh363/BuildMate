const crypto = require('crypto');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { PAYMENT_TYPE } = require('../models/Payment');
const { Order, Payment, runInTransaction } = require('../repositories/commerceAccess');
const { ApiError } = require('../utils/ApiError');
const { MockPaymentProvider } = require('../providers/MockPaymentProvider');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const commissionService = require('./commissionService');
const escrowService = require('./escrowService');
const { orderStatusAfterDeposit } = require('../utils/order.rules');
const {
  recordDepositTerms,
  assertDepositTermsAccepted,
  DEPOSIT_TERMS_VERSION,
} = require('../utils/contractor-finance');
const { env } = require('../config/env');

const provider = new MockPaymentProvider();
const captureLocks = new Map();

async function withCaptureLock(paymentId, work) {
  const key = String(paymentId);
  const pending = captureLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      captureLocks.delete(key);
    });
  captureLocks.set(key, next);
  return next;
}

function rollupStatus(payments) {
  if (!payments.length) return PAYMENT_STATUS.UNPAID;
  if (payments.every((row) => row.status === PAYMENT_STATUS.REFUNDED)) return PAYMENT_STATUS.REFUNDED;
  if (payments.some((row) => row.status === PAYMENT_STATUS.PAID) && payments.every((row) => row.status === PAYMENT_STATUS.PAID || row.status === PAYMENT_STATUS.REFUNDED)) {
    const paid = payments.filter((row) => row.status === PAYMENT_STATUS.PAID).reduce((sum, row) => sum + row.amount, 0);
    const due = payments.reduce((sum, row) => sum + row.amount, 0);
    if (paid >= due) return PAYMENT_STATUS.PAID;
  }
  if (payments.some((row) => row.status === PAYMENT_STATUS.PENDING)) return PAYMENT_STATUS.PENDING;
  if (payments.some((row) => row.status === PAYMENT_STATUS.FAILED) && !payments.some((row) => row.status === PAYMENT_STATUS.PAID)) {
    return PAYMENT_STATUS.FAILED;
  }
  if (payments.some((row) => row.status === PAYMENT_STATUS.PAID)) return PAYMENT_STATUS.UNPAID;
  return PAYMENT_STATUS.UNPAID;
}

async function syncOrderPaymentStatus(orderId, tx) {
  const rows = await Payment.listByOrder(orderId, tx);
  const order = await Order.findById(orderId);
  if (!order) return null;
  order.paymentStatus = rollupStatus(rows);
  await order.save(tx);
  return order;
}

async function assertPaymentAccess(payment, user, { customerOnly = false } = {}) {
  if (!user) throw new ApiError(401, 'Authentication required');
  if (user.role === 'ADMIN') return;
  if (customerOnly) {
    if (String(payment.customerId) !== String(user.id)) {
      throw new ApiError(403, 'You cannot checkout this payment');
    }
    return;
  }
  const uid = String(user.id);
  if (uid === String(payment.customerId) || uid === String(payment.contractorId)) return;
  throw new ApiError(403, 'You cannot view this payment');
}

async function checkout(paymentId, user, { method = 'MOCK', termsAccepted, termsVersion } = {}) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  await assertPaymentAccess(payment, user, { customerOnly: true });

  const order = await Order.findById(payment.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new ApiError(409, 'Cancelled orders cannot be paid');
  }
  if (payment.type === PAYMENT_TYPE.FINAL_PAYMENT) {
    if (![ORDER_STATUS.COMPLETED, ORDER_STATUS.CUSTOMER_ACCEPTED].includes(order.status)) {
      throw new ApiError(409, 'Final payment is only allowed after the job is finished');
    }
  }

  if (payment.type === PAYMENT_TYPE.FULL_PAYMENT) {
    payment.amount = order.amount;
  }

  if (payment.status === PAYMENT_STATUS.PAID || payment.status === PAYMENT_STATUS.REFUNDED) {
    throw new ApiError(409, 'This payment is already closed');
  }
  if (payment.status === PAYMENT_STATUS.PENDING) {
    throw new ApiError(409, 'Checkout already in progress');
  }

  if (payment.type === PAYMENT_TYPE.DEPOSIT) {
    const already = assertDepositTermsAccepted(payment.metadata);
    if (!already.ok) {
      if (termsAccepted !== true || (termsVersion && termsVersion !== DEPOSIT_TERMS_VERSION)) {
        throw new ApiError(409, 'Accept the deposit terms before paying', { code: 'TERMS_NOT_ACCEPTED' });
      }
      payment.metadata = {
        ...(payment.metadata || {}),
        termsAcceptance: recordDepositTerms({ userId: user.id }),
      };
    }
  }

  const session = provider.createCheckout(payment);
  payment.status = PAYMENT_STATUS.PENDING;
  payment.provider = 'mock';
  payment.transactionCode = session.transactionCode;
  payment.metadata = {
    ...(payment.metadata || {}),
    method,
    providerRef: session.providerRef,
    nonce: crypto.randomBytes(4).toString('hex'),
  };
  await runInTransaction(async (tx) => {
    await payment.save(tx);
    await syncOrderPaymentStatus(order._id, tx);
  });

  await writeAudit({
    actorId: user.id,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.PAYMENT_CREATED,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { orderId: String(order._id), transactionCode: payment.transactionCode },
  });

  return { payment: payment.toPublic(), checkout: session };
}

async function markPaid(payment, actorId, actorRole = 'SYSTEM') {
  return withCaptureLock(payment._id, () => capturePaid(payment, actorId, actorRole));
}

async function capturePaid(incoming, actorId, actorRole = 'SYSTEM') {
  const payment = (await Payment.findById(incoming._id)) || incoming;
  if (payment.status === PAYMENT_STATUS.PAID) {
    if (payment.type === PAYMENT_TYPE.DEPOSIT) {
      return { payment: payment.toPublic(), commission: null, escrow: escrowService.financeOf(payment).escrow, duplicated: true };
    }
    const commission = await commissionService.createForPaidPayment(payment, actorId);
    return { payment: payment.toPublic(), commission: commission ? commission.toPublic() : null, duplicated: true };
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new ApiError(409, 'Payment must be PENDING before capture');
  }

  const captured = await runInTransaction(async (tx) => {
    payment.status = PAYMENT_STATUS.PAID;
    payment.paidAt = new Date();
    await payment.save(tx);
    const paidOrder = await syncOrderPaymentStatus(payment.orderId, tx);
    if (payment.type === PAYMENT_TYPE.DEPOSIT && paidOrder) {
      const next = orderStatusAfterDeposit(paidOrder.status);
      if (next !== paidOrder.status) {
        paidOrder.status = next;
        await paidOrder.save(tx);
      }
    }
    let commission = null;
    if (payment.type === PAYMENT_TYPE.DEPOSIT) {
      await escrowService.markDepositHeld(payment, tx);
    } else {
      commission = await commissionService.createForPaidPayment(payment, actorId, tx);
    }
    await notify({
      userId: payment.contractorId,
      title: payment.type === PAYMENT_TYPE.DEPOSIT ? 'Deposit held in escrow' : 'Payment received',
      message: payment.type === PAYMENT_TYPE.DEPOSIT
        ? `${payment.amount.toLocaleString('vi-VN')}đ is held by BuildMate (mock)`
        : `${payment.amount.toLocaleString('vi-VN')}đ captured`,
      type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
      link: '/contractor/orders',
      meta: { paymentId: String(payment._id), orderId: String(payment.orderId) },
    });
    await writeAudit({
      actorId,
      actorRole,
      action: AUDIT_ACTION.PAYMENT_PAID,
      entityType: 'Payment',
      entityId: payment._id,
      meta: { orderId: String(payment.orderId), amount: payment.amount },
    });
    return commission;
  });

  return {
    payment: payment.toPublic(),
    commission: captured && captured.toPublic ? captured.toPublic() : null,
    escrow: payment.type === PAYMENT_TYPE.DEPOSIT ? escrowService.financeOf(payment).escrow : null,
    duplicated: false,
  };
}

async function mockSuccess(paymentId, user) {
  if (env.isProd) throw new ApiError(404, 'Route not found');
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  await assertPaymentAccess(payment, user, { customerOnly: true });
  return markPaid(payment, user.id, 'CUSTOMER');
}

async function refund(paymentId, adminId, reason = '') {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new ApiError(409, 'Only PAID payments can be refunded');
  }
  if (payment.type === PAYMENT_TYPE.DEPOSIT) {
    const { CANCEL_CASE } = require('../utils/contractor-finance');
    const updated = await escrowService.refundDeposit(
      payment.orderId,
      adminId,
      reason || 'Admin mock refund',
      CANCEL_CASE.MUTUAL
    );
    return updated.toPublic ? updated.toPublic() : updated;
  }
  await runInTransaction(async (tx) => {
    payment.status = PAYMENT_STATUS.REFUNDED;
    payment.refundedAt = new Date();
    payment.metadata = { ...(payment.metadata || {}), refundReason: reason || 'Admin refund' };
    await payment.save(tx);
    await commissionService.reverseForPayment(payment._id, tx);
    await syncOrderPaymentStatus(payment.orderId, tx);
  });

  await notify({
    userId: payment.customerId,
    title: 'Payment refunded',
    message: `${payment.amount.toLocaleString('vi-VN')}đ refunded`,
    type: NOTIFICATION_TYPE.PAYMENT_FAILED,
    meta: { paymentId: String(payment._id), orderId: String(payment.orderId) },
  });

  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.PAYMENT_REFUNDED,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { reason, orderId: String(payment.orderId) },
  });

  return payment.toPublic();
}

async function listForOrder(orderId, user) {
  let order = await Order.findById(orderId);
  if (!order) {
    const { MaterialOrder } = require('../repositories/materialOrderAccess');
    const materialOrder = await MaterialOrder.findById(orderId);
    if (!materialOrder) throw new ApiError(404, 'Order not found');
    const uid = String(user.id);
    const allowed =
      user.role === 'ADMIN' || uid === String(materialOrder.customerId) || uid === String(materialOrder.storeOwnerId);
    if (!allowed) throw new ApiError(403, 'You cannot view these payments');
    const isPaid = Boolean(materialOrder.remainingSettledOffline);
    return {
      summary: {
        status: isPaid ? 'PAID' : 'UNPAID',
        amount: Number(materialOrder.totalAmount),
        paidAmount: isPaid ? Number(materialOrder.totalAmount) : 0,
        remainingAmount: isPaid ? 0 : Number(materialOrder.totalAmount),
        due: isPaid ? 0 : Number(materialOrder.totalAmount),
        depositAmount: 0,
        platformFee: 0,
        contractorHold: 0,
        escrowStatus: null,
        mock: false,
        paymentMethod: 'COD',
      },
      items: [
        {
          id: `cod-${materialOrder._id}`,
          orderId: String(materialOrder._id),
          type: 'COD',
          amount: Number(materialOrder.totalAmount),
          status: isPaid ? 'PAID' : 'UNPAID',
          transactionCode: 'COD-DIRECT',
          createdAt: materialOrder.createdAt,
        },
      ],
    };
  }
  const uid = String(user.id);
  const allowed =
    user.role === 'ADMIN' || uid === String(order.customerId) || uid === String(order.contractorId);
  if (!allowed) throw new ApiError(403, 'You cannot view these payments');

  const items = await Payment.find({ orderId: order._id }).sort({ createdAt: 1 });
  const paidAmount = items
    .filter((row) => row.status === PAYMENT_STATUS.PAID)
    .reduce((sum, row) => sum + row.amount, 0);
  const deposit = items.find((row) => row.type === PAYMENT_TYPE.DEPOSIT);
  const finance = deposit ? escrowService.financeOf(deposit).finance : null;
  const escrow = deposit ? escrowService.financeOf(deposit).escrow : null;
  const due = finance ? finance.depositAmount : items.reduce((sum, row) => sum + row.amount, 0);
  return {
    summary: {
      status: rollupStatus(items),
      amount: finance ? finance.totalAmount : order.amount,
      paidAmount,
      remainingAmount: finance ? finance.remainingAmount : Math.max(order.amount - paidAmount, 0),
      due,
      depositAmount: finance ? finance.depositAmount : null,
      platformFee: finance ? finance.platformFee : null,
      contractorHold: finance ? finance.contractorHold : null,
      escrowStatus: escrow ? escrow.status : null,
      mock: true,
    },
    items: items.map((row) => row.toPublic()),
  };
}

module.exports = { checkout, mockSuccess, refund, listForOrder, markPaid, syncOrderPaymentStatus };
