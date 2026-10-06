import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { itemListClass, ListRow } from '@/components/ui/surfaces';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { mediaUrl } from '@/lib/partner-api';
import { useReturnState } from '@/lib/navigation';
import { labeled, useI18n } from '@/locales';
import type { RepairRequest } from '@/types/sprint4';

export function ContractorRequestsPage() {
  const { t, te } = useI18n();
  const back = useReturnState();
  const [rows, setRows] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    return repairApi
      .received()
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={() => void load()} />;

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('contractorRequests.eyebrow')}
        title={t('contractorRequests.title')}
        description={t('contractorRequests.description')}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title={t('contractorRequests.emptyTitle')}
          body={t('contractorRequests.emptyBody')}
        />
      ) : (
        <div className={itemListClass}>
          {rows.map((item) => (
            <ListRow key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="copper">{labeled(t, 'category', item.category)}</Badge>
                    <Badge tone={item.status === 'PENDING' ? 'warn' : item.status === 'ACCEPTED' ? 'success' : 'mist'}>
                      {labeled(t, 'status', item.status)}
                    </Badge>
                  </div>
                  <h2 className="mt-2 font-display text-xl text-navy-800">{item.title}</h2>
                  <p className="text-sm text-ink-400">
                    {item.customer?.name} · {item.address || t('contractorRequests.siteFallback')}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.images.map((src) => (
                      <img key={src} src={mediaUrl(src)} alt="" className="h-16 w-16 rounded-xl object-cover" />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {item.status === 'PENDING' ? (
                    <>
                      <Button size="sm" onClick={() => void repairApi.accept(item.id).then(load)}>
                        {t('contractorRequests.accept')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void repairApi.reject(item.id).then(load)}>
                        {t('contractorRequests.decline')}
                      </Button>
                    </>
                  ) : null}
                  {item.roomId ? (
                    <Button asChild size="sm" variant="copper">
                      <Link to={`/contractor/chat/${item.roomId}`} state={back}>{t('request.openChat')}</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/contractor/quotation/create/${item.id}`} state={back}>{t('contractorRequests.createQuote')}</Link>
                  </Button>
                </div>
              </div>
            </ListRow>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
