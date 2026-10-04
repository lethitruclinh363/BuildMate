import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Clock, Mail, MapPin, Phone, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ImageViewer, MediaFrame, type ViewerSlide } from '@/components/media/ProfileMedia';
import { LocationViewer } from '@/features/map/components/LocationViewer';
import { MapPlaceActions } from '@/features/map/components/MapPlaceActions';
import { ServiceAreaMap } from '@/pages/public/ServiceAreaMap';
import { categoryDisplayLabel, foldCategoryName } from '@/data/material-categories';
import { AddToMaterialCart } from '@/features/material-cart/AddToMaterialCart';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import type { CatalogMaterial } from '@/types/partner';
import type { MaterialCategoryPick } from '@/data/material-categories';
import type { PublicStoreProfile, PublicStoreReview } from '@/types/marketplace';

export function StoreProfileShowcase({
  profile,
  categories,
  materials,
  reviews,
  preview = false,
}: {
  profile: PublicStoreProfile;
  categories: MaterialCategoryPick[];
  materials: CatalogMaterial[];
  reviews?: { average: number; count: number; items: PublicStoreReview[] } | null;
  preview?: boolean;
}) {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const owner = !preview && user && String(user.id) === String(profile.contractorId);
  const [viewer, setViewer] = useState<{ slides: ViewerSlide[]; index: number } | null>(null);
  const [activeCategory, setActiveCategory] = useState('');
  const gallerySlides: ViewerSlide[] = profile.gallery.map((src, index) => ({ src, alt: t('storePublic.galleryAlt', { n: index + 1 }) }));
  const rating = reviews?.average ?? profile.rating ?? 0;
  const reviewCount = reviews?.count ?? profile.reviewCount ?? 0;
  const place = [profile.address, profile.city].filter(Boolean).join(', ');
  const visibleProducts = materials.filter((item) => !activeCategory || foldCategoryName(item.category) === activeCategory);

  function openAt(src: string, alt: string) {
    const slides = [
      profile.coverImage ? { src: profile.coverImage, alt: t('storePublic.cover') } : null,
      profile.logo ? { src: profile.logo, alt: t('storePublic.logo') } : null,
      profile.avatar ? { src: profile.avatar, alt: t('storePublic.avatar') } : null,
      ...gallerySlides,
      ...materials.filter((item) => item.image).map((item) => ({ src: item.image, alt: item.name })),
    ].filter((item): item is ViewerSlide => Boolean(item));
    const index = slides.findIndex((item) => item.src === src);
    setViewer(index >= 0 ? { slides, index } : { slides: [{ src, alt }], index: 0 });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <section className="overflow-hidden rounded-[28px] border border-navy-800/8 bg-white shadow-card">
        <MediaFrame
          src={profile.coverImage}
          alt={t('storePublic.cover')}
          fit="cover"
          priority
          frameClassName="aspect-[2/1] sm:aspect-[21/8]"
          onOpen={profile.coverImage ? () => openAt(profile.coverImage, t('storePublic.cover')) : undefined}
          empty={<div className="absolute inset-0 bg-navy-800" />}
        />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <div className="-mt-10 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-card">
              <MediaFrame
                src={profile.logo}
                alt={profile.displayName}
                fit="logo"
                frameClassName="h-20 w-20 sm:h-24 sm:w-24"
                onOpen={profile.logo ? () => openAt(profile.logo, t('storePublic.logo')) : undefined}
                empty={<span className="absolute inset-0 grid place-items-center px-2 text-center text-xs font-semibold text-ink-400">{profile.displayName.slice(0, 1) || t('storePublic.logo')}</span>}
              />
            </div>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl text-navy-800">{profile.displayName}</h1>
                {profile.verified ? (
                  <Badge tone="success">
                    <BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> {t('storePublic.verified')}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-500">{t('storePublic.kind')}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-copper-500" /> {profile.city || t('storePublic.noAddress')}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-navy-800">
                  <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
                  {reviewCount > 0 ? t('storePublic.reviewSummary', { score: rating.toFixed(1), count: reviewCount }) : t('storePublic.noReviews')}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${profile.phone}`}><Phone className="h-4 w-4" /> {t('storePublic.contact')}</a>
              </Button>
            ) : null}
            <Button asChild variant="copper">
              <a href="#store-products">{t('storePublic.viewProducts')}</a>
            </Button>
            {owner ? (
              <Button asChild variant="ghost">
                <Link to="/store/profile/edit">{t('storePublic.edit')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('storePublic.about')}</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-600">{profile.description.trim() ? profile.description : t('storePublic.noAbout')}</p>
          {profile.showroomNote ? <p className="mt-4 text-sm leading-6 text-ink-600">{profile.showroomNote}</p> : null}
        </Card>
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('storePublic.hoursTitle')}</h2>
          <p className="mt-1 text-sm text-ink-500">{t('storePublic.hoursHint')}</p>
          <p className="mt-4 inline-flex items-center gap-2 font-display text-2xl text-navy-800">
            <Clock className="h-5 w-5 text-copper-500" /> {profile.openingHours.trim() || t('storePublic.noHours')}
          </p>
          {profile.serviceAreas.length ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {profile.serviceAreas.map((area) => (
                <li key={area} className="rounded-full bg-mist-100 px-3 py-1.5 text-sm font-semibold text-navy-800">{area}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <Card hover={false}>
        <h2 className="font-display text-xl text-navy-800">{t('storePublic.deliveryPolicy')}</h2>
        {profile.deliveryEnabled ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.deliveryRange')}</dt>
              <dd className="mt-1 font-display text-2xl text-navy-800">{t('storePublic.deliveryRangeValue', { km: profile.serviceRadiusKm || 0 })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.deliveryFrom')}</dt>
              <dd className="mt-1 font-display text-2xl text-navy-800">{t('storePublic.deliveryFromValue', { fee: vnd(profile.baseDeliveryFee || 0) })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.deliveryFree')}</dt>
              <dd className="mt-1 font-display text-2xl text-navy-800">{t('storePublic.deliveryFreeValue', { km: profile.freeDeliveryRadiusKm || 0 })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.deliveryPerKm')}</dt>
              <dd className="mt-1 text-sm font-semibold text-navy-800">{vnd(profile.deliveryFeePerKm || 0)}</dd>
            </div>
            {(profile.minimumOrderAmount || 0) > 0 ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.deliveryMinimum')}</dt>
                <dd className="mt-1 text-sm font-semibold text-navy-800">{vnd(profile.minimumOrderAmount || 0)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-500">{t('storePublic.deliveryOff')}</p>
        )}
        {profile.deliveryNote ? <p className="mt-4 text-sm leading-6 text-ink-600">{profile.deliveryNote}</p> : null}
      </Card>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('storePublic.categories')}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('storePublic.categoriesHint')}</p>
        {categories.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((item) => {
              const key = foldCategoryName(item.name);
              const active = activeCategory === key;
              return (
                <li key={`${item.type}-${item.name}`}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveCategory(active ? '' : key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-navy-800 text-white' : 'bg-white text-navy-800 shadow-card'}`}
                  >
                    {categoryDisplayLabel(item, t)}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-500">{t('storePublic.noCategories')}</p>
        )}
      </section>

      <section id="store-products">
        <span id="materials" className="sr-only" />
        <h2 className="font-display text-2xl text-navy-800">{t('storePublic.products')}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('storePublic.productsHint')}</p>
        {visibleProducts.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((item) => (
              <Card key={item.id} hover={false} className="overflow-hidden p-0">
                <MediaFrame
                  src={item.image}
                  alt={item.name}
                  fit="cover"
                  frameClassName="aspect-[4/3]"
                  onOpen={item.image ? () => openAt(item.image, item.name) : undefined}
                  empty={<span className="absolute inset-0 grid place-items-center text-xs text-ink-400">{t('storePublic.noPhoto')}</span>}
                />
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{categoryDisplayLabel({ name: item.category, type: 'SYSTEM' }, t)}</p>
                  <h3 className="mt-1 font-display text-lg text-navy-800">{item.name}</h3>
                  <p className="mt-2 font-display text-xl text-navy-800">{vnd(item.price)} <span className="text-sm font-sans font-normal text-ink-400">/ {item.unit}</span></p>
                  <p className="mt-1 text-xs text-ink-500">{item.stock > 0 ? t('storePublic.inStock') : t('storePublic.outOfStock')}</p>
                  {preview ? null : (
                    <AddToMaterialCart material={item} storeId={String(profile.id)} storeName={profile.displayName} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-500">{activeCategory ? t('storePublic.noProductsInCategory') : t('storePublic.noProducts')}</p>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('storePublic.gallery')}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('storePublic.galleryHint')}</p>
        {profile.gallery.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {profile.gallery.map((src, index) => (
              <MediaFrame
                key={`${src}-${index}`}
                src={src}
                alt={t('storePublic.galleryAlt', { n: index + 1 })}
                fit="thumbnail"
                frameClassName="aspect-[4/3] rounded-2xl"
                onOpen={() => setViewer({ slides: gallerySlides, index })}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-500">{t('storePublic.noGallery')}</p>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-navy-800">{t('storePublic.reviews')}</h2>
        {reviewCount > 0 ? (
          <div className="mt-3">
            <p className="font-display text-3xl text-navy-800">{rating.toFixed(1)}</p>
            <p className="text-sm text-ink-500">{t('storePublic.reviewSummary', { score: rating.toFixed(1), count: reviewCount })}</p>
            <ul className="mt-4 space-y-3">
              {(reviews?.items || []).map((item) => (
                <li key={item.id} className="rounded-2xl bg-white p-4 shadow-card">
                  <p className="text-sm font-semibold text-navy-800">{item.customerName || t('storePublic.customer')}</p>
                  <p className="text-sm text-copper-600">{item.rating}/5</p>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{item.comment}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3">
            <p className="font-display text-2xl text-navy-800">{t('storePublic.noReviews')}</p>
            <p className="mt-1 text-sm text-ink-500">{t('storePublic.noReviewsBody')}</p>
          </div>
        )}
      </section>

      <Card hover={false}>
        <h2 className="font-display text-xl text-navy-800">{t('storePublic.contactTitle')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <p className="text-sm text-ink-600"><span className="block text-xs font-semibold uppercase tracking-wide text-ink-400">{t('storePublic.contactPerson')}</span><span className="mt-1 block font-semibold text-navy-800">{profile.contactName || t('storePublic.missing')}</span></p>
          <p className="inline-flex items-start gap-2 text-sm font-semibold text-navy-800"><Phone className="mt-0.5 h-4 w-4 text-copper-500" /> {profile.phone || t('storePublic.missing')}</p>
          <p className="inline-flex items-start gap-2 text-sm font-semibold text-navy-800"><Mail className="mt-0.5 h-4 w-4 text-copper-500" /> {profile.contactEmail || t('storePublic.missing')}</p>
          <p className="inline-flex items-start gap-2 text-sm font-semibold text-navy-800"><MapPin className="mt-0.5 h-4 w-4 text-copper-500" /> {place || t('storePublic.noAddress')}</p>
        </div>
        {profile.locationReady && profile.areaCenter ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-navy-800">{t('storePublic.locationTitle')}</h3>
            <div className="mt-3">
              <LocationViewer
                lat={profile.areaCenter.lat}
                lng={profile.areaCenter.lng}
                address={[profile.address, profile.city].filter(Boolean).join(', ') || undefined}
              />
            </div>
            <MapPlaceActions lat={profile.areaCenter.lat} lng={profile.areaCenter.lng} />
          </div>
        ) : null}
        {profile.areaCenter ? (
          <div className="mt-4 overflow-hidden rounded-2xl">
            <ServiceAreaMap lat={profile.areaCenter.lat} lng={profile.areaCenter.lng} radiusKm={profile.serviceRadiusKm || 5} />
          </div>
        ) : null}
      </Card>

      <ImageViewer
        slides={viewer?.slides || []}
        index={viewer ? viewer.index : null}
        onClose={() => setViewer(null)}
        onChange={(next) => setViewer((current) => (current ? { ...current, index: next } : current))}
      />
    </div>
  );
}
