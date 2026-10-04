import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Phone, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { reviewApi } from '@/features/reviews/services/review.api';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { withAuthRedirect } from '@/types/sprint4';
import type { CatalogService } from '@/types/partner';
import type { PublicContractorProfile, PublicHighlights } from '@/types/marketplace';
import type { Review } from '@/features/reviews/types/review.types';
import { ImageViewer, MediaFrame, type ViewerSlide } from '@/components/media/ProfileMedia';
import { LocationViewer } from '@/features/map/components/LocationViewer';
import { MapPlaceActions } from '@/features/map/components/MapPlaceActions';
import { ServiceAreaMap } from './ServiceAreaMap';

const UNITS = {
  JOB: 'forms.perJob',
  HOUR: 'forms.perHour',
  M2: 'forms.perM2',
  DAY: 'forms.perDay',
} as const;

function unitLabel(unit: string, translate: (path: string) => string) {
  const key = UNITS[unit as keyof typeof UNITS];
  return key ? translate(key) : unit;
}

export function ContractorProfileShowcase({
  profile,
  services,
  highlights,
  preview,
}: {
  profile: PublicContractorProfile;
  services: CatalogService[];
  highlights?: PublicHighlights;
  preview?: boolean;
}) {
  const { t, locale } = useI18n();
  const user = useAuthStore((state) => state.user);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState(profile.rating || 0);
  const [total, setTotal] = useState(profile.reviewCount || 0);
  const [star, setStar] = useState<number | 'all'>('all');
  const [viewer, setViewer] = useState<{ slides: ViewerSlide[]; index: number } | null>(null);
  const owner = !preview && Boolean(user && user.role === 'CONTRACTOR' && user.id === String(profile.contractorId));
  const publicPath = `/contractors/${profile.contractorId}`;
  const dateTag = locale === 'en' ? 'en-US' : 'vi-VN';

  useEffect(() => {
    if (!profile.contractorId) return;
    reviewApi
      .forUser(String(profile.contractorId), 'CONTRACTOR')
      .then((res) => {
        setReviews(res.data.data.items || []);
        setAverage(res.data.data.average || 0);
        setTotal(res.data.data.count || 0);
      })
      .catch(() => undefined);
  }, [profile.contractorId]);

  const visibleReviews = reviews.filter((row) => star === 'all' || row.rating === star);
  const facts = [
    profile.yearsExperience > 0 ? { label: t('public.experience'), value: t('public.experienceYears', { n: profile.yearsExperience }) } : null,
    profile.workerCount > 0 ? { label: t('public.crewSize'), value: t('public.crewCount', { n: profile.workerCount }) } : null,
    profile.city ? { label: t('public.areas'), value: profile.city } : null,
    profile.openingHours ? { label: t('public.hours'), value: profile.openingHours } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const highlightItems = [
    highlights?.completedProjects ? { label: t('public.completedProjects'), value: String(highlights.completedProjects) } : null,
    highlights?.customersServed ? { label: t('public.customersServed'), value: String(highlights.customersServed) } : null,
    highlights?.completionRate != null ? { label: t('public.completionRate'), value: `${highlights.completionRate}%` } : null,
    highlights?.responseRate != null ? { label: t('public.responseRate'), value: `${highlights.responseRate}%` } : null,
    highlights?.averageResponseMinutes != null
      ? {
          label: t('public.responseTime'),
          value:
            highlights.averageResponseMinutes < 60
              ? t('public.responseMinutes', { n: highlights.averageResponseMinutes })
              : t('public.responseHours', { n: Math.max(1, Math.round(highlights.averageResponseMinutes / 60)) }),
        }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  const albums = [
    profile.gallery?.length ? { title: t('public.gallery'), kind: 'project' as const, urls: profile.gallery } : null,
    profile.crewPhotos?.length ? { title: t('public.crew'), kind: 'crew' as const, urls: profile.crewPhotos } : null,
  ].filter((item): item is { title: string; kind: 'project' | 'crew'; urls: string[] } => Boolean(item));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {preview ? (
        <p className="rounded-2xl bg-copper-400/15 px-4 py-3 text-sm text-navy-800">{t('public.previewNote')}</p>
      ) : null}

      <section className="rounded-[22px] border border-navy-800/8 bg-white shadow-card">
        <MediaFrame
          src={profile.coverImage}
          alt={t('viewer.coverAlt')}
          fit="cover"
          priority
          frameClassName="aspect-[2.4/1] rounded-t-[22px] bg-navy-800 sm:aspect-[2.8/1]"
          onOpen={
            profile.coverImage
              ? () => setViewer({ slides: [{ src: profile.coverImage, alt: t('viewer.coverAlt') }], index: 0 })
              : undefined
          }
          empty={<div className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900" />}
        />
        <div className="px-4 pb-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative z-10 -mt-10 w-24 shrink-0 sm:-mt-12 sm:w-28">
                {profile.avatar || profile.logo ? (
                  <MediaFrame
                    src={profile.avatar || profile.logo}
                    alt={t(profile.avatar ? 'viewer.avatarAlt' : 'viewer.logoAlt')}
                    fit="thumbnail"
                    frameClassName="aspect-square rounded-3xl border-4 border-white bg-navy-800 shadow-card"
                    onOpen={() => {
                      const slides: ViewerSlide[] = [];
                      if (profile.avatar) slides.push({ src: profile.avatar, alt: t('viewer.avatarAlt') });
                      if (profile.logo && profile.logo !== profile.avatar) slides.push({ src: profile.logo, alt: t('viewer.logoAlt') });
                      setViewer({ slides, index: 0 });
                    }}
                  />
                ) : (
                  <div className="grid aspect-square place-items-center rounded-3xl border-4 border-white bg-navy-800 font-display text-3xl text-paper-50 shadow-card">
                    {(profile.displayName || 'B').slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="relative z-10 min-w-0 sm:pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl text-navy-800 md:text-4xl">{profile.displayName}</h1>
                  {profile.verified ? (
                    <Badge tone="success">
                      <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                      {t('common.verified')}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                  {total > 0 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-navy-800">
                      <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
                      {t('public.reviewScore', { score: average.toFixed(1) })}
                      <span className="font-normal text-ink-400">· {t('public.reviewTotal', { n: total })}</span>
                    </span>
                  ) : (
                    <span>{t('public.noReviews')}</span>
                  )}
                  {profile.city ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-copper-500" /> {profile.city}
                    </span>
                  ) : null}
                </p>
                {profile.slogan ? <p className="mt-2 max-w-xl text-base text-ink-600">{profile.slogan}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview ? (
                <>
                  {profile.phone ? (
                    <Button type="button" variant="outline">
                      <Phone className="h-4 w-4" /> {t('public.contact')}
                    </Button>
                  ) : null}
                  <Button type="button" variant="copper">
                    {t('public.requestRepair')}
                  </Button>
                </>
              ) : owner ? (
                <Button asChild>
                  <Link to="/contractor/profile/edit">{t('public.editProfile')}</Link>
                </Button>
              ) : (
                <>
                  {profile.phone ? (
                    user ? (
                      <Button asChild variant="outline">
                        <a href={`tel:${profile.phone}`}>
                          <Phone className="h-4 w-4" /> {t('public.contact')}
                        </a>
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link to={withAuthRedirect(publicPath, null)}>
                          <Phone className="h-4 w-4" /> {t('public.contact')}
                        </Link>
                      </Button>
                    )
                  ) : null}
                  <RequestRepairButton contractorId={String(profile.contractorId)} storeId={profile.id} size="md" />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('public.about')}</h2>
        {profile.description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">{profile.description}</p> : null}
        {profile.achievements ? <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-600">{profile.achievements}</p> : null}
        {facts.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <Card key={fact.label} hover={false} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{fact.label}</p>
                <p className="mt-2 font-display text-xl text-navy-800">{fact.value}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('public.services')}</h2>
        {services.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <Card key={service.id} hover={false}>
                <Badge tone="copper">{catalogCategoryLabel(service.category, t)}</Badge>
                <h3 className="mt-3 font-display text-xl text-navy-800">{catalogServiceLabel(service.name, t)}</h3>
                {service.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink-600">{service.description}</p> : null}
                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="text-xs text-ink-400">{unitLabel(service.unit, t)}</p>
                  {service.basePrice ? (
                    <div className="text-right">
                      <p className="text-xs text-ink-400">{t('public.referencePrice')}</p>
                      <p className="font-display text-xl text-navy-800">{vnd(service.basePrice)}</p>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-400">{t('public.noServices')}</p>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('public.areas')}</h2>
        <Card hover={false} className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
            {profile.city ? (
              <span className="inline-flex items-center gap-1 font-semibold text-navy-800">
                <MapPin className="h-4 w-4 text-copper-500" /> {profile.city}
              </span>
            ) : null}
            {profile.serviceRadiusKm ? <span>{t('public.radius', { km: profile.serviceRadiusKm })}</span> : null}
          </div>
          {profile.serviceAreas?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.serviceAreas.map((area) => (
                <Badge key={area} tone="mist">{area}</Badge>
              ))}
            </div>
          ) : null}
          {profile.locationReady && profile.areaCenter ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-navy-800">{t('publicProfile.locationTitle')}</h3>
              <div className="mt-3">
                <LocationViewer lat={profile.areaCenter.lat} lng={profile.areaCenter.lng} address={profile.city || undefined} />
              </div>
              <MapPlaceActions lat={profile.areaCenter.lat} lng={profile.areaCenter.lng} />
            </div>
          ) : null}
          {profile.areaCenter && profile.serviceRadiusKm ? (
            <div className="mt-4 overflow-hidden rounded-2xl">
              <ServiceAreaMap lat={profile.areaCenter.lat} lng={profile.areaCenter.lng} radiusKm={profile.serviceRadiusKm} />
            </div>
          ) : null}
        </Card>
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('public.galleryTitle')}</h2>
        {albums.length ? (
          <div className="mt-4 space-y-6">
            {albums.map((album) => (
              <div key={album.title}>
                <h3 className="text-sm font-semibold text-ink-500">{album.title}</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {album.urls.map((url, index) => {
                    const altFor = (n: number) => t(album.kind === 'crew' ? 'viewer.crewAlt' : 'viewer.projectAlt', { n });
                    return (
                      <MediaFrame
                        key={`${url}-${index}`}
                        src={url}
                        alt={altFor(index + 1)}
                        fit="thumbnail"
                        frameClassName="aspect-[4/3] rounded-2xl"
                        onOpen={() =>
                          setViewer({
                            slides: album.urls.map((item, itemIndex) => ({ src: item, alt: altFor(itemIndex + 1) })),
                            index,
                          })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-400">{t('public.noPhotos')}</p>
        )}
        {profile.publicCertificates?.length ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink-500">{t('public.certificates')}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {profile.publicCertificates.map((url, index) => (
                <MediaFrame
                  key={`${url}-${index}`}
                  src={url}
                  alt={t('viewer.certificateAlt', { n: index + 1 })}
                  fit="thumbnail"
                  frameClassName="aspect-[4/3] rounded-2xl"
                  onOpen={() =>
                    setViewer({
                      slides: profile.publicCertificates.map((item, itemIndex) => ({
                        src: item,
                        alt: t('viewer.certificateAlt', { n: itemIndex + 1 }),
                      })),
                      index,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {highlightItems.length ? (
        <section>
          <h2 className="font-display text-2xl text-navy-800">{t('public.highlights')}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlightItems.map((item) => (
              <Card key={item.label} hover={false} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{item.label}</p>
                <p className="mt-2 font-display text-2xl text-navy-800">{item.value}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-navy-800">{t('public.reviewsTitle')}</h2>
            {total > 0 ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
                <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
                {t('public.reviewScore', { score: average.toFixed(1) })}
                <span className="font-normal text-ink-400">· {t('public.reviewTotal', { n: total })}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={star === 'all'} onClick={() => setStar('all')}>{t('public.allStars')}</FilterChip>
          {[5, 4, 3, 2, 1].map((value) => (
            <FilterChip key={value} active={star === value} onClick={() => setStar(value)}>
              {t('public.stars', { n: value })}
            </FilterChip>
          ))}
        </div>
        {visibleReviews.length ? (
          <div className="mt-4 space-y-3">
            {visibleReviews.map((row) => (
              <Card key={row.id} hover={false}>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-navy-800 text-sm text-paper-50">
                    {row.customerAvatar ? (
                      <img src={mediaUrl(row.customerAvatar)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (row.customerName || 'K').slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-navy-800">{row.customerName || t('public.customer')}</p>
                      <p className="text-xs text-ink-400">{new Date(row.createdAt).toLocaleDateString(dateTag)}</p>
                    </div>
                    <p className="mt-1 text-copper-500">{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</p>
                    {row.jobTitle ? <p className="mt-1 text-xs text-ink-400">{row.jobTitle}</p> : null}
                    {row.comment ? <p className="mt-2 text-sm leading-6 text-ink-600">{row.comment}</p> : null}
                    {row.contractorReply ? <p className="mt-3 rounded-2xl bg-navy-800/5 px-3 py-2 text-sm leading-6 text-navy-800">{row.contractorReply}</p> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-400">{t('public.noReviews')}</p>
        )}
      </section>

      {!owner || preview ? (
        <section className="rounded-[22px] bg-navy-800 px-5 py-8 text-paper-50 sm:px-8">
          <h2 className="font-display text-3xl">{t('public.ctaTitle')}</h2>
          <p className="mt-2 max-w-xl text-sm text-white/75">{t('public.ctaBody')}</p>
          <div className="mt-5">
            {preview ? (
              <Button type="button" variant="copper" size="lg">
                {t('public.requestRepair')}
              </Button>
            ) : (
              <RequestRepairButton contractorId={String(profile.contractorId)} storeId={profile.id} size="lg" />
            )}
          </div>
        </section>
      ) : null}

      <ImageViewer
        slides={viewer?.slides || []}
        index={viewer ? viewer.index : null}
        onClose={() => setViewer(null)}
        onChange={(next) => setViewer((current) => (current ? { ...current, index: next } : current))}
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-navy-800 text-white' : 'bg-white text-navy-800 ring-1 ring-navy-800/10'}`}
    >
      {children}
    </button>
  );
}
