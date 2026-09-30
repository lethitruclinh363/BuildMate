const { Order, ORDER_STATUS } = require('../models/Order');
const { Review, REVIEW_TARGET } = require('../models/Review');
const { User } = require('../models/User');
const { Store, STORE_TYPE } = require('../models/Store');
const { ApiError } = require('../utils/ApiError');
const { notify, NOTIFICATION_TYPE } = require('./notification.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');

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

async function listForUser(targetUserId, targetType) {
  const query = { targetUserId };
  if (targetType && Object.values(REVIEW_TARGET).includes(targetType)) {
    query.targetType = targetType;
  }
  const rows = await Review.find(query).sort({ createdAt: -1 });
  const [people, orders] = await Promise.all([
    User.find({ _id: { $in: rows.map((row) => row.customerId) } }).select('name avatar'),
    Order.find({ _id: { $in: rows.map((row) => row.orderId) } }).select('title'),
  ]);
  const byId = new Map(people.map((person) => [String(person._id), person]));
  const titles = new Map(orders.map((order) => [String(order._id), order.title || '']));
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / count) * 10) / 10 : 0;
  return {
    average,
    count,
    distribution: distributionOf(rows),
    items: rows.map((row) => {
      const customer = byId.get(String(row.customerId));
      return {
        ...row.toPublic(),
        customerName: customer?.name || '',
        customerAvatar: customer?.avatar || '',
        jobTitle: titles.get(String(row.orderId)) || '',
      };
    }),
  };
}

async function ownContractorReview(contractorId, reviewId) {
  const review = await Review.findById(reviewId);
  if (!review || String(review.targetUserId) !== String(contractorId) || review.targetType !== REVIEW_TARGET.CONTRACTOR) {
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
  const admins = await User.find({ role: 'ADMIN' }).select('_id');
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
    actorRole: 'CONTRACTOR',
    action: AUDIT_ACTION.REVIEW_REPORTED,
    entityType: 'Review',
    entityId: review._id,
    meta: { reason: review.reportReason },
  });
  return { reported: true };
}

module.exports = { createReview, listForUser, recomputeTargetRating, replyToReview, reportReview };
