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
import { EkycReviewPanel } from '@/pages/verification/EkycReviewPanel';
import { AdminLocationSection } from '@/pages/verification/AdminLocationSection';
import { LockedContactValue, OperatingHoursPanel } from '@/partners/OperatingHoursPanel';
import { getApiErrorMessage } from '@/services/api';
import { mediaUrl } from '@/lib/utils';
import type { DocumentType, PartnerApplication, VerificationDocument, VerificationStatus } from '@/types/admin';
import { useToastStore } from '@/stores/toast.store';

function serviceTitle(translate: (key: string) => string, name: string) {
  const hit = translate(`serviceCatalog.${name}`);
  if (!hit || hit === '—' || hit === `serviceCatalog.${name}`) return name;
  return hit;
}

function categoryTitle(translate: (key: string) => string, item: { name: string; type?: string }) {
  if (item.type === 'CUSTOM') return item.name;
  const key = `category.${item.name}`;
  const hit = translate(key);
  if (!hit || hit === '—' || hit === key) return item.name;
  return hit;
}

function knownSystemCategory(translate: (key: string) => string, name: string) {
  const key = `category.${name}`;
  const hit = translate(key);
  return Boolean(name && hit && hit !== '—' && hit !== key);
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

function vTone(status: string): 'success' | 'warn' | 'danger' | 'navy' {
  if (status === 'APPROVED') return 'success';
  if (status === 'SUBMITTED') return 'warn';
  if (status === 'REJECTED') return 'danger';
  return 'navy';
}

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

  const imageDocuments = documents.filter(
    (doc) => doc.mimeType?.startsWith('image/') && !String(doc.url || '').startsWith('private:ekyc:')
  );
  const fileDocuments = documents.filter(
    (doc) => !doc.mimeType?.startsWith('image/') && !String(doc.url || '').startsWith('private:ekyc:')
  );

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
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              status === filter.id
                ? 'bg-[#173B4F] text-white shadow-sm'
                : 'border border-[#E1E7ED] bg-white text-[#526477] hover:bg-[#F8FAFC]'
            }`}
          >
            {t(`verify.${filter.label}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.2fr]">
        <GlassCard padding={false} className="max-h-[70vh] overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-[#7E92A2]">{t('verify.empty')}</p>
          ) : (
            visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`mb-2 w-full rounded-xl border p-4 text-left transition ${
                  selected?.id === item.id
                    ? 'border-[#2B6280] bg-[#EBF3F7] shadow-sm'
                    : 'border-[#E1E7ED] bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-semibold text-[#16283C]">{item.businessName || item.user?.name}</p>
                    <p className="text-xs text-[#526477]">
                      {item.user?.email} · {item.city}
                    </p>
                    {item.activation ? (
                      <p className="mt-1 text-xs text-[#526477]">
                        {t('verify.activationLabel')}: {t(item.activation.activationStatus === 'LIVE' ? 'verify.activationLive' : item.activation.activationStatus === 'PAUSED' ? 'verify.activationPaused' : 'verify.activationInactive')}
                        {' · '}
                        {t('verify.profilePercent', { n: item.activation.percent })}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={vTone(item.verificationStatus)}>{item.verificationStatus}</Badge>
                </div>
              </button>
            ))
          )}
        </GlassCard>
        {selected ? (
          <GlassCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#526477]">{t('verify.application')}</p>
                <h2 className="font-display text-2xl font-bold text-[#16283C]">{selected.businessName}</h2>
                {actor === 'CONTRACTOR' ? (
                  <p className="text-sm text-[#526477]">
                    {selected.user?.name} · {selected.user?.phone || '—'} · {t('verify.years', { n: selected.yearsExperience || 0 })}
                  </p>
                ) : (
                  <p className="text-sm text-[#526477]">
                    {t('verify.representative')}: {selected.user?.name || '—'} · {selected.user?.phone || '—'}
                  </p>
                )}
              </div>
              <div className="text-right">
                <Badge tone={vTone(selected.verificationStatus)}>{selected.verificationStatus}</Badge>
                {selected.activation ? (
                  <p className="mt-2 text-xs text-[#526477]">
                    {t('verify.activationLabel')}: {t(selected.activation.activationStatus === 'LIVE' ? 'verify.activationLive' : selected.activation.activationStatus === 'PAUSED' ? 'verify.activationPaused' : 'verify.activationInactive')}
                    <br />
                    {t('verify.profilePercent', { n: selected.activation.percent })}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#16283C]">{selected.description || t('verify.noNarrative')}</p>
            <p className="mt-2 text-sm text-[#526477]">
              {selected.address}, {selected.city} · {t('verify.tax')} {selected.taxCode || '—'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LockedContactValue label={t('verify.phone')} value={selected.user?.phone} />
              <LockedContactValue label={t('verify.email')} value={selected.user?.email} />
            </div>
            <div className="mt-4">
              <OperatingHoursPanel
                title={t('verify.operatingHours')}
                hours={selected.weeklyHours || selected.publicProfile?.weeklyHours || selected.store?.weeklyHours || null}
                unsetLabel={t('verify.hoursUnset')}
                restLabel={t('verify.hoursRest')}
                dayLabels={{
                  mon: t('verify.dayMon'),
                  tue: t('verify.dayTue'),
                  wed: t('verify.dayWed'),
                  thu: t('verify.dayThu'),
                  fri: t('verify.dayFri'),
                  sat: t('verify.daySat'),
                  sun: t('verify.daySun'),
                }}
              />
            </div>
            {actor === 'CONTRACTOR' ? (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="font-display text-lg">{t('verify.systemServices')}</h3>
                  {(selected.services || []).some((item) => item.type !== 'CUSTOM') ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {(selected.services || [])
                        .filter((item) => item.type !== 'CUSTOM')
                        .map((item) => (
                          <li key={`${item.category}-${item.name}`} className="rounded-full border border-[#E1E7ED] bg-[#F8FAFC] px-3 py-1.5 text-sm text-[#16283C]">
                            {serviceTitle(t, item.name)}
                            <span className="ml-2 text-xs text-[#526477]">{t(`category.${item.category}`)}</span>
                            {item.completionStatus === 'COMPLETED' ? (
                              <span className="ml-2 text-xs font-medium text-emerald-700">✓ {t('verify.serviceComplete')}</span>
                            ) : item.completionStatus === 'INCOMPLETE' ? (
                              <span className="ml-2 text-xs font-medium text-amber-700">⚠ {t('verify.serviceIncomplete')}</span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-[#526477]">{t('verify.noServices')}</p>
                  )}
                </div>
                <div>
                  <h3 className="font-display text-lg">{t('verify.customServices')}</h3>
                  <p className="mt-1 text-xs text-[#526477]">{t('verify.customCatalogNote')}</p>
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
                            <li key={`custom-${item.serviceId || item.name}`} className="rounded-2xl border border-[#E1E7ED] bg-white px-3 py-3 text-sm text-[#16283C] shadow-sm">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#16283C]">
                                    {item.name}
                                    <span className="ml-2 text-xs font-semibold tracking-wide text-[#2B6280]">{t('verify.customBadge')}</span>
                                  </p>
                                  <p className="mt-1 text-xs text-[#526477]">
                                    {t('verify.customCategory')}: {item.category && item.category !== 'Custom' ? t(`category.${item.category}`) : '—'}
                                    {' · '}
                                    {t('verify.customProposer')}: {selected.businessName || selected.user?.name || '—'}
                                  </p>
                                  <p className="mt-1 text-xs text-[#526477]">{statusLabel}</p>
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
            {actor === 'MATERIAL_STORE_OWNER' ? <StoreCategoryReview application={selected} /> : null}
            {selected.publicProfile ? (
              <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3">
                <h3 className="font-display text-lg">{t('verify.publicProfile')}</h3>
                <p className="mt-1 text-xs text-white/45">{t('verify.publicProfileHint')}</p>
                <p className="mt-3 text-sm font-semibold text-white">{selected.publicProfile.displayName}</p>
                {selected.publicProfile.description ? <p className="mt-2 text-sm leading-6 text-white/70">{selected.publicProfile.description}</p> : null}
                <p className="mt-2 text-sm text-white/55">
                  {[selected.publicProfile.city, selected.publicProfile.openingHours, ...(selected.publicProfile.serviceAreas || [])].filter(Boolean).join(' · ')}
                </p>
                {selected.publicProfile.showroomNote ? <p className="mt-2 text-sm text-white/70">{selected.publicProfile.showroomNote}</p> : null}
                {selected.publicProfile.deliveryNote ? <p className="mt-2 text-sm text-white/70">{selected.publicProfile.deliveryNote}</p> : null}
              </div>
            ) : null}
            <AdminLocationSection application={selected} actor={actor} />
            <h3 className="mt-6 font-display text-lg">{t('verify.images')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {imageDocuments.map((doc) => (
                <AdminDocCard
                  key={doc._id}
                  profileId={selected.id}
                  doc={doc}
                  title={docTitle(doc.type, t)}
                  tone="dark"
                />
              ))}
            </div>
            {imageDocuments.length === 0 && actor !== 'CONTRACTOR' ? <p className="mt-2 text-sm text-white/45">{t('verify.noPortfolio')}</p> : null}
            <h3 className="mt-6 font-display text-lg">{t('verify.documents')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {fileDocuments.map((doc) => (
                <AdminDocCard
                  key={doc._id}
                  profileId={selected.id}
                  doc={doc}
                  title={docTitle(doc.type, t)}
                  tone="light"
                />
              ))}
            </div>
            {selected.rejectionReason ? (
              <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{selected.rejectionReason}</p>
            ) : null}
            {actor === 'CONTRACTOR' ? (
              <EkycReviewPanel
                applicationId={selected.id}
                ekyc={selected.ekyc}
                busy={busy}
                reasonReady={reason.trim().length >= 8}
                t={t}
                onRetake={() => void act(() => adminApi.retakeEkyc(selected.id, reason), t('verify.ekycRetakeToast'))}
              />
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

function AdminDocCard({
  profileId,
  doc,
  title,
  tone,
}: {
  profileId: string;
  doc: VerificationDocument;
  title: string;
  tone: 'dark' | 'light';
}) {
  const privateDoc = String(doc.url || '').startsWith('private:');
  const [src, setSrc] = useState(() => (privateDoc ? '' : mediaUrl(doc.url)));

  useEffect(() => {
    if (!privateDoc) {
      setSrc(mediaUrl(doc.url));
      return undefined;
    }
    let blobUrl = '';
    let cancelled = false;
    adminApi
      .verificationFile(profileId, doc._id)
      .then((url) => {
        blobUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [privateDoc, profileId, doc._id, doc.url]);

  const dark = tone === 'dark';
  return (
    <a
      href={src || undefined}
      target="_blank"
      rel="noreferrer"
      className={
        dark
          ? 'overflow-hidden rounded-2xl border border-white/10 bg-navy-950/40'
          : 'overflow-hidden rounded-2xl border border-[#E1E7ED] bg-white text-[#16283C] shadow-sm hover:border-[#2B6280]/40 transition'
      }
    >
      {doc.mimeType.startsWith('image/') ? (
        src ? <img src={src} alt="" className="h-32 w-full object-cover" /> : <div className="h-32 bg-black/10" />
      ) : (
        <div className={`grid h-32 place-items-center ${dark ? 'text-white/60' : 'text-[#2B6280]'}`}>
          <FileText className="h-6 w-6" />
        </div>
      )}
      <div className="p-3">
        <p className={`text-sm font-semibold ${dark ? '' : 'text-[#16283C]'}`}>{title}</p>
        <p className={`truncate text-xs ${dark ? 'text-white/40' : 'text-[#526477]'}`}>{doc.originalName}</p>
      </div>
    </a>
  );
}

function StoreCategoryReview({ application }: { application: PartnerApplication }) {
  const { t, i18n } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const categories: NonNullable<PartnerApplication['materialCategories']> = application.materialCategories?.length
    ? application.materialCategories
    : (application.serviceAreas || [])
        .filter((name) => knownSystemCategory(t, name))
        .map((name) => ({ name, type: 'SYSTEM' as const, status: 'APPROVED' as const, createdAt: null }));
  const system = categories.filter((item) => item.type !== 'CUSTOM');
  const custom = categories.filter((item) => item.type === 'CUSTOM');
  const open = categories.find((item) => `${item.type || 'SYSTEM'}:${item.name}` === openKey) || null;

  function statusLabel(status?: string) {
    if (status === 'REJECTED') return t('verify.customStatusRejected');
    if (status === 'PENDING_APPROVAL') return t('verify.customStatusPending');
    if (status === 'ACTIVE' || status === 'APPROVED' || !status) return t('verify.customStatusApproved');
    return status;
  }

  function renderChips(items: typeof categories) {
    return (
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const key = `${item.type || 'SYSTEM'}:${item.name}`;
          const active = openKey === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpenKey(active ? null : key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-[#2B6280] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#16283C] hover:bg-[#E2E8F0]'}`}
              >
                {categoryTitle(t, item)}
                <span className={`ml-2 text-xs font-semibold tracking-wide ${active ? 'text-white/90' : 'text-[#2B6280]'}`}>
                  {item.type === 'CUSTOM' ? t('verify.customBadge') : t('verify.systemBadge')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="font-display text-lg">{t('verify.registeredCategories')}</h3>
      {categories.length === 0 ? (
        <p className="mt-2 text-sm text-white/45">{t('verify.noRegisteredCategories')}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {system.length ? (
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-white/70">{t('verify.systemCategories')}</h4>
              {renderChips(system)}
            </div>
          ) : null}
          {custom.length ? (
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-white/70">{t('verify.customCategories')}</h4>
              {renderChips(custom)}
            </div>
          ) : null}
          {open ? (
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/80">
              <p>
                <span className="text-white/45">{t('verify.categoryName')}: </span>
                {categoryTitle(t, open)}
              </p>
              <p className="mt-1">
                <span className="text-white/45">{t('verify.categoryType')}: </span>
                {open.type === 'CUSTOM' ? t('verify.customBadge') : t('verify.systemBadge')}
              </p>
              <p className="mt-1">
                <span className="text-white/45">{t('verify.categoryStatus')}: </span>
                {statusLabel(open.status)}
              </p>
              <p className="mt-1">
                <span className="text-white/45">{t('verify.categoryStore')}: </span>
                {application.businessName || application.user?.name}
              </p>
              {open.createdAt ? (
                <p className="mt-1">
                  <span className="text-white/45">{t('verify.categoryCreated')}: </span>
                  {new Date(open.createdAt).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function isPdf(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('.pdf');
}

function serviceLabel(name: string, t: (key: string) => string) {
  if (!name) return '';
  const key = `serviceCatalog.${name}`;
  const hit = t(key);
  return hit && hit !== key ? hit : name;
}

function PortfolioReview({ portfolio }: { portfolio?: PartnerApplication['portfolio'] }) {
  const { t } = useTranslation();
  const projects = portfolio?.projects || [];
  const projectUrls = new Set(projects.flatMap((project) => project.images || []));
  const shots = [
    portfolio?.avatar ? { url: portfolio.avatar, label: t('verify.avatar') } : null,
    portfolio?.teamLogo ? { url: portfolio.teamLogo, label: t('verify.teamLogo') } : null,
    portfolio?.workshop ? { url: portfolio.workshop, label: t('verify.workshop') } : null,
    ...(portfolio?.construction || []).filter((url) => !projectUrls.has(url)).map((url) => ({ url, label: t('verify.construction') })),
    ...(portfolio?.certificates || []).map((url) => ({ url, label: t('verify.certificates') })),
  ].filter((item): item is { url: string; label: string } => item !== null);

  return (
    <div className="mt-6">
      <h3 className="font-display text-lg">{t('verify.portfolio')}</h3>
      {shots.length === 0 && projects.length === 0 ? (
        <p className="mt-2 text-sm text-white/45">{t('verify.noPortfolio')}</p>
      ) : null}
      {shots.length ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.map((shot) => (
            <a
              key={`${shot.label}-${shot.url}`}
              href={mediaUrl(shot.url)}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-2xl border border-[#E1E7ED] bg-white text-[#16283C] shadow-sm hover:border-[#2B6280]/40 transition"
            >
              {isPdf(shot.url) ? (
                <div className="grid h-28 place-items-center text-sm font-semibold text-[#2B6280]">PDF</div>
              ) : (
                <img src={mediaUrl(shot.url)} alt="" className="h-28 w-full object-cover" />
              )}
              <p className="px-3 py-2 text-xs text-[#526477]">{shot.label}</p>
            </a>
          ))}
        </div>
      ) : null}
      {projects.length ? (
        <div className="mt-5 border-t border-[#E1E7ED] pt-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#526477]">{t('verify.projectsTitle')}</h4>
          <div className="mt-3 divide-y divide-[#E1E7ED]">
            {projects.map((project, index) => (
              <div key={project.id || `${project.serviceId}-${index}`} className="py-4">
                <p className="text-sm font-semibold text-[#16283C]">{t('verify.projectNumber', { n: index + 1 })}</p>
                <p className="mt-1 text-sm text-[#526477]">
                  {t('verify.projectService')}: {serviceLabel(project.serviceNameSnapshot, t)}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#526477]">{t('verify.projectDescription')}</p>
                <p className="mt-1 text-sm text-[#16283C]">{project.description}</p>
                {project.images?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {project.images.map((url) => (
                      <a key={url} href={mediaUrl(url)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-[#E1E7ED] hover:border-[#2B6280]/40 transition">
                        <img src={mediaUrl(url)} alt="" className="aspect-[4/3] w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
