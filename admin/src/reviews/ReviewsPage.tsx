import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { loadAdminDirectory } from '@/hooks/useDirectory';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { formatDate, shortenId } from '@/lib/utils';

export function ReviewsPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(loadAdminDirectory, []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow={t('pages.trust')}
        title={t('pages.reviews')}
        description={t('pages.reviewsDesc')}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label={t('pages.average')} value={data.analytics.reviews.average.toFixed(1)} />
        <StatCard label={t('pages.totalReviews')} value={data.analytics.reviews.total} />
      </div>
      <DataTable
        columns={[t('pages.rating'), t('pages.target'), t('pages.comment'), t('pages.order'), t('pages.created')]}
        empty={<EmptyState icon={<Star className="h-5 w-5" />} title={t('pages.noReviews')} />}
        rows={data.reviews.map((row) => [
          `${row.rating}/5`,
          `${row.targetType === 'CONTRACTOR' ? t('roles.CONTRACTOR') : t('nav.stores')} · ${shortenId(row.targetUserId)}`,
          row.comment || '—',
          <Link key={row.id} to={`/orders/${row.orderId}`} className="text-copper-300">
            {shortenId(row.orderId)}
          </Link>,
          formatDate(row.createdAt),
        ])}
      />
    </div>
  );
}
