import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HardHat, List, Map, MapPin, Navigation, Search, Store } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { ExplorePopup } from '@/features/map/components/ExplorePopup';
import { ExploreResultsPane, CardSkeleton, CompactEmpty, type ExploreListTab } from '@/features/map/components/ExploreResultsPane';
import { ExploreSplitShell } from '@/features/map/components/ExploreSplitShell';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import { MapView } from '@/features/map/components/MapView';
import { ExploreCategorySelect } from '@/features/map/components/ExploreCategorySelect';
import { RadiusSelector } from '@/features/map/components/RadiusSelector';
import { FilterDrawer, type MarketplaceFilters } from '@/features/map/components/FilterDrawer';
import { Button } from '@/components/ui/Button';
import { MaterialExplorer } from '@/features/map/components/MaterialExplorer';
import { useCurrentLocation } from '@/features/map/hooks/useCurrentLocation';
import { readExplore, rememberExplore } from '@/features/map/lib/explore-memory';
import { hasCoordinates } from '@/features/map/lib/location';
import { locationApi } from '@/features/map/services/location.api';
import { originFromPlace, reverseGeocode } from '@/features/map/services/geocoding';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { materialRequirementApi } from '@/lib/material-requirement-api';
import { SEARCH_CHIPS, type NearbyPlace, type PublicService } from '@/types/marketplace';

