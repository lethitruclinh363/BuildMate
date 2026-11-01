import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { MoreHorizontal, Package } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { VerificationGate } from '@/components/contractor/VerificationGate';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { MediaFrame } from '@/components/media/ProfileMedia';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { categoryDisplayLabel } from '@/data/material-categories';
import { api } from '@/lib/api';
import { listingOf, saleLabelKey, saleState, saleTone, type SaleState } from '@/lib/material-sale';
import { materialStoreApi, productImageUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { CatalogMaterial, StoreMaterialCategory, Storefront } from '@/types/partner';
import type { ApiResponse } from '@/types/user';
import { DeviceImageField, imageProblem } from '@/pages/store/DeviceImageField';

const UNITS = ['Bao', 'Kg', 'Tấn', 'Mét', 'm²', 'm³', 'Thùng', 'Cái', 'Cuộn', 'Bộ'];
const LOW_STOCK = 10;

async function uploadMaterialImage(file: File) {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post<ApiResponse<{ url: string }>>('/uploads/stores', body, { timeout: 60000 });
  return res.data.data.url;
}

function formatQty(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
}

const schema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(1),
  sku: z.string().optional(),
  unit: z.string().trim().min(1).max(20),
  price: z.coerce.number().finite().min(0),
  stock: z.coerce.number().finite().min(0),
  minOrderQty: z.coerce.number().finite().min(1),
  description: z.string().optional(),
  listingStatus: z.enum(['ACTIVE', 'PAUSED', 'DISCONTINUED']),
  manualOut: z.boolean(),
  restockExpectedOn: z.string().optional(),
  statusNote: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function StoreMaterialsPage() {
  const { t, te } = useI18n();
  const pushToast = useToastStore((state) => state.push);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('category') || '';
  const editId = params.get('edit') || '';
  const openedEdit = useRef('');
  const [approved, setApproved] = useState(false);
  const [store, setStore] = useState<Storefront | null>(null);
  const [items, setItems] = useState<CatalogMaterial[]>([]);
  const [categories, setCategories] = useState<StoreMaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | SaleState>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'priceAsc' | 'priceDesc' | 'stockAsc' | 'stockDesc'>('newest');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogMaterial | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CatalogMaterial | null>(null);
  const [pendingAction, setPendingAction] = useState<{ item: CatalogMaterial; kind: 'pause' | 'discontinue' | 'resume' } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [menuId, setMenuId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError] = useState('');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      category: '',
      sku: '',
      unit: 'Bao',
      price: 0,
      stock: 0,
      minOrderQty: 1,
      description: '',
      listingStatus: 'ACTIVE',
      manualOut: false,
      restockExpectedOn: '',
      statusNote: '',
    },
  });
  const skipDiscontinueConfirm = useRef(false);
  const watchedPrice = Number(form.watch('price') || 0);
  const watchedStock = Number(form.watch('stock') || 0);
  const watchedUnit = form.watch('unit') || '';
  const watchedMin = Number(form.watch('minOrderQty') || 0);

  const load = async () => {
    const workspace = await materialStoreApi.workspace();
    const data = workspace.data.data;
    setApproved(data.approved);
    setStore(data.store);
    if (!data.approved || !data.store) {
      setItems([]);
      setCategories([]);
      return;
    }
    const [res, categoryRes] = await Promise.all([
      materialStoreApi.listMaterials(),
      materialStoreApi.listStoreCategories(),
    ]);
    setItems(res.data.data || []);
    setCategories(categoryRes.data.data || []);
  };

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editId || openedEdit.current === editId) return;
    const found = items.find((row) => row.id === editId);
    if (!found) return;
    openedEdit.current = editId;
    setEditing(found);
    setError('');
    form.reset({
      name: found.name,
      category: found.category,
      sku: found.sku,
      unit: found.unit || 'Bao',
      price: found.price,
      stock: found.stock,
      minOrderQty: found.minOrderQty,
      description: found.description,
      listingStatus: listingOf(found),
      manualOut: found.saleAvailability === 'MANUALLY_UNAVAILABLE',
      restockExpectedOn: found.restockExpectedOn ? String(found.restockExpectedOn).slice(0, 10) : '',
      statusNote: found.statusNote || '',
    });
    setOpen(true);
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [editId, items, form, params, setParams]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);

  const activeCategories = categories.filter((item) => item.status === 'ACTIVE');
  const categoryName = (item: { category: string; categoryId?: string | null }) => {
    const match = categories.find((category) => category.id === item.categoryId || category.name === item.category);
    return match ? categoryDisplayLabel(match, t) : item.category;
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (categoryId && item.categoryId !== categoryId) return false;
      if (status !== 'all' && saleState(item) !== status) return false;
      if (!needle) return true;
      return `${item.name} ${item.sku || ''}`.toLowerCase().includes(needle);
    });
    rows.sort((a, b) => {
      if (sort === 'oldest') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      if (sort === 'priceAsc') return a.price - b.price;
      if (sort === 'priceDesc') return b.price - a.price;
      if (sort === 'stockAsc') return a.stock - b.stock;
      if (sort === 'stockDesc') return b.stock - a.stock;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return rows;
  }, [items, query, categoryId, categories, status, sort]);

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('materialPage.manageEyebrow')} title={t('materialPage.gatedTitle')} />
        <VerificationGate to="/store/verification" />
      </PageTransition>
    );
  }

  const resetImage = () => {
    setPendingFile(null);
    setImageRemoved(false);
    setImageError('');
  };

  const openNew = () => {
    setEditing(null);
    resetImage();
    setError('');
    const selected = categories.find((item) => item.id === categoryId);
    const first = selected?.name || activeCategories[0]?.name || '';
    form.reset({ name: '', category: first, sku: '', unit: 'Bao', price: 0, stock: 0, minOrderQty: 1, description: '', listingStatus: 'ACTIVE', manualOut: false, restockExpectedOn: '', statusNote: '' });
    setOpen(true);
  };

  const openEdit = (item: CatalogMaterial) => {
    setEditing(item);
    resetImage();
    setError('');
    setMenuId('');
    form.reset({
      name: item.name,
      category: item.category,
      sku: item.sku,
      unit: item.unit || 'Bao',
      price: item.price,
      stock: item.stock,
      minOrderQty: item.minOrderQty,
      description: item.description,
      listingStatus: listingOf(item),
      manualOut: item.saleAvailability === 'MANUALLY_UNAVAILABLE',
      restockExpectedOn: item.restockExpectedOn ? String(item.restockExpectedOn).slice(0, 10) : '',
      statusNote: item.statusNote || '',
    });
    setOpen(true);
  };

  const chooseImage = (file: File) => {
    const problem = imageProblem(file);
    if (problem) {
      setImageError(problem === 'size' ? t('materialPage.imageSize') : t('materialPage.imageType'));
      return;
    }
    setImageError('');
    setImageRemoved(false);
    setPendingFile(file);
  };

  const persist = form.handleSubmit(async (values) => {
    if (!values.category) {
      setError(t('materialPage.categoryRequired'));
      return;
    }
    const hasImage = Boolean(pendingFile) || (!imageRemoved && editing?.image);
    if (!hasImage) {
      setImageError(t('materialPage.imageRequired'));
      return;
    }
    if (imageError) return;
    if (editing && values.listingStatus === 'DISCONTINUED' && listingOf(editing) !== 'DISCONTINUED' && !skipDiscontinueConfirm.current) {
      setActionNote(values.statusNote || '');
      setPendingAction({ item: editing, kind: 'discontinue' });
      return;
    }
    skipDiscontinueConfirm.current = false;
    setBusy(true);
    setError('');
    try {
      let image = imageRemoved ? '' : editing?.image || '';
      if (pendingFile) {
        const problem = imageProblem(pendingFile);
        if (problem) {
          setImageError(problem === 'size' ? t('materialPage.imageSize') : t('materialPage.imageType'));
          return;
        }
        image = await uploadMaterialImage(pendingFile);
      }
      await materialStoreApi.saveMaterial({
        name: values.name,
        category: values.category,
        sku: values.sku,
        unit: values.unit,
        price: values.price,
        stock: values.stock,
        minOrderQty: values.minOrderQty,
        description: values.description,
        image,
        listingStatus: values.listingStatus,
        saleAvailability: values.manualOut ? 'MANUALLY_UNAVAILABLE' : 'AVAILABLE',
        restockExpectedOn: values.restockExpectedOn || null,
        statusNote: values.statusNote || '',
      }, editing?.id);
      setOpen(false);
      resetImage();
      await load();
      pushToast({ kind: 'success', title: t('materialPage.saved') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setError(te(ax.response?.data?.message) || t('materialPage.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  const patchSale = async (item: CatalogMaterial, body: Partial<CatalogMaterial>) => {
    setMenuId('');
    setBusy(true);
    try {
      await materialStoreApi.saveMaterial(body, item.id);
      setPendingAction(null);
      setActionNote('');
      await load();
      pushToast({ kind: 'success', title: t('materialPage.saved') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      pushToast({ kind: 'error', title: te(ax.response?.data?.message) || t('materialPage.saveFail') });
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await materialStoreApi.deleteMaterial(pendingDelete.id);
      setPendingDelete(null);
      await load();
      pushToast({
        kind: 'success',
        title: res.data.data?.deactivated ? t('materialPage.deactivated') : t('materialPage.deleted'),
      });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      pushToast({ kind: 'error', title: te(ax.response?.data?.message) || t('materialPage.saveFail') });
    } finally {
      setBusy(false);
    }
  };

  const setCategoryFilter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('category', id);
    else next.delete('category');
    setParams(next, { replace: true });
  };

  const unitChoices = watchedUnit && !UNITS.includes(watchedUnit) ? [watchedUnit, ...UNITS] : UNITS;
  const filtersOn = Boolean(query || categoryId || status !== 'all' || sort !== 'newest');
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const scoped = categoryId ? items.filter((item) => item.categoryId === categoryId) : items;
  const counts = {
    all: scoped.length,
    selling: scoped.filter((item) => saleState(item) === 'selling').length,
    out: scoped.filter((item) => saleState(item) === 'out').length,
    paused: scoped.filter((item) => saleState(item) === 'paused').length,
    discontinued: scoped.filter((item) => saleState(item) === 'discontinued').length,
  };
  const watchedListing = form.watch('listingStatus');
  const watchedManual = form.watch('manualOut');

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('materialPage.manageEyebrow')}
        title={t('materialPage.productTitle')}
        description={t('materialPage.description')}
        actions={store ? <Button onClick={openNew}>{t('materialPage.addProduct')}</Button> : undefined}
      />

      {loadError ? <p className="mb-4 text-sm text-red-600">{t('materialPage.loadFail')}</p> : null}

      {!store ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title={t('servicePage.needStore')} body={t('materialPage.needStoreBody')} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            {([
              ['all', t('materialPage.statTotal'), counts.all],
              ['selling', t('materialPage.saleSelling'), counts.selling],
              ['out', t('materialPage.saleOut'), counts.out],
              ['paused', t('materialPage.salePaused'), counts.paused],
              ['discontinued', t('materialPage.saleDiscontinued'), counts.discontinued],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-2xl border px-3 py-3 text-left ${status === key ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-800/10 bg-white text-navy-800'}`}
              >
                <span className="block text-xs">{label}</span>
                <span className="mt-1 block font-display text-2xl">{formatQty(count)}</span>
              </button>
            ))}
          </div>
          {selectedCategory ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-navy-800/10 bg-white px-4 py-3">
              <p className="text-sm text-navy-800">{t('materialPage.filteredCategory', { name: categoryDisplayLabel(selectedCategory, t) })}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setCategoryFilter('')}>{t('materialPage.viewAllProducts')}</Button>
            </div>
          ) : null}
          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              id="product-search"
              label={t('materialPage.searchPlaceholder')}
              value={query}
              placeholder={t('materialPage.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select id="product-category" label={t('materialPage.category')} value={categoryId} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">{t('materialPage.allCategories')}</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {categoryDisplayLabel(item, t)}
                </option>
              ))}
            </Select>
            <Select id="product-status" label={t('materialPage.categoryStatus')} value={status} onChange={(event) => setStatus(event.target.value as 'all' | SaleState)}>
              <option value="all">{t('materialPage.allStatuses')}</option>
              <option value="selling">{t('materialPage.saleSelling')}</option>
              <option value="out">{t('materialPage.saleOut')}</option>
              <option value="paused">{t('materialPage.salePaused')}</option>
              <option value="discontinued">{t('materialPage.saleDiscontinued')}</option>
            </Select>
            <Select id="product-sort" label={t('materialPage.sortLabel')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="newest">{t('materialPage.sortNewest')}</option>
              <option value="oldest">{t('materialPage.sortOldest')}</option>
              <option value="priceAsc">{t('materialPage.sortPriceAsc')}</option>
              <option value="priceDesc">{t('materialPage.sortPriceDesc')}</option>
              <option value="stockAsc">{t('materialPage.sortStockAsc')}</option>
              <option value="stockDesc">{t('materialPage.sortStockDesc')}</option>
            </Select>
          </div>

          {categoryId && scoped.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={t('materialPage.categoryEmptyProducts')}
              body={t('materialPage.emptyBody')}
              actionLabel={t('materialPage.addToCategory')}
              onAction={openNew}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={t('materialPage.empty')}
              body={t('materialPage.emptyBody')}
              actionLabel={t('materialPage.addFirst')}
              onAction={openNew}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={t('materialPage.noMatch')}
              body={t('materialPage.noMatchBody')}
              actionLabel={filtersOn ? t('materialPage.clearFilter') : undefined}
              onAction={filtersOn ? () => { setQuery(''); setStatus('all'); setCategoryFilter(''); } : undefined}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => {
                const state = saleState(item);
                const low = state === 'selling' && item.stock > 0 && item.stock <= LOW_STOCK;
                return (
                  <Card key={item.id} className="p-0">
                    <button type="button" className="block w-full overflow-hidden rounded-t-[22px] text-left" onClick={() => navigate(`/store/products/${item.id}`)}>
                      <MediaFrame
                        src={productImageUrl(item.image)}
                        alt={item.name}
                        fit="cover"
                        frameClassName="aspect-[4/3]"
                        empty={<span className="absolute inset-0 grid place-items-center text-ink-400"><Package className="h-8 w-8" aria-hidden /></span>}
                      />
                    </button>
                    <div className="p-4 md:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 text-left" onClick={() => navigate(`/store/products/${item.id}`)}>
                          <p className="text-xs uppercase tracking-wider text-copper-600">{categoryName(item)}</p>
                          <h3 className="font-display text-lg text-navy-800">{item.name}</h3>
                          <p className="text-xs text-ink-400">SKU: {item.sku || t('materialPage.noSku')}</p>
                        </button>
                        <div className="relative">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t('materialPage.moreActions')}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuId(menuId === item.id ? '' : item.id);
                            }}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {menuId === item.id ? (
                            <div className="absolute right-0 z-30 w-56 rounded-xl border border-navy-800/10 bg-white p-1 shadow-lift" onClick={(event) => event.stopPropagation()}>
                              {state === 'selling' ? (
                                <>
                                  <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => { setMenuId(''); setActionNote(''); setPendingAction({ item, kind: 'pause' }); }}>{t('materialPage.pauseSale')}</button>
                                  <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => void patchSale(item, { saleAvailability: 'MANUALLY_UNAVAILABLE' })}>{t('materialPage.markOut')}</button>
                                  <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => { setMenuId(''); setActionNote(''); setPendingAction({ item, kind: 'discontinue' }); }}>{t('materialPage.discontinue')}</button>
                                </>
                              ) : null}
                              {state === 'out' ? (
                                <>
                                  <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => openEdit(item)}>{t('materialPage.updateStock')}</button>
                                  {item.saleAvailability === 'MANUALLY_UNAVAILABLE' ? (
                                    <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => void patchSale(item, { saleAvailability: 'AVAILABLE' })}>{t('materialPage.markAvailable')}</button>
                                  ) : null}
                                </>
                              ) : null}
                              {state === 'paused' ? (
                                <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => void patchSale(item, { listingStatus: 'ACTIVE' })}>{t('materialPage.resumeSale')}</button>
                              ) : null}
                              {state === 'discontinued' ? (
                                <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => { setMenuId(''); setPendingAction({ item, kind: 'resume' }); }}>{t('materialPage.resumeBusiness')}</button>
                              ) : null}
                              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => { setMenuId(''); setPendingDelete(item); }}>
                                {t('materialPage.deleteProduct')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button type="button" className="mt-4 block text-left" onClick={() => navigate(`/store/products/${item.id}`)}>
                        <p className="font-display text-2xl text-navy-800">{vnd(item.price)} / {item.unit}</p>
                        <p className="mt-1 text-sm text-ink-500">{t('materialPage.stockLine', { n: formatQty(item.stock), unit: item.unit })}</p>
                        <p className="text-xs text-ink-400">{t('materialPage.minLine', { n: formatQty(item.minOrderQty), unit: item.unit })}</p>
                      </button>
                      {state === 'discontinued' ? <p className="mt-3 text-sm font-semibold tracking-wide text-red-700">{t('materialPage.discontinuedBanner')}</p> : null}
                      {state === 'out' ? <p className="mt-3 text-sm font-semibold tracking-wide text-amber-700">{t('materialPage.outBanner')}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={saleTone(state)}>{t(saleLabelKey(state))}</Badge>
                        {low ? <Badge tone="warn">{t('materialPage.statusLow')}</Badge> : null}
                      </div>
                      <div className="mt-4">
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}>{t('common.edit')}</Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next && form.formState.isDirty && !window.confirm(t('materialPage.unsaved'))) return;
          setOpen(next);
          if (!next) resetImage();
        }}
        title={editing ? t('materialPage.edit') : t('materialPage.create')}
        size="lg"
      >
        <form className="grid gap-5" onSubmit={persist}>
          <section className="grid gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.basicSection')}</h3>
            <Input id="m-name" label={`${t('materialPage.name')} *`} {...form.register('name')} error={form.formState.errors.name ? t('materialPage.nameRequired') : undefined} />
            <Select id="m-cat" label={`${t('materialPage.category')} *`} {...form.register('category')} error={form.formState.errors.category ? t('materialPage.categoryRequired') : undefined}>
              <option value="">{t('materialPage.allCategories')}</option>
              {(editing && !activeCategories.some((item) => item.name === editing.category)
                ? [{ id: editing.categoryId || editing.category, name: editing.category, type: 'CUSTOM' as const, description: '', image: '', status: 'ACTIVE' as const, productCount: 0 }, ...activeCategories]
                : activeCategories
              ).map((item) => (
                <option key={item.id} value={item.name}>
                  {categoryDisplayLabel(item, t)}
                </option>
              ))}
            </Select>
            {activeCategories.length === 0 ? (
              <p className="text-sm text-ink-500">
                {t('materialPage.noCategoryYet')}{' '}
                <Link to="/store/materials" className="font-semibold text-navy-800 underline">{t('materialPage.addCategory')}</Link>
              </p>
            ) : null}
            <Input id="m-sku" label={t('materialPage.sku')} {...form.register('sku')} />
            <TextArea id="m-desc" label={t('materialPage.notes')} {...form.register('description')} />
          </section>

          <section className="grid gap-4 border-t border-navy-800/10 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.imageSection')}</h3>
            <DeviceImageField
              label={`${t('materialPage.image')} *`}
              file={pendingFile}
              existing={productImageUrl(editing?.image)}
              removed={imageRemoved}
              error={imageError}
              onFile={chooseImage}
              onClear={() => {
                setPendingFile(null);
                setImageRemoved(true);
                setImageError('');
              }}
            />
          </section>

          <section className="grid gap-4 border-t border-navy-800/10 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.priceSection')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="m-price" label={`${t('materialPage.price')} *`} type="number" min={0} step="1" {...form.register('price')} error={form.formState.errors.price ? t('materialPage.priceRequired') : undefined} />
              <Select
                id="m-unit"
                label={`${t('materialPage.unit')} *`}
                value={UNITS.includes(watchedUnit) ? watchedUnit : '__other'}
                onChange={(event) => {
                  const value = event.target.value;
                  form.setValue('unit', value === '__other' ? (UNITS.includes(watchedUnit) ? '' : watchedUnit) : value, { shouldValidate: true });
                }}
              >
                {unitChoices.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
                <option value="__other">{t('materialPage.unitOther')}</option>
              </Select>
            </div>
            {!UNITS.includes(watchedUnit) ? (
              <Input id="m-unit-custom" label={t('materialPage.unitOther')} value={watchedUnit} maxLength={20} onChange={(event) => form.setValue('unit', event.target.value, { shouldValidate: true })} />
            ) : null}
            <p className="text-sm font-medium text-navy-800">{vnd(watchedPrice)}{watchedUnit ? ` / ${watchedUnit}` : ''}</p>
          </section>

          <section className="grid gap-4 border-t border-navy-800/10 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.stockSection')}</h3>
            <Input id="m-stock" label={`${t('materialPage.stock')} *`} type="number" min={0} step="1" {...form.register('stock')} />
            <p className="text-sm text-ink-500">{t('materialPage.stockPreview', { n: formatQty(watchedStock), unit: watchedUnit || '' })}</p>
            <p className="text-xs text-ink-400">{t('materialPage.lowStockHint')}</p>
          </section>

          <section className="grid gap-4 border-t border-navy-800/10 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.orderSection')}</h3>
            <Input id="m-min" label={t('materialPage.minQty')} type="number" min={1} step="1" {...form.register('minOrderQty')} />
            <p className="text-sm text-ink-500">{t('materialPage.minLine', { n: formatQty(watchedMin), unit: watchedUnit || '' })}</p>
          </section>

          <section className="grid gap-4 border-t border-navy-800/10 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-600">{t('materialPage.businessStatus')}</h3>
            <Select
              id="m-status"
              label={t('materialPage.businessStatus')}
              value={watchedListing}
              onChange={(event) => form.setValue('listingStatus', event.target.value as FormValues['listingStatus'], { shouldDirty: true })}
            >
              <option value="ACTIVE">{t('materialPage.saleSelling')}</option>
              <option value="PAUSED">{t('materialPage.salePaused')}</option>
              {editing ? <option value="DISCONTINUED">{t('materialPage.saleDiscontinued')}</option> : null}
            </Select>
            <label className="flex items-center gap-3 text-sm text-navy-800">
              <input type="checkbox" className="h-4 w-4" checked={watchedManual} onChange={(event) => form.setValue('manualOut', event.target.checked, { shouldDirty: true })} />
              {t('materialPage.manualOut')}
            </label>
            <Input id="m-restock" label={t('materialPage.restockDate')} type="date" {...form.register('restockExpectedOn')} />
            <TextArea id="m-note" label={t('materialPage.reasonOptional')} {...form.register('statusNote')} />
            {watchedListing === 'ACTIVE' && (watchedStock <= 0 || watchedManual) ? (
              <p className="text-sm text-amber-700">{t('materialPage.stockZeroHint')}</p>
            ) : null}
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={busy}>{t('materialPage.saveProduct')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(pendingAction)}
        onOpenChange={(next) => {
          if (!next) {
            setPendingAction(null);
            setActionNote('');
          }
        }}
        title={pendingAction?.kind === 'discontinue' ? t('materialPage.discontinueTitle') : pendingAction?.kind === 'resume' ? t('materialPage.resumeBusiness') : t('materialPage.pauseTitle')}
      >
        <p className="text-sm leading-6 text-ink-600">
          {pendingAction?.kind === 'discontinue' ? t('materialPage.discontinueBody') : pendingAction?.kind === 'resume' ? t('materialPage.resumeBusinessBody') : t('materialPage.pauseBody')}
        </p>
        {pendingAction?.kind !== 'resume' ? (
          <div className="mt-4">
            <TextArea id="sale-note" label={t('materialPage.reasonOptional')} value={actionNote} onChange={(event) => setActionNote(event.target.value)} />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { setPendingAction(null); setActionNote(''); }}>{t('common.cancel')}</Button>
          <Button
            type="button"
            loading={busy}
            onClick={() => {
              if (!pendingAction) return;
              if (open && pendingAction.kind === 'discontinue') {
                form.setValue('statusNote', actionNote);
                skipDiscontinueConfirm.current = true;
                setPendingAction(null);
                void persist();
                return;
              }
              if (pendingAction.kind === 'pause') void patchSale(pendingAction.item, { listingStatus: 'PAUSED', statusNote: actionNote });
              else if (pendingAction.kind === 'discontinue') void patchSale(pendingAction.item, { listingStatus: 'DISCONTINUED', statusNote: actionNote });
              else void patchSale(pendingAction.item, { listingStatus: 'ACTIVE' });
            }}
          >
            {pendingAction?.kind === 'discontinue' ? t('materialPage.confirmDiscontinue') : pendingAction?.kind === 'resume' ? t('materialPage.confirmResume') : t('materialPage.confirmPause')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={t('materialPage.deleteProduct')}
      >
        <p className="text-sm leading-6 text-ink-600">{t('materialPage.deleteConfirm', { name: pendingDelete?.name || '' })}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</Button>
          <Button type="button" loading={busy} onClick={() => void removeProduct()}>{t('materialPage.deleteProduct')}</Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
