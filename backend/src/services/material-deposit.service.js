const { ApiError } = require('../utils/ApiError');
const { emitToUser } = require('./socketService');
const { MockPaymentProvider } = require('../providers/MockPaymentProvider');
const { evaluateDepositCheckout, evaluateDepositCapture } = require('../utils/material-deposit.rules');
const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  materialCommissionSnapshot,
  assertMaterialStatusTransition,
} = require('../utils/material-order.rules');

const provider = new MockPaymentProvider();

function throwDecision(decision) {
  if (!decision.ok) throw new ApiError(decision.status, decision.message);
}

function present(doc) {
  if (!doc) return null;
  if (typeof doc.toPublic === 'function') return doc.toPublic();
  return {
    id: doc._id,
    orderCode: doc.orderCode,
    customerId: doc.customerId,
    storeId: doc.storeId,
    storeOwnerId: doc.storeOwnerId,
    materialOrderId: doc.materialOrderId,
    amount: doc.amount,
    platformFeeAmount: doc.platformFeeAmount ?? doc.platformAmount,
    storeDepositAmount: doc.storeDepositAmount ?? doc.storeAmount,
    depositAmount: doc.depositAmount,
    remainingAmount: doc.remainingAmount,
    materialSubtotal: doc.materialSubtotal,
    shippingFee: doc.shippingFee,
    totalAmount: doc.totalAmount,
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    transactionCode: doc.transactionCode,
    rateSnapshot: doc.rateSnapshot,
    platformAmount: doc.platformAmount,
    storeAmount: doc.storeAmount,
    paidAt: doc.paidAt || null,
  };
}

