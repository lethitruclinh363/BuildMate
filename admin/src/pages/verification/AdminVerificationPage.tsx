import { useMemo, useState } from 'react';
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

function serviceTitle(translate: (key: string) => string, name: string) {
  const hit = translate(`serviceCatalog.${name}`);
  if (!hit || hit === `serviceCatalog.${name}`) return name;
  return hit;
}

type Actor = 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';

const CREW_DOCS = new Set<DocumentType>(['BUSINESS_LICENSE', 'CERTIFICATE', 'CCCD_FRONT', 'CCCD_BACK', 'ID_CARD', 'PORTFOLIO']);
const STORE_DOCS = new Set<DocumentType>(['BUSINESS_LICENSE', 'CERTIFICATE', 'CCCD_FRONT', 'CCCD_BACK', 'ID_CARD', 'STORE_IMAGE']);

const filters: Array<{ id: VerificationStatus | ''; label: 'queue' | 'all' | 'live' | 'returned' | 'drafts' }> = [
  { id: 'SUBMITTED', label: 'queue' },
  { id: '', label: 'all' },
  { id: 'APPROVED', label: 'live' },
  { id: 'REJECTED', label: 'returned' },
  { id: 'DRAFT', label: 'drafts' },
];

function docTitle(type: DocumentType, translate: (key: string) => string) {
  if (type === 'CCCD_FRONT') return translate('verify.cccdFront');
  if (type === 'CCCD_BACK') return translate('verify.cccdBack');
  if (type === 'BUSINESS_LICENSE') return translate('verify.license');
  if (type === 'CERTIFICATE') return translate('verify.certificate');
  return type;
}

function countStatus(rows: PartnerApplication[], status: VerificationStatus) {
  return rows.filter((row) => row.verificationStatus === status).length;
}

