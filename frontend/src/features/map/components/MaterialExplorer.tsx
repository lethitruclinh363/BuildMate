import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  Package,
  RotateCcw,
  Search,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AddToMaterialCart } from '@/features/material-cart/AddToMaterialCart';
import {
  locationApi,
  type MaterialCategoryItem,
  type MaterialSearchParams,
} from '@/features/map/services/location.api';
import { categoryDisplayLabel } from '@/data/material-categories';
import { publicPriceVisible, saleLabelKey, saleState, saleTone } from '@/lib/material-sale';
import { productImageUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { NearbyPlace, PublicMaterial } from '@/types/marketplace';
import type { CatalogMaterial } from '@/types/partner';

interface MaterialExplorerProps {
  stores?: NearbyPlace[];
  initialStoreId?: string;
}

export function MaterialExplorer({ stores = [], initialStoreId }: MaterialExplorerProps) {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state initialization
  const urlQ = searchParams.get('m_q') || '';
  const urlCat = searchParams.get('m_cat') || '';
  const urlCatId = searchParams.get('m_catId') || '';
  const urlStore = searchParams.get('m_store') || initialStoreId || '';
  const urlMin = searchParams.get('m_min') || '';
  const urlMax = searchParams.get('m_max') || '';
  const urlStatus = (searchParams.get('m_status') as MaterialSearchParams['sellingStatus']) || 'all';
  const urlSort = (searchParams.get('m_sort') as MaterialSearchParams['sortBy']) || 'default';
  const urlPage = Number(searchParams.get('m_page')) || 1;

  // Local state
  const [keyword, setKeyword] = useState(urlQ);
  const [debouncedKeyword, setDebouncedKeyword] = useState(urlQ);
  const [selectedCategoryId, setSelectedCategoryId] = useState(urlCatId);
  const [selectedCategoryName, setSelectedCategoryName] = useState(urlCat);
  const [selectedStoreId, setSelectedStoreId] = useState(urlStore);
  const [sellingStatus, setSellingStatus] = useState<MaterialSearchParams['sellingStatus']>(urlStatus);
  const [sortBy, setSortBy] = useState<MaterialSearchParams['sortBy']>(urlSort);
  const [page, setPage] = useState(urlPage);

  // Price inputs state
  const [minPriceInput, setMinPriceInput] = useState(urlMin);
  const [maxPriceInput, setMaxPriceInput] = useState(urlMax);
  const [appliedMinPrice, setAppliedMinPrice] = useState<number | undefined>(
    urlMin && !Number.isNaN(Number(urlMin)) ? Number(urlMin) : undefined
  );
  const [appliedMaxPrice, setAppliedMaxPrice] = useState<number | undefined>(
    urlMax && !Number.isNaN(Number(urlMax)) ? Number(urlMax) : undefined
  );
  const [priceError, setPriceError] = useState<string | null>(null);

  // Data state
  const [categories, setCategories] = useState<MaterialCategoryItem[]>([]);
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const debounceTimer = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce keyword input (350ms)
  useEffect(() => {
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(debounceTimer.current);
  }, [keyword]);

  // Load public categories from backend
  useEffect(() => {
    locationApi
      .materialCategories()
      .then((res) => {
        setCategories(res.data.data || []);
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  // Fetch materials whenever search/filter criteria change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: MaterialSearchParams = {
      keyword: debouncedKeyword || undefined,
      categoryId: selectedCategoryId || undefined,
      category: !selectedCategoryId && selectedCategoryName ? selectedCategoryName : undefined,
      store: selectedStoreId || undefined,
      minPrice: appliedMinPrice,
      maxPrice: appliedMaxPrice,
      sellingStatus: sellingStatus && sellingStatus !== 'all' ? sellingStatus : undefined,
      sortBy: sortBy || 'default',
      page,
      limit: 12,
    };

    locationApi
      .searchMaterials(params)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        if (Array.isArray(data)) {
          setMaterials(data);
          setTotal(data.length);
          setTotalPages(1);
        } else if (data && typeof data === 'object') {
          setMaterials(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } else {
          setMaterials([]);
          setTotal(0);
          setTotalPages(1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('materialSearch.loadError'));
          setMaterials([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    debouncedKeyword,
    selectedCategoryId,
    selectedCategoryName,
    selectedStoreId,
    appliedMinPrice,
    appliedMaxPrice,
    sellingStatus,
    sortBy,
    page,
    t,
  ]);

  // Sync state to URL search params
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedKeyword) next.set('m_q', debouncedKeyword);
    else next.delete('m_q');

    if (selectedCategoryId) next.set('m_catId', selectedCategoryId);
    else next.delete('m_catId');

    if (selectedCategoryName) next.set('m_cat', selectedCategoryName);
    else next.delete('m_cat');

    if (selectedStoreId) next.set('m_store', selectedStoreId);
    else next.delete('m_store');

    if (appliedMinPrice != null) next.set('m_min', String(appliedMinPrice));
    else next.delete('m_min');

    if (appliedMaxPrice != null) next.set('m_max', String(appliedMaxPrice));
    else next.delete('m_max');

    if (sellingStatus && sellingStatus !== 'all') next.set('m_status', sellingStatus);
    else next.delete('m_status');

    if (sortBy && sortBy !== 'default') next.set('m_sort', sortBy);
    else next.delete('m_sort');

    if (page > 1) next.set('m_page', String(page));
    else next.delete('m_page');

    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedKeyword,
    selectedCategoryId,
    selectedCategoryName,
    selectedStoreId,
    appliedMinPrice,
    appliedMaxPrice,
    sellingStatus,
    sortBy,
    page,
  ]);

  // Price validation and application
  const applyPriceFilter = (minStr: string, maxStr: string) => {
    const minVal = minStr.trim() !== '' ? Number(minStr) : undefined;
    const maxVal = maxStr.trim() !== '' ? Number(maxStr) : undefined;

    if (minVal != null && (Number.isNaN(minVal) || minVal < 0)) {
      setPriceError(t('materialSearch.negativePriceValidation'));
      return false;
    }
    if (maxVal != null && (Number.isNaN(maxVal) || maxVal < 0)) {
      setPriceError(t('materialSearch.negativePriceValidation'));
      return false;
    }
    if (minVal != null && maxVal != null && minVal > maxVal) {
      setPriceError(t('materialSearch.priceValidation'));
      return false;
    }

    setPriceError(null);
    setAppliedMinPrice(minVal);
    setAppliedMaxPrice(maxVal);
    setPage(1);
    return true;
  };

  const handlePriceApplyClick = () => {
    applyPriceFilter(minPriceInput, maxPriceInput);
  };

  const handleQuickPrice = (min?: number, max?: number) => {
    const minStr = min != null ? String(min) : '';
    const maxStr = max != null ? String(max) : '';
    setMinPriceInput(minStr);
    setMaxPriceInput(maxStr);
    applyPriceFilter(minStr, maxStr);
  };

  const handleClearPrice = () => {
    setMinPriceInput('');
    setMaxPriceInput('');
    setAppliedMinPrice(undefined);
    setAppliedMaxPrice(undefined);
    setPriceError(null);
    setPage(1);
  };

  const handleClearKeyword = () => {
    setKeyword('');
    setDebouncedKeyword('');
    setPage(1);
  };

  const handleSelectCategory = (catItem?: MaterialCategoryItem) => {
    if (!catItem) {
      setSelectedCategoryId('');
      setSelectedCategoryName('');
    } else {
      setSelectedCategoryId(catItem.id || '');
      setSelectedCategoryName(catItem.name);
    }
    setPage(1);
  };

  const handleResetAllFilters = () => {
    setKeyword('');
    setDebouncedKeyword('');
    setSelectedCategoryId('');
    setSelectedCategoryName('');
    setSelectedStoreId('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setAppliedMinPrice(undefined);
    setAppliedMaxPrice(undefined);
    setPriceError(null);
    setSellingStatus('all');
    setSortBy('default');
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Active filters count check
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (debouncedKeyword) count++;
    if (selectedCategoryId || selectedCategoryName) count++;
    if (selectedStoreId) count++;
    if (appliedMinPrice != null || appliedMaxPrice != null) count++;
    if (sellingStatus && sellingStatus !== 'all') count++;
    if (sortBy && sortBy !== 'default') count++;
    return count;
  }, [
    debouncedKeyword,
    selectedCategoryId,
    selectedCategoryName,
    selectedStoreId,
    appliedMinPrice,
    appliedMaxPrice,
    sellingStatus,
    sortBy,
  ]);

  return (
    <section id="materials" ref={containerRef} className="mt-12 space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-[1.75rem] text-navy-800">{t('materialSearch.title')}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{t('materialSearch.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 pt-2 sm:pt-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((prev) => !prev)}
            className="flex items-center gap-1.5"
          >
            <Filter className="h-4 w-4 text-navy-800" />
            <span>{t('materialSearch.filtersLabel')}</span>
            {activeFiltersCount > 0 ? (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-copper-500 text-xs font-bold text-white">
                {activeFiltersCount}
              </span>
            ) : null}
          </Button>
          {activeFiltersCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetAllFilters}
              className="text-xs text-ink-500 hover:text-red-700"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              {t('materialSearch.resetFilters')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search className="h-5 w-5 text-ink-400" />
        </div>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('materialSearch.placeholder')}
          className="h-12 w-full rounded-2xl border border-navy-800/15 bg-white pl-11 pr-11 text-base text-navy-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-navy-600 focus:ring-4 focus:ring-navy-600/10"
        />
        {keyword ? (
          <button
            type="button"
            onClick={handleClearKeyword}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-ink-400 transition hover:text-navy-900"
            aria-label={t('materialSearch.clearSearch')}
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* Category Chips Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleSelectCategory(undefined)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !selectedCategoryId && !selectedCategoryName
              ? 'bg-navy-800 text-white shadow'
              : 'bg-white text-ink-600 shadow-card hover:bg-mist-100 hover:text-navy-800'
          }`}
        >
          {t('materialSearch.allCategories')}
        </button>

        {categories.map((cat) => {
          const isSelected =
            (selectedCategoryId && cat.id === selectedCategoryId) ||
            (!selectedCategoryId && selectedCategoryName === cat.name);
          const label =
            locale === 'vi' ? cat.labelVi || cat.name : cat.labelEn || cat.name;

          return (
            <button
              key={`${cat.type}-${cat.id || cat.name}`}
              type="button"
              onClick={() => handleSelectCategory(cat)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isSelected
                  ? 'bg-navy-800 text-white shadow'
                  : 'bg-white text-ink-600 shadow-card hover:bg-mist-100 hover:text-navy-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Advanced Filter Panel (collapsible) */}
      {showFilters ? (
        <Card className="space-y-4 rounded-2xl border border-navy-800/10 bg-mist-50/50 p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Price Range Filter */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-600">
                  {t('materialSearch.filterPrice')}
                </span>
                {appliedMinPrice != null || appliedMaxPrice != null ? (
                  <button
                    type="button"
                    onClick={handleClearPrice}
                    className="text-xs text-red-600 underline hover:text-red-800"
                  >
                    {t('materialSearch.clearPrice')}
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  placeholder={t('materialSearch.minPrice')}
                  className="h-10 w-full rounded-xl border border-navy-800/15 bg-white px-3 text-sm text-navy-900 outline-none focus:border-navy-500"
                />
                <span className="text-ink-400">–</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={maxPriceInput}
                  onChange={(e) => setMaxPriceInput(e.target.value)}
                  placeholder={t('materialSearch.maxPrice')}
                  className="h-10 w-full rounded-xl border border-navy-800/15 bg-white px-3 text-sm text-navy-900 outline-none focus:border-navy-500"
                />
                <Button type="button" size="sm" onClick={handlePriceApplyClick} className="shrink-0">
                  {t('materialSearch.applyPrice')}
                </Button>
              </div>
              {priceError ? <p className="text-xs text-red-600">{priceError}</p> : null}
              {/* Quick price presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickPrice(undefined, 100000)}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-ink-600 shadow-sm hover:bg-mist-100 hover:text-navy-800"
                >
                  {t('materialSearch.quickPriceUnder100')}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPrice(100000, 500000)}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-ink-600 shadow-sm hover:bg-mist-100 hover:text-navy-800"
                >
                  {t('materialSearch.quickPrice100To500')}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPrice(500000, undefined)}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-ink-600 shadow-sm hover:bg-mist-100 hover:text-navy-800"
                >
                  {t('materialSearch.quickPriceAbove500')}
                </button>
              </div>
            </div>

            {/* Selling Status Filter */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-600">
                {t('materialSearch.filterStatus')}
              </span>
              <select
                value={sellingStatus}
                onChange={(e) => {
                  setSellingStatus(e.target.value as MaterialSearchParams['sellingStatus']);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-navy-800/15 bg-white px-3 text-sm text-navy-900 outline-none focus:border-navy-500"
              >
                <option value="all">{t('materialSearch.statusAll')}</option>
                <option value="selling">{t('materialSearch.statusSelling')}</option>
                <option value="out">{t('materialSearch.statusOut')}</option>
                <option value="paused">{t('materialSearch.statusPaused')}</option>
                <option value="discontinued">{t('materialSearch.statusDiscontinued')}</option>
              </select>
            </div>

            {/* Store Filter */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-600">
                {t('storePublic.kind')}
              </span>
              <select
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-xl border border-navy-800/15 bg-white px-3 text-sm text-navy-900 outline-none focus:border-navy-500"
              >
                <option value="">{t('materialSearch.allStores')}</option>
                {stores
                  .filter((s) => s.storeType === 'MATERIALS' || s.storeType === 'BOTH')
                  .map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.storeName || store.businessName}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Control bar: Result count & Sort Dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 pb-3">
        <p className="text-sm font-semibold text-navy-900">
          {t('materialSearch.resultsFound', { count: total })}
        </p>

        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-ink-400" />
          <span className="text-xs font-medium text-ink-500">{t('materialSearch.sortBy')}:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as MaterialSearchParams['sortBy']);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-navy-800/15 bg-white px-2.5 text-xs font-medium text-navy-800 outline-none transition focus:border-navy-600"
          >
            <option value="default">{t('materialSearch.sortDefault')}</option>
            <option value="price_asc">{t('materialSearch.sortPriceAsc')}</option>
            <option value="price_desc">{t('materialSearch.sortPriceDesc')}</option>
            <option value="newest">{t('materialSearch.sortNewest')}</option>
          </select>
        </div>
      </div>

      {/* Content Area: Loading / Error / Empty / Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <CardSkeleton key={idx} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p)}
            className="mt-3 border-red-300 text-red-800 hover:bg-red-100"
          >
            {t('materialSearch.retry')}
          </Button>
        </div>
      ) : materials.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-navy-800/10 bg-white p-8 text-center shadow-card">
          <Package className="h-12 w-12 text-ink-300" />
          <h3 className="mt-3 font-display text-lg text-navy-800">{t('materialSearch.noResults')}</h3>
          <p className="mt-1 max-w-md text-sm text-ink-500">{t('materialSearch.noResultsBody')}</p>
          {activeFiltersCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetAllFilters}
              className="mt-4"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t('materialSearch.resetFilters')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {materials.map((m) => {
            const state = saleState(m);
            const isDiscontinued = state === 'discontinued';
            const showPrice = publicPriceVisible(m) && m.price != null;
            const photo = productImageUrl(m.image || m.images?.[0]);
            const storeTargetId = m.store?.id || m.storeId;
            const storeName = m.store?.name || '';

            const catalogItem: CatalogMaterial = {
              id: m.id,
              name: m.name,
              category: m.category,
              categoryId: m.categoryId,
              sku: m.sku || '',
              unit: m.unit,
              price: m.price || 0,
              stock: m.stock,
              minOrderQty: m.minOrderQty || 1,
              image: m.image || '',
              images: m.images,
              description: m.description || '',
              isActive: m.isActive ?? true,
              listingStatus: m.listingStatus,
              saleAvailability: m.saleAvailability,
              saleState: state,
            };

            return (
              <Card
                key={m.id}
                hover={false}
                className="flex flex-col overflow-hidden rounded-2xl border border-navy-800/10 bg-white p-0 shadow-card transition-shadow hover:shadow-lg"
              >
                {/* Image & Badges */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-mist-100">
                  {photo ? (
                    <img
                      src={photo}
                      alt={m.name}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink-300">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    <Badge tone={saleTone(state)}>{t(saleLabelKey(state))}</Badge>
                  </div>
                </div>

                {/* Body Details */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
                    <span>{categoryDisplayLabel({ name: m.category, type: 'SYSTEM' }, t)}</span>
                    {m.sku ? <span className="font-mono text-ink-400">SKU: {m.sku}</span> : null}
                  </div>

                  <h3 className="mt-1 font-display text-base font-bold text-navy-800 transition hover:text-copper-600">
                    {storeTargetId ? (
                      <Link to={`/stores/${storeTargetId}/materials/${m.id}`}>{m.name}</Link>
                    ) : (
                      m.name
                    )}
                  </h3>

                  {storeName ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
                      <StoreIcon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      {storeTargetId ? (
                        <Link
                          to={`/stores/${storeTargetId}`}
                          className="truncate hover:text-navy-800 hover:underline"
                        >
                          {storeName}
                        </Link>
                      ) : (
                        <span className="truncate">{storeName}</span>
                      )}
                    </p>
                  ) : null}

                  {/* Price Section */}
                  <div className="mt-3 pt-2">
                    {showPrice ? (
                      <p className="font-display text-xl font-bold text-navy-800">
                        {vnd(m.price!)}{' '}
                        <span className="text-xs font-sans font-normal text-ink-400">/{m.unit}</span>
                      </p>
                    ) : isDiscontinued ? (
                      <p className="text-xs font-medium italic text-ink-400">
                        {t('materialSearch.discontinuedNotice')}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-400">—</p>
                    )}
                  </div>

                  {/* Action / Add to Cart */}
                  <div className="mt-auto pt-3">
                    {storeTargetId ? (
                      <AddToMaterialCart
                        material={catalogItem}
                        storeId={String(storeTargetId)}
                        storeName={storeName}
                      />
                    ) : (
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link to={`/stores/${storeTargetId}/materials/${m.id}`}>
                          {t('materialSearch.viewDetails')}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && !loading && !error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-800/10 pt-4">
          <p className="text-xs text-ink-500">
            {t('materialSearch.pageInfo', { page, totalPages })} ({total} {t('explore.materialLine').toLowerCase()})
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{t('materialSearch.prevPage')}</span>
            </Button>

            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              // Only render nearby pages if there are many pages
              if (totalPages > 7 && Math.abs(pageNum - page) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                if (pageNum === 2 || pageNum === totalPages - 1) {
                  return (
                    <span key={pageNum} className="px-1 text-ink-400">
                      …
                    </span>
                  );
                }
                return null;
              }

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => handlePageChange(pageNum)}
                  className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold transition ${
                    pageNum === page
                      ? 'bg-navy-800 text-white shadow-sm'
                      : 'bg-white text-ink-600 shadow-sm hover:bg-mist-100 hover:text-navy-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="flex items-center gap-1"
            >
              <span>{t('materialSearch.nextPage')}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-navy-800/10 bg-white p-4 shadow-card">
      <div className="aspect-[4/3] w-full rounded-xl bg-navy-800/10" />
      <div className="mt-3 h-4 w-20 rounded bg-navy-800/10" />
      <div className="mt-2 h-5 w-40 rounded bg-navy-800/10" />
      <div className="mt-2 h-4 w-28 rounded bg-navy-800/10" />
      <div className="mt-4 h-6 w-24 rounded bg-navy-800/10" />
      <div className="mt-4 h-9 w-full rounded-full bg-navy-800/10" />
    </div>
  );
}
