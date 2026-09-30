import { Star } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { ReviewList } from '@/features/reviews/components/ReviewList';
import { StarRating } from '@/features/reviews/components/StarRating';
import { useUserReviews } from '@/features/reviews/hooks/useUserReviews';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';

export function StoreReviewsPage() {
  const { t } = useI18n();
  const userId = useAuthStore((s) => s.user?.id);
  const { data, loading, error, reload } = useUserReviews(userId, 'MATERIAL_STORE');

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  const average = data?.average || 0;
  const count = data?.count || 0;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('review.eyebrow')} title={t('review.storeOwnerTitle')} description={t('review.storeOwnerDesc')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card hover={false}>
          <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{t('review.average')}</p>
          <div className="mt-3 flex items-center gap-3">
            <p className="font-display text-4xl text-navy-800">{average.toFixed(1)}</p>
            <StarRating value={Math.round(average)} readOnly />
          </div>
        </Card>
        <Card hover={false}>
          <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{t('review.count', { n: count })}</p>
          <p className="mt-3 font-display text-4xl text-navy-800">{count}</p>
        </Card>
      </div>
      {count === 0 ? (
        <EmptyState icon={<Star className="h-6 w-6" />} title={t('review.empty')} body={t('review.storeOwnerDesc')} />
      ) : (
        <ReviewList items={data?.items || []} />
      )}
    </PageTransition>
  );
}