function uniqueById(places: NearbyPlace[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const id = String(place.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function ExplorePage() {
  const { t, te } = useI18n();
  const [search] = useSearchParams();
  const mrlId = search.get('mrl') || '';
  const saved = useMemo(() => readExplore(), []);
  const { origin, setOrigin, locate, status, reverseFailed } = useCurrentLocation(saved?.origin);
  const [filters, setFilters] = useState<MarketplaceFilters>(
    saved?.filters || {
      category: '',
      radius: 5,
      minRating: 0,
      storeType: '',
    }
  );
  const [contractors, setContractors] = useState<NearbyPlace[]>([]);//Lưu danh sách các Contractor tìm được gần vị trí khách hàng
  const [stores, setStores] = useState<NearbyPlace[]>([]);
  const [services, setServices] = useState<PublicService[]>([]);
  const [pick, setPick] = useState<{ id: string; kind: 'contractor' | 'store'; token: number } | null>(null);
  const [listTab, setListTab] = useState<ExploreListTab>('all');
  const [mobilePane, setMobilePane] = useState<'map' | 'list'>('map');
  const [searchTick, setSearchTick] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(saved?.mapCenter || null);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinFailed, setPinFailed] = useState(false);
  const [eligibleIds, setEligibleIds] = useState<Set<string>>(new Set());
  const [mrlTitle, setMrlTitle] = useState('');
  const pinTimer = useRef<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

 // Các bộ lọc dùng chung khi tìm Contractor và Material Store
  const searchFilters = {
    category: filters.category || undefined,
    minRating: filters.minRating || undefined,
    storeType: filters.storeType || undefined,
  };

  const seen = useRef(false);

  useEffect(() => {
    api
      .get<{ data: { category: string }[] }>('/service-catalog', { silent: true })
      .then((res) => setGroups([...new Set((res.data.data || []).map((item) => item.category))]))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    locationApi
      .searchServices(filters.category ? { category: filters.category } : {})
      .then((res) => {
        if (!cancelled) setServices(res.data.data || []);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.category]);

  //Gọi API tìm Contractor theo vị trí
  useEffect(() => {
    let cancelled = false;
    if (!seen.current) setLoading(true);
    Promise.all([
      locationApi.nearbyContractors(origin.lat, origin.lng, filters.radius, searchFilters),//thợ
      locationApi.nearbyStores(origin.lat, origin.lng, filters.radius, searchFilters),//cửa hàng
    ])
      .then(([crews, yards]) => {
        if (cancelled) return;
        setContractors(uniqueById(crews.data.data || []));
        setStores(uniqueById(yards.data.data || []));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(te(getApiErrorMessage(err)));
      })
      .finally(() => {
        seen.current = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // extra is derived from the same filter fields listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, filters.radius, filters.category, filters.minRating, filters.storeType]);

  const reloadNearby = () => {
    seen.current = false;
    setLoading(true);
    setError(null);
    Promise.all([
      locationApi.nearbyContractors(origin.lat, origin.lng, filters.radius, searchFilters),
      locationApi.nearbyStores(origin.lat, origin.lng, filters.radius, searchFilters),
    ])
      .then(([crews, yards]) => {
        setContractors(uniqueById(crews.data.data || []));
        setStores(uniqueById(yards.data.data || []));
        setError(null);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => {
        seen.current = true;
        setLoading(false);
      });
  };

  useEffect(() => {
    setPick(null);
  }, [origin.lat, origin.lng, filters.radius]);

  useEffect(() => {
    if (!pick) return;
    if (listTab === 'contractor' && pick.kind !== 'contractor') setPick(null);
    if (listTab === 'store' && pick.kind !== 'store') setPick(null);
  }, [listTab, pick]);

  useEffect(() => {
    if (!pick) return;
    const container = listRef.current;
    const target = container?.querySelector<HTMLElement>(`#place-${pick.kind}-${pick.id}`);
    if (!container || !target) return;
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }, [pick]);

  function choose(id: string, kind: 'contractor' | 'store') {
    setPick({ id, kind, token: Date.now() });
  }

  useEffect(() => {
    rememberExplore({ origin, filters, mapCenter });
  }, [origin, filters, mapCenter]);

  const mrlOriginApplied = useRef(false);
  useEffect(() => {
    if (!mrlId) {
      mrlOriginApplied.current = false;
      return;
    }
    setListTab('store');
    setFilters((current) => (current.storeType === 'MATERIALS' ? current : { ...current, storeType: 'MATERIALS' }));
    if (mrlOriginApplied.current) return;
    let ignore = false;
    materialRequirementApi
      .get(mrlId)
      .then((res) => {
        if (ignore) return;
        const list = res.data.data;
        setMrlTitle(list.title || list.requestTitle || list.requestCode || '');
        const lat = Number(list.siteLat);
        const lng = Number(list.siteLng);
        if (!hasCoordinates(lat, lng)) return;
        mrlOriginApplied.current = true;
        setOrigin({
          lat,
          lng,
          label: list.siteAddress || undefined,
          address: list.siteAddress || undefined,
          source: 'MAP_PIN',
        });
      })
      .catch(() => null);
    materialRequirementApi
      .eligibleStores(mrlId)
      .then((res) => {
        if (ignore) return;
        setEligibleIds(new Set((res.data.data || []).map((row) => String(row.storeId))));
      })
      .catch(() => {
        if (!ignore) setEligibleIds(new Set());
      });
    return () => {
      ignore = true;
    };
  }, [mrlId, setOrigin]);

  useEffect(() => () => window.clearTimeout(pinTimer.current), []);

  function pinFromMap(lat: number, lng: number) {
    if (!hasCoordinates(lat, lng)) return;
    setPinFailed(false);
    setOrigin((current) => ({ ...current, lat, lng, source: 'MAP_PIN' }));
    window.clearTimeout(pinTimer.current);
    pinTimer.current = window.setTimeout(() => {
      reverseGeocode(lat, lng)
        .then((hit) => {
          const next = originFromPlace({ ...hit, lat, lng }, 'MAP_PIN');
          setOrigin(next.label ? next : { lat, lng, source: 'MAP_PIN' });
        })
        .catch(() => setPinFailed(true));
    }, 400);
  }

  const rankedStores = useMemo(() => {
    if (!eligibleIds.size) return stores;
    return [...stores].sort((a, b) => Number(eligibleIds.has(String(b.id))) - Number(eligibleIds.has(String(a.id))));
  }, [stores, eligibleIds]);
  const selected = pick
    ? (pick.kind === 'store' ? rankedStores : contractors).find((place) => place.id === pick.id) || null
    : null;
  const focus = selected
    ? { lat: Number(selected.location.coordinates[1]), lng: Number(selected.location.coordinates[0]) }
    : null;
  const mapContractors = listTab === 'store' || mrlId ? [] : contractors;
  const mapStores = listTab === 'contractor' ? [] : rankedStores;

  const legend = useMemo(
    () => [
      ['#0B2E4A', t('explore.jobSite')],
      ['#C9842A', t('explore.contractor')],
      ['#D4A017', t('explore.store')],
    ],
    [t]
  );

  const listPane =
    loading && contractors.length === 0 && stores.length === 0 ? (
      <div className="flex flex-col gap-2">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base text-navy-800 sm:text-lg">{t('explore.nearbyResults')}</h2>
          <RadiusSelector value={filters.radius} onChange={(radius) => setFilters((current) => ({ ...current, radius }))} />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    ) : error && contractors.length === 0 && stores.length === 0 ? (
      <ErrorState body={error} onRetry={reloadNearby} />
    ) : (
      // Hiển thị danh sách Contractor
      <ExploreResultsPane
        contractors={mrlId ? [] : contractors}
        stores={rankedStores}
        pick={pick}
        onChoose={choose}
        radiusKm={filters.radius}
        emptyCrewsTitle={t('explore.noCrews')}
        emptyCrewsBody={t('explore.noCrewsBody')}
        emptyStoresTitle={t('explore.noStores')}
        emptyStoresBody={t('explore.noStoresBody')}
        tab={listTab}
        onTabChange={setListTab}
        onRadiusChange={(radius) => setFilters((current) => ({ ...current, radius }))}
        origin={origin}
      />
    );

  
return (
  <PageTransition className="overflow-x-hidden">
    <div className="explore-stage flex w-full min-w-0 flex-col overflow-hidden px-3 pt-2 md:px-4">
      {/* Tiêu đề trang */}
      <PageHeader
        compact
        className="mb-1.5 shrink-0"
        title={t('explore.title')}
        description={
          mrlId
            ? t('mrl.exploreBanner')
            : t('explore.description')
        }
      />

      {/* Tiêu đề danh sách vật liệu */}
      {mrlId && mrlTitle && (
        <p className="mb-1.5 shrink-0 rounded-2xl bg-white px-4 py-2 text-sm text-navy-800 shadow-card">
          {mrlTitle}
        </p>
      )}

      {/* Thanh tìm kiếm và bộ lọc */}
      <div className="mb-1.5 flex min-w-0 shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <LocationPicker
            compact
            hideGps
            submitToken={searchTick}
            origin={origin}
            gpsStatus={status}
            mapCenter={mapCenter}
            onGps={locate}
            onPick={setOrigin}
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
          {/* Chọn danh mục dịch vụ */}
          <ExploreCategorySelect
            value={filters.category}
            options={
              groups.length
                ? groups.map((category) => ({
                    category,
                    label: catalogCategoryLabel(category, t),
                  }))
                : SEARCH_CHIPS.map((item) => ({
                    category: item.category,
                    label: t(item.labelKey),
                  }))
            }
            onChange={(category) =>
              setFilters((current) => ({
                ...current,
                category,
              }))
            }
          />

          {/* Nút tìm kiếm */}
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="h-10 shrink-0 px-3"
            onClick={() =>
              setSearchTick((tick) => tick + 1)
            }
          >
            <Search className="h-4 w-4" />
            {t('common.search')}
          </Button>

          {/* Sử dụng vị trí hiện tại */}
          <Button
            type="button"
            variant="copper"
            size="sm"
            className="h-10 shrink-0 px-3"
            loading={status === 'asking'}
            onClick={locate}
          >
            <Navigation className="h-4 w-4" />
            {t('map.useCurrent')}
          </Button>

          {/* Bộ lọc nâng cao */}
          <FilterDrawer
            value={filters}
            onChange={setFilters}
          />
        </div>
      </div>

      {/* Thông báo lỗi GPS */}
      {(status === 'denied' || status === 'unavailable') && (
        <p className="mb-1.5 shrink-0 text-xs text-red-700 sm:text-sm">
          {status === 'denied'
            ? t('map.gpsDenied')
            : t('map.gpsUnavailable')}
        </p>
      )}

      {/* Thông báo lỗi lấy địa chỉ */}
      {(reverseFailed || pinFailed) && (
        <p className="mb-1.5 shrink-0 text-xs text-red-700 sm:text-sm">
          {t('map.reverseFailed')}
        </p>
      )}

      {/* Chuyển đổi bản đồ và danh sách trên mobile */}
      <div className="mb-1.5 flex shrink-0 gap-1.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane('map')}
          className={cn(
            'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition',
            mobilePane === 'map'
              ? 'bg-navy-800 text-white'
              : 'bg-white text-ink-600 shadow-card'
          )}
        >
          <Map className="h-4 w-4" />
          {t('explore.viewMap')}
        </button>

        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className={cn(
            'inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition',
            mobilePane === 'list'
              ? 'bg-navy-800 text-white'
              : 'bg-white text-ink-600 shadow-card'
          )}
        >
          <List className="h-4 w-4" />
          {t('explore.viewList')}
        </button>
      </div>

      {/* Khu vực bản đồ và danh sách kết quả */}
      <ExploreSplitShell
        listRef={listRef}
        mobilePane={mobilePane}
        list={listPane}
        map={
          // Hiển thị bản đồ
          <MapView
            origin={origin}
            radiusKm={filters.radius}
            contractors={mapContractors}
            stores={mapStores}
            activeId={pick?.id}
            activeKind={pick?.kind}
            focus={focus}
            focusToken={pick?.token}
            loading={loading}
            onGps={locate}
            gpsAsking={status === 'asking'}
            onSelect={choose}
            onPick={pinFromMap}
            onViewChange={setMapCenter}
            className="h-full w-full"
            overlay={
              selected && pick ? (
                <ExplorePopup
                  place={selected}
                  kind={pick.kind}
                  onClose={() => setPick(null)}
                  mrlId={mrlId || undefined}
                />
              ) : null
            }
          />
        }
      />

      {/* Chú thích ký hiệu trên bản đồ */}
      <div className="mt-1 flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 pb-1 text-[11px] text-ink-500 sm:text-xs">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 text-navy-800" />
          {legend[0][1]}
        </span>

        <span className="inline-flex items-center gap-1">
          <HardHat className="h-3 w-3 text-copper-500" />
          {legend[1][1]}
        </span>

        <span className="inline-flex items-center gap-1">
          <Store className="h-3 w-3 text-amber-600" />
          {legend[2][1]}
        </span>
      </div>
    </div>

    {/* Nội dung bổ sung: dịch vụ phổ biến và vật liệu */}
    {!mrlId && (
      <>
        {/* Dịch vụ phổ biến */}
        <section className="mt-8 px-4 md:px-6">
          <h2 className="font-display text-[1.75rem] text-navy-800">
            {t('explore.popular')}
          </h2>

          {services.length === 0 ? (
            <div className="mt-4">
              <CompactEmpty
                title={t('explore.popularEmpty')}
                body={t('explore.popularEmptyBody')}
                action={
                  filters.radius < 10
                    ? () =>
                        setFilters((current) => ({
                          ...current,
                          radius: 10,
                        }))
                    : undefined
                }
                actionLabel={t('explore.widen')}
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {services.slice(0, 8).map((service) => (
                <Card key={service.id}>
                  <Badge tone="copper">
                    {catalogCategoryLabel(service.category, t)}
                  </Badge>

                  <h3 className="mt-3 font-display text-lg text-navy-800">
                    {catalogServiceLabel(service.name, t)}
                  </h3>

                  <p className="mt-1 text-sm text-ink-400">
                    {service.store?.name}
                  </p>

                  <p className="mt-3 font-display text-xl text-navy-800">
                    {service.basePrice
                      ? vnd(service.basePrice)
                      : null}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Khám phá cửa hàng vật liệu */}
        <div className="px-4 pb-8 md:px-6">
          <MaterialExplorer stores={stores} />
        </div>
      </>
    )}
  </PageTransition>
);

}