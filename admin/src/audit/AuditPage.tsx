import { useTranslation } from 'react-i18next';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { formatDate, shortenId } from '@/lib/utils';
import { ScrollText } from 'lucide-react';

export function AuditPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => adminApi.auditLogs({ limit: 200 }), []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  return (
    <div>
      <PageHeader eyebrow={t('pages.compliance')} title={t('pages.audit')} description={t('pages.auditDesc')} />
      <DataTable
        columns={[t('pages.action'), t('pages.entity'), t('pages.actor'), t('pages.when')]}
        empty={<EmptyState icon={<ScrollText className="h-5 w-5" />} title={t('pages.noAudit')} />}
        rows={data.map((row) => [
          <Badge key={`${row.id}-a`} tone="copper">
            {row.action}
          </Badge>,
          `${row.entityType} · ${shortenId(row.entityId)}`,
          row.actor?.name || row.actorRole || t('pages.system'),
          formatDate(row.createdAt),
        ])}
      />
    </div>
  );
}
