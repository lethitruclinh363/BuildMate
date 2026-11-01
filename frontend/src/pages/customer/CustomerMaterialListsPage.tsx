import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { getApiErrorMessage } from '@/lib/api';
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { useI18n } from '@/locales';
import { useSocket } from '@/providers/SocketProvider';

function statusTone(status: string): 'mist' | 'copper' | 'success' | 'warn' | 'danger' {
  if (status === 'DELIVERED' || status === 'CONFIRMED') return 'success';
  if (status === 'DRAFT' || status === 'SENT') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  return 'copper';
}

export function CustomerMaterialListsPage() {
  const { t, te } = useI18n();
  const { socket } = useSocket();
  const [rows, setRows] = useState<MaterialRequirementList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    materialRequirementApi
      .mine()
      .then((res) => {
        if (!ignore) {
          setRows(res.data.data || []);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!ignore) setError(te(getApiErrorMessage(err)));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [te]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (list: MaterialRequirementList) => {
      if (!list?.id) return;
      setRows((prev) => {
        const next = prev.some((row) => row.id === list.id)
          ? prev.map((row) => (row.id === list.id ? list : row))
          : [list, ...prev];
        return next;
      });
    };
    socket.on('mrl:update', onUpdate);
    return () => {
      socket.off('mrl:update', onUpdate);
    };
  }, [socket]);

  const visible = useMemo(() => {
    const savedParents = new Set(rows.filter((row) => row.kind === 'SAVED').map((row) => row.parentListId || row.id));
    return rows.filter((row) => {
      if (row.status === 'CANCELLED') return false;
      if (row.kind === 'SOURCE' && savedParents.has(row.id)) return false;
      return true;
    });
  }, [rows]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={() => window.location.reload()} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('mrl.customerEyebrow')} title={t('mrl.customerTitle')} description={t('mrl.customerBody')} />
      {!visible.length ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('mrl.customerEmpty')} body={t('mrl.customerBody')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
          {visible.map((row) => (
            <Link
              key={row.id}
              to={`/customer/material-lists/${row.id}`}
              className="flex items-center justify-between gap-3 border-b border-navy-800/5 px-4 py-4 last:border-0 hover:bg-paper-100"
            >
              <div>
                <p className="font-medium text-navy-800">{row.title || row.requestTitle || row.requestCode || `${t('mrl.listLabel')} ${row.id.slice(-6)}`}</p>
                <p className="text-sm text-ink-400">
                  {row.requestCode ? `${row.requestCode} · ` : ''}
                  {(row.items || []).length} {t('mrl.itemCount')}
                  {row.storeName ? ` · ${row.storeName}` : ''}
                </p>
              </div>
              <Badge tone={statusTone(row.status)}>{t(`mrl.status.${row.status}`)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
