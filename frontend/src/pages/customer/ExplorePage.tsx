import { useEffect, useMemo, useState } from 'react';
import { HardHat, MapPin, Store } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ExplorePopup } from '@/features/map/components/ExplorePopup';
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
  const [pick, setPick] = useState<{ id: string; kind: 'contractor' | 'store'; token: number } | null>(null);
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

  useEffect(() => {
    setPick(null);
  }, [origin.lat, origin.lng, filters.radius]);

  useEffect(() => {
    if (!pick) return;
    document.getElementById(`place-${pick.kind}-${pick.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pick]);

  function choose(id: string, kind: 'contractor' | 'store') {
    setPick({ id, kind, token: Date.now() });
  }

  const selected = pick
    ? (pick.kind === 'store' ? stores : contractors).find((place) => place.id === pick.id) || null
    : null;
  const focus = selected
    ? { lat: Number(selected.location.coordinates[1]), lng: Number(selected.location.coordinates[0]) }
    : null;

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

      {status === 'denied' || status === 'unavailable' ? (
        <p className="mt-3 text-sm text-red-700">{status === 'denied' ? t('map.gpsDenied') : t('map.gpsUnavailable')}</p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-[22px] border border-navy-800/8 shadow-card">
        <MapView
          origin={origin}
          radiusKm={filters.radius}
          contractors={contractors}
          stores={stores}
          activeId={pick?.id}
          activeKind={pick?.kind}
          focus={focus}
          focusToken={pick?.token}
          loading={loading}
          onGps={locate}
          gpsAsking={status === 'asking'}
          onSelect={choose}
          onPick={(lat, lng) => setOrigin({ lat, lng, label: 'Map pin' })}
          overlay={
            selected && pick ? (
              <ExplorePopup place={selected} kind={pick.kind} onClose={() => setPick(null)} />
            ) : null
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-500">
        <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-navy-800" /> {legend[0][1]}</span>
        <span className="inline-flex items-center gap-2"><HardHat className="h-4 w-4 text-copper-500" /> {legend[1][1]}</span>
        <span className="inline-flex items-center gap-2"><Store className="h-4 w-4 text-amber-600" /> {legend[2][1]}</span>
      </div>

      {loading ? (
        <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <div className="mt-8">
          <ErrorState body={error} onRetry={load} />
        </div>
      ) : (
        <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-2">
          <section className="flex min-w-0 flex-col">
            <h2 className="mb-4 font-display text-[1.75rem] text-navy-800">{t('explore.nearbyContractors')}</h2>
            {contractors.length === 0 ? (
              <CompactEmpty title={t('explore.noCrews')} body={t('explore.noCrewsBody')} />
            ) : (
              <div className="flex flex-1 flex-col gap-4">
                {contractors.map((p) => (
                  <ContractorCard key={p.id} place={p} active={pick?.kind === 'contractor' && pick.id === p.id} onHover={() => choose(p.id, 'contractor')} />
                ))}
              </div>
            )}
          </section>
          <section className="flex min-w-0 flex-col">
            <h2 className="mb-4 font-display text-[1.75rem] text-navy-800">{t('explore.nearbyStores')}</h2>
            {stores.length === 0 ? (
              <CompactEmpty title={t('explore.noStores')} body={t('explore.noStoresBody')} />
            ) : (
              <div className="flex flex-1 flex-col gap-4">
                {stores.map((p) => (
                  <MaterialStoreCard key={p.id} place={p} active={pick?.kind === 'store' && pick.id === p.id} onHover={() => choose(p.id, 'store')} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="mt-12">
        <h2 className="font-display text-[1.75rem] text-navy-800">{t('explore.popular')}</h2>
        {services.length === 0 ? (
          <CompactEmpty
            title={t('explore.popularEmpty')}
            body={t('explore.popularEmptyBody')}
            action={filters.radius < 10 ? () => setFilters((current) => ({ ...current, radius: 10 })) : undefined}
            actionLabel={t('explore.widen')}
          />
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
        <h2 className="font-display text-[1.75rem] text-navy-800">{t('explore.materials')}</h2>
        {materials.length === 0 ? (
          <CompactEmpty
            title={t('explore.materialsEmpty')}
            body={t('explore.popularEmptyBody')}
            action={filters.radius < 10 ? () => setFilters((current) => ({ ...current, radius: 10 })) : undefined}
            actionLabel={t('explore.widen')}
          />
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

function CardSkeleton() {
  return (
    <div className="h-[220px] animate-pulse rounded-[22px] bg-white p-6 shadow-card" aria-hidden>
      <div className="flex gap-4">
        <div className="h-[72px] w-[72px] rounded-2xl bg-navy-800/10" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-5 w-36 rounded bg-navy-800/10" />
          <div className="h-4 w-48 rounded bg-navy-800/10" />
        </div>
      </div>
      <div className="mt-6 h-4 w-40 rounded bg-navy-800/10" />
      <div className="mt-8 flex gap-2">
        <div className="h-9 w-28 rounded-full bg-navy-800/10" />
        <div className="h-9 w-36 rounded-full bg-navy-800/10" />
      </div>
    </div>
  );
}

function CompactEmpty({
  title,
  body,
  action,
  actionLabel,
}: {
  title: string;
  body?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="mt-4 flex min-h-[112px] max-h-[140px] flex-col justify-center rounded-[22px] border border-navy-800/8 bg-white px-6 py-4 shadow-card">
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {body ? <p className="mt-1 text-sm leading-6 text-ink-500">{body}</p> : null}
      {action && actionLabel ? (
        <button type="button" className="mt-2 w-fit text-sm font-semibold text-navy-800 underline" onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
