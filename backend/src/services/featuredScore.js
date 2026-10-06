/**
 * Featured ranking for the homepage.
 *
 * Cold start (fewer than 5 eligible providers): show them all, up to 4,
 * without requiring reviews or completed jobs.
 *
 * Featured mode renormalizes weights when a signal does not exist yet.
 * TODO: contractor reputation is not a separate model (reviews are ratingScore).
 * TODO: store deliverySuccessRate, store responseRate, and admin warnings
 * are not stored. Those weights are omitted instead of filled with fake data.
 */

const COLD_START_BELOW = 5;
const CARD_LIMIT = 4;
const MIN_REVIEWS = 5;
const HIDDEN_ACCOUNTS = new Set(['BLOCKED', 'BANNED', 'INACTIVE', 'SUSPENDED']);
const HIDDEN_STORE = new Set(['DRAFT', 'INACTIVE', 'PAUSED', 'SUSPENDED']);
const HIDDEN_VERIFICATION = new Set(['DRAFT', 'SUBMITTED', 'REJECTED']);

const CONTRACTOR_WEIGHTS = {
  rating: 0.3,
  completed: 0.2,
  completion: 0.15,
  response: 0.1,
  recent: 0.05,
  profile: 0.05,
};

const STORE_WEIGHTS = {
  rating: 0.25,
  completed: 0.2,
  completion: 0.15,
  profile: 0.05,
};

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function saturatingCount(count, knee = 50) {
  const value = Math.max(0, Number(count) || 0);
  const cap = Math.max(1, knee);
  return clamp((Math.log1p(value) / Math.log1p(cap)) * 100);
}

function ratingScore(average, reviewCount, globalAverage = 4) {
  const count = Math.max(0, Number(reviewCount) || 0);
  const mean = count ? clamp(average, 0, 5) : 0;
  const prior = clamp(Number.isFinite(Number(globalAverage)) ? globalAverage : 4, 0, 5);
  const weighted = (mean * count + prior * MIN_REVIEWS) / (count + MIN_REVIEWS);
  return clamp((weighted / 5) * 100);
}

function completionScore(completed, accepted) {
  const done = Math.max(0, Number(completed) || 0);
  const total = Math.max(0, Number(accepted) || 0);
  if (!total) return 0;
  return clamp((done / total) * 100);
}

function penaltyScore({ cancelled = 0, complaints = 0 } = {}) {
  const cancelPenalty = Math.min(40, Math.max(0, Number(cancelled) || 0) * 8);
  const complaintPenalty = Math.min(40, Math.max(0, Number(complaints) || 0) * 15);
  return clamp(cancelPenalty + complaintPenalty);
}

function weightedTotal(parts, weights) {
  const keys = Object.keys(weights).filter((key) => Number.isFinite(parts[key]));
  const weightSum = keys.reduce((sum, key) => sum + weights[key], 0) || 1;
  const raw = keys.reduce((sum, key) => sum + weights[key] * clamp(parts[key]), 0) / weightSum;
  return clamp(raw);
}

function contractorFeaturedScore(input) {
  const parts = {
    rating: ratingScore(input.averageRating, input.reviewCount, input.globalAverageRating),
    completed: saturatingCount(input.completedJobs),
    completion: completionScore(input.completedJobs, input.acceptedJobs),
    response: input.responseRate == null ? null : clamp(input.responseRate),
    recent: saturatingCount(input.recentActivity, 5),
    profile: clamp(input.profileCompleteness),
  };
  return clamp(weightedTotal(parts, CONTRACTOR_WEIGHTS) - penaltyScore(input));
}

function storeFeaturedScore(input) {
  const parts = {
    rating: ratingScore(input.averageRating, input.reviewCount, input.globalAverageRating),
    completed: saturatingCount(input.completedOrders),
    completion: completionScore(input.completedOrders, input.acceptedOrders),
    profile: clamp(input.profileCompleteness),
  };
  return clamp(weightedTotal(parts, STORE_WEIGHTS) - penaltyScore(input));
}

function isEligibleProvider(row) {
  const verification = String(row?.verificationStatus || '');
  const storeStatus = String(row?.storeStatus || '');
  const account = String(row?.accountStatus || '');
  if (HIDDEN_VERIFICATION.has(verification) || verification !== 'APPROVED') return false;
  if (HIDDEN_STORE.has(storeStatus) || storeStatus !== 'LIVE') return false;
  if (HIDDEN_ACCOUNTS.has(account)) return false;
  return true;
}

function coldStartCompare(a, b) {
  const completeness = (b.profileCompleteness || 0) - (a.profileCompleteness || 0);
  if (completeness) return completeness;
  const rating = (b.averageRating || 0) - (a.averageRating || 0);
  if (rating) return rating;
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

function selectFeatured(rows, scoreOf) {
  const eligible = (Array.isArray(rows) ? rows : []).filter(isEligibleProvider);
  const coldStart = eligible.length < COLD_START_BELOW;
  const ranked = coldStart
    ? [...eligible].sort(coldStartCompare)
    : [...eligible].sort((a, b) => scoreOf(b) - scoreOf(a) || coldStartCompare(a, b));
  return {
    mode: coldStart ? 'cold-start' : 'featured',
    items: ranked.slice(0, CARD_LIMIT),
  };
}

function profileCompleteness(store, counts = {}) {
  const material = store?.storeType === 'MATERIALS';
  const checks = [
    String(store?.name || '').trim().length >= 2,
    Boolean(String(store?.avatar || store?.logo || '').trim()),
    String(store?.description || '').trim().length >= 8,
    String(store?.address || '').trim().length >= 2,
    String(store?.phone || '').trim().length >= 8,
    String(store?.openingHours || '').trim().length >= 3,
    store?.locationConfirmed === true,
    material ? Number(counts.productCount) >= 1 : Number(counts.serviceCount) >= 1,
  ];
  return (checks.filter(Boolean).length / checks.length) * 100;
}

module.exports = {
  COLD_START_BELOW,
  CARD_LIMIT,
  ratingScore,
  contractorFeaturedScore,
  storeFeaturedScore,
  isEligibleProvider,
  selectFeatured,
  profileCompleteness,
  penaltyScore,
};
