
import { Link } from 'react-router-dom';
import { Check, Clock3, FileText, Pencil } from 'lucide-react';

import { VerificationBadge } from '@/components/contractor/VerificationBadge';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
<<<<<<< HEAD
import { catalogPickLabel, catalogServiceLabel } from '@/data/contractor-services';
=======
import { VerificationDocThumb } from '@/components/partner/VerificationDocThumb';

import {
  catalogPickLabel,
  catalogServiceLabel,
} from '@/data/contractor-services';

>>>>>>> main
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { VerificationDocThumb } from '@/components/partner/VerificationDocThumb';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';

import type {
  ContractorProfile,
  DocumentType,
  VerificationDocument,
} from '@/types/partner';

// ==========================================
// 1. NHÓM GIẤY TỜ XÁC MINH
// ==========================================

const DOC_GROUPS: {
  titleKey: string;
  types: DocumentType[];
}[] = [
  {
    titleKey: 'verify.representativeId',
    types: ['CCCD_FRONT', 'CCCD_BACK', 'ID_CARD'],
  },
  {
    titleKey: 'docType.BUSINESS_LICENSE',
    types: ['BUSINESS_LICENSE'],
  },
  {
    titleKey: 'docType.CERTIFICATE',
    types: ['CERTIFICATE'],
  },
];

// ==========================================
// 2. HÀM ĐỊNH DẠNG NGÀY GIỜ
// ==========================================

function when(
  value: string | null | undefined,
  locale: string
) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const language = locale === 'en' ? 'en-GB' : 'vi-VN';

  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

// ==========================================
// 3. HÀM HIỂN THỊ THÔNG TIN
// ==========================================

function fact(
  label: string,
  value: string | number | null | undefined,
  empty: string
) {
  const displayValue =
    value === 0 || value ? String(value) : empty;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-black">
        {displayValue}
      </p>
    </div>
  );
}

// ==========================================
// 4. TRANG VIEW PROVIDER VERIFICATION STATUS
// ==========================================

