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
  if (order.deadlineAt) {
    const confirmed = new Date(order.deadlineAt).getTime();
    if (Number.isFinite(confirmed)) return confirmed;
  }
  const days = Number(order.estimatedDays);
  const created = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
  if (!Number.isFinite(days) || days < 1 || !Number.isFinite(created)) return null;
  return created + days * DAY_MS;
}

/**
 * @param {{ orders?: object[], reviews?: object[], complaints?: object[] }} input
 * orders: { id, status, customerId, contractorId, cancelledBy, cancelReason, customerEmail,
 *           orderCode, title, createdAt, completedAt, updatedAt, estimatedDays, deadlineAt }
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

const MATERIAL_COMPLETED = new Set(['CUSTOMER_RECEIVED', 'COMPLETED']);
const PAID_STATUSES = new Set(['PAID', 'REFUNDED']);
const ISSUE_NOTE = /^ISSUE:(OPEN|PROCESSING|RESOLVED|REJECTED)$/i;

function confirmedDeadline(note) {
  const text = String(note || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function hasMaterialTransaction(row) {
  if (PAID_STATUSES.has(row.payment_status)) return true;
  return (row.material_order_status_history || []).some((item) => item.status === 'DEPOSIT_PAID');
}

/**
 * Maps material-order rows into the shared score input.
 * A confirmed delivery time is an ISO timestamp stored on the CONFIRMED history note.
 * Each order contributes at most one complaint, taken from the latest ISSUE: status note.
 */
function materialScoreInput(rows, reviewRows) {
  const orders = [];
  const complaints = [];
  for (const row of rows || []) {
    if (!hasMaterialTransaction(row)) continue;
    const history = [...(row.material_order_status_history || [])].sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
    const cancel = [...history].reverse().find((item) => item.status === 'CANCELLED');
    const delivered = history.find((item) => item.status === 'DELIVERED')
      || history.find((item) => item.status === 'CUSTOMER_RECEIVED')
      || history.find((item) => item.status === 'COMPLETED');
    const deadlineAt = history.map((item) => (item.status === 'CONFIRMED' ? confirmedDeadline(item.note) : null)).find(Boolean) || null;
    const ownerId = String(row.store_owner_user_id);
    const customerId = String(row.customer_user_id);
    let cancelledBy = null;
    if (row.status === 'CANCELLED' && cancel) {
      if (cancel.actor_role === 'STORE') cancelledBy = ownerId;
      else if (cancel.actor_role === 'CUSTOMER') cancelledBy = customerId;
    }
    const issues = history.filter((item) => ISSUE_NOTE.test(String(item.note || '').trim()));
    if (issues.length) {
      const latest = issues[issues.length - 1];
      complaints.push({
        orderId: String(row.id),
        status: String(latest.note).trim().split(':')[1].toUpperCase(),
        updatedAt: latest.created_at,
      });
    }
    orders.push({
      id: String(row.id),
      status: MATERIAL_COMPLETED.has(row.status) ? 'CUSTOMER_ACCEPTED' : row.status,
      customerId,
      contractorId: ownerId,
      cancelledBy,
      cancelReason: String(cancel?.note || '').trim().toUpperCase() === 'FRAUD' ? 'FRAUD' : '',
      customerEmail: row.users_material_orders_customer_user_idTousers?.email || row.customer_email || '',
      orderCode: row.order_code || '',
      title: row.customer_note || '',
      createdAt: row.created_at,
      completedAt: delivered?.created_at || null,
      updatedAt: row.updated_at,
      deadlineAt,
    });
  }
  return {
    orders,
    reviews: (reviewRows || []).map((row) => ({
      orderId: String(row.material_order_id),
      rating: row.rating,
      createdAt: row.created_at,
    })),
    complaints,
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
  materialScoreInput,
  isTestOrder,
  isFraudOrder,
};
