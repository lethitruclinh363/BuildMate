import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios, { type AxiosError } from 'axios';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { Bookmark } from 'lucide-react';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import { useCurrentLocation, type MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { loadSavedPlace, persistedLocationSource, placeFromRecord, saveSavedPlace } from '@/features/map/lib/location';
import { useMaterialCartStore } from '@/features/material-cart/material-cart.store';
import { getApiErrorMessage } from '@/lib/api';
import {
  materialCheckoutApi,
  type MaterialCheckoutDraft,
  type MaterialCheckoutQuote,
} from '@/lib/material-checkout-api';
import { materialOrderApi } from '@/lib/material-order-api';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const SKIP_LABELS = new Set(['GPS', 'Can Tho centre', 'Map pin']);

function shownMoney(value: number | null) {
  return value == null ? '—' : vnd(value);
}

export function MaterialCheckoutPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const storeId = useMaterialCartStore((s) => s.storeId);
  const storeName = useMaterialCartStore((s) => s.storeName);
  const items = useMaterialCartStore((s) => s.items);
  const { origin, setOrigin } = useCurrentLocation();
  const saved = useMemo(() => loadSavedPlace(), []);
  const [chosen, setChosen] = useState(false);
  const [address, setAddress] = useState('');
  const [quote, setQuote] = useState<MaterialCheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const itemKey = useMemo(
    () => items.map((item) => `${item.materialId}:${item.quantity}`).join('|'),
    [items]
  );

  function pickOrigin(next: MapOrigin) {
    setOrigin(next);
    setChosen(true);
    if (next.label && !SKIP_LABELS.has(next.label)) setAddress(next.label);
  }

  function useSaved() {
    if (!saved) return;
    setOrigin({
      lat: saved.lat,
      lng: saved.lng,
      label: saved.label || saved.address,
      address: saved.address,
      locationConfirmed: true,
      source: 'MANUAL_PIN',
    });
    setAddress(saved.address || saved.label);
    setChosen(true);
  }

  useEffect(() => {
    if (!storeId || items.length === 0 || origin.locationConfirmed !== true || address.trim().length < 4) {
      setQuote(null);
      setQuoting(false);
      setQuoteError('');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const payload: MaterialCheckoutDraft = {
        storeId,
        address: address.trim(),
        lat: origin.lat,
        lng: origin.lng,
        items: items.map((item) => ({ materialId: item.materialId, quantity: item.quantity })),
      };
      setQuoting(true);
      setQuoteError('');
      materialCheckoutApi
        .quote(payload, { signal: controller.signal })
        .then((res) => setQuote(res.data.data))
        .catch((err: unknown) => {
          const cancel = err as { name?: string; code?: string; message?: string };
          if (
            axios.isCancel(err) ||
            cancel.name === 'AbortError' ||
            cancel.code === 'ERR_CANCELED' ||
            /signal is aborted/i.test(cancel.message || '')
          ) return;
          setQuote(null);
          setQuoteError(getApiErrorMessage(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoting(false);
        });
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [address, itemKey, items, origin.lat, origin.lng, origin.locationConfirmed, storeId]);

  const block =
    quote && !quote.ok
      ? quote.code === 'OUT_OF_RANGE'
        ? t('cart.outOfRange', { km: quote.serviceRadiusKm })
        : quote.code === 'DELIVERY_DISABLED'
          ? t('cart.deliveryOff')
          : quote.code === 'BELOW_MINIMUM'
            ? t('cart.belowMinimum', { amount: vnd(quote.minimumOrderAmount) })
            : ''
      : '';

  function failureMessage(err: unknown) {
    const details = (err as AxiosError<{ details?: { code?: string; serviceRadiusKm?: number; minimumOrderAmount?: number } }>)
      .response?.data?.details;
    if (details?.code === 'OUT_OF_RANGE') return t('cart.outOfRange', { km: details.serviceRadiusKm ?? '' });
    if (details?.code === 'DELIVERY_DISABLED') return t('cart.deliveryOff');
    if (details?.code === 'BELOW_MINIMUM') return t('cart.belowMinimum', { amount: vnd(details.minimumOrderAmount || 0) });
    return getApiErrorMessage(err);
  }

  async function placeOrder() {
    const delivery = placeFromRecord({ lat: origin.lat, lng: origin.lng, address: address.trim(), label: address.trim() });
    if (!quote?.ok || !storeId || origin.locationConfirmed !== true || !delivery || delivery.address.length < 4 || submitting) return;
    setSubmitting(true);
    try {
      saveSavedPlace(delivery);
      const res = await materialOrderApi.create({
        storeId,
        deliveryAddress: delivery.address,
        lat: delivery.lat,
        lng: delivery.lng,
        locationConfirmed: true,
        locationSource: persistedLocationSource(origin.source),
        ...(origin.refId ? { providerRefId: origin.refId } : {}),
        customerNote: customerNote.trim(),
        items: items.map((item) => ({ materialId: item.materialId, quantity: item.quantity })),
      });
      useMaterialCartStore.getState().clear();
      pushToast({ kind: 'success', title: t('cart.orderCreated'), body: t('cart.orderCreatedBody') });
      navigate(`/customer/material-orders/${res.data.data.id}`);
    } catch (err) {
      pushToast({ kind: 'error', title: failureMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/cart" label={t('common.backToCart')} />
        <p className="text-xs uppercase tracking-[0.22em] text-copper-500">{t('cart.eyebrow')}</p>
        <h1 className="mt-2 font-display text-3xl text-navy-800">{t('cart.checkoutTitle')}</h1>
        <p className="mt-2 text-sm text-ink-500">{storeName || t('cart.checkoutIntro')}</p>

        {!items.length || !storeId ? (
          <Card hover={false} className="mt-6">
            <p className="text-sm text-ink-600">{t('cart.emptyCheckout')}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/cart">{t('cart.back')}</Link>
            </Button>
          </Card>
        ) : (
          <div className="mt-6 grid gap-5">
            <Card hover={false}>
              {saved ? (
                <Button type="button" variant="outline" onClick={useSaved}>
                  <Bookmark className="h-4 w-4" /> {t('map.useSaved')}
                </Button>
              ) : null}
              <div className="mt-4">
                <LocationPicker variant="panel" origin={origin} onPick={pickOrigin} />
              </div>
              <Input
                id="delivery-address"
                className="mt-4"
                label={t('cart.address')}
                placeholder={t('cart.addressPh')}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Card>

            <Card hover={false}>
              <p className="text-xs text-ink-400">{t('cart.priceChecked')}</p>
              {quote?.lines.length ? (
                <ul className="mt-4 divide-y divide-navy-800/8">
                  {quote.lines.map((line) => (
                    <li key={line.materialId} className="flex items-start justify-between gap-3 py-3 text-sm">
                      <span>
                        <span className="font-medium text-navy-800">{line.name}</span>
                        <span className="mt-1 block text-ink-400">
                          {vnd(line.price)} / {line.unit} · × {line.quantity}
                        </span>
                      </span>
                      <span className="font-semibold text-navy-800">{vnd(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!chosen ? <p className="mt-4 text-sm text-ink-500">{t('map.pickRequired')}</p> : null}
              {chosen && address.trim().length < 4 ? <p className="mt-4 text-sm text-ink-500">{t('cart.needAddress')}</p> : null}
              {quoting ? <p className="mt-4 text-sm text-ink-500">{t('cart.quoting')}</p> : null}
              {quoteError ? <p className="mt-4 text-sm text-red-600">{quoteError}</p> : null}
              {block ? <p className="mt-4 text-sm font-medium text-red-700">{block}</p> : null}

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('cart.materialSubtotal')}</dt>
                  <dd className="font-semibold text-navy-800">{quote ? vnd(quote.materialSubtotal) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('cart.distance')}</dt>
                  <dd className="font-semibold text-navy-800">
                    {quote?.distanceKm == null ? '—' : t('cart.distanceKm', { n: quote.distanceKm })}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('cart.shipping')}</dt>
                  <dd className="font-semibold text-navy-800">{shownMoney(quote?.shippingFee ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-navy-800/8 pt-2">
                  <dt className="text-ink-500">{t('cart.orderTotal')}</dt>
                  <dd className="font-display text-lg text-navy-800">{shownMoney(quote?.orderTotal ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('cart.deposit')}</dt>
                  <dd className="font-semibold text-navy-800">{shownMoney(quote?.depositAmount ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('cart.remaining')}</dt>
                  <dd className="font-semibold text-navy-800">{shownMoney(quote?.remainingAmount ?? null)}</dd>
                </div>
              </dl>

              <TextArea
                id="delivery-note"
                className="mt-4 min-h-[88px]"
                label={t('cart.note')}
                placeholder={t('cart.notePh')}
                value={customerNote}
                maxLength={500}
                onChange={(event) => setCustomerNote(event.target.value)}
              />

              <Button className="mt-5" disabled={!quote?.ok || quoting || submitting} loading={submitting} onClick={() => void placeOrder()}>
                {t('cart.placeDeposit')}
              </Button>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/cart">{t('cart.back')}</Link>
              </Button>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
