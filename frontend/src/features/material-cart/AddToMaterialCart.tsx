import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import { purchasable, saleBannerKey, saleNoticeKey, saleState } from '@/lib/material-sale';
import type { CatalogMaterial } from '@/types/partner';
import { useMaterialCartStore } from './material-cart.store';

function limits(material: CatalogMaterial) {
  const min = Math.max(1, Number(material.minOrderQty) || 1);
  const stock = Math.max(0, Number(material.stock) || 0);
  return { min, stock, sellable: stock >= min };
}

export function AddToMaterialCart({
  material,
  storeId,
  storeName,
}: {
  material: CatalogMaterial;
  storeId: string;
  storeName: string;
}) {
  const { t } = useI18n();
  const push = useToastStore((state) => state.push);
  const addItem = useMaterialCartStore((state) => state.addItem);
  const replaceStore = useMaterialCartStore((state) => state.replaceStore);
  const { min, stock, sellable } = limits(material);
  const state = saleState(material);
  const canBuy = purchasable(material) && sellable;
  const banner = saleBannerKey(state);
  const notice = saleNoticeKey(state);
  const [quantity, setQuantity] = useState(min);
  const [switchOpen, setSwitchOpen] = useState(false);

  function draft() {
    return {
      materialId: material.id,
      storeId,
      name: material.name,
      image: material.image || '',
      unit: material.unit,
      price: material.price,
      quantity,
      minOrderQty: min,
      stock,
      purchasable: purchasable(material),
    };
  }

  function toastFor(result: 'added' | 'unavailable' | 'capped') {
    if (result === 'added') push({ kind: 'success', title: t('cart.added') });
    else if (result === 'capped') push({ kind: 'error', title: t('cart.stockLimit') });
    else push({ kind: 'error', title: t('cart.unavailable') });
  }

  function onAdd() {
    const result = addItem(draft(), storeName);
    if (result === 'needs-switch') {
      setSwitchOpen(true);
      return;
    }
    toastFor(result);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="inline-flex items-center rounded-full border border-navy-800/10">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center text-navy-800 disabled:text-ink-300"
          aria-label={t('cart.decrease')}
          disabled={!canBuy || quantity <= min}
          onClick={() => setQuantity((value) => Math.max(min, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-8 text-center text-sm font-semibold text-navy-800">{canBuy ? quantity : 0}</span>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center text-navy-800 disabled:text-ink-300"
          aria-label={t('cart.increase')}
          disabled={!canBuy || quantity >= stock}
          onClick={() => setQuantity((value) => Math.min(stock, value + 1))}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {banner ? <p className="text-sm font-semibold tracking-wide text-red-700">{t(banner)}</p> : null}
      <Button type="button" className="w-full" disabled={!canBuy} onClick={onAdd}>
        {banner ? t(banner) : t('cart.add')}
      </Button>
      {notice ? <p className="text-sm leading-6 text-ink-600">{t(notice)}</p> : null}
      {state === 'out' && material.restockExpectedOn ? (
        <p className="text-sm text-ink-500">{t('materialPage.restockOn', { date: String(material.restockExpectedOn).slice(0, 10) })}</p>
      ) : null}
      <ConfirmModal
        open={switchOpen}
        title={t('cart.switchTitle')}
        description={t('cart.switchBody')}
        confirmLabel={t('cart.switchConfirm')}
        onOpenChange={setSwitchOpen}
        onConfirm={() => {
          const result = replaceStore(draft(), storeName);
          setSwitchOpen(false);
          toastFor(result);
        }}
      />
    </div>
  );
}
