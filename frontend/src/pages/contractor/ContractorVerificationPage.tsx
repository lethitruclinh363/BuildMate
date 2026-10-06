import { Link } from 'react-router-dom';
import { Check, Clock3, FileText, Pencil } from 'lucide-react';
import { VerificationBadge } from '@/components/contractor/VerificationBadge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { catalogPickLabel, catalogServiceLabel } from '@/data/contractor-services';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { ContractorProfile, DocumentType, VerificationDocument } from '@/types/partner';

const DOC_GROUPS: { titleKey: string; types: DocumentType[] }[] = [
  { titleKey: 'verify.representativeId', types: ['CCCD_FRONT', 'CCCD_BACK', 'ID_CARD'] },
  { titleKey: 'docType.BUSINESS_LICENSE', types: ['BUSINESS_LICENSE'] },
  { titleKey: 'docType.CERTIFICATE', types: ['CERTIFICATE'] },
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

export function ContractorVerificationPage() {
  const { t, locale } = useI18n();
  const { data, loading, error, refresh } = useContractorWorkspace();

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState body={error} onRetry={() => void refresh()} />;

  const profile = data.profile;
  const status = profile.verificationStatus;
  const empty = t('verify.emptyValue');
  const photos = photoSlots(profile, t);

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('verify.recordEyebrow')}
        title={t('verify.recordTitle')}
        description={t('verify.recordDescription')}
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
            {status === 'APPROVED' ? (
              <Link to="/contractor/profile/edit" className="mt-4 inline-flex text-sm font-semibold text-navy-800 underline">
                {t('verify.openPublicProfile')}
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <Card hover={false} className="mt-6 grid gap-4 sm:grid-cols-3">
        {fact(t('verify.statusLabel'), t(status === 'SUBMITTED' ? 'verify.review' : status === 'APPROVED' ? 'verify.approved' : status === 'REJECTED' ? 'verify.revision' : 'verify.draft'), empty)}
        {fact(t('verify.submittedOn'), when(profile.submittedAt, locale), empty)}
        {fact(t('verify.reviewedOn'), when(profile.reviewedAt, locale), empty)}
      </Card>

      <div className="mt-6 grid gap-6">
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.teamSection')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fact(t('verify.businessName'), profile.businessName, empty)}
            {fact(t('verify.representative'), profile.representativeName, empty)}
            {fact(t('verify.phone'), profile.contactPhone, empty)}
            {fact(t('verify.email'), profile.contactEmail, empty)}
            {fact(t('verify.years'), profile.yearsExperience, empty)}
            {fact(t('verify.workers'), profile.workerCount, empty)}
            {fact(t('verify.address'), profile.address, empty)}
            {fact(t('verify.city'), profile.city, empty)}
          </div>
          <div className="mt-4">
            {fact(t('verify.descriptionField'), profile.description, empty)}
          </div>
        </Card>

        <Card hover={false}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-navy-800">{t('verify.servicesSection')}</h2>
              <p className="mt-1 text-sm text-ink-400">{t('verify.servicesHint')}</p>
            </div>
            {status === 'APPROVED' ? (
              <Link to="/contractor/services" className="text-sm font-semibold text-navy-800 underline">
                {t('verify.manageServices')}
              </Link>
            ) : null}
          </div>
          {profile.services?.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {profile.services.map((item) => (
                <li key={`${item.type}-${item.serviceId || item.name}`} className="rounded-full bg-paper-100 px-3 py-1.5 text-sm font-semibold text-navy-800">
                  {item.type === 'CUSTOM' ? item.name : catalogPickLabel(item, t)}
                  {item.type === 'CUSTOM' ? <span className="ml-2 text-[11px] text-copper-500">CUSTOM</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-400">{t('verify.noServices')}</p>
          )}
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
          {profile.portfolio?.projects?.length ? (
            <div className="mt-5 divide-y divide-navy-800/10 border-t border-navy-800/10">
              <h3 className="py-3 text-sm font-semibold text-navy-800">{t('verify.projectsTitle')}</h3>
              {profile.portfolio.projects.map((project, index) => (
                <div key={project.id} className="py-4">
                  <p className="text-sm font-semibold text-navy-800">{t('verify.projectNumber', { n: index + 1 })}</p>
                  <p className="mt-1 text-sm text-ink-500">
                    {t('verify.projectService')}: {catalogServiceLabel(project.serviceNameSnapshot, t)}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">{t('verify.projectDescription')}</p>
                  <p className="mt-1 text-sm text-navy-800">{project.description}</p>
                  {project.images.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {project.images.map((url) => (
                        <img key={url} src={mediaUrl(url)} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.docsSection')}</h2>
          <DocumentGroups documents={profile.documents} />
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('verify.historySection')}</h2>
          <ol className="mt-4 space-y-3 text-sm text-ink-600">
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
  if (status === 'APPROVED') return `${t('verify.approvedBody')} ${t('verify.approvedNext')}`;
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

function photoSlots(profile: ContractorProfile, t: (key: string) => string) {
  const portfolio = profile.portfolio;
  const projectUrls = new Set((portfolio?.projects || []).flatMap((project) => project.images));
  const slots = [
    { key: 'avatar', src: portfolio?.avatar || '', label: t('verify.avatar') },
    { key: 'logo', src: portfolio?.teamLogo || '', label: t('verify.teamLogo') },
    { key: 'workshop', src: portfolio?.workshop || '', label: t('verify.workshop') },
    ...(portfolio?.construction || [])
      .filter((src) => !projectUrls.has(src))
      .map((src, index) => ({ key: `work-${index}`, src, label: t('verify.construction') })),
    ...(portfolio?.certificates || []).map((src, index) => ({ key: `cert-${index}`, src, label: t('verify.certificatePhoto') })),
  ];
  return slots.filter((item) => item.src);
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
                      <p className="text-sm font-semibold text-navy-800">{docSide(doc.type, t)}</p>
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

function docSide(type: DocumentType, t: (key: string) => string) {
  if (type === 'CCCD_FRONT') return t('verify.docFront');
  if (type === 'CCCD_BACK') return t('verify.docBack');
  return t(`docType.${type}`);
}
