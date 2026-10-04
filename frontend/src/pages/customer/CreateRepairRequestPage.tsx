import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Bookmark } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import { useCurrentLocation, type MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { loadSavedPlace, placeFromRecord, saveSavedPlace } from '@/features/map/lib/location';
import { locationApi } from '@/features/map/services/location.api';
import { AxiosError } from 'axios';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { api } from '@/lib/api';
import { useI18n } from '@/locales';
import type { ApiResponse } from '@/types/user';

type CatalogChoice = { name: string; category: string; catalogKey?: string; serviceId?: string };

type FormValues = {
  catalogServiceId: string;
  title: string;
  description: string;
};

export function CreateRepairRequestPage() {
  const { t, te } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const contractorId = params.get('contractorId') || '';
  const storeId = params.get('storeId') || '';
  const { origin, setOrigin, locate, status } = useCurrentLocation();
  const [crewName, setCrewName] = useState(t('chat.crewFallback'));
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [serverError, setServerError] = useState('');
  const [catalog, setCatalog] = useState<CatalogChoice[]>([]);
  const [group, setGroup] = useState('');
  const saved = useMemo(() => loadSavedPlace(), []);
  // const [origin, setOrigin] = useState<MapOrigin>(CAN_THO);
  const [chosen, setChosen] = useState(false);
  const [address, setAddress] = useState('');

  const schema = useMemo(
    () =>
      z.object({
        catalogServiceId: z.string().min(2, t('request.pickService')),
        title: z.string().min(4, t('request.titleMin')),
        description: z.string().min(8, t('request.descMin')),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { catalogServiceId: '', title: '', description: '' },
  });

  const catalogServiceId = watch('catalogServiceId');
  const groups = useMemo(() => [...new Set(catalog.map((item) => item.category))], [catalog]);
  const choices = catalog.filter((item) => !group || item.category === group);

  useEffect(() => {
    api
      .get<ApiResponse<CatalogChoice[]>>('/service-catalog', { silent: true })
      .then((res) => setCatalog(res.data.data || []))
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!contractorId) return;
    locationApi
      .contractor(contractorId)
      .then((res) => setCrewName(res.data.data.publicProfile?.displayName || res.data.data.contractor?.businessName || ''))
      .catch(() => undefined);
  }, [contractorId]);

  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  function pickSite(next: MapOrigin) {
    setOrigin(next);
    setChosen(true);
    if (next.label) setAddress(next.label);
  }

  function useSaved() {
    if (!saved) return;
    setOrigin({ lat: saved.lat, lng: saved.lng, label: saved.label || saved.address });
    setAddress(saved.address || saved.label);
    setChosen(true);
  }

  const onSubmit = async (values: FormValues) => {
    if (!contractorId) {
      setServerError(t('request.pickContractor'));
      return;
    }
    const site = placeFromRecord({ lat: origin.lat, lng: origin.lng, address, label: address });
    if (!chosen || !site || site.address.length < 4) {
      setServerError(t('map.pickRequired'));
      return;
    }
    setServerError('');
    const form = new FormData();
    form.append('contractorId', contractorId);
    if (storeId) form.append('storeId', storeId);
    const picked = catalog.find((item) => (item.catalogKey || item.serviceId) === values.catalogServiceId);
    form.append('category', picked?.category || 'Repair');
    form.append('catalogServiceId', values.catalogServiceId);
    form.append('serviceName', picked?.name || '');
    form.append('title', values.title);
    form.append('description', values.description);
    form.append('address', site.address);
    form.append('lat', String(site.lat));
    form.append('lng', String(site.lng));
    saveSavedPlace(site);
    images.forEach((f) => form.append('images', f));
    videos.forEach((f) => form.append('videos', f));
    try {
      const { data } = await repairApi.create(form);
      navigate(`/customer/chat/${data.data.roomId}`);
    } catch (err) {
      const ax = err as AxiosError<{ message?: string }>;
      setServerError(te(ax.response?.data?.message) || t('request.submitFail'));
    }
  };

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('request.eyebrow')}
        title={t('request.title')}
        description={t('request.sendTo', { name: crewName })}
      />
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-5 rounded-[22px] border border-navy-800/8 bg-white p-6 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink-800">{t('request.pickGroup')}</span>
            <select
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setValue('catalogServiceId', '');
              }}
              className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm outline-none"
            >
              <option value="">{t('request.allGroups')}</option>
              {groups.map((item) => (
                <option key={item} value={item}>
                  {catalogCategoryLabel(item, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink-800">{t('request.pickService')}</span>
            <select
              value={catalogServiceId}
              onChange={(event) => setValue('catalogServiceId', event.target.value, { shouldValidate: true })}
              className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm outline-none"
            >
              <option value="">{t('request.pickServicePlaceholder')}</option>
              {choices.map((item) => {
                const key = item.catalogKey || item.serviceId || item.name;
                return (
                  <option key={key} value={key}>
                    {item.name}
                  </option>
                );
              })}
            </select>
            {errors.catalogServiceId ? <p className="text-xs text-red-600">{errors.catalogServiceId.message}</p> : null}
          </label>
        </div>
        <Input id="title" label={t('request.fieldTitle')} placeholder={t('request.titlePh')} error={errors.title?.message} {...register('title')} />
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-ink-800">{t('request.fieldDesc')}</span>
          <textarea
            rows={5}
            className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-navy-500/10"
            placeholder={t('request.descPh')}
            {...register('description')}
          />
          {errors.description ? <span className="text-xs text-red-600">{errors.description.message}</span> : null}
        </label>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink-800">{t('request.fieldAddress')}</p>
          {saved ? (
            <Button type="button" variant="outline" onClick={useSaved}>
              <Bookmark className="h-4 w-4" /> {t('map.useSaved')}
            </Button>
          ) : null}
          <LocationPicker variant="panel" origin={origin} onPick={pickSite} />
          <Input
            id="address"
            label={t('request.fieldAddress')}
            placeholder={t('request.addressPh')}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-800">{t('request.media')}</p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-2 text-sm"
            onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 8))}
          />
          <input
            type="file"
            accept="video/*"
            className="mt-2 block text-sm"
            onChange={(e) => setVideos(Array.from(e.target.files || []).slice(0, 2))}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((src) => (
              <img key={src} src={src} alt="" className="h-20 w-20 rounded-xl object-cover" />
            ))}
          </div>
        </div>
        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {t('request.submitChat')}
        </Button>
      </form>
    </PageTransition>
  );
}
