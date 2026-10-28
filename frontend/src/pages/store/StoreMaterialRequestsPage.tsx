import { useEffect, useState } from 'react';
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

export function StoreMaterialRequestsPage() {
  const { t, te } = useI18n();
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

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={() => window.location.reload()} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('mrl.storeEyebrow')} title={t('mrl.storeTitle')} description={t('mrl.storeBody')} />
      {!rows.length ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('mrl.storeEmpty')} body={t('mrl.storeBody')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
          {rows.map((row) => (
            <Link key={row.id} to={`/store/material-requests/${row.id}`} className="flex items-center justify-between gap-3 border-b border-navy-800/5 px-4 py-4 last:border-0 hover:bg-paper-100">
              <div>
                <p className="font-medium text-navy-800">{t('mrl.listLabel')} {row.id.slice(-6)}</p>
                <p className="text-sm text-ink-400">{(row.items || []).length} {t('mrl.itemCount')}</p>
              </div>
              <Badge tone="copper">{row.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
