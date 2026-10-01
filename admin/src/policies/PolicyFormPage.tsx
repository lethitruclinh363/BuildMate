import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { Input } from '@/components/Input';
import { PageHeader } from '@/components/PageHeader';
import { RichTextEditor } from '@/policies/RichTextEditor';
import {
  POLICY_STATUSES,
  POLICY_TYPES,
  getApiErrorMessage,
  policyApi,
  type PolicyStatus,
  type PolicyType,
} from '@/policies/policy.api';
import { useToastStore } from '@/stores/toast.store';

export function PolicyFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const push = useToastStore((s) => s.push);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PolicyType>('TERMS_OF_SERVICE');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [version, setVersion] = useState('1.0');
  const [status, setStatus] = useState<PolicyStatus>('DRAFT');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let cancelled = false;
    policyApi.get(id).then((policy) => {
      if (cancelled) return;
      setTitle(policy.title);
      setType(policy.type);
      setLanguage(policy.language);
      setVersion(policy.version);
      setStatus(policy.status);
      setEffectiveDate(policy.effectiveDate ? policy.effectiveDate.slice(0, 10) : '');
      setContent(policy.content || '');
    }).catch(() => {
      if (!cancelled) setError(t('policy.missing'));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, id, t]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const body = {
      title,
      type,
      language,
      version,
      status,
      content,
      effectiveDate: effectiveDate ? new Date(effectiveDate).toISOString() : '',
    };
    try {
      const saved = mode === 'create' ? await policyApi.create(body) : await policyApi.update(id || '', body);
      push('success', t('policy.saved'));
      navigate(`/policies/${saved.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('policy.eyebrow')}
        title={mode === 'create' ? t('policy.newTitle') : t('policy.editTitle')}
        actions={<Link to="/policies" className="text-sm text-copper-300">{t('policy.back')}</Link>}
      />
      <GlassCard>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Input id="policy-title" label={t('policy.titleField')} value={title} onChange={(event) => setTitle(event.target.value)} required />
          <div className="grid gap-4 md:grid-cols-2">
            <FieldSelect label={t('policy.type')} value={type} onChange={(value) => setType(value as PolicyType)} options={POLICY_TYPES.map((item) => [item, t(`policy.types.${item}`)])} />
            <FieldSelect label={t('policy.language')} value={language} onChange={(value) => setLanguage(value as 'vi' | 'en')} options={[['vi', 'VI'], ['en', 'EN']]} />
            <Input id="policy-version" label={t('policy.version')} value={version} onChange={(event) => setVersion(event.target.value)} required />
            <FieldSelect label={t('policy.status')} value={status} onChange={(value) => setStatus(value as PolicyStatus)} options={POLICY_STATUSES.map((item) => [item, t(`policy.statuses.${item}`)])} />
            <Input id="policy-date" label={t('policy.effective')} type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          </div>
          <RichTextEditor value={content} onChange={setContent} />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div>
            <Button type="submit" loading={loading}>{t('policy.save')}</Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-copper-500/60"
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>{text}</option>
        ))}
      </select>
    </label>
  );
}
