import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { getApiErrorMessage } from '@/lib/api';
import { materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { Storefront } from '@/types/partner';

interface DeliveryForm {
  deliveryEnabled: boolean;
  serviceRadiusKm: string;
  baseDeliveryFee: string;
  freeDeliveryRadiusKm: string;
  deliveryFeePerKm: string;
  minimumOrderAmount: string;
  deliveryNote: string;
}

function fromStore(store: Storefront): DeliveryForm {
  return {
    deliveryEnabled: Boolean(store.deliveryEnabled),
    serviceRadiusKm: String(store.serviceRadiusKm || 5),
    baseDeliveryFee: String(store.baseDeliveryFee || 0),
    freeDeliveryRadiusKm: String(store.freeDeliveryRadiusKm || 0),
    deliveryFeePerKm: String(store.deliveryFeePerKm || 0),
    minimumOrderAmount: String(store.minimumOrderAmount || 0),
    deliveryNote: store.deliveryNote || '',
  };
}

function asNumber(value: string) {
  return Number(value);
}

export function StoreDeliveryPage() {
  const { t, te } = useI18n();
  const push = useToastStore((state) => state.push);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<DeliveryForm | null>(null);

  useEffect(() => {
    materialStoreApi
      .getStore()
      .then((res) => {
        if (!res.data.data) {
          setMissing(true);
          return;
        }
        setForm(fromStore(res.data.data));
      })
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof DeliveryForm>(key: K, value: DeliveryForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const serviceRadiusKm = asNumber(form.serviceRadiusKm);
    const baseDeliveryFee = asNumber(form.baseDeliveryFee);
    const freeDeliveryRadiusKm = asNumber(form.freeDeliveryRadiusKm);
    const deliveryFeePerKm = asNumber(form.deliveryFeePerKm);
    const minimumOrderAmount = asNumber(form.minimumOrderAmount);
    const fees = [baseDeliveryFee, freeDeliveryRadiusKm, deliveryFeePerKm, minimumOrderAmount];
    if (!Number.isFinite(serviceRadiusKm) || serviceRadiusKm < 1 || serviceRadiusKm > 50) {
      setError(t('deliveryPolicy.radiusRange'));
      return;
    }
    if (fees.some((value) => !Number.isFinite(value) || value < 0)) {
      setError(t('deliveryPolicy.feeRange'));
      return;
    }
    if (freeDeliveryRadiusKm > serviceRadiusKm) {
      setError(t('deliveryPolicy.freeTooFar'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await materialStoreApi.updateStore({
        deliveryEnabled: form.deliveryEnabled,
        serviceRadiusKm,
        baseDeliveryFee,
        freeDeliveryRadiusKm,
        deliveryFeePerKm,
        minimumOrderAmount,
        deliveryNote: form.deliveryNote.trim(),
      });
      setForm(fromStore(res.data.data));
      push({ kind: 'success', title: t('deliveryPolicy.saved') });
    } catch (err) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (missing || !form) {
    return (
      <ErrorState title={t('deliveryPolicy.title')} body={t('deliveryPolicy.missingStore')} />
    );
  }

  return (
    <Card hover={false} className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.22em] text-copper-500">{t('deliveryPolicy.eyebrow')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('deliveryPolicy.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">{t('deliveryPolicy.description')}</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="flex items-start gap-3 rounded-2xl border border-navy-800/10 bg-white px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 accent-navy-800"
            checked={form.deliveryEnabled}
            onChange={(event) => setField('deliveryEnabled', event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-ink-800">{t('deliveryPolicy.enabled')}</span>
            <span className="mt-1 block text-xs text-ink-400">{t('deliveryPolicy.enabledHint')}</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="service-radius"
            label={t('deliveryPolicy.radius')}
            type="number"
            min={1}
            max={50}
            step="0.1"
            value={form.serviceRadiusKm}
            onChange={(event) => setField('serviceRadiusKm', event.target.value)}
          />
          <Input
            id="free-radius"
            label={t('deliveryPolicy.freeRadius')}
            type="number"
            min={0}
            max={50}
            step="0.1"
            value={form.freeDeliveryRadiusKm}
            onChange={(event) => setField('freeDeliveryRadiusKm', event.target.value)}
          />
          <Input
            id="base-fee"
            label={t('deliveryPolicy.baseFee')}
            type="number"
            min={0}
            step="1000"
            value={form.baseDeliveryFee}
            onChange={(event) => setField('baseDeliveryFee', event.target.value)}
          />
          <Input
            id="fee-per-km"
            label={t('deliveryPolicy.perKm')}
            type="number"
            min={0}
            step="1000"
            value={form.deliveryFeePerKm}
            onChange={(event) => setField('deliveryFeePerKm', event.target.value)}
          />
          <Input
            id="minimum-order"
            label={t('deliveryPolicy.minimum')}
            type="number"
            min={0}
            step="1000"
            value={form.minimumOrderAmount}
            onChange={(event) => setField('minimumOrderAmount', event.target.value)}
          />
        </div>
        <TextArea
          id="delivery-note"
          label={t('deliveryPolicy.note')}
          value={form.deliveryNote}
          placeholder={t('deliveryPolicy.notePh')}
          onChange={(event) => setField('deliveryNote', event.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            {t('deliveryPolicy.save')}
          </Button>
          <Link to="/store/profile/edit" className="text-sm font-semibold text-navy-800 underline">
            {t('nav.store.publicProfile')}
          </Link>
        </div>
      </form>
    </Card>
  );
}