function createMaterialDepositService(deps) {
  async function replay(order, payment) {
    if (!payment || payment.status !== MATERIAL_PAYMENT_STATUS.PAID) {
      return {
        order: present(order),
        payment: present(payment),
        commission: null,
        duplicated: true,
      };
    }
    const ensured = await ensureCommission(payment, order);
    await notifyOnce(order, payment, ensured.created);
    return {
      order: present(order),
      payment: present(payment),
      commission: present(ensured.commission),
      duplicated: true,
    };
  }

  async function ensureCommission(payment, order) {
    const paymentId = payment._id;
    const existing = await deps.findCommission(paymentId);
    if (existing) return { commission: existing, created: false };
    const snapshot = materialCommissionSnapshot(order);
    try {
      return await deps.insertCommission({
        materialOrderPaymentId: paymentId,
        materialOrderId: order._id,
        storeOwnerId: order.storeOwnerId,
        rateSnapshot: snapshot.rateSnapshot,
        platformAmount: snapshot.platformAmount,
        storeAmount: snapshot.storeAmount,
        status: 'POSTED',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const again = await deps.findCommission(paymentId);
        return { commission: again, created: false };
      }
      throw err;
    }
  }

  async function notifyOnce(order, payment, created) {
    if (!created) return;
    await deps.notifyStore({
      userId: order.storeOwnerId,
      title: 'Đơn vật liệu mới',
      message: `${order.orderCode} đã thanh toán cọc`,
      type: 'ORDER_CREATED',
      link: '/store/orders',
      meta: { materialOrderId: String(order._id), paymentId: String(payment._id) },
    });
  }

  async function checkout(user, orderId) {
    const order = await deps.findOrderById(orderId);
    const decision = evaluateDepositCheckout(order, user.id);
    throwDecision(decision);

    if (decision.action === 'replay') {
      return replay(order, await deps.findDepositPayment(order._id));
    }

    let payment = await deps.findDepositPayment(order._id);
    if (!payment) {
      const inserted = await deps.insertDepositPayment({
        materialOrderId: order._id,
        customerId: order.customerId,
        storeOwnerId: order.storeOwnerId,
        amount: order.depositAmount,
        platformFeeAmount: order.platformFeeAmount,
        storeDepositAmount: order.storeDepositAmount,
        status: MATERIAL_PAYMENT_STATUS.UNPAID,
        provider: 'mock',
        metadata: {},
      });
      payment = inserted.payment;
    }

    if (payment.status === MATERIAL_PAYMENT_STATUS.PAID) {
      return replay(order, payment);
    }
    if (payment.status === MATERIAL_PAYMENT_STATUS.PENDING) {
      const fresh = await deps.findOrderById(order._id);
      return { ...await replay(fresh, payment), checkout: payment.metadata || null };
    }

    const session = provider.createCheckout(payment);
    const pending = await deps.compareAndSetPayment(payment._id, payment.status, {
      $set: {
        status: MATERIAL_PAYMENT_STATUS.PENDING,
        provider: 'mock',
        transactionCode: session.transactionCode,
        metadata: { ...(payment.metadata || {}), providerRef: session.providerRef, method: 'MOCK' },
      },
    });
    const currentPayment = pending || (await deps.findDepositPayment(order._id));
    if (pending) {
      await deps.compareAndSetOrder(order._id, MATERIAL_ORDER_STATUS.PENDING_PAYMENT, {
        $set: { paymentStatus: MATERIAL_PAYMENT_STATUS.PENDING },
      });
    }
    const freshOrder = await deps.findOrderById(order._id);
    return {
      order: present(freshOrder),
      payment: present(currentPayment),
      commission: null,
      checkout: session,
      duplicated: !pending,
    };
  }

  async function capture(user, orderId) {
    const prod = deps.isProd ? deps.isProd() : require('../config/env').env.isProd;
    if (prod) throw new ApiError(404, 'Route not found');

    const order = await deps.findOrderById(orderId);
    const payment = order ? await deps.findDepositPayment(order._id) : null;
    const decision = evaluateDepositCapture(order, payment, user.id);
    throwDecision(decision);

    if (decision.action === 'replay') {
      const result = await replay(order, payment);
      return result;
    }

    assertMaterialStatusTransition(order.status, MATERIAL_ORDER_STATUS.DEPOSIT_PAID, MATERIAL_ACTOR.SYSTEM);

    const paid = await deps.compareAndSetPayment(payment._id, MATERIAL_PAYMENT_STATUS.PENDING, {
      $set: { status: MATERIAL_PAYMENT_STATUS.PAID, paidAt: new Date() },
    });
    if (!paid) {
      const current = await deps.findDepositPayment(order._id);
      const fresh = await deps.findOrderById(order._id);
      return replay(fresh, current);
    }

    const moved = await deps.compareAndSetOrder(order._id, MATERIAL_ORDER_STATUS.PENDING_PAYMENT, {
      $set: {
        status: MATERIAL_ORDER_STATUS.DEPOSIT_PAID,
        paymentStatus: MATERIAL_PAYMENT_STATUS.PAID,
      },
      $push: {
        statusHistory: {
          status: MATERIAL_ORDER_STATUS.DEPOSIT_PAID,
          actorId: user.id,
          actorRole: MATERIAL_ACTOR.SYSTEM,
          note: '',
          createdAt: new Date(),
        },
      },
    });

    if (!moved) {
      const latest = await deps.findOrderById(order._id);
      if (!latest || latest.status === MATERIAL_ORDER_STATUS.CANCELLED) {
        await deps.compareAndSetPayment(paid._id, MATERIAL_PAYMENT_STATUS.PAID, {
          $set: { status: MATERIAL_PAYMENT_STATUS.PENDING, paidAt: null },
        });
        throw new ApiError(409, 'Cancelled orders cannot be paid');
      }
      return replay(latest, paid);
    }

    const ensured = await ensureCommission(paid, moved);
    await notifyOnce(moved, paid, ensured.created);
    const live = {
      orderId: String(moved._id),
      status: moved.status,
      orderCode: moved.orderCode,
    };
    emitToUser(moved.customerId, 'material_order_updated', live);
    emitToUser(moved.storeOwnerId, 'material_order_updated', live);
    return {
      order: present(moved),
      payment: present(paid),
      commission: present(ensured.commission),
      duplicated: false,
    };
  }

  return { checkout, capture };
}

function repositoryDeps() {
  const { MaterialOrder, MaterialOrderPayment, MaterialCommission } = require('../repositories/materialOrderAccess');
  const { notify, NOTIFICATION_TYPE } = require('./notificationService');

  return {
    findOrderById: (id) => MaterialOrder.findById(id),
    compareAndSetOrder: (id, fromStatus, update) =>
      MaterialOrder.findOneAndUpdate({ _id: id, status: fromStatus }, update, { new: true }),
    findDepositPayment: (orderId) => MaterialOrderPayment.findOne({ materialOrderId: orderId }),
    insertDepositPayment: async (doc) => {
      try {
        const payment = await MaterialOrderPayment.create(doc);
        return { payment, created: true };
      } catch (err) {
        if (err && err.code === 11000) {
          const payment = await MaterialOrderPayment.findOne({ materialOrderId: doc.materialOrderId });
          return { payment, created: false };
        }
        throw err;
      }
    },
    compareAndSetPayment: (id, fromStatus, update) =>
      MaterialOrderPayment.findOneAndUpdate({ _id: id, status: fromStatus }, update, { new: true }),
    findCommission: (paymentId) => MaterialCommission.findOne({ materialOrderPaymentId: paymentId }),
    insertCommission: async (doc) => {
      try {
        const commission = await MaterialCommission.create(doc);
        return { commission, created: true };
      } catch (err) {
        if (err && err.code === 11000) {
          const commission = await MaterialCommission.findOne({ materialOrderPaymentId: doc.materialOrderPaymentId });
          return { commission, created: false };
        }
        throw err;
      }
    },
    notifyStore: (payload) => notify({ ...payload, type: payload.type || NOTIFICATION_TYPE.ORDER_CREATED }),
  };
}

const depositApi = createMaterialDepositService(repositoryDeps());
const { runInTransaction } = require('../repositories/pgContext');

function transactional(work) {
  return runInTransaction(() => work());
}

module.exports = {
  createMaterialDepositService,
  checkout: (user, orderId) => transactional(() => depositApi.checkout(user, orderId)),
  capture: (user, orderId) => transactional(() => depositApi.capture(user, orderId)),
};
