import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Bookmark, Check, ImagePlus, Upload, Wrench, X } from 'lucide-react';
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

function isSiteVideo(file: File) {
  const name = file.name.toLowerCase();
  if (!/\.(mp4|mov)$/.test(name)) return false;
  if (file.type && !file.type.startsWith('video/')) return false;
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
  const [mediaError, setMediaError] = useState('');
  const [videoError, setVideoError] = useState('');
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [serverError, setServerError] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [catalog, setCatalog] = useState<CatalogChoice[]>([]);
  const [group, setGroup] = useState('');
  const saved = useMemo(() => loadSavedPlace(), []);
  const [origin, setOrigin] = useState<MapOrigin>(CAN_THO);
  const [chosen, setChosen] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        catalogServiceId: z.string().trim().min(2, t('request.pickService')).max(80),
        title: z.string().trim().min(4, t('request.titleMin')).max(140, t('request.titleMax')),
        description: z.string().trim().min(8, t('request.descMin')).max(2000, t('request.descMax')),
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
  const titleValue = watch('title');
  const descriptionValue = watch('description');
  const groups = useMemo(() => [...new Set(catalog.map((item) => item.category).filter(Boolean))], [catalog]);
  const choices = catalog.filter((item) => item.category === group);
  const selectedChoice = catalog.find((item) => (item.catalogKey || item.serviceId) === catalogServiceId);
  const site = placeFromRecord(origin);
  const locationReady = Boolean(
    chosen && site && site.address.length >= 4 && origin.locationConfirmed === true
  );

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
  }

  function addImages(list: FileList | null) {
    const files = Array.from(list || []);
    const incoming = files.filter(isSiteImage);
    const seen = new Set(images.map(fileKey));
    const extra = incoming.filter((file) => {
      const key = fileKey(file);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const remaining = Math.max(0, 8 - images.length);
    setImages((prev) => [...prev, ...extra.slice(0, remaining)]);

    if (files.length > incoming.length) setMediaError(t('request.mediaType'));
    else if (extra.length > remaining) setMediaError(t('request.mediaLimit'));
    else if (extra.length) setMediaError('');
  }

  function addVideos(list: FileList | null) {
    const files = Array.from(list || []);
    const incoming = files.filter(isSiteVideo);
    const seen = new Set(videos.map(fileKey));
    const extra = incoming.filter((file) => {
      const key = fileKey(file);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const remaining = Math.max(0, 2 - videos.length);
    setVideos((prev) => [...prev, ...extra.slice(0, remaining)]);

    if (files.length > incoming.length) setVideoError(t('request.videoType'));
    else if (extra.length > remaining) setVideoError(t('request.videoLimit'));
    else if (extra.length) setVideoError('');
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setMediaError('');
  }

  function removeVideo(index: number) {
    setVideos((prev) => prev.filter((_, i) => i !== index));
    setVideoError('');
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
    setChosen(true);
  }

  const onSubmit = async (values: FormValues) => {
    if (!contractorId) {
      setServerError(t('request.pickContractor'));
      return;
    }
    setSubmitAttempted(true);
    if (!locationReady || !site) return;
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
      <div className="mx-auto max-w-4xl">
        <BackButton fallback="/customer/request/history" />
        <PageHeader
          eyebrow={t('request.eyebrow')}
          title={t('request.title')}
          description={t('request.sendTo', { name: crewName })}
        />
        <form onSubmit={handleSubmit(onSubmit, () => setSubmitAttempted(true))} className="space-y-8 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card sm:p-8">
          <p className="rounded-xl bg-paper-100 px-4 py-3 text-sm text-ink-600">{t('request.requiredNote')}</p>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-navy-800">{t('request.sectionService')}</h2>
            <div className="space-y-4 pl-0 sm:pl-11">
              <div>
                <p className="text-sm font-semibold text-ink-800">{t('request.pickGroup')} *</p>
                {groups.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {groups.map((item) => {
                      const selected = item === group;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={selected}
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
                <p className="text-sm font-semibold text-ink-800">{t('request.contractorServices')} *</p>
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
                            aria-pressed={selected}
                            onClick={() =>
                              setValue('catalogServiceId', selected ? '' : key, { shouldValidate: true })
                            }
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
                {selectedChoice ? (
                  <p className="mt-2 text-xs text-navy-700">
                    {t('request.serviceContext', {
                      category: catalogCategoryLabel(selectedChoice.category, t),
                      service: catalogServiceLabel(selectedChoice.name, t),
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-navy-800/8 pt-6">
            <h2 className="text-lg font-semibold text-navy-800">{t('request.sectionDetails')}</h2>
            <div className="space-y-4 sm:pl-11">
              <Input
                id="title"
                label={`${t('request.fieldTitle')} *`}
                placeholder={t('request.titlePh')}
                hint={t('request.titleCount', { count: titleValue.length })}
                maxLength={140}
                error={errors.title?.message}
                {...register('title')}
              />
              <label className="block space-y-1.5">
                <span className="flex items-center justify-between gap-3 text-sm font-semibold text-ink-800">
                  <span>{t('request.fieldDesc')} *</span>
                  <span className="text-xs font-normal text-ink-400">{t('request.descriptionCount', { count: descriptionValue.length })}</span>
                </span>
                <textarea
                  rows={5}
                  maxLength={2000}
                  className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-navy-500/10"
                  placeholder={t('request.descPh')}
                  {...register('description')}
                />
                {errors.description ? <span className="text-xs text-red-600">{errors.description.message}</span> : null}
              </label>
            </div>
          </section>

          <section className="space-y-4 border-t border-navy-800/8 pt-6">
            <h2 className="text-lg font-semibold text-navy-800">{t('request.sectionLocation')}</h2>
            <div className="space-y-3 sm:pl-11">
              {saved ? (
                <Button type="button" variant="outline" onClick={useSaved}>
                  <Bookmark className="h-4 w-4" /> {t('map.useSaved')}
                </Button>
              ) : null}
              <LocationPicker variant="panel" origin={origin} onPick={pickSite} note={t('map.repairHint')} />
              {submitAttempted && !locationReady ? (
                <p className="text-xs text-red-600" role="alert">{t('map.confirmRequired')}</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 border-t border-navy-800/8 pt-6">
            <h2 className="text-lg font-semibold text-navy-800">{t('request.sectionMedia')}</h2>
            <div className="space-y-4 sm:pl-11">
              <p className="text-sm text-ink-500">{t('request.mediaHint')}</p>
              <label
                htmlFor="repair-images"
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingImages(true);
                }}
                onDragLeave={() => setIsDraggingImages(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingImages(false);
                  addImages(event.dataTransfer.files);
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition focus-within:ring-4 focus-within:ring-navy-500/10',
                  isDraggingImages
                    ? 'border-navy-700 bg-navy-800/5'
                    : 'border-navy-800/15 bg-paper-50 hover:border-navy-800/35 hover:bg-paper-100'
                )}
              >
                <input
                  id="repair-images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addImages(event.target.files);
                    event.target.value = '';
                  }}
                />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy-800 shadow-sm">
                  <ImagePlus className="h-6 w-6" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-navy-800">{t('request.imageDropTitle')}</span>
                  <span className="mt-1 block text-xs text-ink-500">{t('request.imageDropHint')}</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm font-medium text-navy-800">
                  <Upload className="h-4 w-4" aria-hidden /> {t('request.imageChoose')}
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink-500">{t('request.imageCount', { count: images.length })}</p>
                {mediaError ? <p className="text-xs text-red-600" role="alert">{mediaError}</p> : null}
                {submitAttempted && images.length === 0 ? (
                  <p className="w-full text-xs text-red-600" role="alert">{t('request.mediaRequired')}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {images.map((file, index) => (
                  <div key={fileKey(file)} className="group relative w-24">
                    <img src={previews[index]} alt={file.name} className="h-20 w-24 rounded-xl object-cover" />
                    <button
                      type="button"
                      aria-label={`${t('request.removeImage')}: ${file.name}`}
                      title={t('request.removeImage')}
                      className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-red-700 shadow-sm hover:bg-white"
                      onClick={() => removeImage(index)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                    <p className="mt-1 truncate text-xs text-ink-600" title={file.name}>{file.name}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-navy-800/8 pt-4">
                <p className="text-sm font-medium text-ink-700">{t('request.mediaVideoOptional')}</p>
                <label htmlFor="repair-videos" className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm font-medium text-navy-800 hover:bg-paper-100 focus-within:ring-4 focus-within:ring-navy-500/10">
                  <input
                    id="repair-videos"
                    type="file"
                    accept="video/mp4,video/quicktime"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      addVideos(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <Upload className="h-4 w-4" aria-hidden /> {t('request.videoChoose')}
                </label>
                <p className="mt-2 text-xs text-ink-500">{t('request.videoCount', { count: videos.length })}</p>
                {videoError ? <p className="mt-1 text-xs text-red-600" role="alert">{videoError}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {videos.map((file, index) => (
                    <div key={fileKey(file)} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-paper-100 px-3 py-2 text-xs text-ink-700">
                      <span className="max-w-[220px] truncate">{file.name}</span>
                      <button type="button" aria-label={`${t('request.removeVideo')}: ${file.name}`} onClick={() => removeVideo(index)} className="shrink-0 text-red-700 hover:text-red-900">
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {serverError ? <p className="text-sm text-red-600" role="alert">{serverError}</p> : null}
          <div className="border-t border-navy-800/8 pt-5">
            <p className="mb-3 text-xs text-ink-500">{t('request.submitRequirements')}</p>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting} className="w-full sm:h-12">
              {isSubmitting ? t('request.submitting') : t('request.submitChat')}
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
