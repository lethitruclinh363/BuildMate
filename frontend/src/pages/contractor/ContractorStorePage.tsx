import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { MapPin, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { VerificationGate } from '@/components/contractor/VerificationGate';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { contractorApi, mediaUrl } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';

const schema = z.object({
  name: z.string().min(2),
  slogan: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().min(4),
  city: z.string().optional(),
  openingHours: z.string().optional(),
  serviceRadiusKm: z.coerce.number().min(1).max(50),
  coverImage: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'LIVE', 'PAUSED']),
});

type FormValues = z.infer<typeof schema>;

export function ContractorStorePage() {
  const { t, te } = useI18n();
  const { data, loading, refresh, approved } = useContractorWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!data?.store) {
      form.reset({
        name: data?.profile.businessName || '',
        address: data?.profile.address || '',
        city: data?.profile.city || 'Can Tho',
        serviceRadiusKm: 5,
        status: 'LIVE',
        openingHours: '07:00 – 18:00',
      });
      return;
    }
    const s = data.store;
    form.reset({
      name: s.name,
      slogan: s.slogan,
      phone: s.phone,
      address: s.address,
      city: s.city,
      openingHours: s.openingHours,
      serviceRadiusKm: s.serviceRadiusKm,
      coverImage: s.coverImage,
      description: s.description,
      status: s.status,
    });
  }, [data, form]);

  if (loading) return <DashboardSkeleton />;
  if (!approved) {
    return (
      <PageTransition>
        <PageHeader eyebrow={t('storePage.eyebrow')} title={t('storePage.gatedTitle')} />
        <VerificationGate />
      </PageTransition>
    );
  }

  const store = data?.store;
  const values = form.watch();

  const persist = form.handleSubmit(async (payload) => {
    setError('');
    setBusy(true);
    try {
      const body = { ...payload, storeType: 'SERVICES' as const };
      if (store) await contractorApi.updateStore(body);
      else await contractorApi.createStore({ ...body, lng: 105.787, lat: 10.045 });
      await refresh();
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setError(te(ax.response?.data?.message) || t('storePage.saveFail'));
    } finally {
      setBusy(false);
    }
  });

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('storePage.eyebrow')}
        title={t('storePage.title')}
        description={t('storePage.description')}
      />

      {!store ? (
        <EmptyState
          icon={<Store className="h-5 w-5" />}
          title={t('storePage.emptyTitle')}
          body={t('storePage.emptyBody')}
        />
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card hover={false} className="overflow-hidden p-0">
          <div className="relative h-44 bg-navy-800">
            {values.coverImage ? (
              <img src={mediaUrl(values.coverImage)} alt="" className="h-full w-full object-cover opacity-80" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <Badge tone="copper">{labeled(t, 'storeType', 'SERVICES')}</Badge>
              <h2 className="mt-2 font-display text-2xl">{values.name || t('storePage.storeName')}</h2>
              <p className="text-sm text-white/70">{values.slogan || t('storePage.previewSlogan')}</p>
            </div>
          </div>
          <div className="space-y-2 p-5 text-sm text-ink-600">
            <p className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-copper-500" />
              {values.address || t('verify.address')} · {t('storePage.radiusLine', { km: values.serviceRadiusKm || 5 })}
            </p>
            <p>{values.openingHours} · {values.phone || t('storePage.phone')}</p>
            <p className="leading-6">{values.description || t('storePage.previewDesc')}</p>
          </div>
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{store ? t('storePage.edit') : t('storePage.openYard')}</h2>
          <form className="mt-5 grid gap-4" onSubmit={persist}>
            <Input id="name" label={t('storePage.storeName')} error={form.formState.errors.name?.message} {...form.register('name')} />
            <Input id="slogan" label={t('storePage.slogan')} {...form.register('slogan')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="phone" label={t('storePage.publicPhone')} {...form.register('phone')} />
              <Input id="openingHours" label={t('storePage.hours')} {...form.register('openingHours')} />
            </div>
            <Input id="address" label={t('verify.address')} error={form.formState.errors.address?.message} {...form.register('address')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="city" label={t('verify.city')} {...form.register('city')} />
              <Input id="serviceRadiusKm" label={t('storePage.radius')} type="number" {...form.register('serviceRadiusKm')} />
            </div>
            <Select id="status" label={t('storePage.listingStatus')} {...form.register('status')}>
              <option value="LIVE">{t('status.LIVE')}</option>
              <option value="DRAFT">{t('status.DRAFT')}</option>
              <option value="PAUSED">{t('status.PAUSED')}</option>
            </Select>
            <Input id="coverImage" label={t('storePage.coverUrl')} hint={t('storePage.coverHint')} {...form.register('coverImage')} />
            <TextArea id="description" label={t('storePage.aboutYard')} {...form.register('description')} />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" loading={busy}>{store ? t('storePage.update') : t('storePage.publish')}</Button>
          </form>
        </Card>
      </div>
    </PageTransition>
  );
}
