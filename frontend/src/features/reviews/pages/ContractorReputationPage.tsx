import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { formatPercent } from '../components/ReputationSummary';
import { reviewApi } from '../services/review.api';
import type { ReputationSnapshot } from '../types/reputation.types';

export function ContractorReputationPage() {
  const { t, locale } = useI18n();
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

  const dateTag = locale === 'en' ? 'en-GB' : 'vi-VN';
  const updated = reputation.updatedAt
    ? new Date(reputation.updatedAt).toLocaleString(dateTag)
    : t('reputation.noUpdate');

  return (
    <PageTransition>
      <PageHeader eyebrow={t('reputation.eyebrow')} title={t('reputation.title')} description={t('reputation.desc')} />
      <Card hover={false} className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('reputation.scoreLabel')}</p>
        {reputation.published && reputation.score != null ? (
          <p className="mt-1 font-display text-4xl text-navy-800">
            {reputation.score.toFixed(2)}
            <span className="text-xl text-ink-400">/10</span>
          </p>
        ) : (
          <p className="mt-2 text-2xl font-semibold text-navy-800">{t('reputation.insufficient')}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
          <p>
            {t('reputation.grade')}:{' '}
            <span className="font-semibold text-navy-800">
              {reputation.grade ? t(`reputation.${reputation.grade}`) : t('reputation.insufficient')}
            </span>
          </p>
          <p>
            {t('reputation.updated')}: <span className="font-semibold text-navy-800">{updated}</span>
          </p>
          <p className="font-semibold text-navy-800">
            {reputation.status === 'READY' ? t('reputation.ready') : t('reputation.notReady')}
          </p>
        </div>
        <p className="mt-3 text-sm text-ink-500">
          {t('reputation.need', {
            orders: reputation.requirements.minOrders,
            reviews: reputation.requirements.minReviews,
          })}{' '}
          {t('reputation.validOrders', { n: reputation.validOrders })}
        </p>
        <p className="mt-2 text-sm text-ink-500">{t('reputation.formula')}</p>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Metric
          title={t('reputation.reviewsTitle')}
          value={
            reputation.reviews.average == null
              ? t('reputation.noAverage')
              : t('reputation.reviewsValue', {
                  score: reputation.reviews.average.toFixed(1),
                  count: reputation.reviews.count,
                })
          }
          detail={t('reputation.reviewCount', { n: reputation.reviews.count })}
          help={t('reputation.reviewsHelp')}
        />
        <Metric
          title={t('reputation.completionTitle')}
          value={reputation.completion.percent == null ? t('reputation.metricInsufficient') : `${formatPercent(reputation.completion.percent)}%`}
          detail={t('reputation.customerCancelled', { n: reputation.completion.customerCancelled })}
          help={t('reputation.completionHelp')}
        />
        <Metric
          title={t('reputation.onTimeTitle')}
          value={reputation.onTime.percent == null ? t('reputation.metricInsufficient') : `${formatPercent(reputation.onTime.percent)}%`}
          detail={reputation.onTime.sufficient ? `${reputation.onTime.onTime} / ${reputation.onTime.onTime + reputation.onTime.late}` : ''}
          help={t('reputation.onTimeHelp')}
        />
        <Metric
          title={t('reputation.complaintsTitle')}
          value={reputation.complaints.percent == null ? t('reputation.metricInsufficient') : `${formatPercent(reputation.complaints.percent)}%`}
          detail={reputation.complaints.sufficient ? `${reputation.complaints.dismissed} / ${reputation.complaints.dismissed + reputation.complaints.upheld}` : ''}
          help={t('reputation.complaintsHelp')}
        />
      </div>
    </PageTransition>
  );
}

function Metric({ title, value, detail, help }: { title: string; value: string; detail: string; help: string }) {
  return (
    <Card hover={false} className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-800">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-500">{detail}</p> : null}
      <p className="mt-3 text-sm leading-6 text-ink-600">{help}</p>
    </Card>
  );
}
