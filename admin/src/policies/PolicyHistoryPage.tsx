import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { policyApi, type PolicyRevision } from '@/policies/policy.api';

export function PolicyHistoryPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [rows, setRows] = useState<PolicyRevision[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    policyApi.history(id).then(setRows).catch(() => setError(t('policy.missing')));
  }, [id, t]);

  return (
    <div>
      <PageHeader
        eyebrow={t('policy.eyebrow')}
        title={t('policy.history')}
        actions={<Link to={`/policies/${id}`} className="text-sm text-copper-300">{t('policy.detail')}</Link>}
      />
      {error ? <p className="mb-3 text-sm text-red-300">{error}</p> : null}
      {!error && !rows.length ? <p className="text-sm text-white/50">{t('policy.noHistory')}</p> : null}
      <div className="space-y-4">
        {rows.map((row) => (
          <GlassCard key={row.id}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-lg text-white">{row.title}</p>
              <Badge tone="copper">{row.version}</Badge>
              <Badge tone={row.status === 'ACTIVE' ? 'success' : 'navy'}>{t(`policy.statuses.${row.status}`)}</Badge>
              <span className="text-xs text-white/40">{new Date(row.createdAt).toLocaleString(i18n.language)}</span>
            </div>
            <div
              className="mt-4 text-sm leading-relaxed text-white/70 [&_p+p]:mt-3"
              dangerouslySetInnerHTML={{ __html: row.content }}
            />
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
