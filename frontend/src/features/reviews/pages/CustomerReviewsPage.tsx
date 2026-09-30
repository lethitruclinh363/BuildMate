import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOrders } from '@/features/orders/hooks/useOrders';
import { useI18n } from '@/locales';

export function CustomerReviewsPage() {
  const { t } = useI18n();
  const { items, loading, error, reload } = useOrders('customer');
  const completed = items.filter((row) => row.status === 'CUSTOMER_ACCEPTED');

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('review.eyebrow')} title={t('review.title')} description={t('review.desc')} />
      {completed.length === 0 ? (
        <EmptyState icon={<Star className="h-5 w-5" />} title={t('review.empty')} body={t('review.emptyBody')} />
      ) : (
        <div className="space-y-3">
          {completed.map((order) => (
            <Card key={order.id} hover={false} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-copper-600">{order.orderCode}</p>
                <p className="font-display text-lg text-navy-800">{order.title}</p>
              </div>
              <Button asChild size="sm" variant="copper">
                <Link to={`/customer/orders/${order.id}/review`}>{t('review.write')}</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
