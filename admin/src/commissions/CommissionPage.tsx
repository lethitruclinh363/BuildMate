import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { Input } from '@/components/Input';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { vnd } from '@/lib/utils';
import { getApiErrorMessage } from '@/services/api';
import { useToastStore } from '@/stores/toast.store';

export function CommissionPage() {
  const { t } = useTranslation();
  const push = useToastStore((s) => s.push);
  const { data, loading, error, reload } = useAsync(async () => {
    const [rule, analytics] = await Promise.all([adminApi.getCommissionRule(), adminApi.analytics()]);
    return { rule, analytics };
  }, []);
  const [percentage, setPercentage] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await adminApi.setCommissionRule({
        percentage: Number(percentage || data.rule.percentage),
        name: name || data.rule.name,
      });
      push('success', t('pages.ruleUpdated'));
      setPercentage('');
      setName('');
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('pages.fee')}
        title={t('pages.commissionTitle')}
        description={t('pages.commissionDesc')}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('pages.activeRate')} value={`${data.rule.percentage}%`} hint={data.rule.name} />
        <StatCard label={t('pages.platformTake')} value={vnd(data.analytics.finance.commission)} />
        <StatCard label={t('pages.earning')} value={vnd(data.analytics.finance.contractorEarning)} />
      </div>
      <GlassCard className="max-w-xl">
        <p className="mb-4 text-sm text-[#526477]">{t('pages.commissionLock')}</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            id="pct"
            label={t('pages.percentage')}
            type="number"
            min={5}
            max={5}
            step="1"
            value={percentage}
            placeholder="5"
            disabled
            onChange={(e) => setPercentage(e.target.value)}
          />
          <Input
            id="rule-name"
            label={t('pages.ruleName')}
            value={name}
            placeholder={data.rule.name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" loading={busy} disabled>
            {t('pages.updateRule')}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
