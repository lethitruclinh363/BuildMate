import { useEffect, useMemo, useState } from 'react';
import { Store, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import { MapView } from '@/features/map/components/MapView';
import { ContractorCard } from '@/features/map/components/ContractorCard';
import { MaterialStoreCard } from '@/features/map/components/MaterialStoreCard';
import { RadiusSelector } from '@/features/map/components/RadiusSelector';
import { FilterDrawer, type MarketplaceFilters } from '@/features/map/components/FilterDrawer';
import { useCurrentLocation } from '@/features/map/hooks/useCurrentLocation';
import { locationApi } from '@/features/map/services/location.api';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { SEARCH_CHIPS, type NearbyPlace, type PublicMaterial, type PublicService } from '@/types/marketplace';

export function ExplorePage() {
  const { t, te } = useI18n();
  const { origin, setOrigin, locate, status } = useCurrentLocation();
  const [filters, setFilters] = useState<MarketplaceFilters>({
    category: '',
    radius: 5,
    minRating: 0,
    storeType: '',
  });
  const [contractors, setContractors] = useState<NearbyPlace[]>([]);
  const [stores, setStores] = useState<NearbyPlace[]>([]);
  const [services, setServices] = useState<PublicService[]>([]);
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const extra = {
    category: filters.category || undefined,
    minRating: filters.minRating || undefined,
    storeType: filters.storeType || undefined,
  };

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      locationApi.nearbyContractors(origin.lat, origin.lng, filters.radius, extra),
      locationApi.nearbyStores(origin.lat, origin.lng, filters.radius, extra),
      locationApi.searchServices(filters.category ? { category: filters.category } : {}),
      locationApi.searchMaterials({}),
    ])
      .then(([c, s, svc, mat]) => {
        setContractors(c.data.data);
        setStores(s.data.data);
        setServices(svc.data.data);
        setMaterials(mat.data.data);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api
      .get<{ data: { category: string }[] }>('/service-catalog', { silent: true })
      .then((res) => setGroups([...new Set((res.data.data || []).map((item) => item.category))]))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, filters.radius, filters.category, filters.minRating, filters.storeType]);

  const legend = useMemo(
    () => [
      ['#0B2E4A', t('explore.jobSite')],
      ['#C9842A', t('explore.contractor')],
      ['#D4A017', t('explore.store')],
    ],
    [t]
  );

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('explore.eyebrow')}
        title={t('explore.title')}
        description={t('explore.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterDrawer value={filters} onChange={setFilters} />
            <RadiusSelector value={filters.radius} onChange={(radius) => setFilters((f) => ({ ...f, radius }))} />
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {(groups.length ? groups.map((category) => ({ category, label: catalogCategoryLabel(category, t) })) : SEARCH_CHIPS.map((item) => ({ category: item.category, label: t(item.labelKey) }))).map((item) => (
          <button
            key={item.category}
            type="button"
            onClick={() =>
              setFilters((cur) => ({ ...cur, category: cur.category === item.category ? '' : item.category }))
            }
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filters.category === item.category ? 'bg-copper-400 text-navy-900' : 'bg-white text-ink-600 shadow-card'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <LocationPicker origin={origin} gpsStatus={status} onGps={locate} onPick={setOrigin} />

      <div className="mt-5 overflow-hidden rounded-[22px] border border-navy-800/8 shadow-card">
        <MapView
          origin={origin}
          radiusKm={filters.radius}
          contractors={contractors}
          stores={stores}
          activeId={activeId}
          onSelect={setActiveId}
          onPick={(lat, lng) => setOrigin({ lat, lng, label: 'Map pin' })}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-400">
        {legend.map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: color }} /> {label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-8">
          <DashboardSkeleton />
        </div>
      ) : error ? (
        <div className="mt-8">
          <ErrorState body={error} onRetry={load} />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-4 font-display text-2xl text-navy-800">{t('explore.nearbyContractors')}</h2>
            {contractors.length === 0 ? (
              <EmptyState icon={<Wrench className="h-5 w-5" />} title={t('explore.noCrews')} body={t('explore.noCrewsBody')} />
            ) : (
              <div className="space-y-4">
                {contractors.map((p) => (
                  <ContractorCard key={p.id} place={p} active={activeId === p.id} onHover={() => setActiveId(p.id)} />
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-4 font-display text-2xl text-navy-800">{t('explore.nearbyStores')}</h2>
            {stores.length === 0 ? (
              <EmptyState icon={<Store className="h-5 w-5" />} title={t('explore.noStores')} body={t('explore.noStoresBody')} />
            ) : (
              <div className="space-y-4">
                {stores.map((p) => (
                  <MaterialStoreCard key={p.id} place={p} active={activeId === p.id} onHover={() => setActiveId(p.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="mt-12">
        <h2 className="font-display text-2xl text-navy-800">{t('explore.popular')}</h2>
        {services.length === 0 ? (
          <p className="mt-4 text-sm text-ink-400">{t('explore.noCrews')}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {services.slice(0, 8).map((s) => (
              <Card key={s.id}>
                <Badge tone="copper">{catalogCategoryLabel(s.category, t)}</Badge>
                <h3 className="mt-3 font-display text-lg text-navy-800">{catalogServiceLabel(s.name, t)}</h3>
                <p className="mt-1 text-sm text-ink-400">{s.store?.name}</p>
                <p className="mt-3 font-display text-xl text-navy-800">{s.basePrice ? vnd(s.basePrice) : null}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-navy-800">{t('explore.materials')}</h2>
        {materials.length === 0 ? (
          <p className="mt-4 text-sm text-ink-400">{t('explore.noStores')}</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {materials.slice(0, 8).map((m) => (
              <Card key={m.id}>
                <Badge tone="mist">{m.category}</Badge>
                <h3 className="mt-3 font-display text-lg text-navy-800">{m.name}</h3>
                <p className="mt-1 text-sm text-ink-400">{m.store?.name}</p>
                <p className="mt-3 font-display text-xl text-navy-800">
                  {vnd(m.price)} <span className="text-sm font-sans text-ink-400">/{m.unit}</span>
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
