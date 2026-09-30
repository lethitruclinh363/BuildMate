import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { getApiErrorMessage, policyApi, type PolicyRecord, type PolicyStatus } from '@/policies/policy.api';
import { useToastStore } from '@/stores/toast.store';

export function PolicyDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const push = useToastStore((s) => s.push);
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    policyApi.get(id).then(setPolicy).catch(() => setError(t('policy.missing')));
  }, [id, t]);

  async function setStatus(status: PolicyStatus) {
    if (!id) return;
    setLoading(true);
    try {
      const next = await policyApi.update(id, { status });
      setPolicy(next);
      push('success', t('policy.saved'));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!policy) {
    return <p className="text-sm text-white/60">{error || t('common.loading')}</p>;
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('policy.eyebrow')}
        title={policy.title}
        description={`${t(`policy.types.${policy.type}`)} · ${policy.language.toUpperCase()} · ${t('policy.version')} ${policy.version}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/policies" className="self-center text-sm text-copper-300">{t('policy.back')}</Link>
            <Button variant="outline" onClick={() => navigate(`/policies/${policy.id}/edit`)}>{t('policy.edit')}</Button>
            <Button variant="ghost" onClick={() => navigate(`/policies/${policy.id}/history`)}>{t('policy.history')}</Button>
          </div>
        }
      />
      <GlassCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={policy.status === 'ACTIVE' ? 'success' : policy.status === 'DRAFT' ? 'warn' : 'navy'}>
            {t(`policy.statuses.${policy.status}`)}
          </Badge>
          <span className="text-sm text-white/50">
            {t('policy.effective')}: {policy.effectiveDate ? new Date(policy.effectiveDate).toLocaleDateString(i18n.language) : '—'}
          </span>
          <span className="text-sm text-white/50">{t('policy.current')} {policy.version}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {policy.status !== 'ACTIVE' ? (
            <Button loading={loading} onClick={() => void setStatus('ACTIVE')}>{t('policy.activate')}</Button>
          ) : (
            <Button variant="outline" loading={loading} onClick={() => void setStatus('INACTIVE')}>{t('policy.deactivate')}</Button>
          )}
        </div>
      </GlassCard>
      <GlassCard>
        <div
          className="text-sm leading-relaxed text-white/75 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: policy.content || '' }}
        />
      </GlassCard>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
