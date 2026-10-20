import { trustLineKind } from '@/features/reviews/components/reputationDisplay';

export function exploreTrustText(
  place: { rating: number; reviewCount: number; reputationScore?: number | null },
  t: (path: string, vars?: Record<string, string | number>) => string
) {
  const kind = trustLineKind(place.reviewCount, place.reputationScore);
  if (kind === 'full') {
    return t('explore.ratingTrust', {
      score: place.rating.toFixed(1),
      count: place.reviewCount,
      reputation: Number(place.reputationScore).toFixed(1),
    });
  }
  if (kind === 'partial') {
    return t('explore.ratingPartial', {
      score: place.rating.toFixed(1),
      count: place.reviewCount,
    });
  }
  return t('explore.ratingNone');
}
