import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Store } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import type { PartnerApplication } from '@/types/admin';

const tone: Record<string, 'success' | 'warn' | 'danger' | 'copper' | 'navy'> = {
  APPROVED: 'success',
  SUBMITTED: 'copper',
  REJECTED: 'danger',
  DRAFT: 'navy',
};

function PartnerDirectoryPage({ role }: { role: 'CONTRACTOR' | 'MATERIAL_STORE_OWNER' }) {
  const { t } = useTranslation();
  const copy = role === 'CONTRACTOR' ? 'crew' : 'store';
  const queue = role === 'CONTRACTOR' ? '/partners/contractors' : '/partners/stores';
  const { data, loading, error, reload } = useAsync(() => adminApi.listVerifications(), []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const rows = data.filter((row: PartnerApplication) => row.user?.role === role);

  return (
    <div>
      <PageHeader
        eyebrow={t(`partners.${copy}.eyebrow`)}
        title={t(`partners.${copy}.title`)}
        description={t(`partners.${copy}.subtitle`)}
        actions={
          <Link to={queue} className="rounded-xl bg-copper-500 px-4 py-2 text-sm font-semibold text-navy-950">
            {t('partners.openQueue')}
          </Link>
        }
      />
      <DataTable
        columns={[t(`partners.${copy}.business`), t('partners.owner'), t('partners.city'), t('partners.status'), t('partners.actions')]}
        empty={<EmptyState icon={role === 'CONTRACTOR' ? <Building2 className="h-5 w-5" /> : <Store className="h-5 w-5" />} title={t(`partners.${copy}.empty`)} />}
        rows={rows.map((row) => [
          row.businessName || row.user?.name || '—',
          row.user?.email || '—',
          row.city || '—',
          <Badge key={row.id} tone={tone[row.verificationStatus] || 'navy'}>
            {row.verificationStatus}
          </Badge>,
          <Link key={`${row.id}-u`} to={`${queue}?id=${row.id}`} className="text-copper-300">
            {t('partners.profile')}
          </Link>,
        ])}
      />
    </div>
  );
}

export function ContractorsPage() {
  return <PartnerDirectoryPage role="CONTRACTOR" />;
}

export function MaterialStoresPage() {
  return <PartnerDirectoryPage role="MATERIAL_STORE_OWNER" />;
}
