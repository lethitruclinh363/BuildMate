const { ORDER_STATUS } = require('../models/Order');
const { REVIEW_TARGET } = require('../models/Review');
const { STORE_TYPE } = require('../models/Store');
const { Order, Review } = require('../repositories/commerceAccess');
const { Store, findUsersByIds, findUsersByRole } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');

async function recomputeTargetRating(targetUserId, targetType) {
  const rows = await Review.find({ targetUserId, targetType });
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / count) * 10) / 10 : 0;
  if (targetType === REVIEW_TARGET.CONTRACTOR) {
    await Store.findOneAndUpdate({ contractorId: targetUserId }, { rating: avg, reviewCount: count });
  }
  if (targetType === REVIEW_TARGET.MATERIAL_STORE) {
    await Store.findOneAndUpdate(
      { contractorId: targetUserId },
      { materialRating: avg, materialReviewCount: count }
    );
  }
  return { average: avg, count };
}

const MATERIAL_STORE_TYPES = [STORE_TYPE.MATERIALS];

async function resolveReviewTarget(order, payload) {
  const targetUserId = payload.targetUserId;
  let targetType = payload.targetType;
  if (!targetType && String(targetUserId) === String(order.contractorId)) {
    targetType = REVIEW_TARGET.CONTRACTOR;
  }

  if (targetType === REVIEW_TARGET.CONTRACTOR) {
    if (String(targetUserId) !== String(order.contractorId)) {
      throw new ApiError(403, 'Target is not the contractor on this order');
    }
    return { targetUserId, targetType };
  }

  if (targetType === REVIEW_TARGET.MATERIAL_STORE) {
    if (!order.storeId) throw new ApiError(403, 'This order has no material store to review');
    const store = await Store.findById(order.storeId);
    if (!store || !MATERIAL_STORE_TYPES.includes(store.storeType)) {
      throw new ApiError(403, 'This order has no material store to review');
    }
    if (String(store.contractorId) === String(order.contractorId)) {
      throw new ApiError(403, 'This order has no material store to review');
    }
    if (String(targetUserId) !== String(store.contractorId)) {
      throw new ApiError(403, 'Target is not the material store on this order');
    }
    return { targetUserId, targetType };
  }

  throw new ApiError(400, 'Review target must be the contractor or the material store');
}

async function createReview(customerId, payload) {
  const order = await Order.findById(payload.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.customerId) !== String(customerId)) {
    throw new ApiError(403, 'Only the customer can review this order');
  }
  if (order.status !== ORDER_STATUS.CUSTOMER_ACCEPTED) {
    throw new ApiError(409, 'Reviews are allowed only after the order is completed');
  }

  const { targetUserId, targetType } = await resolveReviewTarget(order, payload);

  let review;
  try {
    review = await Review.create({
      orderId: order._id,
      customerId,
      targetUserId,
      targetType,
      rating: payload.rating,
      comment: payload.comment || '',
      images: payload.images || [],
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'You have already reviewed this party on the order');
    }
    throw err;
  }

  await recomputeTargetRating(targetUserId, targetType);

  await notify({
    userId: targetUserId,
    title: 'New review',
    message: `${payload.rating}/5 · ${order.title}`,
    type: NOTIFICATION_TYPE.NEW_REVIEW,
    link: targetType === REVIEW_TARGET.MATERIAL_STORE ? '/store/reviews' : '/contractor/reviews',
    meta: { orderId: String(order._id), reviewId: String(review._id) },
  });

  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.REVIEW_CREATED,
    entityType: 'Review',
    entityId: review._id,
    meta: { orderId: String(order._id), rating: payload.rating, targetType },
  });

  return review.toPublic();
}

function distributionOf(rows) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    const star = Number(row.rating);
    if (distribution[star] != null) distribution[star] += 1;
  }
  return distribution;
}

function reviewSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.length;
  const average = count
    ? Math.round((list.reduce((sum, row) => sum + Number(row.rating), 0) / count) * 10) / 10
    : 0;
  return { average, count, distribution: distributionOf(list) };
}

function pageReviews(rows, options = {}) {
  const rating = Number(options.rating);
  const source = Array.isArray(rows) ? rows : [];
  const filtered = Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? source.filter((row) => Number(row.rating) === rating)
    : [...source];
  const oldest = options.sort === 'oldest';
  const ordered = [...filtered].sort((left, right) => {
    const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return oldest ? delta : -delta;
  });
  const pageSize = Math.min(50, Math.max(1, Number(options.pageSize) || 10));
  const total = ordered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(options.page) || 1));
  return {
    total,
    page,
    pageSize,
    items: ordered.slice((page - 1) * pageSize, page * pageSize),
  };
}

async function presentReviews(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const [people, orders] = await Promise.all([
    findUsersByIds(list.map((row) => row.customerId)),
    Order.find({ _id: { $in: list.map((row) => row.orderId) } }),
  ]);
  const byId = new Map(people.map((person) => [String(person._id), person]));
  const byOrder = new Map(orders.map((order) => [String(order._id), order.toPublic ? order.toPublic() : order]));
  return list.map((row) => {
    const customer = byId.get(String(row.customerId));
    const order = byOrder.get(String(row.orderId));
    return {
      ...row.toPublic(),
      customerName: customer?.name || '',
      customerAvatar: customer?.avatar || '',
      jobTitle: order?.title || '',
      orderCode: order?.orderCode || row.orderCode || '',
      orderStatus: order?.status || row.orderStatus || '',
      materialOrderId: row.materialOrderId || '',
    };
  });
}

