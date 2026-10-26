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

const complaintTone = (status: ComplaintStatus): 'warn' | 'info' | 'success' | 'danger' => {
  switch (status) {
    case 'OPEN':
      return 'warn';
    case 'PROCESSING':
      return 'info';
    case 'RESOLVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    default:
      return 'warn';
  }
};

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
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              status === code
                ? 'border-[#173B4F] bg-[#173B4F] text-white shadow-sm'
                : 'border-[#E1E7ED] bg-white text-[#526477] hover:bg-[#F8FAFC] hover:text-[#16283C]'
            }`}
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
            <p className="font-semibold text-[#16283C]">{row.reason}</p>
            <p className="line-clamp-1 text-xs text-[#526477]">{row.description}</p>
          </div>,
          <Badge key={`${row.id}-s`} tone={complaintTone(row.status)}>
            {complaintStatusLabel(row.status)}
          </Badge>,
          shortenId(row.orderId),
          formatDate(row.createdAt),
          <Link key={`${row.id}-l`} to={`/complaints/${row.id}`} state={back} className="font-semibold text-[#2B6280] hover:text-[#173B4F] hover:underline">
            {t('pages.view')}
          </Link>,
        ])}
      />
    </div>
  );
}
