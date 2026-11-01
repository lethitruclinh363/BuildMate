import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Bookmark, Check, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { loadSavedPlace, persistedLocationSource, placeFromRecord, saveSavedPlace } from '@/features/map/lib/location';
import { locationApi } from '@/features/map/services/location.api';
import { AxiosError } from 'axios';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import { CAN_THO } from '@/types/marketplace';

type CatalogChoice = { name: string; category: string; catalogKey?: string; serviceId?: string };

type FormValues = {
  catalogServiceId: string;
  title: string;
  description: string;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isSiteImage(file: File) {
  const name = file.name.toLowerCase();
  if (!/\.(jpe?g|png|webp|gif)$/.test(name)) return false;
  if (file.type && !file.type.startsWith('image/')) return false;
  return true;
}

export function CreateRepairRequestPage() {
  const { t, te } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const contractorId = params.get('contractorId') || '';
  const storeId = params.get('storeId') || '';
  const [crewName, setCrewName] = useState(t('chat.crewFallback'));
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [serverError, setServerError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<CatalogChoice[]>([]);
  const [group, setGroup] = useState('');
  const saved = useMemo(() => loadSavedPlace(), []);
  const [origin, setOrigin] = useState<MapOrigin>(CAN_THO);
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
  const groups = useMemo(() => [...new Set(catalog.map((item) => item.category).filter(Boolean))], [catalog]);
  const choices = catalog.filter((item) => item.category === group);

  useEffect(() => {
    if (!contractorId) {
      setCatalog([]);
      return;
    }
    locationApi
      .contractor(contractorId)
      .then((res) => {
        const payload = res.data.data;
        setCrewName(payload.publicProfile?.displayName || payload.contractor?.businessName || '');
        const rows = (payload.services || [])
          .filter((item) => item.isActive === true && item.completionStatus !== 'INCOMPLETE')
          .map((item) => ({
            name: item.name,
            category: item.category,
            catalogKey: item.catalogKey || item.id,
            serviceId: item.id,
          }));
        setCatalog(rows);
        setGroup((current) => {
          const nextGroups = [...new Set(rows.map((item) => item.category).filter(Boolean))];
          if (current && nextGroups.includes(current)) return current;
          return nextGroups[0] || '';
        });
        setValue('catalogServiceId', '');
      })
      .catch(() => {
        setCatalog([]);
        setGroup('');
      });
  }, [contractorId, setValue]);

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

  function addImages(list: FileList | null) {
    const incoming = Array.from(list || []).filter(isSiteImage);
    if ((list?.length || 0) > incoming.length) {
      setServerError(t('request.mediaType'));
    }
    setImages((prev) => {
      const seen = new Set(prev.map(fileKey));
      const extra = incoming.filter((file) => !seen.has(fileKey(file)));
      return [...prev, ...extra].slice(0, 8);
    });
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
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

  const onSubmit = async (values: FormValues) => {
    if (!contractorId) {
      setServerError(t('request.pickContractor'));
      return;
    }
    const site = placeFromRecord({ lat: origin.lat, lng: origin.lng, address, label: address });
    if (!chosen || !site || site.address.length < 4 || origin.locationConfirmed !== true) {
      setServerError(t('map.confirmRequired'));
      return;
    }
    if (images.length === 0) return;
    if (!catalog.length) {
      setServerError(t('request.noContractorServices'));
      return;
    }
    if (!catalog.some((item) => (item.catalogKey || item.serviceId) === values.catalogServiceId)) {
      setServerError(t('request.pickService'));
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
    form.append('locationConfirmed', 'true');
    form.append('locationSource', persistedLocationSource(origin.source));
    if (origin.refId) form.append('providerRefId', origin.refId);
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
      <BackButton fallback="/customer/request/history" />
      <PageHeader
        eyebrow={t('request.eyebrow')}
        title={t('request.title')}
        description={t('request.sendTo', { name: crewName })}
      />
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-5 rounded-[22px] border border-navy-800/8 bg-white p-6 shadow-card">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink-800">{t('request.pickGroup')}</p>
            {groups.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {groups.map((item) => {
                  const selected = item === group;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setGroup(item);
                        setValue('catalogServiceId', '');
                      }}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                        selected
                          ? 'bg-navy-800 text-white'
                          : 'border border-navy-800/10 bg-white text-ink-700 hover:border-navy-800/30'
                      )}
                    >
                      {catalogCategoryLabel(item, t)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-500">{t('request.noContractorServices')}</p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-800">{t('request.contractorServices')}</p>
            {catalog.length === 0 ? null : !choices.length ? (
              <p className="mt-2 text-sm text-ink-500">{t('request.noGroupServices')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-navy-800/8 overflow-hidden rounded-2xl border border-navy-800/10">
                {choices.map((item) => {
                  const key = item.catalogKey || item.serviceId || item.name;
                  const selected = catalogServiceId === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setValue('catalogServiceId', key, { shouldValidate: true })}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition',
                          selected ? 'bg-navy-800/5' : 'bg-white hover:bg-navy-800/[0.03]'
                        )}
                      >
                        <Wrench className="h-4 w-4 shrink-0 text-ink-400" />
                        <span className="flex-1 font-medium text-navy-800">{catalogServiceLabel(item.name, t)}</span>
                        {selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.catalogServiceId ? <p className="mt-1 text-xs text-red-600">{errors.catalogServiceId.message}</p> : null}
            {catalog.length ? (
              <p className="mt-2 text-xs text-emerald-700">{t('request.onlyContractorServices')}</p>
            ) : null}
          </div>
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
          <LocationPicker variant="panel" origin={origin} onPick={pickSite} note={t('map.repairHint')} />
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
          <p className="mt-1 text-sm text-ink-500">{t('request.mediaHint')}</p>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="mt-2 text-sm"
            onChange={(e) => {
              addImages(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="mt-3 text-xs font-medium text-ink-500">{t('request.mediaVideoOptional')}</p>
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            className="mt-2 block text-sm"
            onChange={(e) => setVideos(Array.from(e.target.files || []).slice(0, 2))}
          />
          {videos[0] ? <p className="mt-1 truncate text-xs text-ink-500">{videos[0].name}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            {images.map((file, index) => (
              <div key={fileKey(file)} className="w-24 space-y-1">
                <img src={previews[index]} alt={file.name} className="h-20 w-20 rounded-xl object-cover" />
                <p className="truncate text-xs text-ink-600" title={file.name}>{file.name}</p>
                <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => removeImage(index)}>
                  {t('request.removeImage')}
                </button>
              </div>
            ))}
          </div>
          {images.length === 0 ? (
            <p className="mt-2 text-xs text-red-600">{t('request.mediaRequired')}</p>
          ) : null}
        </div>
        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        <Button type="submit" loading={isSubmitting} disabled={isSubmitting || images.length === 0 || catalog.length === 0} className="w-full">
          {isSubmitting ? t('request.submitting') : t('request.submitChat')}
        </Button>
      </form>
    </PageTransition>
  );
}
