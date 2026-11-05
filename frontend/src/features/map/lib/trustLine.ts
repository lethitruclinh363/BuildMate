export function exploreTrustText(
  place: { rating: number; reviewCount: number },
  t: (path: string, vars?: Record<string, string | number>) => string
) {
  if (place.reviewCount > 0) {
    return `${place.rating.toFixed(1)} (${place.reviewCount})`;
  }
  return t('explore.noRating');
}