export function ContractorVerificationPage() {
  // Lấy chức năng đa ngôn ngữ
  const { t, locale } = useI18n();

  // Lấy dữ liệu hồ sơ Contractor
  const {
    data,
    loading,
    error,
    refresh,
  } = useContractorWorkspace();

  // Nếu đang tải dữ liệu
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Nếu có lỗi hoặc không có dữ liệu
  if (error || !data) {
    return (
      <ErrorState
        body={error}
        onRetry={() => void refresh()}
      />
    );
  }

  // Lấy thông tin hồ sơ
  const profile = data.profile;

  // Lấy trạng thái xác minh
  const status = profile.verificationStatus;

  // Nội dung hiển thị khi dữ liệu trống
  const empty = t('verify.emptyValue');

  // Lấy danh sách hình ảnh
  const photos = photoSlots(profile, t);

  return (
    <PageTransition>
      <div className="text-black">

        {/* TIÊU ĐỀ TRANG */}

        <PageHeader
          eyebrow={t('verify.recordEyebrow')}
          title={t('verify.recordTitle')}
          description={t('verify.recordDescription')}
          actions={<VerificationBadge status={status} />}
        />

        {/* TRẠNG THÁI XÁC MINH */}

        <Card
          hover={false}
          className={bannerClass(status)}
        >
          <div className="flex items-start gap-4">

            {/* Icon theo trạng thái */}

            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/80 text-black">
              {status === 'APPROVED' && (
                <Check className="h-6 w-6" />
              )}

              {status === 'REJECTED' && (
                <Pencil className="h-5 w-5" />
              )}

              {(status === 'DRAFT' || status === 'SUBMITTED') && (
                <Clock3 className="h-5 w-5" />
              )}
            </span>

            <div>

              {/* Tiêu đề trạng thái */}

              <h2 className="font-display text-2xl text-black">
                {bannerTitle(status, t)}
              </h2>

              {/* Nội dung trạng thái */}

              <p className="mt-2 text-sm leading-6 text-black">
                {bannerBody(status, t)}
              </p>

              {/* Lý do từ chối */}

              {status === 'REJECTED' && profile.rejectionReason && (
                <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm text-black">
                  {profile.rejectionReason}
                </p>
              )}

              {/* Tiếp tục hoặc chỉnh sửa hồ sơ */}

              {(status === 'DRAFT' || status === 'REJECTED') && (
                <Link
                  to="/partner/onboarding"
                  className="mt-4 inline-flex rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-black"
                >
                  {status === 'DRAFT'
                    ? t('verify.continueOnboarding')
                    : t('verify.editProfile')}
                </Link>
              )}

              {/* Mở hồ sơ công khai khi được duyệt */}

              {status === 'APPROVED' && (
                <Link
                  to="/contractor/profile/edit"
                  className="mt-4 inline-flex text-sm font-semibold text-black underline"
                >
                  {t('verify.openPublicProfile')}
                </Link>
              )}

            </div>
          </div>
        </Card>

        {/* THÔNG TIN TRẠNG THÁI VÀ THỜI GIAN */}

        <Card
          hover={false}
          className="mt-6 grid gap-4 text-black sm:grid-cols-3"
        >
          {fact(
            t('verify.statusLabel'),
            t(
              status === 'SUBMITTED'
                ? 'verify.review'
                : status === 'APPROVED'
                  ? 'verify.approved'
                  : status === 'REJECTED'
                    ? 'verify.revision'
                    : 'verify.draft'
            ),
            empty
          )}

          {fact(
            t('verify.submittedOn'),
            when(profile.submittedAt, locale),
            empty
          )}

          {fact(
            t('verify.reviewedOn'),
            when(profile.reviewedAt, locale),
            empty
          )}
        </Card>

<<<<<<< HEAD
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
=======
        <div className="mt-6 grid gap-6 text-black">
>>>>>>> main

          {/* THÔNG TIN CONTRACTOR */}

          <Card hover={false}>
            <h2 className="font-display text-xl text-black">
              {t('verify.teamSection')}
            </h2>

            <div className="mt-5 grid gap-4 text-black sm:grid-cols-2">

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
              {fact(
                t('verify.descriptionField'),
                profile.description,
                empty
              )}
            </div>
          </Card>

          {/* DANH SÁCH DỊCH VỤ */}

          <Card hover={false}>
            <div className="flex flex-wrap items-end justify-between gap-3">

              <div>
                <h2 className="font-display text-xl text-black">
                  {t('verify.servicesSection')}
                </h2>

                <p className="mt-1 text-sm text-black">
                  {t('verify.servicesHint')}
                </p>
              </div>

              {/* Chỉ cho phép quản lý dịch vụ khi đã duyệt */}

              {status === 'APPROVED' && (
                <Link
                  to="/contractor/services"
                  className="text-sm font-semibold text-black underline"
                >
                  {t('verify.manageServices')}
                </Link>
              )}

            </div>

            {/* Kiểm tra danh sách dịch vụ */}

            {profile.services?.length ? (
              <ul className="mt-4 flex flex-wrap gap-2">

                {profile.services.map((item) => (
                  <li
                    key={`${item.type}-${item.serviceId || item.name}`}
                    className="rounded-full bg-paper-100 px-3 py-1.5 text-sm font-semibold text-black"
                  >
                    {item.type === 'CUSTOM'
                      ? item.name
                      : catalogPickLabel(item, t)}

                    {item.type === 'CUSTOM' && (
                      <span className="ml-2 text-[11px] text-black">
                        CUSTOM
                      </span>
                    )}
                  </li>
                ))}

              </ul>
            ) : (
              <p className="mt-4 text-sm text-black">
                {t('verify.noServices')}
              </p>
            )}
          </Card>

          {/* HÌNH ẢNH VÀ PORTFOLIO */}

          <Card hover={false}>
            <h2 className="font-display text-xl text-black">
              {t('verify.photosSection')}
            </h2>

            {/* Hiển thị hình ảnh */}

            {photos.length > 0 ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">

                {photos.map((photo) => (
                  <li key={photo.key}>

                    <img
                      src={mediaUrl(photo.src)}
                      alt={photo.label}
                      className="h-36 w-full rounded-2xl object-cover"
                    />

                    <p className="mt-2 text-xs font-semibold text-black">
                      {photo.label}
                    </p>

                  </li>
                ))}

              </ul>
            ) : (
              <p className="mt-4 text-sm text-black">
                {t('verify.noPhotos')}
              </p>
            )}

            {/* Danh sách dự án đã thực hiện */}

            {profile.portfolio?.projects?.length ? (
              <div className="mt-5 divide-y divide-navy-800/10 border-t border-navy-800/10">

                <h3 className="py-3 text-sm font-semibold text-black">
                  {t('verify.projectsTitle')}
                </h3>

                {profile.portfolio.projects.map((project, index) => (
                  <div key={project.id} className="py-4">

                    <p className="text-sm font-semibold text-black">
                      {t('verify.projectNumber', {
                        n: index + 1,
                      })}
                    </p>

                    <p className="mt-1 text-sm text-black">
                      {t('verify.projectService')}:{' '}
                      {catalogServiceLabel(
                        project.serviceNameSnapshot,
                        t
                      )}
                    </p>

                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-black">
                      {t('verify.projectDescription')}
                    </p>

                    <p className="mt-1 text-sm text-black">
                      {project.description}
                    </p>

                    {/* Hình ảnh của dự án */}

                    {project.images.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">

                        {project.images.map((url) => (
                          <img
                            key={url}
                            src={mediaUrl(url)}
                            alt=""
                            className="aspect-[4/3] w-full rounded-lg object-cover"
                          />
                        ))}

                      </div>
                    )}

                  </div>
                ))}

              </div>
            ) : null}
          </Card>

          {/* GIẤY TỜ XÁC MINH */}

          <Card hover={false}>
            <h2 className="font-display text-xl text-black">
              {t('verify.docsSection')}
            </h2>

            <DocumentGroups documents={profile.documents} />
          </Card>

          {/* LỊCH SỬ XÁC MINH */}

          <Card hover={false}>
            <h2 className="font-display text-xl text-black">
              {t('verify.historySection')}
            </h2>

            <ol className="mt-4 space-y-3 text-sm text-black">

              <li>
                {t('verify.submittedOn')}:{' '}
                {when(profile.submittedAt, locale) || empty}
              </li>

              <li>
                {t('verify.reviewedOn')}:{' '}
                {when(profile.reviewedAt, locale) || empty}
              </li>

              <li>
                {t('verify.updatedOn')}:{' '}
                {when(profile.updatedAt, locale) || empty}
              </li>

            </ol>
          </Card>

        </div>
      </div>
    </PageTransition>
  );
}

