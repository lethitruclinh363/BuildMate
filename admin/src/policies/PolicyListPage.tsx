import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { POLICY_STATUSES, POLICY_TYPES, policyApi, type PolicyRecord, type PolicyStatus } from '@/policies/policy.api';
import { useReturnState } from '@/lib/navigation';

function statusTone(status: PolicyStatus) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'DRAFT') return 'warn' as const;
  return 'navy' as const;
}

export function PolicyListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const back = useReturnState();
  const [rows, setRows] = useState<PolicyRecord[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      policyApi
        .list({ search, type, status, language })
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch(() => {
          if (!cancelled) setError(t('errors.failed'));
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, type, status, language, t]);

  return (
    <div>
      <PageHeader
        eyebrow={t('policy.eyebrow')}
        title={t('policy.title')}
        description={t('policy.description')}
        actions={<Button onClick={() => navigate('/policies/new', { state: back })}>{t('policy.create')}</Button>}
      />
      <GlassCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('policy.search')}
            className="rounded-xl border border-[#E1E7ED] bg-white px-3.5 py-2.5 text-sm text-[#16283C] placeholder:text-[#94A3B8] outline-none focus:border-[#2B6280]"
          />
          <Select value={type} onChange={setType} label={t('policy.all')} options={POLICY_TYPES.map((item) => [item, t(`policy.types.${item}`)])} />
          <Select value={status} onChange={setStatus} label={t('policy.all')} options={POLICY_STATUSES.map((item) => [item, t(`policy.statuses.${item}`)])} />
          <Select value={language} onChange={setLanguage} label={t('policy.all')} options={[['vi', 'VI'], ['en', 'EN']]} />
        </div>
      </GlassCard>
      {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}
      <GlassCard padding={false}>
        <DataTable
          columns={[t('policy.titleField'), t('policy.type'), t('policy.language'), t('policy.version'), t('policy.status'), t('policy.updated'), t('policy.actions')]}
          empty={<p className="p-6 text-center text-sm text-[#526477]">{t('policy.empty')}</p>}
          rows={rows.map((row) => [
            <span key="title" className="font-medium text-[#16283C]">{row.title}</span>,
            t(`policy.types.${row.type}`),
            row.language.toUpperCase(),
            row.version,
            <Badge key="status" tone={statusTone(row.status)}>{t(`policy.statuses.${row.status}`)}</Badge>,
            new Date(row.updatedAt).toLocaleDateString(i18n.language),
            <Link key="view" to={`/policies/${row.id}`} state={back} className="font-semibold text-[#2B6280] hover:text-[#173B4F] hover:underline">{t('policy.view')}</Link>,
          ])}
        />
      </GlassCard>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-[#E1E7ED] bg-white px-3.5 py-2.5 text-sm text-[#16283C] outline-none focus:border-[#2B6280]"
    >
      <option value="">{label}</option>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}
