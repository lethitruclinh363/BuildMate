import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { ReputationDashboard } from '@/features/reviews/components/ReputationDashboard';
import { reviewApi } from '@/features/reviews/services/review.api';
import type { ReputationSnapshot } from '@/features/reviews/types/reputation.types';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';

export function StoreReputationPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reputation, setReputation] = useState<ReputationSnapshot | null>(null);

  function load() {
    setLoading(true);
    setError('');
    reviewApi
      .storeReputation()
      .then((res) => {
        setReputation(res.data.data.reputation);
        setLoaded(true);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !loaded) return <DashboardSkeleton />;
  if (error && !loaded) return <ErrorState body={error} onRetry={load} />;
  if (!reputation) return <ErrorState body={error || t('reputation.insufficient')} onRetry={load} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('reputation.eyebrow')} title={t('reputation.storeTitle')} description={t('reputation.storeDesc')} />
      <ReputationDashboard
        reputation={reputation}
        labels={{
          reviews: t('reputation.reviewsTitle'),
          completion: t('reputation.storeCardCompletion'),
          onTime: t('reputation.storeCardOnTime'),
          complaints: t('reputation.storeCardComplaints'),
        }}
      />
    </PageTransition>
  );
}