// ==========================================
// 5. HÀM LẤY TIÊU ĐỀ THEO TRẠNG THÁI
// ==========================================

function bannerTitle(
  status: ContractorProfile['verificationStatus'],
  t: (key: string) => string
) {
  if (status === 'APPROVED') {
    return t('verify.approvedTitle');
  }

  if (status === 'REJECTED') {
    return t('verify.rejectedTitle');
  }

  if (status === 'DRAFT') {
    return t('verify.draftTitle');
  }

  return t('verify.pendingTitle');
}

// ==========================================
// 6. HÀM LẤY NỘI DUNG THEO TRẠNG THÁI
// ==========================================

function bannerBody(
  status: ContractorProfile['verificationStatus'],
  t: (key: string) => string
) {
  if (status === 'APPROVED') {
    return `${t('verify.approvedBody')} ${t('verify.approvedNext')}`;
  }

  if (status === 'REJECTED') {
    return t('verify.rejectedBody');
  }

  if (status === 'DRAFT') {
    return t('verify.draftBody');
  }

  return `${t('verify.pendingBody')} ${t('verify.pendingEmail')}`;
}

// ==========================================
// 7. HÀM CHỌN MÀU THEO TRẠNG THÁI
// ==========================================

function bannerClass(
  status: ContractorProfile['verificationStatus']
) {
  if (status === 'APPROVED') {
    return 'border-emerald-200 bg-emerald-50';
  }

  if (status === 'REJECTED') {
    return 'border-red-200 bg-red-50';
  }

  if (status === 'SUBMITTED') {
    return 'border-amber-200 bg-amber-50';
  }

  return 'border-navy-800/10 bg-white';
}

// ==========================================
// 8. HÀM LẤY HÌNH ẢNH PORTFOLIO
// ==========================================

