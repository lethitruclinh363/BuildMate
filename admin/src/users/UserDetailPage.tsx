import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatDate } from '@/lib/utils';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(async () => adminApi.getCustomer(id), [id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || t('customers.missing')} onRetry={reload} />;

  const { user, orders, reviews, complaints } = data;

  return (
    <div>
      <Link to="/users" className="mb-4 inline-block text-sm text-copper-300">
        ← {t('customers.back')}
      </Link>
      <PageHeader
        eyebrow={t('customers.record')}
        title={user.name}
        description={user.email}
        actions={<Badge tone="copper">{t('customers.role')}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 space-y-2 text-sm text-white/70">
          <p>
            {t('customers.phone')}: {user.phone || '—'}
          </p>
          <p>
            {t('customers.status')}: {user.status}
          </p>
          <p>
            {t('customers.city')}: {user.city || '—'}
          </p>
          <p>
            {t('customers.joined')}: {formatDate(user.createdAt)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.16em] text-copper-400">{t('customers.reviews')}</p>
          <p className="mt-2 font-display text-3xl">{reviews.length}</p>
        </GlassCard>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <GlassCard>
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-copper-400">{t('customers.orders')}</p>
          {orders.length === 0 ? (
            <p className="text-sm text-white/40">{t('customers.noOrders')}</p>
          ) : (
            orders.map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="mb-2 block text-sm text-copper-300">
                {order.orderCode} · {order.title}
              </Link>
            ))
          )}
        </GlassCard>
        <GlassCard>
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-copper-400">{t('customers.reviews')}</p>
          {reviews.length === 0 ? (
            <p className="text-sm text-white/40">{t('customers.noReviews')}</p>
          ) : (
            reviews.map((row) => (
              <p key={row.id} className="mb-2 text-sm text-white/70">
                {row.rating}/5 · {row.comment || '—'}
              </p>
            ))
          )}
        </GlassCard>
        <GlassCard>
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-copper-400">{t('customers.complaints')}</p>
          {complaints.length === 0 ? (
            <p className="text-sm text-white/40">{t('customers.noComplaints')}</p>
          ) : (
            complaints.map((row) => (
              <Link key={row.id} to={`/complaints/${row.id}`} className="mb-2 block text-sm text-white/70">
                {row.reason} · {formatDate(row.createdAt)}
              </Link>
            ))
          )}
        </GlassCard>
      </div>
    </div>
  );
}
