/** Display rules for the reputation dashboard. Scores come from the API. */

export function clampScore(value: number) {
  return Math.min(10, Math.max(0, value));
}

/** Null means the official score is hidden. Zero is a real published score. */
export function gaugeRatio(score: number | null | undefined, published: boolean): number | null {
  if (!published || score == null || !Number.isFinite(score)) return null;
  return clampScore(score) / 10;
}

/**
 * A component bar is filled only when that figure was actually measured.
 * A neutral placeholder from the scorer stays hidden because `sufficient` is false.
 */
export function measuredBar(component: number | null | undefined, sufficient: boolean): number | null {
  if (!sufficient || component == null || !Number.isFinite(component)) return null;
  return clampScore(component);
}

export function weightPercent(weight: number | null | undefined): number | null {
  if (weight == null || !Number.isFinite(weight)) return null;
  return Math.round(weight * 100);
}

export function shortfall(validOrders: number, reviewCount: number, minOrders: number, minReviews: number) {
  return {
    orders: Math.max(0, minOrders - validOrders),
    reviews: Math.max(0, minReviews - reviewCount),
  };
}

export function trustLineKind(reviewCount: number, reputationScore: number | null | undefined) {
  if (reviewCount > 0 && reputationScore != null && Number.isFinite(reputationScore)) return 'full' as const;
  if (reviewCount > 0) return 'partial' as const;
  return 'none' as const;
}

export function formatScore(value: number) {
  const text = clampScore(value).toFixed(2);
  return text.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}
