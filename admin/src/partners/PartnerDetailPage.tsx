import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { AdminBackButton } from '@/components/AdminBackButton';
import { AdminVietMapView } from '@/components/AdminVietMapView';
import { Badge } from '@/components/Badge';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { useAsync } from '@/hooks/useAsync';
import { formatDate, vnd } from '@/lib/utils';
import { adminApi } from '@/services/admin.api';
import type { ReviewListPayload } from '@/types/admin';
import { PartnerMediaImage } from '@/partners/PartnerMediaImage';
import {
  categoryTitle,
  extractProfileCoords,
  publicDocuments,
  serviceTitle,
  statusTone,
  storeHero,
  uniqueUrls,
} from '@/partners/partnerProfile.utils';
import { LockedContactValue, OperatingHoursPanel } from '@/partners/OperatingHoursPanel';

type Actor = 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{label}</p>
      <div className="mt-1 text-sm font-semibold text-[#16283C]">{value || '—'}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassCard className="mt-6 space-y-4 p-5">
      <h2 className="border-b border-[#E1E7ED] pb-2 font-display text-lg font-bold text-[#16283C]">{title}</h2>
      {children}
    </GlassCard>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[#E1E7ED] bg-[#F8FAFC] px-3 py-1.5 text-sm text-[#16283C]">{children}</span>
  );
}

function ImageGroup({ title, urls }: { title: string; urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {urls.map((url) => (
          <PartnerMediaImage key={`${title}-${url}`} url={url} className="h-28 w-full object-cover" />
        ))}
      </div>
    </div>
  );
}

