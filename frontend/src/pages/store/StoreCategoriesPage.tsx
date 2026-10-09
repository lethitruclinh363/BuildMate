import { AxiosError } from 'axios';
import { Layers, MoreHorizontal, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VerificationGate } from '@/components/contractor/VerificationGate';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { categoryDisplayLabel, foldCategoryName } from '@/data/material-categories';
import { api } from '@/lib/api';
import { materialStoreApi, mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { StoreMaterialCategory, Storefront } from '@/types/partner';
import type { ApiResponse } from '@/types/user';
import { DeviceImageField, imageProblem } from '@/pages/store/DeviceImageField';

async function uploadImage(file: File) {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post<ApiResponse<{ url: string }>>('/uploads/stores', body, { timeout: 60000 });
  return res.data.data.url;
}

function formatQty(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
}

export function StoreCategoriesPage() {
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);
  const [approved, setApproved] = useState(false);
  const [store, setStore] = useState<Storefront | null>(null);
  const [items, setItems] = useState<StoreMaterialCategory[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'with' | 'without'>('all');
  const [sort, setSort] = useState<'new' | 'old' | 'az' | 'za' | 'most' | 'least'>('new');
  const [menuId, setMenuId] = useState('');
  const [pendingHide, setPendingHide] = useState<StoreMaterialCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreMaterialCategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoreMaterialCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError] = useState('');

  const load = async () => {
    const workspace = await materialStoreApi.workspace();
    const data = workspace.data.data;
    setApproved(data.approved);
    setStore(data.store);
    if (!data.approved || !data.store) {
      setItems([]);
      return;
    }
    const res = await materialStoreApi.listStoreCategories();
    setItems(res.data.data || []);
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
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId('');
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);

  const resetImage = () => {
    setPendingFile(null);
    setImageRemoved(false);
    setImageError('');
  };

  const openNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setStatus('ACTIVE');
    setFormError('');
    resetImage();
    setOpen(true);
  };

  const openEdit = (item: StoreMaterialCategory) => {
    setEditing(item);
    setName(item.type === 'SYSTEM' ? categoryDisplayLabel(item, t) : item.name);
    setDescription(item.description || '');
    setStatus(item.status);
    setFormError('');
    resetImage();
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

  const labelOf = (item: StoreMaterialCategory) => categoryDisplayLabel(item, t);

  const visible = useMemo(() => {
    const needle = foldCategoryName(debounced);
    const rows = items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (stockFilter === 'with' && item.productCount <= 0) return false;
      if (stockFilter === 'without' && item.productCount > 0) return false;
      if (!needle) return true;
      const hay = foldCategoryName(`${item.name} ${labelOf(item)} ${item.description || ''}`);
      return hay.includes(needle);
    });
    rows.sort((a, b) => {
      if (sort === 'old') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      if (sort === 'az') return labelOf(a).localeCompare(labelOf(b), 'vi');
      if (sort === 'za') return labelOf(b).localeCompare(labelOf(a), 'vi');
      if (sort === 'most') return b.productCount - a.productCount;
      if (sort === 'least') return a.productCount - b.productCount;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return rows;
  }, [items, debounced, statusFilter, stockFilter, sort, t]);

  const filtersOn = Boolean(query || statusFilter !== 'all' || stockFilter !== 'all' || sort !== 'new');

  const setListing = async (item: StoreMaterialCategory, status: 'ACTIVE' | 'INACTIVE') => {
    setBusy(true);
    setMenuId('');
    try {
      await materialStoreApi.saveStoreCategory(
        { name: item.name, description: item.description, image: item.image, status },
        item.id
      );
      setPendingHide(null);
      await load();
      pushToast({ kind: 'success', title: t('materialPage.categorySaved') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      pushToast({ kind: 'error', title: te(ax.response?.data?.message) || t('materialPage.saveFail') });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError(t('materialPage.categoryNameRequired'));
      return;
    }
    const folded = foldCategoryName(trimmed);
    const duplicate = items.some((item) => {
      if (editing && item.id === editing.id) return false;
      return foldCategoryName(item.name) === folded || foldCategoryName(labelOf(item)) === folded;
    });
    if (duplicate) {
      setFormError(t('materialPage.categoryDuplicate'));
      return;
    }
    if (imageError) return;
    setBusy(true);
    setFormError('');
    try {
      let image = imageRemoved ? '' : editing?.image || '';
      if (pendingFile) image = await uploadImage(pendingFile);
      await materialStoreApi.saveStoreCategory(
        {
          name: editing?.type === 'SYSTEM' ? editing.name : trimmed,
          description,
          image,
          status: editing?.type === 'SYSTEM' ? 'ACTIVE' : status,
        },
        editing?.id
      );
      setOpen(false);
      resetImage();
      await load();
      pushToast({ kind: 'success', title: t('materialPage.categorySaved') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      const message = ax.response?.data?.message;
      setFormError(
        message === 'This category already exists in this store.'
          ? t('materialPage.categoryDuplicate')
          : te(message) || t('materialPage.saveFail')
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || pendingDelete.productCount > 0) {
      setPendingDelete(null);
      return;
    }
    setBusy(true);
    try {
      await materialStoreApi.deleteStoreCategory(pendingDelete.id);
      setPendingDelete(null);
      await load();
      pushToast({ kind: 'success', title: t('materialPage.categoryDeleted') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null> & { details?: { productCount?: number } }>;
      const count = ax.response?.data?.details?.productCount;
      if (count) {
        setPendingDelete({ ...pendingDelete, productCount: count });
      } else {
        setFormError(te(ax.response?.data?.message) || t('materialPage.saveFail'));
        setPendingDelete(null);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('materialPage.manageEyebrow')} title={t('materialPage.gatedTitle')} />
        <VerificationGate to="/store/verification" />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('materialPage.manageEyebrow')}
        title={t('materialPage.catalogTitle')}
        description={t('materialPage.catalogDescription')}
        actions={store ? <Button onClick={openNew}>{t('materialPage.addCategory')}</Button> : undefined}
      />

      {loadError ? <p className="mb-4 text-sm text-red-600">{t('materialPage.loadFail')}</p> : null}

      {!store ? (
        <EmptyState icon={<Layers className="h-5 w-5" />} title={t('servicePage.needStore')} body={t('materialPage.needStoreBody')} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title={t('materialPage.categoryEmpty')}
          body={t('materialPage.categoryEmptyBody')}
          actionLabel={t('materialPage.addCategory')}
          onAction={openNew}
        />
      ) : (
        <>
          <div className="mb-5 rounded-2xl border border-navy-800/10 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy-800">{t('materialPage.resultCount', { n: formatQty(visible.length) })}</p>
              {filtersOn ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setQuery(''); setDebounced(''); setStatusFilter('all'); setStockFilter('all'); setSort('new'); }}>
                  {t('materialPage.clearFilters')}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('materialPage.searchCategories')}
                  className="h-10 w-full rounded-lg border border-navy-800/10 bg-white pl-9 pr-9 text-sm text-ink-800 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10"
                />
                {query ? (
                  <button type="button" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-ink-400" aria-label={t('materialPage.clearFilters')} onClick={() => setQuery('')}>
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </label>
              <Select id="cat-status-filter" label={t('materialPage.categoryStatus')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">{t('materialPage.allStatuses')}</option>
                <option value="ACTIVE">{t('materialPage.statusActive')}</option>
                <option value="INACTIVE">{t('materialPage.categoryHidden')}</option>
              </Select>
              <Select id="cat-count-filter" label={t('materialPage.countFilter')} value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}>
                <option value="all">{t('materialPage.allCategories')}</option>
                <option value="with">{t('materialPage.withProducts')}</option>
                <option value="without">{t('materialPage.withoutProducts')}</option>
              </Select>
              <Select id="cat-sort" label={t('materialPage.sortLabel')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="new">{t('materialPage.sortCreated')}</option>
                <option value="old">{t('materialPage.sortOldest')}</option>
                <option value="az">{t('materialPage.sortNameAsc')}</option>
                <option value="za">{t('materialPage.sortNameDesc')}</option>
                <option value="most">{t('materialPage.sortProductsDesc')}</option>
                <option value="least">{t('materialPage.sortProductsAsc')}</option>
              </Select>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={<Layers className="h-5 w-5" />} title={t('materialPage.noMatch')} body={t('materialPage.noMatchBody')} actionLabel={t('materialPage.clearFilters')} onAction={() => { setQuery(''); setDebounced(''); setStatusFilter('all'); setStockFilter('all'); setSort('new'); }} />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <Card key={item.id} className="p-0">
                  <div className="grid aspect-[16/9] place-items-center overflow-hidden rounded-t-[22px] bg-mist-100/70">
                    {item.image ? (
                      <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Layers className="h-10 w-10 text-navy-800/40" aria-hidden />
                    )}
                  </div>
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg text-navy-800">{labelOf(item)}</h3>
                      <div className="flex items-center gap-1">
                        <Badge tone={item.status === 'ACTIVE' ? 'success' : 'mist'}>
                          {item.status === 'ACTIVE' ? t('materialPage.statusActive') : t('materialPage.categoryHidden')}
                        </Badge>
                        <div className="relative">
                          <Button type="button" size="icon" variant="ghost" aria-label={t('materialPage.moreActions')} onClick={(event) => { event.stopPropagation(); setMenuId(menuId === item.id ? '' : item.id); }}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {menuId === item.id ? (
                            <div className="absolute right-0 z-30 w-48 rounded-xl border border-navy-800/10 bg-white p-1 shadow-lift" onClick={(event) => event.stopPropagation()}>
                              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-navy-800 hover:bg-mist-100" onClick={() => item.status === 'ACTIVE' ? setPendingHide(item) : void setListing(item, 'ACTIVE')}>
                                {item.status === 'ACTIVE' ? t('materialPage.hideCategory') : t('materialPage.showCategory')}
                              </button>
                              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => { setMenuId(''); setPendingDelete(item); }}>
                                {t('materialPage.deleteCategory')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-6 text-ink-500">{item.description || '—'}</p>
                    <p className="mt-3 text-sm font-medium text-navy-800">{t('materialPage.productCount', { n: formatQty(item.productCount) })}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/store/products?category=${encodeURIComponent(item.id)}`)}>
                        {t('materialPage.viewProducts')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>{t('common.edit')}</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetImage();
        }}
        title={editing ? t('materialPage.editCategory') : t('materialPage.createCategory')}
        size="lg"
      >
        <div className="grid gap-4">
          <Input
            id="cat-name"
            label={`${t('materialPage.categoryName')} *`}
            value={name}
            disabled={editing?.type === 'SYSTEM'}
            onChange={(event) => setName(event.target.value)}
          />
          <TextArea
            id="cat-desc"
            label={t('materialPage.categoryDescription')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <DeviceImageField
            label={t('materialPage.categoryImage')}
            file={pendingFile}
            existing={editing?.image ? mediaUrl(editing.image) : ''}
            removed={imageRemoved}
            error={imageError}
            onFile={chooseImage}
            onClear={() => {
              setPendingFile(null);
              setImageRemoved(true);
              setImageError('');
            }}
          />
          <Select
            id="cat-status"
            label={t('materialPage.categoryStatus')}
            value={editing?.type === 'SYSTEM' ? 'ACTIVE' : status}
            disabled={editing?.type === 'SYSTEM'}
            onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}
          >
            <option value="ACTIVE">{t('materialPage.statusActive')}</option>
            <option value="INACTIVE">{t('materialPage.statusInactive')}</option>
          </Select>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" loading={busy} onClick={() => void save()}>
              {t('materialPage.saveCategory')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(pendingHide)} onOpenChange={(next) => { if (!next) setPendingHide(null); }} title={t('materialPage.hideCategory')}>
        <p className="text-sm leading-6 text-ink-600">{t('materialPage.hideCategoryBody')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPendingHide(null)}>{t('common.cancel')}</Button>
          <Button type="button" loading={busy} onClick={() => pendingHide && void setListing(pendingHide, 'INACTIVE')}>{t('materialPage.confirmHide')}</Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={t('materialPage.deleteCategory')}
      >
        <p className="text-sm leading-6 text-ink-600">
          {pendingDelete && pendingDelete.productCount > 0
            ? t('materialPage.categoryHasProducts', { n: formatQty(pendingDelete.productCount) })
            : t('materialPage.categoryDeleteConfirm', { name: pendingDelete ? labelOf(pendingDelete) : '' })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
            {pendingDelete && pendingDelete.productCount > 0 ? t('materialPage.understand') : t('common.cancel')}
          </Button>
          {pendingDelete && pendingDelete.productCount === 0 ? (
            <Button type="button" loading={busy} onClick={() => void confirmDelete()}>
              {t('materialPage.deleteCategory')}
            </Button>
          ) : null}
        </div>
      </Modal>
    </PageTransition>
  );
}
