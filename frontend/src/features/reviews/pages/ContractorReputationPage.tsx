import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { ReputationDashboard } from '../components/ReputationDashboard';
import { reviewApi } from '../services/review.api';
import type { ReputationSnapshot } from '../types/reputation.types';

export function ContractorReputationPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reputation, setReputation] = useState<ReputationSnapshot | null>(null);

  function load() {
    setLoading(true);
    setError('');
    reviewApi
      .dashboard()
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
      <PageHeader eyebrow={t('reputation.eyebrow')} title={t('reputation.title')} description={t('reputation.desc')} />
      <ReputationDashboard
        reputation={reputation}
        labels={{
          reviews: t('reputation.reviewsTitle'),
          completion: t('reputation.contractorCardCompletion'),
          onTime: t('reputation.contractorCardOnTime'),
          complaints: t('reputation.contractorCardComplaints'),
        }}
      />
    </PageTransition>
  );
}
