import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOrderDetail } from '@/features/orders/hooks/useOrderDetail';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { useToastStore } from '@/store/toast.store';
import { ReviewForm } from '../components/ReviewForm';
import { ReviewList } from '../components/ReviewList';
import { useUserReviews } from '../hooks/useUserReviews';
import { reviewApi } from '../services/review.api';
import type { Review, ReviewTargetType } from '../types/review.types';

function forOrder(items: Review[] | undefined, orderId: string | undefined, customerId: string | undefined, target: ReviewTargetType) {
  return (
    items?.filter(
      (row) =>
        row.targetType === target &&
        String(row.orderId) === String(orderId) &&
        String(row.customerId) === String(customerId)
    ) || []
  );
}

export function CustomerReviewPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const me = useAuthStore((s) => s.user?.id);
  const { order, request, loading, error, reload } = useOrderDetail(id);
  const { data, loading: revLoading, error: revError, reload: reloadReviews } = useUserReviews(order?.contractorId);
  const push = useToastStore((s) => s.push);
  const [busyTarget, setBusyTarget] = useState<ReviewTargetType | null>(null);

  const materialStore =
    request?.store &&
    request.store.storeType === 'MATERIALS' &&
    String(request.store.contractorId) !== String(order?.contractorId)
      ? request.store
      : null;
  const storeOwnerId = materialStore?.contractorId || order?.contractorId;
  const sameOwner = !storeOwnerId || String(storeOwnerId) === String(order?.contractorId);
  const storeReviews = useUserReviews(sameOwner ? undefined : storeOwnerId, 'MATERIAL_STORE');

  const contractorMine = useMemo(
    () => forOrder(data?.items, id, me, 'CONTRACTOR'),
    [data, id, me]
  );
  const storeMine = useMemo(
    () => forOrder(sameOwner ? data?.items : storeReviews.data?.items, id, me, 'MATERIAL_STORE'),
    [data, storeReviews.data, sameOwner, id, me]
  );

  if (loading || revLoading || storeReviews.loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;
  if (revError || storeReviews.error) {
    return <ErrorState body={revError || storeReviews.error || undefined} onRetry={() => { reloadReviews(); storeReviews.reload(); }} />;
  }

  const completed = order.status === 'CUSTOMER_ACCEPTED';

  const submit = async (target: ReviewTargetType, targetUserId: string, payload: { rating: number; comment: string }) => {
    setBusyTarget(target);
    try {
      await reviewApi.create({
        orderId: order.id,
        targetUserId,
        targetType: target,
        rating: payload.rating,
        comment: payload.comment,
      });
      push({ kind: 'success', title: t('review.success') });
      reloadReviews();
      storeReviews.reload();
    } catch (err) {
      push({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setBusyTarget(null);
    }
  };

  return (
    <PageTransition>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to={`/customer/orders/${order.id}`}>{t('common.back')}</Link>
      </Button>
      <PageHeader eyebrow={t('review.eyebrow')} title={order.title} description={order.orderCode} />
      {!completed ? (
        <Card hover={false}>{t('review.locked')}</Card>
      ) : (
        <div className="max-w-lg space-y-6">
          <Card hover={false}>
            {contractorMine.length ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-500">{t('review.existsContractor')}</p>
                <ReviewList items={contractorMine} />
              </div>
            ) : (
              <ReviewForm
                title={t('review.serviceTitle')}
                busy={busyTarget === 'CONTRACTOR'}
                onSubmit={(payload) => void submit('CONTRACTOR', order.contractorId || '', payload)}
              />
            )}
          </Card>
          {materialStore && storeOwnerId ? (
            <Card hover={false}>
              {storeMine.length ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink-500">{t('review.existsStore')}</p>
                  <ReviewList items={storeMine} />
                </div>
              ) : (
                <ReviewForm
                  title={t('review.storeTitle', { name: materialStore.name })}
                  busy={busyTarget === 'MATERIAL_STORE'}
                  onSubmit={(payload) => void submit('MATERIAL_STORE', storeOwnerId, payload)}
                />
              )}
            </Card>
          ) : null}
        </div>
      )}
    </PageTransition>
  );
}
