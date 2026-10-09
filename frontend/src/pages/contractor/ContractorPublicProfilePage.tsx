import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { catalogServiceLabel } from '@/data/contractor-services';
import { PartnerLocationSection } from '@/features/map/components/PartnerLocationSection';
import { storeLocationPatch } from '@/features/map/lib/location';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { locationApi } from '@/features/map/services/location.api';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { api, getApiErrorMessage } from '@/lib/api';
import { contractorApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { ApiResponse } from '@/types/user';
import type { CatalogService, ContractorProfile } from '@/types/partner';
import type { PublicContractorProfile, PublicHighlights } from '@/types/marketplace';
import { ImageViewer, MediaFrame, type ViewerSlide } from '@/components/media/ProfileMedia';
import { useHashFocus } from '@/components/partner/useHashFocus';
import { ContractorProfileShowcase } from '@/pages/public/ContractorProfileShowcase';

type PhotoKey = 'gallery' | 'crewPhotos' | 'publicCertificates';
type OpenSection = 'about' | 'activity' | 'achievements';

const emptyProfile = (): PublicContractorProfile => ({
  id: '',
  contractorId: '',
  displayName: '',
  slogan: '',
  description: '',
  phone: '',
  address: '',
  city: '',
  avatar: '',
  logo: '',
  coverImage: '',
  gallery: [],
  crewPhotos: [],
  publicCertificates: [],
  achievements: '',
  openingHours: '',
  serviceAreas: [],
  yearsExperience: 0,
  workerCount: 0,
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

function areasText(profile: PublicContractorProfile) {
  return (profile.serviceAreas || []).join(', ');
}

export function ContractorPublicProfilePage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const pushToast = useToastStore((state) => state.push);
  const workspace = useContractorWorkspace();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [asking, setAsking] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [open, setOpen] = useState<Partial<Record<OpenSection, boolean>>>({});
  const [profile, setProfile] = useState<PublicContractorProfile>(emptyProfile());
  const [saved, setSaved] = useState<PublicContractorProfile>(emptyProfile());
  const [areas, setAreas] = useState('');
  const [services, setServices] = useState<CatalogService[]>([]);
  const [highlights, setHighlights] = useState<PublicHighlights>({});
  const [viewer, setViewer] = useState<{ slides: ViewerSlide[]; index: number } | null>(null);

  useEffect(() => {
    contractorApi
      .getPublicProfile()
      .then((res) => {
        const next = res.data.data.publicProfile;
        setProfile(next);
        setSaved(next);
        setAreas(areasText(next));
        setServices(res.data.data.services || []);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (id === 'introduction' || id === 'display-name') setOpen((current) => ({ ...current, about: true }));
    if (['working-hours', 'service-area', 'public-contact'].includes(id)) {
      setOpen((current) => ({ ...current, activity: true }));
    }
  }, [hash]);
  useHashFocus(!loading);

  useEffect(() => {
    if (!profile.contractorId) return;
    locationApi
      .contractor(String(profile.contractorId))
      .then((res) => setHighlights(res.data.data.highlights || {}))
      .catch(() => undefined);
  }, [profile.contractorId]);

  async function saveLocation(origin: MapOrigin) {
    if (busy || origin.locationConfirmed !== true) return;
    setBusy(true);
    try {
      await contractorApi.updateStore(storeLocationPatch(origin));
      const next = {
        ...profile,
        areaCenter: { lat: origin.lat, lng: origin.lng },
        locationReady: true,
        ...(origin.address || origin.label ? { address: origin.address || origin.label || profile.address } : {}),
        ...(origin.city ? { city: origin.city } : {}),
      };
      setProfile(next);
      setSaved(next);
      pushToast({ kind: 'success', title: t('publicProfile.locationSaved') });
    } catch (err) {
      pushToast({ kind: 'error', title: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  function setField<K extends keyof PublicContractorProfile>(key: K, value: PublicContractorProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function movePhoto(key: PhotoKey, index: number, direction: -1 | 1) {
    const list = [...profile[key]];
    const next = index + direction;
    if (next < 0 || next >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(next, 0, item);
    setField(key, list);
  }

  async function onSingle(key: 'avatar' | 'logo' | 'coverImage', file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      setField(key, await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error && err.message === 'invalid-image' ? t('publicProfile.imageInvalid') : getApiErrorMessage(err));
    }
  }

  async function onMany(key: PhotoKey, file: File | undefined) {
    if (!file || profile[key].length >= 8) return;
    setError('');
    try {
      setField(key, [...profile[key], await uploadImage(file)]);
    } catch (err) {
      setError(err instanceof Error && err.message === 'invalid-image' ? t('publicProfile.imageInvalid') : getApiErrorMessage(err));
    }
  }

  function cancelEdits() {
    setProfile(saved);
    setAreas(areasText(saved));
    setOpen({});
    setError('');
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const before = await contractorApi.workspace();
      const serviceAreas = areas.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8);
      const res = await contractorApi.savePublicProfile({
        displayName: profile.displayName,
        slogan: profile.slogan,
        description: profile.description,
        phone: profile.phone,
        city: profile.city,
        avatar: profile.avatar,
        logo: profile.logo,
        coverImage: profile.coverImage,
        gallery: profile.gallery,
        crewPhotos: profile.crewPhotos,
        publicCertificates: profile.publicCertificates,
        achievements: profile.achievements,
        openingHours: profile.openingHours,
        serviceAreas,
        yearsExperience: Number(profile.yearsExperience) || 0,
        workerCount: Number(profile.workerCount) || 0,
      });
      setProfile(res.data.data);
      setSaved(res.data.data);
      setAreas(areasText(res.data.data));
      setOpen({});
      const after = await contractorApi.workspace();
      const becameReady = !before.data.data.activation?.ready && after.data.data.activation?.ready;
      pushToast({ kind: 'success', title: becameReady ? t('activation.completeToast') : t('activation.savedToast') });
      navigate('/contractor/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    setRequestBusy(true);
    setError('');
    try {
      await contractorApi.requestVerificationChange(requestNote.trim());
      setRequestNote('');
      setAsking(false);
      pushToast({ kind: 'success', title: t('publicProfile.requestSent') });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setRequestBusy(false);
    }
  }

  const draft: PublicContractorProfile = {
    ...profile,
    serviceAreas: areas.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8),
  };

  if (loading || workspace.loading) return <DashboardSkeleton />;
  if (error && !profile.displayName) {
    return (
      <PageTransition>
        <ErrorState title={t('publicProfile.title')} body={error} />
      </PageTransition>
    );
  }
  if (preview) {
    return (
      <PageTransition>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(false)}>{t('publicProfile.backToEdit')}</Button>
          {profile.contractorId ? (
            <Button asChild variant="ghost">
              <Link to={`/contractors/${profile.contractorId}`}>{t('publicProfile.viewPublic')}</Link>
            </Button>
          ) : null}
        </div>
        <ContractorProfileShowcase profile={draft} services={services} highlights={highlights} preview />
      </PageTransition>
    );
  }

  const legal = workspace.data?.profile;

  return (
    <PageTransition>
      <BackButton fallback="/contractor/dashboard" />
      <form onSubmit={(event) => void onSave(event)} className="space-y-6">
        <PageHeader
          eyebrow={t('publicProfile.eyebrow')}
          title={t('publicProfile.title')}
          description={t('publicProfile.description')}
          actions={
            <div className="flex flex-wrap gap-2">
              {profile.contractorId ? (
                <Button asChild type="button" variant="outline">
                  <Link to={`/contractors/${profile.contractorId}`}>{t('publicProfile.viewPublic')}</Link>
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setPreview(true)}>{t('publicProfile.preview')}</Button>
            </div>
          }
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Card hover={false}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-navy-800/5 text-navy-800">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl text-navy-800">{t('publicProfile.lockedTitle')}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-500">{t('publicProfile.lockedBody')}</p>
            </div>
          </div>
          {legal ? <VerifiedFacts profile={legal} locale={locale} /> : null}
          {asking ? (
            <div className="mt-4 space-y-3">
              <TextArea label={t('publicProfile.requestHint')} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} />
              <div className="flex gap-2">
                <Button type="button" disabled={requestBusy || requestNote.trim().length < 8} onClick={() => void sendRequest()}>
                  {t('publicProfile.requestSend')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAsking(false)}>{t('publicProfile.cancel')}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" className="mt-4" onClick={() => setAsking(true)}>
              {t('publicProfile.requestUpdate')}
            </Button>
          )}
        </Card>

        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('publicProfile.brand')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div id="avatar" className="section-anchor">
            <BrandSlot
              label={t('publicProfile.avatar')}
              changeLabel={t('publicProfile.change')}
              emptyLabel={t('publicProfile.addPhoto')}
              src={profile.avatar}
              alt={t('viewer.avatarAlt')}
              fit="thumbnail"
              frameClassName="aspect-square rounded-2xl"
              onOpen={() => setViewer(openBrand(profile, 'avatar', t))}
              onPick={(file) => void onSingle('avatar', file)}
            />
            </div>
            <div id="logo" className="section-anchor">
            <BrandSlot
              label={t('publicProfile.logo')}
              changeLabel={t('publicProfile.change')}
              emptyLabel={t('publicProfile.addPhoto')}
              src={profile.logo}
              alt={t('viewer.logoAlt')}
              fit="logo"
              frameClassName="aspect-[16/9] rounded-2xl"
              onOpen={() => setViewer(openBrand(profile, 'logo', t))}
              onPick={(file) => void onSingle('logo', file)}
            />
            </div>
          </div>
          <div id="cover" className="section-anchor mt-4">
            <BrandSlot
              label={t('publicProfile.cover')}
              changeLabel={t('publicProfile.change')}
              emptyLabel={t('publicProfile.addPhoto')}
              src={profile.coverImage}
              alt={t('viewer.coverAlt')}
              fit="cover"
              frameClassName="aspect-[2.4/1] rounded-2xl sm:aspect-[2.8/1]"
              onOpen={() => setViewer(openBrand(profile, 'coverImage', t))}
              onPick={(file) => void onSingle('coverImage', file)}
            />
          </div>
        </Card>

        <Card hover={false}>
          <SectionHead
            title={t('publicProfile.aboutCard')}
            open={Boolean(open.about)}
            editLabel={t('publicProfile.editSection')}
            doneLabel={t('publicProfile.doneSection')}
            onToggle={() => setOpen((current) => ({ ...current, about: !current.about }))}
          />
          {open.about ? (
            <div className="mt-4 grid gap-4">
              <div id="display-name" className="section-anchor">
                <Input label={t('publicProfile.displayName')} value={profile.displayName} onChange={(event) => setField('displayName', event.target.value)} required />
              </div>
              <Input label={t('publicProfile.slogan')} value={profile.slogan} onChange={(event) => setField('slogan', event.target.value)} />
              <div id="introduction" className="section-anchor">
                <TextArea label={t('publicProfile.intro')} value={profile.description} onChange={(event) => setField('description', event.target.value)} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-600">{profile.displayName}{profile.slogan ? ` · ${profile.slogan}` : ''}</p>
          )}
        </Card>

        <Card hover={false}>
          <SectionHead
            title={t('publicProfile.activity')}
            open={Boolean(open.activity)}
            editLabel={t('publicProfile.editSection')}
            doneLabel={t('publicProfile.doneSection')}
            onToggle={() => setOpen((current) => ({ ...current, activity: !current.activity }))}
          />
          {open.activity ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input label={t('publicProfile.experience')} type="number" min={0} max={80} value={profile.yearsExperience} onChange={(event) => setField('yearsExperience', Number(event.target.value))} />
              <Input label={t('publicProfile.workers')} type="number" min={0} max={500} value={profile.workerCount} onChange={(event) => setField('workerCount', Number(event.target.value))} />
              <div id="service-area" className="section-anchor">
                <Input label={t('publicProfile.areas')} hint={t('publicProfile.areasHint')} value={areas} onChange={(event) => setAreas(event.target.value)} />
              </div>
              <div id="working-hours" className="section-anchor">
                <Input label={t('publicProfile.hours')} value={profile.openingHours} onChange={(event) => setField('openingHours', event.target.value)} />
              </div>
              <div id="public-contact" className="section-anchor">
                <Input label={t('publicProfile.phone')} value={profile.phone} onChange={(event) => setField('phone', event.target.value)} />
              </div>
              <Input label={t('publicProfile.city')} value={profile.city} onChange={(event) => setField('city', event.target.value)} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-600">
              {[profile.city, profile.openingHours, profile.phone].filter(Boolean).join(' · ') || t('verify.emptyValue')}
            </p>
          )}
        </Card>

        <Card hover={false}>
          <PartnerLocationSection
            title={t('publicProfile.locationTitle')}
            hint={t('publicProfile.locationHint')}
            lat={profile.areaCenter?.lat}
            lng={profile.areaCenter?.lng}
            label={profile.address || profile.city}
            ready={profile.locationReady}
            locationSource={profile.locationSource || undefined}
            saving={busy}
            onSave={(origin) => void saveLocation(origin)}
          />
        </Card>

        <Card hover={false}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-navy-800">{t('publicProfile.library')}</h2>
            <label className="cursor-pointer text-sm font-semibold text-navy-800 underline">
              {t('publicProfile.addPhoto')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void onMany('gallery', event.target.files?.[0])} />
            </label>
          </div>
          <PhotoGrid
            urls={profile.gallery}
            altFor={(n) => t('viewer.projectAlt', { n })}
            removeLabel={t('publicProfile.remove')}
            earlierLabel={t('publicProfile.moveEarlier')}
            laterLabel={t('publicProfile.moveLater')}
            onOpen={(index) =>
              setViewer({
                slides: profile.gallery.map((src, itemIndex) => ({ src, alt: t('viewer.projectAlt', { n: itemIndex + 1 }) })),
                index,
              })
            }
            onMove={(index, direction) => movePhoto('gallery', index, direction)}
            onRemove={(index) => setField('gallery', profile.gallery.filter((_, itemIndex) => itemIndex !== index))}
          />
          <div className="mt-6 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-500">{t('publicProfile.crew')}</h3>
            <label className="cursor-pointer text-sm font-semibold text-navy-800 underline">
              {t('publicProfile.addPhoto')}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void onMany('crewPhotos', event.target.files?.[0])} />
            </label>
          </div>
          <PhotoGrid
            urls={profile.crewPhotos}
            altFor={(n) => t('viewer.crewAlt', { n })}
            removeLabel={t('publicProfile.remove')}
            earlierLabel={t('publicProfile.moveEarlier')}
            laterLabel={t('publicProfile.moveLater')}
            onOpen={(index) =>
              setViewer({
                slides: profile.crewPhotos.map((src, itemIndex) => ({ src, alt: t('viewer.crewAlt', { n: itemIndex + 1 }) })),
                index,
              })
            }
            onMove={(index, direction) => movePhoto('crewPhotos', index, direction)}
            onRemove={(index) => setField('crewPhotos', profile.crewPhotos.filter((_, itemIndex) => itemIndex !== index))}
          />
        </Card>

        <Card hover={false}>
          <SectionHead
            title={t('publicProfile.content')}
            open={Boolean(open.achievements)}
            editLabel={t('publicProfile.editSection')}
            doneLabel={t('publicProfile.doneSection')}
            onToggle={() => setOpen((current) => ({ ...current, achievements: !current.achievements }))}
          />
          {open.achievements ? (
            <div className="mt-4">
              <TextArea label={t('publicProfile.achievements')} value={profile.achievements} onChange={(event) => setField('achievements', event.target.value)} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-600">{profile.achievements || t('verify.emptyValue')}</p>
          )}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-navy-800/8 pt-4">
            <div>
              <h3 className="font-display text-lg text-navy-800">{t('publicProfile.services')}</h3>
              <p className="mt-1 text-sm text-ink-400">{t('publicProfile.servicesHint')}</p>
            </div>
            <Link to="/contractor/services" className="text-sm font-semibold text-navy-800 underline">{t('publicProfile.manageServices')}</Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {services.map((service) => (
              <Badge key={service.id} tone="mist">{catalogServiceLabel(service.name, t)}</Badge>
            ))}
          </div>
        </Card>

        <div className="sticky bottom-0 z-20 -mx-4 flex justify-end gap-2 border-t border-navy-800/10 bg-white/95 px-4 py-3 backdrop-blur">
          <Button asChild type="button" variant="ghost">
            <Link to="/contractor/dashboard">{t('activation.backDashboard')}</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={cancelEdits}>{t('publicProfile.cancel')}</Button>
          <Button type="submit" disabled={busy}>{t('publicProfile.save')}</Button>
        </div>
        <ImageViewer
          slides={viewer?.slides || []}
          index={viewer ? viewer.index : null}
          onClose={() => setViewer(null)}
          onChange={(next) => setViewer((current) => (current ? { ...current, index: next } : current))}
        />
      </form>
    </PageTransition>
  );
}

function SectionHead({
  title,
  open,
  editLabel,
  doneLabel,
  onToggle,
}: {
  title: string;
  open: boolean;
  editLabel: string;
  doneLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-xl text-navy-800">{title}</h2>
      <button type="button" className="text-sm font-semibold text-navy-800 underline" onClick={onToggle}>
        {open ? doneLabel : editLabel}
      </button>
    </div>
  );
}

function VerifiedFacts({ profile, locale }: { profile: ContractorProfile; locale: string }) {
  const { t } = useI18n();
  const empty = t('verify.emptyValue');
  const when = profile.reviewedAt
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(profile.reviewedAt))
    : empty;
  const rows = [
    [t('verify.businessName'), profile.businessName],
    [t('verify.representative'), profile.representativeName],
    [t('verify.email'), profile.contactEmail],
    [t('publicProfile.verifiedPhone'), profile.contactPhone],
    [t('verify.statusLabel'), t(profile.verificationStatus === 'APPROVED' ? 'verify.approved' : 'verify.review')],
    [t('verify.reviewedOn'), when],
    [t('verify.representativeId'), profile.documents?.some((doc) => doc.type === 'CCCD_FRONT' || doc.type === 'CCCD_BACK' || doc.type === 'ID_CARD') ? t('verify.docsReady') : t('verify.docsMissing')],
    [t('docType.BUSINESS_LICENSE'), profile.documents?.some((doc) => doc.type === 'BUSINESS_LICENSE') ? t('verify.docsReady') : t('verify.docsMissing')],
  ];
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-navy-800">{value || empty}</dd>
        </div>
      ))}
    </dl>
  );
}