export function AdminVerificationPage({ actor }: { actor: Actor }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const requestedId = params.get('id');
  const [status, setStatus] = useState<VerificationStatus | ''>(requestedId ? '' : 'SUBMITTED');
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const push = useToastStore((s) => s.push);

  const { data, loading, error, reload } = useAsync(() => adminApi.listVerifications(), []);

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

  const imageDocuments = documents.filter((doc) => doc.mimeType?.startsWith('image/'));
  const fileDocuments = documents.filter((doc) => !doc.mimeType?.startsWith('image/'));

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.partners')}
        title={actor === 'CONTRACTOR' ? t('verify.crewTitle') : t('verify.storeTitle')}
        description={actor === 'CONTRACTOR' ? t('verify.crewDesc') : t('verify.storeDesc')}
      />
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
            {actor === 'CONTRACTOR' ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="font-display text-lg">{t('verify.systemServices')}</h3>
                  {(selected.services || []).some((item) => item.type !== 'CUSTOM') ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {(selected.services || [])
                        .filter((item) => item.type !== 'CUSTOM')
                        .map((item) => (
                          <li key={`${item.category}-${item.name}`} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
                            {serviceTitle(t, item.name)}
                            <span className="ml-2 text-xs text-white/50">{t(`category.${item.category}`)}</span>
                            {item.completionStatus === 'COMPLETED' ? (
                              <span className="ml-2 text-xs text-emerald-300">✓ {t('verify.serviceComplete')}</span>
                            ) : item.completionStatus === 'INCOMPLETE' ? (
                              <span className="ml-2 text-xs text-amber-200">⚠ {t('verify.serviceIncomplete')}</span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">{t('verify.noServices')}</p>
                  )}
                </div>
                <div>
                  <h3 className="font-display text-lg">{t('verify.customServices')}</h3>
                  <p className="mt-1 text-xs text-white/45">{t('verify.customCatalogNote')}</p>
                  {(selected.services || []).some((item) => item.type === 'CUSTOM') ? (
                    <ul className="mt-2 space-y-2">
                      {(selected.services || [])
                        .filter((item) => item.type === 'CUSTOM')
                        .map((item) => {
                          const catalogId = item.serviceId && /^[a-f0-9]{24}$/i.test(item.serviceId) ? item.serviceId : '';
                          const statusLabel =
                            item.status === 'APPROVED'
                              ? t('verify.customStatusApproved')
                              : item.status === 'REJECTED'
                                ? t('verify.customStatusRejected')
                                : t('verify.customStatusPending');
                          return (
                            <li key={`custom-${item.serviceId || item.name}`} className="rounded-2xl bg-white/10 px-3 py-3 text-sm text-white">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold">
                                    {item.name}
                                    <span className="ml-2 text-xs font-semibold tracking-wide text-copper-300">{t('verify.customBadge')}</span>
                                  </p>
                                  <p className="mt-1 text-xs text-white/55">
                                    {t('verify.customCategory')}: {item.category && item.category !== 'Custom' ? t(`category.${item.category}`) : '—'}
                                    {' · '}
                                    {t('verify.customProposer')}: {selected.businessName || selected.user?.name || '—'}
                                  </p>
                                  <p className="mt-1 text-xs text-white/70">{statusLabel}</p>
                                </div>
                                {catalogId ? (
                                  <div className="flex flex-wrap gap-2">
                                    {item.status !== 'APPROVED' && item.status !== 'ACTIVE' ? (
                                      <Button
                                        disabled={busy}
                                        onClick={() =>
                                          act(() => adminApi.reviewCatalogService(catalogId, 'approve'), t('verify.serviceApprovedToast'))
                                        }
                                      >
                                        {t('verify.approveService')}
                                      </Button>
                                    ) : null}
                                    {item.status !== 'REJECTED' ? (
                                      <Button
                                        variant="danger"
                                        disabled={busy}
                                        onClick={() =>
                                          act(() => adminApi.reviewCatalogService(catalogId, 'reject'), t('verify.serviceRejectedToast'))
                                        }
                                      >
                                        {t('verify.rejectService')}
                                      </Button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">{t('verify.noServices')}</p>
                  )}
                </div>
              </div>
            ) : null}
            {actor === 'CONTRACTOR' ? <PortfolioReview portfolio={selected.portfolio} /> : null}
            {actor === 'CONTRACTOR' && selected.serviceAreas?.length ? (
              <p className="mt-2 text-sm text-white/45">
                {t('verify.areas')}: {selected.serviceAreas.join(', ')}
              </p>
            ) : null}
            {actor === 'MATERIAL_STORE_OWNER' ? (
              <div className="mt-4">
                <h3 className="font-display text-lg">{t('verify.services')}</h3>
                {selected.serviceAreas?.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {selected.serviceAreas.map((name) => (
                      <li key={name} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
                        {t(`category.${name}`)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-white/45">{t('verify.noServices')}</p>
                )}
              </div>
            ) : null}
            <h3 className="mt-6 font-display text-lg">{t('verify.images')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {imageDocuments.map((doc) => (
                <a
                  key={doc._id}
                  href={mediaUrl(doc.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950/40"
                >
                  <img src={mediaUrl(doc.url)} alt="" className="h-32 w-full object-cover" />
                  <div className="p-3">
                    <p className="text-sm font-semibold">{docTitle(doc.type, t)}</p>
                    <p className="truncate text-xs text-white/40">{doc.originalName}</p>
                  </div>
                </a>
              ))}
            </div>
            {imageDocuments.length === 0 && actor !== 'CONTRACTOR' ? <p className="mt-2 text-sm text-white/45">{t('verify.noPortfolio')}</p> : null}
            <h3 className="mt-6 font-display text-lg">{t('verify.documents')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {fileDocuments.map((doc) => (
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
                    <p className="text-sm font-semibold">{docTitle(doc.type, t)}</p>
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
                <p className="text-xs text-white/40">{t('verify.reasonHint')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy} onClick={() => void act(() => adminApi.approve(selected.id), t('verify.approvedToast'))}>
                    <ShieldCheck className="h-4 w-4" /> {t('verify.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    loading={busy}
                    disabled={reason.trim().length < 8}
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

function isPdf(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

function PortfolioReview({ portfolio }: { portfolio?: PartnerApplication['portfolio'] }) {
  const { t } = useTranslation();
  const shots = [
    portfolio?.avatar ? { url: portfolio.avatar, label: t('verify.avatar') } : null,
    portfolio?.teamLogo ? { url: portfolio.teamLogo, label: t('verify.teamLogo') } : null,
    portfolio?.workshop ? { url: portfolio.workshop, label: t('verify.workshop') } : null,
    ...(portfolio?.construction || []).map((url) => ({ url, label: t('verify.construction') })),
    ...(portfolio?.certificates || []).map((url) => ({ url, label: t('verify.certificates') })),
  ].filter((item): item is { url: string; label: string } => item !== null);

  return (
    <div className="mt-6">
      <h3 className="font-display text-lg">{t('verify.portfolio')}</h3>
      {shots.length === 0 ? (
        <p className="mt-2 text-sm text-white/45">{t('verify.noPortfolio')}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.map((shot) => (
            <a
              key={`${shot.label}-${shot.url}`}
              href={mediaUrl(shot.url)}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-2xl border border-white/10 bg-navy-950/40"
            >
              {isPdf(shot.url) ? (
                <div className="grid h-28 place-items-center text-sm font-semibold text-copper-300">PDF</div>
              ) : (
                <img src={mediaUrl(shot.url)} alt="" className="h-28 w-full object-cover" />
              )}
              <p className="px-3 py-2 text-xs text-white/60">{shot.label}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
