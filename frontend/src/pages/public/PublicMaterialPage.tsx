import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AddToMaterialCart } from '@/features/material-cart/AddToMaterialCart';
import { locationApi } from '@/features/map/services/location.api';
import { publicPriceVisible, saleBannerKey, saleLabelKey, saleState, saleTone } from '@/lib/material-sale';
import { productImageUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { CatalogMaterial, Storefront } from '@/types/partner';

function formatQty(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
}

export function PublicMaterialPage() {
  const { id, materialId } = useParams();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Storefront | null>(null);
  const [item, setItem] = useState<CatalogMaterial | null>(null);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    locationApi
      .store(id)
      .then((res) => {
        setStore(res.data.data.store);
        setItem((res.data.data.materials || []).find((row) => row.id === materialId) || null);
      })
      .catch(() => {
        setStore(null);
        setItem(null);
      })
      .finally(() => setLoading(false));
  }, [id, materialId]);

  if (loading) return <DashboardSkeleton />;
  if (!store || !item) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <ErrorState title={t('errors.notFoundStore')} body={t('errors.notFoundStoreBody')} />
        </div>
      </PageTransition>
    );
  }

  const state = saleState(item);
  const banner = saleBannerKey(state);
  const photos = (item.images?.length ? item.images : item.image ? [item.image] : []).map((src) => productImageUrl(src)).filter(Boolean);

  return (
    <PageTransition>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-2">
        <div>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-3xl bg-white">
            {photos[photo] ? <img src={photos[photo]} alt={item.name} className="h-full w-full object-cover" /> : <Package className="h-12 w-12 text-navy-800/30" />}
          </div>
          {photos.length > 1 ? (
            <div className="mt-3 flex gap-2">
              {photos.map((src, index) => (
                <button key={src} type="button" className={`h-16 w-16 overflow-hidden rounded-xl border ${index === photo ? 'border-navy-800' : 'border-transparent'}`} onClick={() => setPhoto(index)}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <Link to={`/stores/${store.id}`} className="text-sm font-semibold text-navy-800">{store.name}</Link>
          <p className="mt-3 text-xs uppercase tracking-wider text-copper-600">{item.category}</p>
          <h1 className="mt-1 font-display text-4xl text-navy-800">{item.name}</h1>
          {banner ? <p className="mt-4 text-xl font-semibold tracking-wide text-red-700">{t(banner)}</p> : null}
          <div className="mt-3"><Badge tone={saleTone(state)}>{t(saleLabelKey(state))}</Badge></div>
          {publicPriceVisible(item) ? (
            <p className="mt-4 font-display text-3xl text-navy-800">{vnd(item.price)} <span className="text-base font-sans text-ink-500">/ {item.unit}</span></p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm text-ink-600">
            <div className="flex justify-between gap-4"><dt>SKU</dt><dd>{item.sku || t('materialPage.noSku')}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('materialPage.stock')}</dt><dd>{formatQty(item.stock)} {item.unit}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('materialPage.minQty')}</dt><dd>{formatQty(item.minOrderQty)} {item.unit}</dd></div>
          </dl>
          {item.description ? <p className="mt-4 text-sm leading-6 text-ink-600">{item.description}</p> : null}
          <AddToMaterialCart material={item} storeId={String(store.id)} storeName={store.name} />
          <Button asChild variant="outline" className="mt-4">
            <Link to={`/stores/${store.id}`}>{t('common.back')}</Link>
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