function openBrand(
  profile: PublicContractorProfile,
  key: 'avatar' | 'logo' | 'coverImage',
  translate: (path: string) => string
) {
  const slides: ViewerSlide[] = [
    profile.avatar ? { src: profile.avatar, alt: translate('viewer.avatarAlt') } : null,
    profile.logo ? { src: profile.logo, alt: translate('viewer.logoAlt') } : null,
    profile.coverImage ? { src: profile.coverImage, alt: translate('viewer.coverAlt') } : null,
  ].filter((item): item is ViewerSlide => Boolean(item));
  const start = slides.findIndex((item) => item.src === profile[key]);
  return { slides, index: Math.max(0, start) };
}

function BrandSlot({
  label,
  changeLabel,
  emptyLabel,
  src,
  alt,
  fit,
  frameClassName,
  onOpen,
  onPick,
}: {
  label: string;
  changeLabel: string;
  emptyLabel: string;
  src: string;
  alt: string;
  fit: 'cover' | 'thumbnail' | 'logo';
  frameClassName: string;
  onOpen: () => void;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink-800">{label}</p>
      <MediaFrame
        src={src}
        alt={alt}
        fit={fit}
        frameClassName={frameClassName}
        onOpen={src ? onOpen : undefined}
        empty={<span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-ink-400">{emptyLabel}</span>}
      />
      <label className="inline-flex cursor-pointer text-sm font-semibold text-navy-800 underline">
        {changeLabel}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => onPick(event.target.files?.[0])} />
      </label>
    </div>
  );
}

function PhotoGrid({
  urls,
  altFor,
  removeLabel,
  earlierLabel,
  laterLabel,
  onOpen,
  onMove,
  onRemove,
}: {
  urls: string[];
  altFor: (n: number) => string;
  removeLabel: string;
  earlierLabel: string;
  laterLabel: string;
  onOpen: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  if (!urls.length) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="space-y-2">
          <MediaFrame
            src={url}
            alt={altFor(index + 1)}
            fit="thumbnail"
            frameClassName="aspect-[4/3] rounded-2xl"
            onOpen={() => onOpen(index)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-xs font-semibold text-navy-800 disabled:opacity-40" disabled={index === 0} onClick={() => onMove(index, -1)}>{earlierLabel}</button>
            <button type="button" className="text-xs font-semibold text-navy-800 disabled:opacity-40" disabled={index === urls.length - 1} onClick={() => onMove(index, 1)}>{laterLabel}</button>
            <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onRemove(index)}>{removeLabel}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
