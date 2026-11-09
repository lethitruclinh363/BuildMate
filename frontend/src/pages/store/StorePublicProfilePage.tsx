import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { LockedAccountFields } from '@/features/operating-hours/LockedAccountFields';
import { OperatingHoursEditor } from '@/features/operating-hours/OperatingHoursEditor';
import { OperatingHoursDisplay } from '@/features/operating-hours/OperatingHoursDisplay';
import { normalizeWeeklyHours, weeklyHoursError } from '@/features/operating-hours/weeklyHours';
import type { AxiosError } from 'axios';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/TextArea';
import { ImageViewer, MediaFrame, type ViewerSlide } from '@/components/media/ProfileMedia';
import { useHashFocus } from '@/components/partner/useHashFocus';
import { PartnerLocationSection } from '@/features/map/components/PartnerLocationSection';
import { storeLocationPatch } from '@/features/map/lib/location';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { StoreProfileShowcase } from '@/pages/public/StoreProfileShowcase';
import {
  categoryDisplayLabel,
  collapseCategoryName,
  findOwnedCategoryMatch,
  findSystemCategoryMatch,
  foldCategoryName,
  type MaterialCategoryPick,
} from '@/data/material-categories';
import { api, getApiErrorMessage } from '@/lib/api';
import { saleLabelKey, saleState } from '@/lib/material-sale';
import { materialStoreApi, productImageUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { ApiResponse } from '@/types/user';
import type { CatalogMaterial } from '@/types/partner';
import type { PublicStoreProfile, PublicStoreReview } from '@/types/marketplace';

type EditKey = 'info' | 'contact' | 'address' | 'hours' | 'areas';

const emptyProfile = (): PublicStoreProfile => ({
  id: '',
  contractorId: '',
  displayName: '',
  slogan: '',
  description: '',
  phone: '',
  contactName: '',
  contactEmail: '',
  address: '',
  city: '',
  avatar: '',
  logo: '',
  coverImage: '',
  gallery: [],
  openingHours: '',
  serviceAreas: [],
  serviceRadiusKm: 5,
  showroomNote: '',
  deliveryNote: '',
  verified: false,
  rating: 0,
  reviewCount: 0,
});

async function uploadImage(file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('invalid-image');
  const body = new FormData();
  body.append('file', file);
  const res = await api.post<ApiResponse<{ url: string }>>('/uploads/stores', body, { timeout: 60000 });
  return res.data.data.url;
}

function shown(value: string | undefined, missing: string) {
  const text = (value || '').trim();
  return text || missing;
}

export function StorePublicProfilePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const pushToast = useToastStore((state) => state.push);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [profile, setProfile] = useState<PublicStoreProfile>(emptyProfile());
  const [saved, setSaved] = useState<PublicStoreProfile>(emptyProfile());
  const [areas, setAreas] = useState('');
  const [categories, setCategories] = useState<MaterialCategoryPick[]>([]);
  const [catalog, setCatalog] = useState<MaterialCategoryPick[]>([]);
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [reviews, setReviews] = useState<{ average: number; count: number; items: PublicStoreReview[] } | null>(null);
  const [activeCategory, setActiveCategory] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [viewer, setViewer] = useState<{ slides: ViewerSlide[]; index: number } | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    const section: Partial<Record<string, EditKey>> = {
      'store-name': 'info',
      'store-info': 'info',
      introduction: 'info',
      address: 'address',
      'working-hours': 'hours',
      'public-contact': 'contact',
      'service-area': 'areas',
    };
    if (section[id]) setEditing(section[id]);
  }, [hash]);
  useHashFocus(!loading && !preview);

  useEffect(() => {
    materialStoreApi
      .getPublicProfile()
      .then((res) => {
        const legal = res.data.data.verified;
        const next: PublicStoreProfile = {
          ...res.data.data.publicProfile,
          weeklyHours: normalizeWeeklyHours(
            res.data.data.publicProfile.weeklyHours || res.data.data.publicProfile.operatingHours
          ),
        };
        if (!next.contactName && legal?.representativeName) next.contactName = legal.representativeName;
        if (!next.contactEmail && legal?.contactEmail) next.contactEmail = legal.contactEmail;
        if (!next.phone && legal?.contactPhone) next.phone = legal.contactPhone;
        if (!next.address && legal?.address) next.address = legal.address;
        if (!next.city && legal?.city) next.city = legal.city;
        setProfile(next);
        setSaved(next);
        setAreas((next.serviceAreas || []).join(', '));
        setCategories(res.data.data.categories || []);
        setMaterials(res.data.data.materials || []);
        setReviews(res.data.data.reviews || null);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
    materialStoreApi
      .listMaterialCategories()
      .then((res) => setCatalog([...(res.data.data?.system || []), ...(res.data.data?.custom || [])]))
      .catch(() => setCatalog([]));
  }, []);

  async function saveLocation(origin: MapOrigin) {
    if (busy || origin.locationConfirmed !== true) return;
    setBusy(true);
    try {
      await materialStoreApi.updateStore(storeLocationPatch(origin));
      const next = {
        ...profile,
        areaCenter: { lat: origin.lat, lng: origin.lng },
        locationReady: true,
        ...(origin.address || origin.label ? { address: origin.address || origin.label || profile.address } : {}),
        ...(origin.city ? { city: origin.city } : {}),
      };
      setProfile(next);
      setSaved(next);
      pushToast({ kind: 'success', title: t('storePublic.locationSaved') });
    } catch (err) {
      pushToast({ kind: 'error', title: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  function setField<K extends keyof PublicStoreProfile>(key: K, value: PublicStoreProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function pickImage(key: 'avatar' | 'logo' | 'coverImage', file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setField(key, await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error && err.message === 'invalid-image' ? t('publicProfile.imageInvalid') : getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addGallery(file: File | undefined) {
    if (!file || profile.gallery.length >= 12) return;
    setBusy(true);
    setError('');
    try {
      const url = await uploadImage(file);
      setField('gallery', [...profile.gallery, url]);
    } catch (err) {
      setError(err instanceof Error && err.message === 'invalid-image' ? t('publicProfile.imageInvalid') : getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function moveGallery(index: number, direction: -1 | 1) {
    const list = [...profile.gallery];
    const next = index + direction;
    if (next < 0 || next >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(next, 0, item);
    setField('gallery', list);
  }

  function openSlides(slides: ViewerSlide[], index: number) {
    if (!slides.length) return;
    setViewer({ slides, index });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (profile.displayName.trim().length < 2) {
      setError(t('storePublic.nameRequired'));
      setEditing('info');
      return;
    }
    const hoursError = weeklyHoursError(normalizeWeeklyHours(profile.weeklyHours));
    if (hoursError) {
      setError(t(hoursError));
      setEditing('hours');
      return;
    }
    setBusy(true);
    try {
      const before = await materialStoreApi.workspace();
      const res = await materialStoreApi.savePublicProfile({
        displayName: profile.displayName.trim(),
        slogan: profile.slogan,
        description: profile.description,
        phone: profile.phone,
        contactName: profile.contactName,
        contactEmail: profile.contactEmail,
        avatar: profile.avatar,
        logo: profile.logo,
        coverImage: profile.coverImage,
        gallery: profile.gallery,
        weeklyHours: normalizeWeeklyHours(profile.weeklyHours),
        showroomNote: profile.showroomNote,
        deliveryNote: profile.deliveryNote,
        serviceRadiusKm: profile.serviceRadiusKm || 5,
        serviceAreas: areas.split(',').map((item) => item.trim()).filter(Boolean),
      });
      const next = {
        ...profile,
        ...res.data.data,
        weeklyHours: normalizeWeeklyHours(res.data.data.weeklyHours || res.data.data.operatingHours),
      };
      setProfile(next);
      setSaved(next);
      setAreas((next.serviceAreas || []).join(', '));
      setEditing(null);
      const after = await materialStoreApi.workspace();
      const becameReady = !before.data.data.activation?.ready && after.data.data.activation?.ready;
      pushToast({ kind: 'success', title: becameReady ? t('activation.completeToast') : t('activation.savedToast') });
      navigate('/store/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    const display = collapseCategoryName(categoryName);
    if (!display) {
      setCategoryError(t('storePublic.categoryRequired'));
      return;
    }
    const systemHit = findSystemCategoryMatch(display, catalog.filter((item) => item.type === 'SYSTEM'));
    const ownedHit = findOwnedCategoryMatch(display, catalog.filter((item) => item.type === 'CUSTOM'));
    const listed = categories.some((item) => foldCategoryName(item.name) === foldCategoryName(display) || foldCategoryName(categoryDisplayLabel(item, t)) === foldCategoryName(display));
    if (systemHit || ownedHit || listed) {
      setCategoryError(t('storePublic.categoryExists'));
      return;
    }
    setCategoryBusy(true);
    setCategoryError('');
    try {
      const res = await materialStoreApi.registerMaterialCategory(display);
      setCategories(res.data.data || []);
      setCategoryName('');
      setCategoryOpen(false);
    } catch (err) {
      const code = (err as AxiosError<{ details?: { code?: string } }>).response?.data?.details?.code;
      setCategoryError(
        code === 'DUPLICATE_SYSTEM_CATEGORY' || code === 'DUPLICATE_CUSTOM_CATEGORY'
          ? t('storePublic.categoryExists')
          : getApiErrorMessage(err)
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (error && !profile.id) {
    return (
      <PageTransition>
        <ErrorState title={t('storePublic.title')} body={error} />
        <div className="mt-4">
          <Button asChild>
            <Link to="/store/verification">{t('nav.store.verification')}</Link>
          </Button>
        </div>
      </PageTransition>
    );
  }

  if (preview) {
    return (
      <PageTransition>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(false)}>{t('publicProfile.backToEdit')}</Button>
        </div>
        <StoreProfileShowcase
          profile={{ ...profile, verified: true }}
          categories={categories}
          materials={materials}
          reviews={reviews}
          preview
        />
      </PageTransition>
    );
  }

  const missing = t('storePublic.missing');
  const ratingCount = reviews?.count ?? profile.reviewCount ?? 0;
  const rating = reviews?.average ?? profile.rating ?? 0;
  const place = [profile.address, profile.city].filter(Boolean).join(', ');
  const mapQuery = encodeURIComponent(place);
  const visibleProducts = materials.filter((item) => !activeCategory || foldCategoryName(item.category) === activeCategory);
  const gallerySlides = profile.gallery.map((src, index) => ({ src, alt: t('storePublic.galleryAlt', { n: index + 1 }) }));

  return (
    <PageTransition>
      <BackButton fallback="/store/dashboard" />
      <form onSubmit={onSubmit} className="space-y-6">
        <PageHeader
          eyebrow={t('storePublic.eyebrow')}
          title={t('storePublic.title')}
          description={t('storePublic.description')}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <section className="overflow-hidden rounded-[28px] border border-navy-800/8 bg-white shadow-card">
          <div className="relative">
            <MediaFrame
              src={profile.coverImage}
              alt={t('storePublic.cover')}
              fit="cover"
              priority
              frameClassName="aspect-[2/1] sm:aspect-[21/8]"
              onOpen={profile.coverImage ? () => openSlides([{ src: profile.coverImage, alt: t('storePublic.cover') }], 0) : undefined}
              empty={
                <button
                  type="button"
                  className="absolute inset-0 grid place-items-center bg-navy-800 text-sm font-semibold text-white/80 hover:bg-navy-800/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
                  onClick={() => coverInputRef.current?.click()}
                  aria-label={t('storePublic.addCover')}
                >
                  {t('storePublic.addCover')}
                </button>
              }
            />
            <label className="absolute bottom-3 right-3 z-[3] cursor-pointer rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy-800 shadow-card">
              {t('storePublic.changeCover')}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  void pickImage('coverImage', event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div className="-mt-10 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-card">
                <MediaFrame
                  src={profile.logo}
                  alt={profile.displayName || t('storePublic.logo')}
                  fit="logo"
                  frameClassName="h-20 w-20 sm:h-24 sm:w-24"
                  onOpen={profile.logo ? () => openSlides([{ src: profile.logo, alt: t('storePublic.logo') }], 0) : undefined}
                  empty={<span className="absolute inset-0 grid place-items-center px-2 text-center text-xs font-semibold text-ink-400">{t('storePublic.noLogo')}</span>}
                />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-3xl text-navy-800">{profile.displayName || missing}</h2>
                  <Badge tone="success">
                    <BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> {t('storePublic.verified')}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-500">{t('storePublic.kind')}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-copper-500" /> {profile.city || t('storePublic.noAddress')}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-navy-800">
                    <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
                    {ratingCount > 0 ? t('storePublic.reviewSummary', { score: rating.toFixed(1), count: ratingCount }) : t('storePublic.noReviews')}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setPreview(true)}>{t('storePublic.viewPublic')}</Button>
              <Button type="button" variant="copper" onClick={() => setPreview(true)}>{t('storePublic.preview')}</Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div id="avatar" className="section-anchor">
          <PhotoSlot
            label={t('storePublic.avatar')}
            src={profile.avatar}
            fit="cover"
            empty={t('storePublic.addAvatar')}
            changeLabel={profile.avatar ? t('publicProfile.change') : t('storePublic.addAvatar')}
            removeLabel={t('publicProfile.remove')}
            onOpen={profile.avatar ? () => openSlides([{ src: profile.avatar, alt: t('storePublic.avatar') }], 0) : undefined}
            onPick={(file) => void pickImage('avatar', file)}
            onClear={profile.avatar ? () => setField('avatar', '') : undefined}
          />
          </div>
          <div id="logo" className="section-anchor">
          <PhotoSlot
            label={t('storePublic.logoTitle')}
            src={profile.logo}
            fit="logo"
            empty={t('storePublic.noLogo')}
            changeLabel={profile.logo ? t('publicProfile.change') : t('storePublic.addLogo')}
            removeLabel={t('publicProfile.remove')}
            onOpen={profile.logo ? () => openSlides([{ src: profile.logo, alt: t('storePublic.logo') }], 0) : undefined}
            onPick={(file) => void pickImage('logo', file)}
            onClear={profile.logo ? () => setField('logo', '') : undefined}
          />
          </div>
          <div id="cover" className="section-anchor">
          <PhotoSlot
            label={t('storePublic.cover')}
            src={profile.coverImage}
            fit="cover"
            empty={t('storePublic.addCover')}
            changeLabel={profile.coverImage ? t('storePublic.changeCover') : t('storePublic.addCover')}
            removeLabel={t('publicProfile.remove')}
            onOpen={profile.coverImage ? () => openSlides([{ src: profile.coverImage, alt: t('storePublic.cover') }], 0) : undefined}
            onPick={(file) => void pickImage('coverImage', file)}
            onClear={profile.coverImage ? () => setField('coverImage', '') : undefined}
          />
          </div>
        </div>

        <Block
          id="store-info"
          title={t('storePublic.info')}
          hint={t('storePublic.infoHint')}
          action={<TextButton onClick={() => setEditing(editing === 'info' ? null : 'info')}>{editing === 'info' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
        >
          {editing === 'info' ? (
            <div className="grid gap-4">
              <div id="store-name" className="section-anchor">
                <Input label={t('storePublic.displayName')} value={profile.displayName} onChange={(event) => setField('displayName', event.target.value)} required />
              </div>
              <div id="introduction" className="section-anchor">
                <TextArea label={t('storePublic.intro')} value={profile.description} onChange={(event) => setField('description', event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="max-w-3xl">
              <p className="font-display text-2xl text-navy-800">{profile.displayName || missing}</p>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-600">
                {profile.description.trim() ? profile.description : t('storePublic.noAbout')}
              </p>
              {!profile.description.trim() ? (
                <button type="button" className="mt-3 text-sm font-semibold text-navy-800 underline" onClick={() => setEditing('info')}>
                  {t('storePublic.addAbout')}
                </button>
              ) : null}
            </div>
          )}
        </Block>

        <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Block
            id="public-contact"
            title={t('storePublic.contactTitle')}
            hint={t('storePublic.contactHint')}
            className="h-full"
            action={<TextButton onClick={() => setEditing(editing === 'contact' ? null : 'contact')}>{editing === 'contact' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
          >
            {editing === 'contact' ? (
              <div className="grid gap-4">
                <Input label={t('storePublic.contactPerson')} value={profile.contactName || ''} onChange={(event) => setField('contactName', event.target.value)} />
                <LockedAccountFields phone={profile.phone} email={profile.contactEmail || ''} />
              </div>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Fact label={t('storePublic.contactPerson')} value={shown(profile.contactName, missing)} />
                <Fact label={t('storePublic.phone')} value={shown(profile.phone, missing)} />
                <Fact label={t('storePublic.email')} value={shown(profile.contactEmail, missing)} />
              </dl>
            )}
          </Block>

          <Block
            id="address"
            title={t('storePublic.addressTitle')}
            hint={t('storePublic.addressHint')}
            className="h-full"
            action={<TextButton onClick={() => setEditing(editing === 'address' ? null : 'address')}>{editing === 'address' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
          >
            {editing === 'address' ? (
              <div className="grid gap-4">
                <Input label={t('storePublic.address')} value={profile.address} onChange={(event) => setField('address', event.target.value)} />
                <Input label={t('storePublic.city')} value={profile.city} onChange={(event) => setField('city', event.target.value)} />
              </div>
            ) : (
              <div>
                <p className="inline-flex items-start gap-2 text-sm font-semibold leading-6 text-navy-800">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-copper-500" />
                  {place || t('storePublic.noAddress')}
                </p>
                {profile.city ? <p className="mt-3 text-sm text-ink-500">{t('storePublic.city')}: {profile.city}</p> : null}
                {place ? (
                  <a className="mt-3 inline-flex text-sm font-semibold text-navy-800 underline" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
                    {t('storePublic.map')}
                  </a>
                ) : null}
              </div>
            )}
          </Block>

          <Block
<<<<<<< HEAD
            id="working-hours"
            title={t('storePublic.hoursTitle')}
            hint={t('storePublic.hoursHint')}
            action={<TextButton onClick={() => setEditing(editing === 'hours' ? null : 'hours')}>{editing === 'hours' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
          >
            {editing === 'hours' ? (
              <OperatingHoursEditor
                value={normalizeWeeklyHours(profile.weeklyHours)}
                onChange={(weeklyHours) => setField('weeklyHours', weeklyHours)}
              />
            ) : (
              <OperatingHoursDisplay hours={normalizeWeeklyHours(profile.weeklyHours)} />
            )}
          </Block>

          <Block
=======
>>>>>>> main
            title={t('storePublic.areasTitle')}
            hint={t('storePublic.areasHint')}
            className="h-full"
            action={<TextButton onClick={() => setEditing(editing === 'areas' ? null : 'areas')}>{editing === 'areas' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
          >
            {editing === 'areas' ? (
              <Input label={t('storePublic.areas')} value={areas} onChange={(event) => setAreas(event.target.value)} />
            ) : profile.serviceAreas.length ? (
              <ul className="flex flex-wrap gap-2">
                {profile.serviceAreas.map((area) => (
                  <li key={area} className="rounded-full bg-mist-100 px-3 py-1.5 text-sm font-semibold text-navy-800">{area}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">{t('storePublic.noArea')}</p>
            )}
          </Block>

          <div className="xl:col-span-3">
            <Block
              id="working-hours"
              title={t('storePublic.hoursTitle')}
              hint={t('storePublic.hoursHint')}
              action={<TextButton onClick={() => setEditing(editing === 'hours' ? null : 'hours')}>{editing === 'hours' ? t('publicProfile.doneSection') : t('storePublic.edit')}</TextButton>}
            >
              {editing === 'hours' ? (
                <OperatingHoursEditor
                  value={normalizeWeeklyHours(profile.weeklyHours)}
                  onChange={(weeklyHours) => setField('weeklyHours', weeklyHours)}
                />
              ) : (
                <OperatingHoursDisplay hours={normalizeWeeklyHours(profile.weeklyHours)} />
              )}
            </Block>
          </div>
        </div>

        <Card hover={false}>
          <PartnerLocationSection
            title={t('storePublic.locationTitle')}
            hint={t('storePublic.locationHint')}
            lat={profile.areaCenter?.lat}
            lng={profile.areaCenter?.lng}
            label={profile.address || profile.city}
            ready={profile.locationReady}
            locationSource={profile.locationSource || undefined}
            saving={busy}
            onSave={(origin) => void saveLocation(origin)}
          />
        </Card>

        <Block
          id="categories"
          title={t('storePublic.categories')}
          hint={t('storePublic.categoriesHint')}
          action={
            <div className="flex flex-wrap gap-3">
              <TextButton onClick={() => { setCategoryError(''); setCategoryOpen(true); }}>+ {t('storePublic.addCategory')}</TextButton>
              <Link to="/store/materials" className="text-sm font-semibold text-navy-800 underline">{t('storePublic.manageCategories')}</Link>
            </div>
          }
        >
          {categories.length ? (
            <ul className="flex flex-wrap gap-2">
              {categories.map((item) => {
                const key = foldCategoryName(item.name);
                const active = activeCategory === key;
                return (
                  <li key={`${item.type}-${item.name}`}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setActiveCategory(active ? '' : key)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-navy-800 text-white' : 'bg-mist-100 text-navy-800'}`}
                    >
                      {categoryDisplayLabel(item, t)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">{t('storePublic.noCategories')}</p>
          )}
        </Block>

        <Block
          id="products"
          title={t('storePublic.products')}
          hint={t('storePublic.productsHint')}
          action={<Link to="/store/products" className="text-sm font-semibold text-navy-800 underline">{t('storePublic.viewAll')}</Link>}
        >
          {visibleProducts.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.slice(0, 6).map((item) => {
                const photo = productImageUrl(item.image);
                return (
                <article key={item.id} className="overflow-hidden rounded-2xl bg-mist-100/60">
                  <MediaFrame
                    src={photo}
                    alt={item.name}
                    fit="cover"
                    frameClassName="aspect-[4/3]"
                    onOpen={photo ? () => openSlides([{ src: photo, alt: item.name }], 0) : undefined}
                    empty={<span className="absolute inset-0 grid place-items-center text-xs text-ink-400">{t('storePublic.noPhoto')}</span>}
                  />
                  <div className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{categoryDisplayLabel({ name: item.category, type: 'SYSTEM' }, t)}</p>
                    <h3 className="mt-1 font-display text-lg text-navy-800">{item.name}</h3>
                    <p className="mt-2 font-display text-xl text-navy-800">{vnd(item.price)} <span className="text-sm font-sans font-normal text-ink-400">/ {item.unit}</span></p>
                    <p className="mt-2 text-xs font-semibold tracking-wide text-navy-800">{t(saleLabelKey(saleState(item)))}</p>
                  </div>
                </article>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink-500">{activeCategory ? t('storePublic.noProductsInCategory') : t('storePublic.noProducts')}</p>
              <Link to="/store/products" className="mt-3 inline-flex text-sm font-semibold text-navy-800 underline">{t('nav.store.products')}</Link>
            </div>
          )}
        </Block>

        <Block
          title={t('storePublic.gallery')}
          hint={t('storePublic.galleryHint')}
          action={
            <label className="cursor-pointer text-sm font-semibold text-navy-800 underline">
              {t('storePublic.addImage')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void addGallery(event.target.files?.[0])} />
            </label>
          }
        >
          {profile.gallery.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {profile.gallery.map((url, index) => (
                <div key={`${url}-${index}`} className="min-w-0 space-y-2">
                  <MediaFrame
                    src={url}
                    alt={t('storePublic.galleryAlt', { n: index + 1 })}
                    fit="thumbnail"
                    frameClassName="aspect-[4/3] rounded-2xl"
                    onOpen={() => openSlides(gallerySlides, index)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="text-xs font-semibold text-navy-800 disabled:opacity-40" disabled={index === 0} onClick={() => moveGallery(index, -1)}>{t('publicProfile.moveEarlier')}</button>
                    <button type="button" className="text-xs font-semibold text-navy-800 disabled:opacity-40" disabled={index === profile.gallery.length - 1} onClick={() => moveGallery(index, 1)}>{t('publicProfile.moveLater')}</button>
                    <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setField('gallery', profile.gallery.filter((_, item) => item !== index))}>{t('publicProfile.remove')}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500">{t('storePublic.noGallery')}</p>
          )}
        </Block>

        <Block title={t('storePublic.reviews')} hint={t('storePublic.reviewsHint')}>
          {ratingCount > 0 ? (
            <div>
              <p className="font-display text-3xl text-navy-800">{rating.toFixed(1)}</p>
              <p className="mt-1 text-sm text-ink-500">{t('storePublic.reviewSummary', { score: rating.toFixed(1), count: ratingCount })}</p>
              <ul className="mt-4 space-y-3">
                {(reviews?.items || []).map((item) => (
                  <li key={item.id} className="rounded-2xl bg-mist-100/70 p-4">
                    <p className="text-sm font-semibold text-navy-800">{item.customerName || t('storePublic.customer')}</p>
                    <p className="text-sm text-copper-600">{item.rating}/5</p>
                    <p className="mt-2 text-sm leading-6 text-ink-600">{item.comment}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="inline-flex items-center gap-2 font-display text-2xl text-navy-800">
                <Star className="h-5 w-5 text-copper-400" /> {t('storePublic.noReviews')}
              </p>
              <p className="mt-2 text-sm text-ink-500">{t('storePublic.noReviewsBody')}</p>
            </div>
          )}
        </Block>

        <p className="text-sm text-ink-400">{t('storePublic.publicNote')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild type="button" variant="ghost">
            <Link to="/store/dashboard">{t('activation.backDashboard')}</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setProfile(saved);
              setAreas((saved.serviceAreas || []).join(', '));
              setEditing(null);
              setError('');
            }}
          >
            {t('publicProfile.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>{t('publicProfile.save')}</Button>
        </div>
      </form>

      <Modal open={categoryOpen} onOpenChange={setCategoryOpen} title={t('storePublic.addCategoryTitle')}>
        <div className="space-y-4">
          <Input label={t('storePublic.categoryName')} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          {categoryError ? <p className="text-sm text-red-600">{categoryError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCategoryOpen(false)}>{t('publicProfile.cancel')}</Button>
            <Button type="button" disabled={categoryBusy} onClick={() => void addCategory()}>{t('storePublic.addCategory')}</Button>
          </div>
        </div>
      </Modal>

      <ImageViewer
        slides={viewer?.slides || []}
        index={viewer ? viewer.index : null}
        onClose={() => setViewer(null)}
        onChange={(next) => setViewer((current) => (current ? { ...current, index: next } : current))}
      />
    </PageTransition>
  );
}

function Block({ id, title, hint, action, children, className }: { id?: string; title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div id={id} className={id ? 'section-anchor' : undefined}>
    <Card hover={false} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-navy-800">{title}</h2>
          {hint ? <p className="mt-1 text-sm leading-6 text-ink-500">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-navy-800">{value}</dd>
    </div>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="text-sm font-semibold text-navy-800 underline" onClick={onClick}>
      {children}
    </button>
  );
}

function PhotoSlot({
  label,
  src,
  fit,
  empty,
  changeLabel,
  removeLabel,
  onOpen,
  onPick,
  onClear,
}: {
  label: string;
  src: string;
  fit: 'cover' | 'logo';
  empty: string;
  changeLabel: string;
  removeLabel: string;
  onOpen?: () => void;
  onPick: (file: File | undefined) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card hover={false} className="min-w-0">
      <p className="text-sm font-semibold text-navy-800">{label}</p>
      <div className="mt-3">
        <MediaFrame
          src={src}
          alt={label}
          fit={fit}
          frameClassName="aspect-[4/3] rounded-2xl"
          onOpen={onOpen}
          empty={
            <button
              type="button"
              className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-ink-500 transition hover:bg-navy-800/5 hover:text-navy-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-navy-800"
              onClick={() => inputRef.current?.click()}
              aria-label={changeLabel}
            >
              {empty}
            </button>
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="cursor-pointer text-sm font-semibold text-navy-800 underline">
          {changeLabel}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              onPick(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
        {onClear ? (
          <button type="button" className="text-sm font-semibold text-red-600" onClick={onClear}>{removeLabel}</button>
        ) : null}
      </div>
    </Card>
  );
}
