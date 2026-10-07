import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
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

const tones: Record<RepairRequest['status'], 'warn' | 'success' | 'danger' | 'mist'> = {
  PENDING: 'warn',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  COMPLETED: 'mist',
};

export function RequestHistoryPage() {
  const { t, te } = useI18n();
  const back = useReturnState();
  const [rows, setRows] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (first = false) => {
    if (first) setLoading(true);
    else setPending(true);
    repairApi
      .mine()
      .then((res) => {
        setRows(res.data.data || []);
        setError(null);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => {
        setLoading(false);
        setPending(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error && rows.length === 0) return <ErrorState body={error} pending={pending} onRetry={() => load(false)} />;

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('request.historyEyebrow')}
        title={t('request.historyTitle')}
        description={t('request.historyDesc')}
        actions={
          <Button asChild variant="copper" size="sm">
            <Link to="/customer/explore">{t('request.findAnother')}</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title={t('request.emptyTitle')}
          body={t('request.emptyBody')}
        />
      ) : (
        <div className={itemListClass}>
          {rows.map((item) => (
            <ListRow key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge tone={tones[item.status]}>{labeled(t, 'status', item.status)}</Badge>
                  <h2 className="mt-2 font-display text-xl text-navy-800">{item.title}</h2>
                  <p className="text-sm text-ink-400">
                    {item.contractor?.name} · {labeled(t, 'category', item.category)}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm text-ink-600">{item.description}</p>
                </div>
                {item.images?.[0] ? (
                  <img src={mediaUrl(item.images[0])} alt="" width={80} height={80} loading="lazy" decoding="async" className="h-20 w-20 rounded-2xl object-cover" />
                ) : null}
              </div>
              {item.roomId ? (
                <Button asChild size="sm" className="mt-4">
                  <Link to={`/customer/chat/${item.roomId}`} state={back}>{t('request.openChat')}</Link>
                </Button>
              ) : null}
            </ListRow>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
