import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useMaterialCartStore } from '@/features/material-cart/material-cart.store';

export function MaterialCartPage() {
  const { t } = useI18n();
  const items = useMaterialCartStore((state) => state.items);
  const storeName = useMaterialCartStore((state) => state.storeName);
  const setQuantity = useMaterialCartStore((state) => state.setQuantity);
  const removeItem = useMaterialCartStore((state) => state.removeItem);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-xs uppercase tracking-[0.22em] text-copper-500">{t('cart.eyebrow')}</p>
        <h1 className="mt-2 font-display text-3xl text-navy-800">{t('cart.title')}</h1>
        {!items.length ? (
          <Card hover={false} className="mt-6">
            <p className="text-sm text-ink-600">{t('cart.empty')}</p>
            <Button asChild className="mt-4">
              <Link to="/explore">{t('cart.browse')}</Link>
            </Button>
          </Card>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-navy-800">{storeName}</p>
              {items.map((item) => (
                <Card key={item.materialId} hover={false} className="flex gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-paper-100">
                    {item.image ? <img src={mediaUrl(item.image)} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-display text-lg text-navy-800">{item.name}</h2>
                        <p className="text-sm text-ink-500">{vnd(item.price)} / {item.unit}</p>
                      </div>
                      <button type="button" className="text-ink-400 hover:text-red-600" aria-label={t('cart.remove')} onClick={() => removeItem(item.materialId)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center rounded-full border border-navy-800/10">
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center disabled:text-ink-300"
                          aria-label={t('cart.decrease')}
                          disabled={item.quantity <= item.minOrderQty}
                          onClick={() => setQuantity(item.materialId, item.quantity - 1)}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center disabled:text-ink-300"
                          aria-label={t('cart.increase')}
                          disabled={item.quantity >= item.stock}
                          onClick={() => setQuantity(item.materialId, item.quantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="font-display text-lg text-navy-800">{vnd(item.price * item.quantity)}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Card hover={false} className="h-fit">
              <p className="text-sm text-ink-500">{t('cart.subtotal')}</p>
              <p className="mt-1 font-display text-3xl text-navy-800">{vnd(subtotal)}</p>
              <p className="mt-2 text-xs leading-5 text-ink-400">{t('cart.priceNote')}</p>
              <Button asChild className="mt-4 w-full">
                <Link to="/material-checkout">{t('cart.checkout')}</Link>
              </Button>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
