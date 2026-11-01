import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { BackButton } from '@/components/navigation/BackButton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RepairRequestBrief } from '@/features/repair/components/RepairRequestBrief';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { useReturnState } from '@/lib/navigation';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { labeled, useI18n } from '@/locales';
import { canCreateQuotation, type RepairRequest } from '@/types/sprint4';

export function ContractorRequestDetailPage() {
  const { t, te } = useI18n();
  const { id } = useParams();
  const back = useReturnState();
  const [item, setItem] = useState<RepairRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    repairApi
      .get(id)
      .then((res) => {
        setItem(res.data.data);
        setError(null);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const res = await fn();
      const next = (res as { data?: { data?: RepairRequest } })?.data?.data;
      if (next) setItem(next);
      else load();
    } catch (err) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error || !item) return <ErrorState body={error || undefined} onRetry={load} />;

  return (
    <PageTransition>
      <BackButton fallback="/contractor/requests" />
      <PageHeader
        eyebrow={t('contractorRequests.detailEyebrow')}
        title={item.title}
        description={`${item.customer?.name || t('quote.customerFallback')} · ${catalogCategoryLabel(String(item.category || ''), t)}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="copper">{catalogCategoryLabel(String(item.category || ''), t)}</Badge>
        <Badge
          tone={
            item.status === 'PENDING'
              ? 'warn'
              : item.status === 'ACCEPTED'
                ? 'success'
                : item.status === 'CANCELLED' || item.status === 'REJECTED'
                  ? 'danger'
                  : 'mist'
          }
        >
          {labeled(t, 'status', item.status)}
        </Badge>
      </div>
      <div className="rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
        <RepairRequestBrief item={item} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.status === 'PENDING' ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => void act(() => repairApi.accept(item.id))}>
              {t('contractorRequests.accept')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => repairApi.reject(item.id))}>
              {t('contractorRequests.decline')}
            </Button>
          </>
        ) : null}
        {item.roomId ? (
          <Button asChild size="sm" variant="outline">
            <Link to={`/contractor/chat/${item.roomId}`} state={back}>{t('request.openChat')}</Link>
          </Button>
        ) : null}
        {canCreateQuotation(item.status) ? (
          <Button asChild size="sm" variant="copper">
            <Link to={`/contractor/quotation/create/${item.id}`} state={back}>
              {t('contractorRequests.createQuote')}
            </Link>
          </Button>
        ) : null}
      </div>
    </PageTransition>
  );
}