function photoSlots(
  profile: ContractorProfile,
  t: (key: string) => string
) {
  const portfolio = profile.portfolio;
<<<<<<< HEAD
  const projectUrls = new Set((portfolio?.projects || []).flatMap((project) => project.images));
  const slots = [
    { key: 'avatar', src: portfolio?.avatar || '', label: t('verify.avatar') },
    { key: 'logo', src: portfolio?.teamLogo || '', label: t('verify.teamLogo') },
    { key: 'workshop', src: portfolio?.workshop || '', label: t('verify.workshop') },
    ...(portfolio?.construction || [])
      .filter((src) => !projectUrls.has(src))
      .map((src, index) => ({ key: `work-${index}`, src, label: t('verify.construction') })),
    ...(portfolio?.certificates || []).map((src, index) => ({ key: `cert-${index}`, src, label: t('verify.certificatePhoto') })),
=======

  // Lấy hình ảnh đã có trong các dự án
  const projectUrls = new Set(
    (portfolio?.projects || []).flatMap(
      (project) => project.images
    )
  );

  // Tạo danh sách hình ảnh
  const photos = [
    {
      key: 'avatar',
      src: portfolio?.avatar || '',
      label: t('verify.avatar'),
    },
    {
      key: 'logo',
      src: portfolio?.teamLogo || '',
      label: t('verify.teamLogo'),
    },
    {
      key: 'workshop',
      src: portfolio?.workshop || '',
      label: t('verify.workshop'),
    },

    // Hình ảnh công trình, bỏ ảnh đã có trong dự án
    ...(portfolio?.construction || [])
      .filter((src) => !projectUrls.has(src))
      .map((src, index) => ({
        key: `work-${index}`,
        src,
        label: t('verify.construction'),
      })),

    // Hình ảnh chứng chỉ
    ...(portfolio?.certificates || []).map((src, index) => ({
      key: `cert-${index}`,
      src,
      label: t('verify.certificatePhoto'),
    })),
>>>>>>> main
  ];

  // Chỉ lấy hình ảnh có đường dẫn
  return photos.filter((photo) => photo.src);
}

// ==========================================
// 9. COMPONENT HIỂN THỊ GIẤY TỜ
// ==========================================

function DocumentGroups({
  documents,
}: {
  documents: VerificationDocument[];
}) {
  const { t } = useI18n();

  // Nếu không có giấy tờ
  if (!documents.length) {
    return (
      <p className="mt-4 text-sm text-black">
        {t('verify.noDocs')}
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3 text-black">

      {/* Duyệt từng nhóm giấy tờ */}

      {DOC_GROUPS.map((group) => {

        // Lọc giấy tờ thuộc nhóm hiện tại
        const files = documents.filter((doc) =>
          group.types.includes(doc.type)
        );

        return (
          <li
            key={group.titleKey}
            className="rounded-2xl bg-paper-50 px-4 py-3"
          >

            {/* Tên nhóm giấy tờ */}

            <p className="text-sm font-semibold text-black">
              {files.length > 0 ? '✓ ' : ''}
              {t(group.titleKey)}
            </p>

            {/* Nếu có giấy tờ thì hiển thị danh sách */}

            {files.length > 0 ? (
              <ul className="mt-2 space-y-2">

                {files.map((doc) => (
                  <li
                    key={doc._id}
                    className="flex items-center gap-3"
                  >

                    {/* Nếu là hình ảnh thì hiển thị ảnh */}

                    {doc.mimeType.startsWith('image/') ? (
<<<<<<< HEAD
                      <VerificationDocThumb doc={doc} kind="contractor" className="h-12 w-12 rounded-xl object-cover" />
=======
                      <VerificationDocThumb
                        doc={doc}
                        kind="contractor"
                        className="h-12 w-12 rounded-xl object-cover"
                      />
>>>>>>> main
                    ) : (

                      // Nếu không phải hình ảnh thì hiển thị icon
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-paper-100 text-black">
                        <FileText className="h-4 w-4" />
                      </span>
                    )}

                    {/* Tên và loại tài liệu */}

                    <div>
                      <p className="text-sm font-semibold text-black">
                        {docSide(doc.type, t)}
                      </p>

                      <p className="text-xs text-black">
                        {doc.originalName || t('verify.docsReady')}
                      </p>
                    </div>

                  </li>
                ))}

              </ul>
            ) : (

              // Nếu chưa có giấy tờ
              <p className="mt-1 text-xs text-black">
                {t('verify.docsMissing')}
              </p>
            )}

          </li>
        );
      })}

    </ul>
  );
}

// ==========================================
// 10. HÀM HIỂN THỊ TÊN LOẠI GIẤY TỜ
// ==========================================

function docSide(
  type: DocumentType,
  t: (key: string) => string
) {
  if (type === 'CCCD_FRONT') {
    return t('verify.docFront');
  }

  if (type === 'CCCD_BACK') {
    return t('verify.docBack');
  }

  return t(`docType.${type}`);
}
