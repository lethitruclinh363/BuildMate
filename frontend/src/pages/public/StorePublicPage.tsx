import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { explorePathFromLocation, usePartnerPaths } from '@/lib/partner-paths';
import { MapPin, Star } from 'lucide-react';
import { OperatingHoursDisplay } from '@/features/operating-hours/OperatingHoursDisplay';
import { normalizeWeeklyHours } from '@/features/operating-hours/weeklyHours';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { StoreProfileShowcase } from '@/pages/public/StoreProfileShowcase';
import type { MaterialCategoryPick } from '@/data/material-categories';
import type { PublicStoreProfile, PublicStoreReview } from '@/types/marketplace';
import { locationApi } from '@/features/map/services/location.api';
import { ChatStoreButton } from '@/features/chat/components/ChatStoreButton';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { RequestMaterialsButton } from '@/features/material-request/RequestMaterialsButton';
import { publicPriceVisible, saleLabelKey, saleState, saleTone } from '@/lib/material-sale';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { CatalogMaterial, CatalogService, Storefront } from '@/types/partner';

export function StorePublicPage() {
  const { t } = useI18n();
  const back = useReturnState();
  const { id } = useParams();
  const { pathname } = useLocation();
  const paths = usePartnerPaths();
  const mapHome = explorePathFromLocation(pathname);
  const embedded = pathname.startsWith('/customer/');
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<{
    store: Storefront;
    publicProfile?: PublicStoreProfile | null;
    categories?: MaterialCategoryPick[];
    visibility?: 'LIVE' | 'INACTIVE' | 'PAUSED';
    reviews?: { average: number; count: number; items: PublicStoreReview[] } | null;
    services: CatalogService[];
    materials: CatalogMaterial[];
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    locationApi
      .store(id)
      .then((res) => setPayload(res.data.data))
      .catch(() => setPayload(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardSkeleton />;
  if (!payload) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <ErrorState title={t('errors.notFoundStore')} body={t('errors.notFoundStoreBody')} />
          <div className="mt-4 text-center">
            <Button asChild>
              <Link to={mapHome}>{t('common.backToMap')}</Link>
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }
  if (payload.visibility && payload.visibility !== 'LIVE') {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <ErrorState
            title={payload.store?.name || t('errors.notFoundStore')}
            body={payload.visibility === 'PAUSED' ? t('activation.pausedPublic') : t('activation.notPublic')}
          />
          <div className="mt-4 text-center">
            <Button asChild>
              <Link to={mapHome}>{t('common.backToMap')}</Link>
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }
  const { store, services, materials } = payload;
  if (store.storeType === 'MATERIALS' && payload.publicProfile) {
    return (
      <PageTransition>
        <div className={embedded ? 'pt-1' : 'mx-auto max-w-6xl px-4 pt-6 md:px-8'}>
          <BackButton fallback={mapHome} />
        </div>
        <StoreProfileShowcase
          profile={{ ...payload.publicProfile, verified: true, displayName: payload.publicProfile.displayName || store.name }}
          categories={payload.categories || []}
          materials={materials}
          reviews={payload.reviews}
        />
      </PageTransition>
    );
  }
  const sellsMaterials = store.storeType === 'MATERIALS';
  const weeklyHours = normalizeWeeklyHours(
    payload.publicProfile?.weeklyHours || payload.publicProfile?.operatingHours || store.weeklyHours
  );

  return (
    <PageTransition>
      <div className={embedded ? 'mx-auto max-w-6xl' : 'mx-auto max-w-6xl px-4 py-10 md:px-8'}>
        <BackButton fallback={mapHome} />
        <div className="overflow-hidden rounded-[22px] border border-navy-800/8 bg-white shadow-card">
          <div className="relative h-56 bg-navy-800 md:h-72">
            {store.coverImage ? (
              <img src={mediaUrl(store.coverImage)} alt="" className="h-full w-full object-cover opacity-80" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <Badge tone="copper">{labeled(t, 'storeType', store.storeType)}</Badge>
              <h1 className="mt-2 font-display text-3xl md:text-4xl">{store.name}</h1>
              <p className="text-white/75">{store.slogan}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="space-y-1 text-sm text-ink-600">
              <p className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-copper-500" /> {store.address}, {store.city}
              </p>
              <p className="text-sm text-ink-500">{t('public.delivery', { km: store.serviceRadiusKm })}</p>
              <p className="inline-flex items-center gap-1 font-semibold text-navy-800">
                <Star className="h-4 w-4 fill-copper-400 text-copper-400" /> {(store.rating ?? 0).toFixed(1)} ({store.reviewCount ?? 0})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sellsMaterials ? (
                <>
                  <ChatStoreButton storeId={store.id} />
                  <Button asChild variant="copper">
                    <Link to="#materials">{t('explore.viewProducts')}</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link to={paths.contractor(store.contractorId)} state={back}>{t('public.crewProfile')}</Link>
                  </Button>
                  <RequestRepairButton contractorId={store.contractorId} storeId={store.id} size="md" />
                </>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-6 text-ink-600">{store.description}</p>

        <Card hover={false} className="mt-8">
          <OperatingHoursDisplay hours={weeklyHours} />
        </Card>

        {sellsMaterials ? null : (
          <>
            <h2 className="mt-10 font-display text-2xl text-navy-800">{t('public.services')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <Card key={s.id}>
                  <Badge tone="copper">{catalogCategoryLabel(s.category, t)}</Badge>
                  <h3 className="mt-3 font-display text-lg text-navy-800">{catalogServiceLabel(s.name, t)}</h3>
                  <p className="mt-2 text-sm text-ink-600">{s.description}</p>
                  <p className="mt-3 font-display text-xl text-navy-800">{s.basePrice ? vnd(s.basePrice) : null}</p>
                </Card>
              ))}
            </div>
          </>
        )}

        {sellsMaterials ? (
          <>
            <h2 id="materials" className="mt-10 font-display text-2xl text-navy-800">{t('public.materials')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {materials.map((m) => (
                <Card key={m.id}>
                  <Badge tone={saleTone(saleState(m))}>{t(saleLabelKey(saleState(m)))}</Badge>
                  <Link to={paths.material(store.id, m.id)} className="mt-3 block font-display text-lg text-navy-800">{m.name}</Link>
                  <p className="text-xs text-ink-400">{t('public.skuStock', { sku: m.sku, stock: m.stock })}</p>
                  {publicPriceVisible(m) ? (
                    <p className="mt-3 font-display text-xl text-navy-800">
                      {vnd(m.price)} <span className="text-sm font-sans font-normal text-ink-400">/{m.unit}</span>
                    </p>
                  ) : null}
                  <RequestMaterialsButton material={m} storeId={String(store.id)} storeName={store.name} />
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
