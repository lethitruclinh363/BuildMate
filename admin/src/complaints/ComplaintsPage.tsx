import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { complaintStatusLabel, formatDate, shortenId } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';
import type { ComplaintStatus } from '@/types/admin';

const filters: Array<ComplaintStatus | ''> = ['', 'OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED'];

export function ComplaintsPage() {
  const { t } = useTranslation();
  const back = useReturnState();
  const [status, setStatus] = useState<ComplaintStatus | ''>('OPEN');
  const { data, loading, error, reload } = useAsync(() => adminApi.listComplaints(status), [status]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  const items = data || [];

  return (
    <div>
      <PageHeader eyebrow={t('pages.disputes')} title={t('pages.complaints')} description={t('pages.complaintsDesc')} />
      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((code) => (
          <button
            key={code || 'all'}
            type="button"
            onClick={() => setStatus(code)}
            className={`rounded-full px-4 py-1.5 text-sm ${status === code ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'}`}
          >
            {complaintStatusLabel(code)}
          </button>
        ))}
      </div>
      <DataTable
        columns={[t('pages.reason'), t('pages.status'), t('pages.order'), t('pages.created'), '']}
        empty={<EmptyState icon={<Inbox className="h-5 w-5" />} title={t('pages.noComplaints')} body={t('pages.queueClear')} />}
        rows={items.map((row) => [
          <div key={`${row.id}-r`}>
            <p>{row.reason}</p>
            <p className="line-clamp-1 text-xs text-white/40">{row.description}</p>
          </div>,
          <Badge key={`${row.id}-s`} tone={row.status === 'OPEN' ? 'copper' : row.status === 'RESOLVED' ? 'success' : 'navy'}>
            {complaintStatusLabel(row.status)}
          </Badge>,
          shortenId(row.orderId),
          formatDate(row.createdAt),
          <Link key={`${row.id}-l`} to={`/complaints/${row.id}`} state={back} className="text-copper-300">
            {t('pages.view')}
          </Link>,
        ])}
      />
    </div>
  );
}
