import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, ShieldCheck } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { TextArea } from '@/components/Input';
import { getApiErrorMessage } from '@/services/api';
import { mediaUrl } from '@/lib/utils';
import type { DocumentType, PartnerApplication, VerificationStatus } from '@/types/admin';
import { useToastStore } from '@/stores/toast.store';

type Actor = 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';

const CREW_DOCS = new Set<DocumentType>(['BUSINESS_LICENSE', 'CERTIFICATE', 'ID_CARD', 'PORTFOLIO']);
const STORE_DOCS = new Set<DocumentType>(['BUSINESS_LICENSE', 'ID_CARD', 'STORE_IMAGE']);

const filters: Array<{ id: VerificationStatus | ''; label: 'queue' | 'all' | 'live' | 'returned' | 'drafts' }> = [
  { id: 'SUBMITTED', label: 'queue' },
  { id: '', label: 'all' },
  { id: 'APPROVED', label: 'live' },
  { id: 'REJECTED', label: 'returned' },
  { id: 'DRAFT', label: 'drafts' },
];

function countStatus(rows: PartnerApplication[], status: VerificationStatus) {
  return rows.filter((row) => row.verificationStatus === status).length;
}

export function AdminVerificationPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const requestedId = params.get('id');
  const [actor, setActor] = useState<Actor>('CONTRACTOR');
  const [status, setStatus] = useState<VerificationStatus | ''>(requestedId ? '' : 'SUBMITTED');
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const push = useToastStore((s) => s.push);

  const { data, loading, error, reload } = useAsync(() => adminApi.listVerifications(), []);

  const actorFromRequest = useMemo(() => {
    if (!requestedId || !data) return null;
    const row = data.find((item) => item.id === requestedId);
    if (row?.user?.role === 'MATERIAL_STORE_OWNER') return 'MATERIAL_STORE_OWNER' as const;
    if (row?.user?.role === 'CONTRACTOR') return 'CONTRACTOR' as const;
    return null;
  }, [data, requestedId]);

  useEffect(() => {
    if (actorFromRequest) setActor(actorFromRequest);
  }, [actorFromRequest]);

  const roleRows = useMemo(
    () => (data || []).filter((row) => row.user?.role === actor),
    [data, actor]
  );
  const visible = useMemo(
    () => (status ? roleRows.filter((row) => row.verificationStatus === status) : roleRows),
    [roleRows, status]
  );
  const selected = visible.find((row) => row.id === selectedId) || visible[0] || null;
  const documents = selected
    ? selected.documents.filter((doc) => (actor === 'CONTRACTOR' ? CREW_DOCS.has(doc.type) : STORE_DOCS.has(doc.type)))
    : [];

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setReason('');
      push('success', ok);
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const chooseActor = (next: Actor) => {
    setActor(next);
    setSelectedId(null);
    setReason('');
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('verify.eyebrow')}
        title={t('verify.title')}
        description={actor === 'CONTRACTOR' ? t('verify.crewDesc') : t('verify.storeDesc')}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => chooseActor('CONTRACTOR')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${actor === 'CONTRACTOR' ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'}`}
        >
          {t('verify.crewTab')}
        </button>
        <button
          type="button"
          onClick={() => chooseActor('MATERIAL_STORE_OWNER')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${actor === 'MATERIAL_STORE_OWNER' ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'}`}
        >
          {t('verify.storeTab')}
        </button>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label={t('verify.queue')} value={countStatus(roleRows, 'SUBMITTED')} />
        <StatCard label={t('verify.approved')} value={countStatus(roleRows, 'APPROVED')} />
        <StatCard label={t('verify.rejected')} value={countStatus(roleRows, 'REJECTED')} />
        <StatCard label={t('verify.draft')} value={countStatus(roleRows, 'DRAFT')} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatus(filter.id)}
            className={`rounded-full px-4 py-1.5 text-sm ${status === filter.id ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'}`}
          >
            {t(`verify.${filter.label}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.2fr]">
        <GlassCard padding={false} className="max-h-[70vh] overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="p-6 text-sm text-white/40">{t('verify.empty')}</p>
          ) : (
            visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`mb-2 w-full rounded-2xl p-4 text-left ${
                  selected?.id === item.id ? 'bg-copper-500/15 text-white' : 'bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg">{item.businessName || item.user?.name}</p>
                    <p className="text-xs text-white/45">
                      {item.user?.email} · {item.city}
                    </p>
                  </div>
                  <Badge tone={item.verificationStatus === 'APPROVED' ? 'success' : 'copper'}>{item.verificationStatus}</Badge>
                </div>
              </button>
            ))
          )}
        </GlassCard>
        {selected ? (
          <GlassCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-copper-400">{t('verify.application')}</p>
                <h2 className="font-display text-2xl">{selected.businessName}</h2>
                {actor === 'CONTRACTOR' ? (
                  <p className="text-sm text-white/50">
                    {selected.user?.name} · {selected.user?.phone || '—'} · {t('verify.years', { n: selected.yearsExperience || 0 })}
                  </p>
                ) : (
                  <p className="text-sm text-white/50">
                    {t('verify.representative')}: {selected.user?.name || '—'} · {selected.user?.phone || '—'}
                  </p>
                )}
              </div>
              <Badge>{selected.verificationStatus}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/70">{selected.description || t('verify.noNarrative')}</p>
            <p className="mt-2 text-sm text-white/45">
              {selected.address}, {selected.city} · {t('verify.tax')} {selected.taxCode || '—'}
            </p>
            {actor === 'CONTRACTOR' && selected.serviceAreas?.length ? (
              <p className="mt-2 text-sm text-white/45">
                {t('verify.areas')}: {selected.serviceAreas.join(', ')}
              </p>
            ) : null}
            {actor === 'MATERIAL_STORE_OWNER' && selected.serviceAreas?.length ? (
              <p className="mt-2 text-sm text-white/45">
                {t('verify.delivery')}: {selected.serviceAreas.join(', ')}
              </p>
            ) : null}
            <h3 className="mt-6 font-display text-lg">{t('verify.documents')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {documents.map((doc) => (
                <a
                  key={doc._id}
                  href={mediaUrl(doc.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950/40"
                >
                  {doc.mimeType.startsWith('image/') ? (
                    <img src={mediaUrl(doc.url)} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <div className="grid h-32 place-items-center text-copper-300">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold">{doc.type}</p>
                    <p className="truncate text-xs text-white/40">{doc.originalName}</p>
                  </div>
                </a>
              ))}
            </div>
            {selected.rejectionReason ? (
              <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{selected.rejectionReason}</p>
            ) : null}
            {selected.verificationStatus === 'SUBMITTED' ? (
              <div className="mt-6 space-y-3 border-t border-white/8 pt-5">
                <TextArea label={t('verify.returnReason')} value={reason} onChange={setReason} />
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy} onClick={() => void act(() => adminApi.approve(selected.id), t('verify.approvedToast'))}>
                    <ShieldCheck className="h-4 w-4" /> {t('verify.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    loading={busy}
                    onClick={() => void act(() => adminApi.reject(selected.id, reason), t('verify.returnedToast'))}
                  >
                    {t('verify.return')}
                  </Button>
                </div>
              </div>
            ) : null}
          </GlassCard>
        ) : (
          <GlassCard className="grid place-items-center text-sm text-white/40">{t('verify.select')}</GlassCard>
        )}
      </div>
    </div>
  );
}
