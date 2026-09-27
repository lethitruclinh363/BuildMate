import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, MapPin, Star } from 'lucide-react';
import { PageTransition } from '@/components/motion/PageTransition';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { locationApi } from '@/features/map/services/location.api';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { CatalogMaterial, CatalogService, Storefront } from '@/types/partner';

function openingStatus(hours: string | undefined, t: (path: string, vars?: Record<string, string | number>) => string) {
  const raw = hours || '';
  const match = raw.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return { open: null as boolean | null, label: hours || t('forms.hoursUnknown') };
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const open = current >= start && current < end;
  return { open, label: open ? t('forms.openNow', { hours: hours || '' }) : t('forms.closed', { hours: hours || '' }) };
}

export function StorePublicPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<{
    store: Storefront;
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
              <Link to="/explore">{t('common.backToMap')}</Link>
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }
  const { store, services, materials } = payload;
  const hours = openingStatus(store.openingHours, t);
  const sellsMaterials = store.storeType === 'MATERIALS';

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
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
              <p className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-copper-500" />
                <Badge tone={hours.open === true ? 'success' : 'mist'}>{hours.label}</Badge>
                · {t('public.delivery', { km: store.serviceRadiusKm })}
              </p>
              <p className="inline-flex items-center gap-1 font-semibold text-navy-800">
                <Star className="h-4 w-4 fill-copper-400 text-copper-400" /> {(store.rating ?? 0).toFixed(1)} ({store.reviewCount ?? 0})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {sellsMaterials ? (
                <Button asChild variant="copper">
                  <Link to="#materials">{t('explore.buy')}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link to={`/contractors/${store.contractorId}`}>{t('public.crewProfile')}</Link>
                  </Button>
                  <RequestRepairButton contractorId={store.contractorId} storeId={store.id} size="md" />
                </>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-6 text-ink-600">{store.description}</p>

        {sellsMaterials ? null : (
          <>
            <h2 className="mt-10 font-display text-2xl text-navy-800">{t('public.services')}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <Card key={s.id}>
                  <Badge tone="copper">{s.category}</Badge>
                  <h3 className="mt-3 font-display text-lg text-navy-800">{s.name}</h3>
                  <p className="mt-2 text-sm text-ink-600">{s.description}</p>
                  <p className="mt-3 font-display text-xl text-navy-800">{vnd(s.basePrice)}</p>
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
                  <Badge tone="mist">{m.category}</Badge>
                  <h3 className="mt-3 font-display text-lg text-navy-800">{m.name}</h3>
                  <p className="text-xs text-ink-400">{t('public.skuStock', { sku: m.sku, stock: m.stock })}</p>
                  <p className="mt-3 font-display text-xl text-navy-800">
                    {vnd(m.price)} <span className="text-sm font-sans font-normal text-ink-400">/{m.unit}</span>
                  </p>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