function PartnerDetailPage({ actor }: { actor: Actor }) {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const isCrew = actor === 'CONTRACTOR';
  const listPath = isCrew ? '/contractors' : '/material-stores';
  const copy = isCrew ? 'crew' : 'store';

  const { data, loading, error, reload } = useAsync(async () => {
    const profile = await adminApi.getVerification(id);
    let reviews: ReviewListPayload | null = null;
    if (profile.userId) {
      try {
        reviews = await adminApi.getReviewsForUser(
          profile.userId,
          isCrew ? 'CONTRACTOR' : 'MATERIAL_STORE'
        );
      } catch {
        reviews = null;
      }
    }
    return { profile, reviews };
  }, [id, actor]);

  if (loading) return <Spinner />;
  if (error || !data || (data.profile.user?.role && data.profile.user.role !== actor)) {
    return (
      <div>
        <AdminBackButton fallback={listPath} label={t('partnerProfile.back')} />
        <ErrorState body={error || t('partnerProfile.missing')} onRetry={error ? reload : undefined} />
      </div>
    );
  }

  const profile = data.profile;
  const reviews = data.reviews;
  const store = profile.store;
  const hero = storeHero(store, profile.portfolio, profile.user?.avatar);
  const coords = extractProfileCoords(profile);
  const address = profile.address || store?.address || profile.publicProfile?.address || '';
  const city = profile.city || store?.city || profile.publicProfile?.city || '';
  const phone = profile.user?.phone || store?.phone || profile.publicProfile?.phone || '';
  const ratingAverage = reviews?.average ?? (isCrew ? store?.rating : store?.materialRating) ?? 0;
  const ratingCount = reviews?.count ?? (isCrew ? store?.reviewCount : store?.materialReviewCount) ?? 0;
  const safeDocs = publicDocuments(profile.documents);
  const avatarUrls = uniqueUrls([profile.portfolio?.avatar, profile.user?.avatar, store?.avatar]);
  const logoUrls = uniqueUrls([profile.portfolio?.teamLogo, store?.logo]);
  const workshopUrls = uniqueUrls([profile.portfolio?.workshop, store?.coverImage]);
  const workUrls = uniqueUrls([...(profile.portfolio?.construction || []), ...(store?.crewPhotos || [])]);
  const storeUrls = uniqueUrls([...(store?.gallery || []), ...safeDocs.filter((doc) => doc.mimeType?.startsWith('image/')).map((doc) => doc.url)]);
  const hasImages =
    avatarUrls.length + logoUrls.length + workshopUrls.length + workUrls.length + storeUrls.length + (profile.portfolio?.projects || []).length > 0;
  return (
    <div>
      <AdminBackButton fallback={listPath} label={t('partnerProfile.back')} />
      <PageHeader
        eyebrow={t(`partners.${copy}.eyebrow`)}
        title={t(`partnerProfile.${copy}Title`)}
        description={profile.businessName || store?.name || profile.user?.name}
        actions={
          <Link
            to={listPath}
            className="rounded-xl border border-[#E1E7ED] bg-white px-4 py-2 text-sm font-semibold text-[#173B4F] shadow-sm hover:bg-[#F8FAFC]"
          >
            {t('partnerProfile.back')}
          </Link>
        }
      />

      <GlassCard className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-[#E1E7ED] bg-[#F8FAFC]">
            <PartnerMediaImage url={hero} alt={profile.businessName} className="h-24 w-24 object-cover" plain />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold text-[#16283C]">
                {profile.businessName || store?.name || profile.user?.name || '—'}
              </h2>
              <Badge tone={statusTone(profile.user?.status)}>{profile.user?.status || '—'}</Badge>
              <Badge tone={statusTone(profile.verificationStatus)}>{profile.verificationStatus}</Badge>
            </div>
            <p className="mt-1 text-sm text-[#526477]">
              {profile.user?.name || '—'} · {profile.user?.email || '—'} · {phone || '—'}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('partnerProfile.owner')} value={profile.user?.name} />
              <LockedContactValue label={t('partnerProfile.email')} value={profile.user?.email} />
              <LockedContactValue label={t('partnerProfile.phone')} value={phone} />
              <Field
                label={t('partnerProfile.accountStatus')}
                value={<Badge tone={statusTone(profile.user?.status)}>{profile.user?.status || '—'}</Badge>}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      <Section title={t(`partnerProfile.${copy}Operations`)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t(`partnerProfile.${copy}Name`)} value={profile.businessName || store?.name} />
          {isCrew ? <Field label={t('partnerProfile.years')} value={t('verify.years', { n: profile.yearsExperience || 0 })} /> : null}
          {isCrew ? <Field label={t('partnerProfile.representative')} value={profile.representativeName} /> : null}
          {!isCrew && profile.taxCode ? <Field label={t('partnerProfile.taxCode')} value={profile.taxCode} /> : null}
          <Field label={t('partnerProfile.registeredAt')} value={formatDate(profile.createdAt || profile.submittedAt)} />
          <Field label={t('partnerProfile.approvedAt')} value={formatDate(profile.reviewedAt)} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{t('partnerProfile.description')}</p>
          <p className="mt-1 text-sm leading-6 text-[#16283C]">
            {profile.description || store?.description || profile.publicProfile?.description || t('verify.noNarrative')}
          </p>
        </div>
        <OperatingHoursPanel
          title={t('partnerProfile.operatingHours')}
          hours={profile.weeklyHours || profile.publicProfile?.weeklyHours || store?.weeklyHours || null}
          unsetLabel={t('partnerProfile.hoursUnset')}
          restLabel={t('partnerProfile.hoursRest')}
          dayLabels={{
            mon: t('partnerProfile.dayMon'),
            tue: t('partnerProfile.dayTue'),
            wed: t('partnerProfile.dayWed'),
            thu: t('partnerProfile.dayThu'),
            fri: t('partnerProfile.dayFri'),
            sat: t('partnerProfile.daySat'),
            sun: t('partnerProfile.daySun'),
          }}
        />
        {isCrew ? (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{t('partnerProfile.services')}</p>
              {(profile.services || []).length ? (
                <div className="flex flex-wrap gap-2">
                  {(profile.services || []).map((item) => (
                    <Chip key={`${item.category}-${item.name}-${item.serviceId || ''}`}>
                      {serviceTitle(t, item.name)}
                      {item.type === 'CUSTOM' ? <span className="ml-2 text-xs text-[#2B6280]">{t('verify.customBadge')}</span> : null}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#526477]">{t('verify.noServices')}</p>
              )}
            </div>
            {profile.serviceAreas?.length ? (
              <Field label={t('partnerProfile.serviceAreas')} value={profile.serviceAreas.join(', ')} />
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#7E92A2]">{t('partnerProfile.categories')}</p>
              {(profile.materialCategories || []).length ? (
                <div className="flex flex-wrap gap-2">
                  {(profile.materialCategories || []).map((item) => (
                    <Chip key={`${item.type || 'SYSTEM'}:${item.name}`}>{categoryTitle(t, item)}</Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#526477]">{t('verify.noRegisteredCategories')}</p>
              )}
            </div>
            {store?.deliveryNote || profile.publicProfile?.deliveryNote ? (
              <Field label={t('partnerProfile.deliveryArea')} value={store?.deliveryNote || profile.publicProfile?.deliveryNote} />
            ) : null}
          </>
        )}
      </Section>

      <Section title={t('partnerProfile.location')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label={t('partnerProfile.address')} value={[address, city].filter(Boolean).join(', ')} />
          </div>
          <Field label={t('partnerProfile.city')} value={city} />
          {store?.serviceRadiusKm ? <Field label={t('partnerProfile.serviceRadius')} value={`${store.serviceRadiusKm} km`} /> : null}
          {store?.serviceAreas?.length ? <Field label={t('partnerProfile.serviceAreas')} value={store.serviceAreas.join(', ')} /> : null}
        </div>
        {coords ? (
          <div className="overflow-hidden rounded-xl border border-[#E1E7ED]">
            <AdminVietMapView
              center={coords}
              zoom={15}
              actorKind={isCrew ? 'contractor' : 'store'}
              address={address}
              fallbackText={t('verify.mapUnavailable')}
              className="h-[280px] w-full md:h-[320px]"
            />
          </div>
        ) : (
          <p className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] px-4 py-3 text-sm text-[#526477]">
            {t('partnerProfile.noMap')}
          </p>
        )}
      </Section>

      {!isCrew ? (
        <Section title={t('partnerProfile.products')}>
          {(profile.materials || []).length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(profile.materials || []).map((item) => (
                <div key={item.id} className="overflow-hidden rounded-xl border border-[#E1E7ED] bg-white">
                  <PartnerMediaImage url={item.image} alt={item.name} className="h-28 w-full object-cover" />
                  <div className="space-y-1 p-3">
                    <p className="text-sm font-semibold text-[#16283C]">{item.name}</p>
                    <p className="text-xs text-[#526477]">{categoryTitle(t, { name: item.category })} · {item.unit}</p>
                    <p className="text-sm font-semibold text-[#173B4F]">{vnd(item.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#526477]">{t('partnerProfile.noProducts')}</p>
          )}
        </Section>
      ) : null}

      <Section title={t('partnerProfile.images')}>
        {hasImages ? (
          <>
            <ImageGroup title={t('verify.avatar')} urls={avatarUrls} />
            <ImageGroup title={t('verify.teamLogo')} urls={logoUrls} />
            <ImageGroup title={isCrew ? t('verify.workshop') : t('partnerProfile.storePhotos')} urls={workshopUrls} />
            <ImageGroup
              title={isCrew ? t('verify.construction') : t('partnerProfile.businessPhotos')}
              urls={isCrew ? uniqueUrls([...workUrls, ...storeUrls]) : workUrls}
            />
            {isCrew ? null : <ImageGroup title={t('partnerProfile.storePhotos')} urls={storeUrls} />}
            {(profile.portfolio?.projects || []).map((project, index) => (
              <div key={project.id || `${project.serviceId}-${index}`} className="border-t border-[#E1E7ED] pt-4">
                <p className="text-sm font-semibold text-[#16283C]">{t('verify.projectNumber', { n: index + 1 })}</p>
                <p className="mt-1 text-sm text-[#526477]">
                  {t('verify.projectService')}: {serviceTitle(t, project.serviceNameSnapshot)}
                </p>
                {project.description ? <p className="mt-2 text-sm text-[#16283C]">{project.description}</p> : null}
                {project.images?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {project.images.map((url) => (
                      <PartnerMediaImage key={url} url={url} className="aspect-[4/3] w-full object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </>
        ) : (
          <p className="text-sm text-[#526477]">{t('verify.noPortfolio')}</p>
        )}
        {safeDocs.filter((doc) => !doc.mimeType?.startsWith('image/')).length ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {safeDocs
              .filter((doc) => !doc.mimeType?.startsWith('image/'))
              .map((doc) => (
                <Chip key={doc._id}>{doc.originalName || doc.type}</Chip>
              ))}
          </div>
        ) : null}
      </Section>

      <Section title={t('partnerProfile.verification')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={t('partnerProfile.profileStatus')}
            value={<Badge tone={statusTone(profile.verificationStatus)}>{profile.verificationStatus}</Badge>}
          />
          {isCrew ? (
            <Field
              label={t('partnerProfile.ekycStatus')}
              value={profile.ekyc?.status || t('partnerProfile.ekycEmpty')}
            />
          ) : (
            <Field
              label={t('partnerProfile.verified')}
              value={profile.publicProfile?.verified || store?.status === 'LIVE' ? t('partnerProfile.verifiedYes') : t('partnerProfile.verifiedNo')}
            />
          )}
          <Field label={t('partnerProfile.registeredAt')} value={formatDate(profile.submittedAt || profile.createdAt)} />
          <Field label={t('partnerProfile.approvedAt')} value={formatDate(profile.reviewedAt)} />
        </div>
      </Section>

      <Section title={t('partnerProfile.reviews')}>
        {ratingCount ? (
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 text-[#D4A017]" />
            <p className="text-lg font-bold text-[#16283C]">{ratingAverage}</p>
            <p className="text-sm text-[#526477]">{t('partnerProfile.reviewCount', { n: ratingCount })}</p>
          </div>
        ) : (
          <p className="text-sm text-[#526477]">{t('partnerProfile.noReviews')}</p>
        )}
      </Section>
    </div>
  );
}

export function ContractorProfilePage() {
  return <PartnerDetailPage actor="CONTRACTOR" />;
}

export function StoreProfilePage() {
  return <PartnerDetailPage actor="MATERIAL_STORE_OWNER" />;
}

export { PartnerDetailPage };
