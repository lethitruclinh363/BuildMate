import { useState } from 'react';
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
import { useToastStore } from '@/store/toast.store';
import { ComplaintForm } from '../components/ComplaintForm';
import { complaintApi } from '../services/complaint.api';

export function CustomerComplaintPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const { order, loading, error, reload } = useOrderDetail(id);
  const push = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;

  const submit = async (payload: { reason: string; description: string }) => {
    setBusy(true);
    try {
      await complaintApi.create({
        orderId: order.id,
        againstUser: order.contractorId,
        reason: payload.reason,
        description: payload.description,
      });
      push({ kind: 'success', title: t('complaint.success') });
    } catch (err) {
      push({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to={`/customer/orders/${order.id}`}>{t('common.back')}</Link>
      </Button>
      <PageHeader eyebrow={t('complaint.eyebrow')} title={order.title} description={order.orderCode} />
      <Card hover={false} className="max-w-lg">
        <ComplaintForm onSubmit={(p) => void submit(p)} busy={busy} />
      </Card>
    </PageTransition>
  );
}