async function listForUser(targetUserId, targetType) {
  const query = { targetUserId };
  if (targetType && Object.values(REVIEW_TARGET).includes(targetType)) {
    query.targetType = targetType;
  }
  const rows = await Review.find(query).sort({ createdAt: -1 });
  return {
    ...reviewSummary(rows),
    items: await presentReviews(rows),
  };
}

async function listTargetReviews(targetUserId, targetType, options = {}) {
  const rows = await Review.find({ targetUserId, targetType });
  const page = pageReviews(rows, options);
  return {
    ...reviewSummary(rows),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    items: await presentReviews(page.items),
  };
}

async function listContractorReviews(contractorId, options = {}) {
  return listTargetReviews(contractorId, REVIEW_TARGET.CONTRACTOR, options);
}

async function listStoreReviews(storeOwnerId, options = {}) {
  return listTargetReviews(storeOwnerId, REVIEW_TARGET.MATERIAL_STORE, options);
}

const RECEIVED_MATERIAL_STATUSES = new Set(['CUSTOMER_RECEIVED', 'COMPLETED']);

function assertMaterialStoreReview(order, customerId) {
  if (!order) throw new ApiError(404, 'Material order not found');
  if (String(order.customerId) !== String(customerId)) {
    throw new ApiError(403, 'Only the customer can review this order');
  }
  if (String(order.storeOwnerId) === String(customerId)) {
    throw new ApiError(403, 'You cannot review your own store');
  }
  if (!RECEIVED_MATERIAL_STATUSES.has(order.status)) {
    throw new ApiError(409, 'Reviews are allowed only after the material order is received');
  }
}

async function createMaterialStoreReview(customerId, payload) {
  const { MaterialOrder } = require('../repositories/materialOrderAccess');
  const order = await MaterialOrder.findById(payload.materialOrderId);
  assertMaterialStoreReview(order, customerId);

  let review;
  try {
    review = await Review.create({
      materialOrderId: order._id,
      customerId,
      targetUserId: order.storeOwnerId,
      targetType: REVIEW_TARGET.MATERIAL_STORE,
      rating: payload.rating,
      comment: payload.comment || '',
      images: [],
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'You have already reviewed this store on the order');
    }
    throw err;
  }

  await recomputeTargetRating(order.storeOwnerId, REVIEW_TARGET.MATERIAL_STORE);
  await notify({
    userId: order.storeOwnerId,
    title: 'New review',
    message: `${payload.rating}/5 · ${order.orderCode || ''}`,
    type: NOTIFICATION_TYPE.NEW_REVIEW,
    link: '/store/reviews',
    meta: { materialOrderId: String(order._id), reviewId: String(review._id) },
  });
  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.REVIEW_CREATED,
    entityType: 'Review',
    entityId: review._id,
    meta: { materialOrderId: String(order._id), rating: payload.rating, targetType: REVIEW_TARGET.MATERIAL_STORE },
  });
  review.orderCode = order.orderCode || '';
  review.orderStatus = order.status || '';
  const [presented] = await presentReviews([review]);
  return presented;
}

async function ownContractorReview(contractorId, reviewId) {
  const review = await Review.findById(reviewId);
  if (!review || String(review.targetUserId) !== String(contractorId)) {
    throw new ApiError(404, 'Review not found');
  }
  if (review.targetType !== REVIEW_TARGET.CONTRACTOR && review.targetType !== REVIEW_TARGET.MATERIAL_STORE) {
    throw new ApiError(404, 'Review not found');
  }
  return review;
}

async function replyToReview(contractorId, reviewId, reply) {
  const review = await ownContractorReview(contractorId, reviewId);
  review.contractorReply = String(reply || '').trim();
  review.repliedAt = new Date();
  await review.save();
  return review.toPublic();
}

async function reportReview(contractorId, reviewId, reason) {
  const review = await ownContractorReview(contractorId, reviewId);
  if (review.reportedAt) throw new ApiError(409, 'This review was already reported');
  review.reportedAt = new Date();
  review.reportReason = String(reason || '').trim();
  await review.save();
  const admins = await findUsersByRole('ADMIN');
  await Promise.all(admins.map((admin) => notify({
    userId: admin._id,
    title: 'Review reported',
    message: review.reportReason.slice(0, 400),
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: '/partners/contractors',
    meta: { reviewId: String(review._id), contractorId: String(contractorId), kind: 'review-report' },
  })));
  await writeAudit({
    actorId: contractorId,
    actorRole: review.targetType === REVIEW_TARGET.MATERIAL_STORE ? 'MATERIAL_STORE_OWNER' : 'CONTRACTOR',
    action: AUDIT_ACTION.REVIEW_REPORTED,
    entityType: 'Review',
    entityId: review._id,
    meta: { reason: review.reportReason },
  });
  return { reported: true };
}

module.exports = {
  createReview,
  listForUser,
  listContractorReviews,
  listStoreReviews,
  createMaterialStoreReview,
  assertMaterialStoreReview,
  reviewSummary,
  pageReviews,
  recomputeTargetRating,
  replyToReview,
  reportReview,
};
