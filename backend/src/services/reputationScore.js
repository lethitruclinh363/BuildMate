/**
 * Contractor reputation, fixed formula.
 * See backend/docs/contractor-reputation.md. Keep the two in step.
 */

const PRIOR_REVIEWS = 10;
const PRIOR_STARS = 3.5;
const NEUTRAL_COMPONENT = 5;
const MIN_REVIEWS = 3;
const MIN_ORDERS = 5;
const WEIGHTS = Object.freeze({ S: 0.5, C: 0.25, T: 0.15, Q: 0.1 });
const COMPLETED_STATUSES = new Set(['COMPLETED', 'CUSTOMER_ACCEPTED']);
const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

function clampScore(value) {
  return round2(Math.min(10, Math.max(0, Number(value) || 0)));
}

function gradeFor(score) {
  if (score >= 9) return 'EXCELLENT';
  if (score >= 8) return 'VERY_GOOD';
  if (score >= 7) return 'GOOD';
  if (score >= 5) return 'AVERAGE';
  return 'NEEDS_IMPROVEMENT';
}

function starComponent(averageStars, count) {
  const n = Math.max(0, Number(count) || 0);
  const average = n ? Number(averageStars) || 0 : 0;
  const adjusted = (n * average + PRIOR_REVIEWS * PRIOR_STARS) / (n + PRIOR_REVIEWS);
  return clampScore(2 * adjusted);
}

function rateComponent(numerator, denominator) {
  const top = Math.max(0, Number(numerator) || 0);
  const bottom = Math.max(0, Number(denominator) || 0);
  if (!bottom) {
    return { score: NEUTRAL_COMPONENT, percent: null, sufficient: false };
  }
  const ratio = top / bottom;
  return {
    score: clampScore(ratio * 10),
    percent: round2(ratio * 100),
    sufficient: true,
  };
}

function isTestOrder(order) {
  const email = String(order.customerEmail || '').trim().toLowerCase();
  if (email.endsWith('@buildmate.test') || email.endsWith('@example.com')) return true;
  return /^TEST-/i.test(String(order.orderCode || ''));
}

function isFraudOrder(order) {
  if (String(order.cancelReason || '').trim().toUpperCase() === 'FRAUD') return true;
  return /^\[FRAUD\]/i.test(String(order.title || '').trim());
}

function eligibleOrder(order) {
  return !isTestOrder(order) && !isFraudOrder(order);
}

function deadlineFor(order) {
  const days = Number(order.estimatedDays);
  const created = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
  if (!Number.isFinite(days) || days < 1 || !Number.isFinite(created)) return null;
  return created + days * DAY_MS;
}

/**
 * @param {{ orders?: object[], reviews?: object[], complaints?: object[] }} input
 * orders: { id, status, customerId, contractorId, cancelledBy, cancelReason, customerEmail,
 *           orderCode, title, createdAt, completedAt, updatedAt, estimatedDays }
 * reviews: { orderId, rating, createdAt }
 * complaints: { orderId, status, updatedAt }
 */
function scoreReputation(input = {}) {
  const orders = (Array.isArray(input.orders) ? input.orders : []).filter(eligibleOrder);
  const eligibleIds = new Set(orders.map((order) => String(order.id)));
  const reviews = (Array.isArray(input.reviews) ? input.reviews : []).filter((review) => {
    const rating = Number(review.rating);
    return eligibleIds.has(String(review.orderId)) && Number.isInteger(rating) && rating >= 1 && rating <= 5;
  });
  const complaints = (Array.isArray(input.complaints) ? input.complaints : []).filter((row) =>
    eligibleIds.has(String(row.orderId))
  );

  const completed = orders.filter((order) => COMPLETED_STATUSES.has(order.status));
  const contractorCancelled = orders.filter(
    (order) => order.status === 'CANCELLED' && order.cancelledBy != null && String(order.cancelledBy) === String(order.contractorId)
  );
  const customerCancelled = orders.filter(
    (order) => order.status === 'CANCELLED' && order.cancelledBy != null && String(order.cancelledBy) === String(order.customerId)
  );

  const reviewCount = reviews.length;
  const averageStars = reviewCount
    ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount
    : null;
  const stars = starComponent(averageStars || 0, reviewCount);

  const completion = rateComponent(completed.length, completed.length + contractorCancelled.length);

  let onTime = 0;
  let late = 0;
  for (const order of completed) {
    const deadline = deadlineFor(order);
    const finished = order.completedAt ? new Date(order.completedAt).getTime() : NaN;
    if (deadline == null || !Number.isFinite(finished)) continue;
    if (finished <= deadline) onTime += 1;
    else late += 1;
  }
  const timing = rateComponent(onTime, onTime + late);

  const upheld = complaints.filter((row) => row.status === 'RESOLVED').length;
  const dismissed = complaints.filter((row) => row.status === 'REJECTED').length;
  const open = complaints.filter((row) => row.status === 'OPEN' || row.status === 'PROCESSING').length;
  const handling = rateComponent(dismissed, upheld + dismissed);

  const published = orders.length >= MIN_ORDERS && reviewCount >= MIN_REVIEWS;
  const score = published
    ? clampScore(stars * WEIGHTS.S + completion.score * WEIGHTS.C + timing.score * WEIGHTS.T + handling.score * WEIGHTS.Q)
    : null;

  const stamps = [];
  for (const order of orders) {
    if (order.updatedAt) stamps.push(new Date(order.updatedAt).getTime());
  }
  for (const review of reviews) {
    if (review.createdAt) stamps.push(new Date(review.createdAt).getTime());
  }
  for (const complaint of complaints) {
    if (complaint.updatedAt) stamps.push(new Date(complaint.updatedAt).getTime());
  }
  const latest = stamps.filter((value) => Number.isFinite(value));

  return {
    published,
    score,
    grade: score == null ? null : gradeFor(score),
    updatedAt: latest.length ? new Date(Math.max(...latest)).toISOString() : null,
    status: published ? 'READY' : 'INSUFFICIENT',
    validOrders: orders.length,
    requirements: { minOrders: MIN_ORDERS, minReviews: MIN_REVIEWS },
    weights: { ...WEIGHTS },
    neutralScore: NEUTRAL_COMPONENT,
    reviews: {
      count: reviewCount,
      average: averageStars == null ? null : Number(averageStars.toFixed(2)),
      component: published ? stars : null,
      sufficient: reviewCount >= MIN_REVIEWS,
    },
    completion: {
      completed: completed.length,
      contractorCancelled: contractorCancelled.length,
      customerCancelled: customerCancelled.length,
      percent: completion.percent,
      component: published ? completion.score : null,
      sufficient: completion.sufficient,
    },
    onTime: {
      onTime,
      late,
      percent: timing.percent,
      component: published ? timing.score : null,
      sufficient: timing.sufficient,
    },
    complaints: {
      upheld,
      dismissed,
      open,
      percent: handling.percent,
      component: published ? handling.score : null,
      sufficient: handling.sufficient,
    },
  };
}

module.exports = {
  PRIOR_REVIEWS,
  PRIOR_STARS,
  NEUTRAL_COMPONENT,
  MIN_REVIEWS,
  MIN_ORDERS,
  WEIGHTS,
  clampScore,
  gradeFor,
  starComponent,
  scoreReputation,
  isTestOrder,
  isFraudOrder,
};
