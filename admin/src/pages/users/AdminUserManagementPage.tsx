import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { formatDate } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';

export function AdminUserManagementPage() {
  const { t } = useTranslation();
  const back = useReturnState();
  const { data, loading, error, reload } = useAsync(() => adminApi.listCustomers(), []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  return (
    <div>
      <PageHeader eyebrow={t('customers.eyebrow')} title={t('customers.title')} description={t('customers.subtitle')} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('customers.count')} value={data.length} />
      </div>
      <DataTable
        columns={[
          t('customers.name'),
          t('customers.email'),
          t('customers.phone'),
          t('customers.city'),
          t('customers.joined'),
          t('customers.status'),
          t('customers.actions'),
        ]}
        empty={<EmptyState icon={<Users className="h-5 w-5" />} title={t('customers.empty')} />}
        rows={data.map((user) => [
          user.name,
          user.email || '—',
          user.phone || '—',
          user.city || '—',
          formatDate(user.createdAt),
          <Badge key={`${user.id}-status`} tone={user.status === 'ACTIVE' ? 'success' : 'warn'}>
            {user.status}
          </Badge>,
          <Link key={`${user.id}-link`} to={`/users/${user.id}`} state={back} className="font-semibold text-[#2B6280] hover:text-[#173B4F] hover:underline">
            {t('customers.view')}
          </Link>,
        ])}
      />
    </div>
  );
}
