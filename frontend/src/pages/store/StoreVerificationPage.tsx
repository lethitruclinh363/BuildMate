import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock3, FileText, Pencil } from 'lucide-react';
import { VerificationBadge } from '@/components/contractor/VerificationBadge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { materialStoreApi, mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { ContractorProfile, DocumentType, Storefront, VerificationDocument } from '@/types/partner';

const DOC_GROUPS: { titleKey: string; types: DocumentType[] }[] = [
  { titleKey: 'verify.representativeId', types: ['CCCD_FRONT', 'CCCD_BACK', 'ID_CARD'] },
  { titleKey: 'docType.BUSINESS_LICENSE', types: ['BUSINESS_LICENSE'] },
  { titleKey: 'docType.CERTIFICATE', types: ['CERTIFICATE'] },
  { titleKey: 'verify.storePhoto', types: ['STORE_IMAGE'] },
];

function when(value: string | null | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function fact(label: string, value: string | number | null | undefined, empty: string) {
  const text = value === 0 || value ? String(value) : empty;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-navy-800">{text}</p>
    </div>
  );
}

export function StoreVerificationPage() {
  const { t, locale } = useI18n();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [store, setStore] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await materialStoreApi.workspace();
      setProfile(res.data.data.profile);
      setStore(res.data.data.store);
    } catch {
      setError(t('verify.saveFail'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error || !profile) return <ErrorState body={error} onRetry={() => void refresh()} />;

  const status = profile.verificationStatus;
  const empty = t('verify.emptyValue');
  const photos = [
    { key: 'avatar', src: profile.portfolio?.avatar || '', label: t('verify.avatar') },
    { key: 'logo', src: profile.portfolio?.teamLogo || '', label: t('verify.teamLogo') },
    { key: 'cover', src: store?.coverImage || profile.portfolio?.workshop || '', label: t('verify.cover') },
    ...(store?.gallery || []).map((src, index) => ({ key: `gallery-${index}`, src, label: t('verify.storePhoto') })),
    ...(profile.portfolio?.certificates || []).map((src, index) => ({ key: `cert-${index}`, src, label: t('verify.certificatePhoto') })),
  ].filter((item) => item.src);

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('verify.recordEyebrow')}
        title={t('verify.storeTitle')}
        description={t('verify.storeRecordDescription')}
        actions={<VerificationBadge status={status} />}
      />

      <Card hover={false} className={bannerClass(status)}>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/80 text-navy-800">
            {status === 'APPROVED' ? <Check className="h-6 w-6" /> : status === 'REJECTED' ? <Pencil className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="font-display text-2xl text-navy-800">{bannerTitle(status, t)}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">{bannerBody(status, t)}</p>
            {status === 'REJECTED' && profile.rejectionReason ? (
              <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm text-red-700">{profile.rejectionReason}</p>
            ) : null}
            {status === 'DRAFT' || status === 'REJECTED' ? (
              <Link to="/partner/onboarding" className="mt-4 inline-flex rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white">
                {status === 'DRAFT' ? t('verify.continueOnboarding') : t('verify.editProfile')}
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6">
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.storeSection')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fact(t('verify.businessName'), store?.name || profile.businessName, empty)}
            {fact(t('verify.representative'), profile.representativeName, empty)}
            {fact(t('verify.phone'), profile.contactPhone || store?.phone, empty)}
            {fact(t('verify.email'), profile.contactEmail, empty)}
            {fact(t('verify.taxCode'), profile.taxCode, empty)}
            {fact(t('verify.storeState'), store?.status, empty)}
          </div>
          <div className="mt-4">{fact(t('verify.descriptionField'), store?.description || profile.description, empty)}</div>
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.locationSection')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fact(t('verify.address'), store?.address || profile.address, empty)}
            {fact(t('verify.city'), store?.city || profile.city, empty)}
            {fact(t('verify.deliveryArea'), profile.serviceAreas.join(', '), empty)}
          </div>
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.photosSection')}</h2>
          {photos.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <li key={photo.key}>
                  <img src={mediaUrl(photo.src)} alt={photo.label} className="h-36 w-full rounded-2xl object-cover" />
                  <p className="mt-2 text-xs font-semibold text-ink-400">{photo.label}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-400">{t('verify.noPhotos')}</p>
          )}
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.docsSection')}</h2>
          <DocumentGroups documents={profile.documents} />
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.historySection')}</h2>
          <ol className="mt-4 space-y-3 text-sm text-ink-600">
            <li>{t('verify.statusLabel')}: {t(status === 'SUBMITTED' ? 'verify.review' : status === 'APPROVED' ? 'verify.approved' : status === 'REJECTED' ? 'verify.revision' : 'verify.draft')}</li>
            <li>{t('verify.submittedOn')}: {when(profile.submittedAt, locale) || empty}</li>
            <li>{t('verify.reviewedOn')}: {when(profile.reviewedAt, locale) || empty}</li>
            <li>{t('verify.updatedOn')}: {when(profile.updatedAt, locale) || empty}</li>
          </ol>
        </Card>
      </div>
    </PageTransition>
  );
}

function bannerTitle(status: ContractorProfile['verificationStatus'], t: (key: string) => string) {
  if (status === 'APPROVED') return t('verify.approvedTitle');
  if (status === 'REJECTED') return t('verify.rejectedTitle');
  if (status === 'DRAFT') return t('verify.draftTitle');
  return t('verify.pendingTitle');
}

function bannerBody(status: ContractorProfile['verificationStatus'], t: (key: string) => string) {
  if (status === 'APPROVED') return `${t('verify.approvedBody')} ${t('verify.storeApprovedNext')}`;
  if (status === 'REJECTED') return t('verify.rejectedBody');
  if (status === 'DRAFT') return t('verify.draftBody');
  return `${t('verify.pendingBody')} ${t('verify.pendingEmail')}`;
}

function bannerClass(status: ContractorProfile['verificationStatus']) {
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50';
  if (status === 'SUBMITTED') return 'border-amber-200 bg-amber-50';
  return 'border-navy-800/10 bg-white';
}

function DocumentGroups({ documents }: { documents: VerificationDocument[] }) {
  const { t } = useI18n();
  if (!documents.length) return <p className="mt-4 text-sm text-ink-400">{t('verify.noDocs')}</p>;
  return (
    <ul className="mt-4 space-y-3">
      {DOC_GROUPS.map((group) => {
        const files = documents.filter((doc) => group.types.includes(doc.type));
        return (
          <li key={group.titleKey} className="rounded-2xl bg-paper-50 px-4 py-3">
            <p className="text-sm font-semibold text-navy-800">
              {files.length ? '✓ ' : ''}
              {t(group.titleKey)}
            </p>
            {files.length ? (
              <ul className="mt-2 space-y-2">
                {files.map((doc) => (
                  <li key={doc._id} className="flex items-center gap-3">
                    {doc.mimeType.startsWith('image/') ? (
                      <img src={mediaUrl(doc.url)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-navy-800 text-white">
                        <FileText className="h-4 w-4" />
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-navy-800">
                        {doc.type === 'CCCD_FRONT' ? t('verify.docFront') : doc.type === 'CCCD_BACK' ? t('verify.docBack') : t(`docType.${doc.type}`)}
                      </p>
                      <p className="text-xs text-ink-400">{doc.originalName || t('verify.docsReady')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-ink-400">{t('verify.docsMissing')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
