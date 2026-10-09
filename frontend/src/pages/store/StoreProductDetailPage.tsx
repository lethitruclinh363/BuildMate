import { AxiosError } from 'axios';
import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/TextArea';
import { categoryDisplayLabel } from '@/data/material-categories';
import { listingOf, saleBannerKey, saleLabelKey, saleState, saleTone } from '@/lib/material-sale';
import { materialStoreApi, productImageUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { CatalogMaterial, StoreMaterialCategory, Storefront } from '@/types/partner';
import type { ApiResponse } from '@/types/user';

function formatQty(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
}

export function StoreProductDetailPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<CatalogMaterial | null>(null);
  const [categories, setCategories] = useState<StoreMaterialCategory[]>([]);
  const [store, setStore] = useState<Storefront | null>(null);
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<'pause' | 'discontinue' | 'resume' | null>(null);
  const [note, setNote] = useState('');

  const load = async () => {
    const workspace = await materialStoreApi.workspace();
    setStore(workspace.data.data.store);
    const [materials, categoryRes] = await Promise.all([
      materialStoreApi.listMaterials(),
      materialStoreApi.listStoreCategories(),
    ]);
    setCategories(categoryRes.data.data || []);
    setItem((materials.data.data || []).find((row) => row.id === id) || null);
  };

  useEffect(() => {
    let cancelled = false;
    void load()
      .catch(() => {
        if (!cancelled) setItem(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const patch = async (body: Partial<CatalogMaterial>) => {
    if (!item) return;
    setBusy(true);
    try {
      await materialStoreApi.saveMaterial(body, item.id);
      setPending(null);
      setNote('');
      await load();
      pushToast({ kind: 'success', title: t('materialPage.saved') });
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      pushToast({ kind: 'error', title: te(ax.response?.data?.message) || t('materialPage.saveFail') });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (!item) {
    return (
      <PageTransition>
        <EmptyState icon={<Package className="h-5 w-5" />} title={t('materialPage.noMatch')} body={t('materialPage.noMatchBody')} actionLabel={t('materialPage.viewAllProducts')} onAction={() => navigate('/store/products')} />
      </PageTransition>
    );
  }

  const state = saleState(item);
  const banner = saleBannerKey(state);
  const photos = (item.images?.length ? item.images : item.image ? [item.image] : []).map((src) => productImageUrl(src)).filter(Boolean);
  const category = categories.find((row) => row.id === item.categoryId);
  const categoryLabel = category ? categoryDisplayLabel(category, t) : item.category;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('materialPage.manageEyebrow')} title={item.name} description={categoryLabel} actions={<Button variant="outline" onClick={() => navigate('/store/products')}>{t('common.back')}</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-3xl bg-mist-100">
            {photos[photo] ? <img src={photos[photo]} alt={item.name} className="h-full w-full object-cover" /> : <Package className="h-12 w-12 text-navy-800/30" />}
          </div>
          {photos.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {photos.map((src, index) => (
                <button key={src} type="button" className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border ${index === photo ? 'border-navy-800' : 'border-transparent'}`} onClick={() => setPhoto(index)}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-3xl border border-navy-800/10 bg-white p-5">
          {banner ? <p className="mb-3 text-lg font-semibold tracking-wide text-red-700">{t(banner)}</p> : null}
          <Badge tone={saleTone(state)}>{t(saleLabelKey(state))}</Badge>
          <p className="mt-4 font-display text-3xl text-navy-800">{vnd(item.price)} <span className="text-base font-sans text-ink-500">/ {item.unit}</span></p>
          <dl className="mt-4 grid gap-2 text-sm text-ink-600">
            <div className="flex justify-between gap-4"><dt>SKU</dt><dd>{item.sku || t('materialPage.noSku')}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('materialPage.stock')}</dt><dd>{formatQty(item.stock)} {item.unit}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('materialPage.minQty')}</dt><dd>{formatQty(item.minOrderQty)} {item.unit}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('materialPage.category')}</dt><dd>{categoryLabel}</dd></div>
            {store ? <div className="flex justify-between gap-4"><dt>{t('materialPage.manageEyebrow')}</dt><dd>{store.name}</dd></div> : null}
            {item.restockExpectedOn && state === 'out' ? <div className="flex justify-between gap-4"><dt>{t('materialPage.restockDate')}</dt><dd>{String(item.restockExpectedOn).slice(0, 10)}</dd></div> : null}
          </dl>
          {item.description ? <p className="mt-4 text-sm leading-6 text-ink-600">{item.description}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/store/products?edit=${encodeURIComponent(item.id)}`)}>{t('common.edit')}</Button>
            {listingOf(item) === 'ACTIVE' && state !== 'out' ? (
              <>
                <Button variant="outline" onClick={() => { setNote(''); setPending('pause'); }}>{t('materialPage.pauseSale')}</Button>
                <Button variant="outline" onClick={() => void patch({ saleAvailability: 'MANUALLY_UNAVAILABLE' })}>{t('materialPage.markOut')}</Button>
              </>
            ) : null}
            {state === 'paused' ? <Button variant="outline" onClick={() => void patch({ listingStatus: 'ACTIVE' })}>{t('materialPage.resumeSale')}</Button> : null}
            {state === 'out' && item.saleAvailability === 'MANUALLY_UNAVAILABLE' ? <Button variant="outline" onClick={() => void patch({ saleAvailability: 'AVAILABLE' })}>{t('materialPage.markAvailable')}</Button> : null}
            {state !== 'discontinued' ? <Button variant="outline" onClick={() => { setNote(item.statusNote || ''); setPending('discontinue'); }}>{t('materialPage.discontinue')}</Button> : (
              <Button variant="outline" onClick={() => setPending('resume')}>{t('materialPage.resumeBusiness')}</Button>
            )}
            <Button variant="ghost" asChild><Link to={`/store/products?category=${encodeURIComponent(item.categoryId || '')}`}>{t('materialPage.viewProducts')}</Link></Button>
          </div>
        </div>
      </div>
      <Modal open={Boolean(pending)} onOpenChange={(next) => { if (!next) setPending(null); }} title={pending === 'discontinue' ? t('materialPage.discontinueTitle') : pending === 'resume' ? t('materialPage.resumeBusiness') : t('materialPage.pauseTitle')}>
        <p className="text-sm leading-6 text-ink-600">{pending === 'discontinue' ? t('materialPage.discontinueBody') : pending === 'resume' ? t('materialPage.resumeBusinessBody') : t('materialPage.pauseBody')}</p>
        {pending !== 'resume' ? <div className="mt-4"><TextArea id="detail-note" label={t('materialPage.reasonOptional')} value={note} onChange={(event) => setNote(event.target.value)} /></div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)}>{t('common.cancel')}</Button>
          <Button loading={busy} onClick={() => {
            if (pending === 'pause') void patch({ listingStatus: 'PAUSED', statusNote: note });
            else if (pending === 'discontinue') void patch({ listingStatus: 'DISCONTINUED', statusNote: note });
            else void patch({ listingStatus: 'ACTIVE' });
          }}>
            {pending === 'discontinue' ? t('materialPage.confirmDiscontinue') : pending === 'resume' ? t('materialPage.confirmResume') : t('materialPage.confirmPause')}
          </Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
