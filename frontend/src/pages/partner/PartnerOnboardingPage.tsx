import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { goBackOrFallback } from '@/lib/navigation';
import { Check } from 'lucide-react';
import { LockedAccountFields } from '@/features/operating-hours/LockedAccountFields';
import { OperatingHoursEditor } from '@/features/operating-hours/OperatingHoursEditor';
import {
  normalizeWeeklyHours,
  unsetHours,
  weeklyHoursError,
  type WeeklyHours,
} from '@/features/operating-hours/weeklyHours';
import { Logo } from '@/components/brand/Logo';
import { FormLabel } from '@/components/ui/FormLabel';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ContractorPortfolioUpload } from '@/components/partner/ContractorPortfolioUpload';
import { ContractorServiceSelector } from '@/components/partner/ContractorServiceSelector';
import { StoreCategorySelector } from '@/components/partner/StoreCategorySelector';
import { VerificationDocThumb } from '@/components/partner/VerificationDocThumb';
import { isContractorService, mergeServiceStatus, registeredServiceId, type ContractorServicePick } from '@/data/contractor-services';
import {
  isMaterialCategoryPick,
  mergeMaterialCategories,
  picksFromStoredNames,
  type MaterialCategoryPick,
} from '@/data/material-categories';
import { getDefaultRouteByRole, homeForUser, useAuth } from '@/context/AuthContext';
import {
  maxReachableStep,
  mergeCompleted,
  normalizeCompleted,
  pruneCompleted,
  recoverCompleted,
  restoreOnboardingStep,
  sameCompleted,
  stepStatus,
} from '@/pages/partner/onboarding-steps';
import { api, getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { contractorApi, materialStoreApi, mediaUrl } from '@/lib/partner-api';
import { ContractorEkycWizard } from '@/features/ekyc/ContractorEkycWizard';
import { ekycApi, type EkycRecord } from '@/features/ekyc/ekyc.api';
import { readPartnerNav, writePartnerNav } from '@/features/ekyc/ekycNav';
import { PartnerOnboardingLocationStep } from '@/features/map/components/PartnerOnboardingLocationStep';
import { hasCoordinates } from '@/features/map/lib/location';
import type { LocationSource } from '@/features/map/types';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { ContractorProfile, DocumentType, VerificationDocument } from '@/types/partner';
import type { ApiResponse } from '@/types/user';

const DOC_BYTES = 8 * 1024 * 1024;
const DOC_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

type Draft = {
  businessName: string;
  representativeName: string;
  contactPhone: string;
  contactEmail: string;
  workerCount: string;
  taxCode: string;
  yearsExperience: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  locationConfirmed: boolean;
  locationSource?: LocationSource;
  providerRefId?: string | null;
  description: string;
  weeklyHours: WeeklyHours;
};

type StoredDraft = Draft & {
  services: string[];
  materialCategories?: MaterialCategoryPick[];
  crewServices: ContractorServicePick[];
  agreed: boolean;
  accurate?: boolean;
  completed?: boolean[];
  step?: number;
};

type PolicyDoc = { id: string; title: string; content: string; version: string };

const emptyDraft: Draft = {
  businessName: '',
  representativeName: '',
  contactPhone: '',
  contactEmail: '',
  workerCount: '',
  taxCode: '',
  yearsExperience: '',
  address: '',
  city: '',
  lat: null,
  lng: null,
  locationConfirmed: false,
  locationSource: undefined,
  providerRefId: undefined,
  description: '',
  weeklyHours: unsetHours(),
};

function storageKey(userId: string) {
  return `buildmate-onboarding-${userId}`;
}

function readLocal(userId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed.businessName !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function inputClass(ok: boolean, touched: boolean) {
  return cn(
    'mt-1.5 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20',
    !touched ? 'border-navy-800/12' : ok ? 'border-emerald-500' : 'border-red-400'
  );
}

export default function PartnerOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout, refreshUser } = useAuth();
  const { t, locale } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const storeOwner = currentUser?.role === 'MATERIAL_STORE_OWNER';
  const partnerApi = storeOwner ? materialStoreApi : contractorApi;

  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [storeCategories, setStoreCategories] = useState<MaterialCategoryPick[]>([]);
  const [crewServices, setCrewServices] = useState<ContractorServicePick[]>([]);
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [completed, setCompleted] = useState<boolean[]>(() => normalizeCompleted(null));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<PolicyDoc | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyFailed, setPolicyFailed] = useState(false);
  const [policyNonce, setPolicyNonce] = useState(0);
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [ekyc, setEkyc] = useState<EkycRecord | null>(null);
  const [ekycNonce, setEkycNonce] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const statusRef = useRef(profile?.verificationStatus);
  statusRef.current = profile?.verificationStatus;

  const steps = useMemo(
    () => [
      { id: 'basic', label: t('auth.onboardStepBasic'), lead: t('auth.onboardBasicLead') },
      {
        id: 'service',
        label: t(storeOwner ? 'auth.onboardStepCategory' : 'auth.onboardStepService'),
        lead: t(storeOwner ? 'auth.onboardStoreCategoryLead' : 'auth.onboardServiceLead'),
      },
      { id: 'images', label: t('auth.onboardStepImages'), lead: t('auth.onboardImagesLead') },
      { id: 'location', label: t('auth.onboardStepLocation'), lead: t('auth.onboardLocationLead') },
      { id: 'verify', label: t('auth.onboardStepVerify'), lead: t(storeOwner ? 'auth.onboardVerifyLeadStore' : 'auth.onboardVerifyLead') },
      { id: 'terms', label: t('auth.onboardStepTerms'), lead: t('auth.onboardTermsLead') },
    ],
    [t, storeOwner]
  );

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    const local = readLocal(currentUser.id);
    partnerApi
      .workspace()
      .then((res) => {
        if (cancelled) return;
        const next = res.data.data.profile;
        setProfile(next);
        const nextLat = next?.lat !== undefined && next?.lat !== null && Number.isFinite(Number(next.lat)) ? Number(next.lat) : null;
        const nextLng = next?.lng !== undefined && next?.lng !== null && Number.isFinite(Number(next.lng)) ? Number(next.lng) : null;
        const base: StoredDraft = {
          businessName: next?.businessName || '',
          representativeName: next?.representativeName || '',
          contactPhone:
            (typeof currentUser.phoneNumber === 'string' ? currentUser.phoneNumber : '') ||
            currentUser.phone ||
            '',
          contactEmail: currentUser.email || '',
          workerCount: next?.workerCount ? String(next.workerCount) : '',
          taxCode: next?.taxCode || '',
          yearsExperience: next?.yearsExperience ? String(next.yearsExperience) : '',
          address: next?.address || '',
          city: next?.city || '',
          lat: nextLat,
          lng: nextLng,
          locationConfirmed: next?.locationConfirmed === true,
          locationSource: next?.locationSource as LocationSource | undefined,
          providerRefId: next?.providerRefId || undefined,
          description: next?.description || '',
          weeklyHours: normalizeWeeklyHours(next?.weeklyHours),
          services: next?.serviceAreas || [],
          materialCategories: (next?.materialCategories || []).filter(isMaterialCategoryPick),
          crewServices: (next?.services || []).filter(isContractorService),
          agreed: false,
        };
        const localLat = local && local.lat !== undefined && local.lat !== null && Number.isFinite(Number(local.lat)) ? Number(local.lat) : undefined;
        const localLng = local && local.lng !== undefined && local.lng !== null && Number.isFinite(Number(local.lng)) ? Number(local.lng) : undefined;
        const source: StoredDraft = local
          ? {
              ...base,
              ...local,
              representativeName: 'representativeName' in local ? local.representativeName : base.representativeName,
              contactPhone: base.contactPhone,
              contactEmail: base.contactEmail,
              workerCount: 'workerCount' in local ? local.workerCount : base.workerCount,
              yearsExperience: local.yearsExperience || base.yearsExperience,
              lat: localLat !== undefined ? localLat : base.lat,
              lng: localLng !== undefined ? localLng : base.lng,
              locationConfirmed: local.locationConfirmed !== undefined ? Boolean(local.locationConfirmed) : Boolean(base.locationConfirmed),
              locationSource: local.locationSource || base.locationSource,
              providerRefId: local.providerRefId || base.providerRefId,
              materialCategories:
                'materialCategories' in local && Array.isArray(local.materialCategories)
                  ? mergeMaterialCategories(local.materialCategories.filter(isMaterialCategoryPick), base.materialCategories || [])
                  : base.materialCategories,
              crewServices:
                'crewServices' in local && Array.isArray(local.crewServices)
                  ? mergeServiceStatus(local.crewServices.filter(isContractorService), base.crewServices)
                  : base.crewServices,
            }
          : base;
        setDraft({
          businessName: source.businessName,
          representativeName: source.representativeName,
          contactPhone: source.contactPhone,
          contactEmail: source.contactEmail,
          workerCount: source.workerCount,
          taxCode: source.taxCode,
          yearsExperience: source.yearsExperience,
          address: source.address,
          city: source.city,
          lat: source.lat ?? null,
          lng: source.lng ?? null,
          locationConfirmed: Boolean(source.locationConfirmed),
          locationSource: source.locationSource,
          providerRefId: source.providerRefId,
          description: source.description,
          weeklyHours: source.weeklyHours?.configured ? normalizeWeeklyHours(source.weeklyHours) : base.weeklyHours,
        });
        const restoredCategories = source.materialCategories?.length
          ? source.materialCategories
          : picksFromStoredNames(Array.isArray(source.services) ? source.services : []);
        setStoreCategories(restoredCategories);
        setCrewServices(source.crewServices);
        const backendCompleted = normalizeCompleted(next?.completedSteps);
        const localCompleted = normalizeCompleted(local && Array.isArray(local.completed) ? local.completed : null);
        const initialCompleted = mergeCompleted(backendCompleted, localCompleted);
        setCompleted(initialCompleted);
        setAgreed(local ? Boolean(source.agreed) : Boolean(initialCompleted[5]));
        setAccurate(local ? Boolean(local.accurate) : Boolean(initialCompleted[5]));
        const nav = readPartnerNav(currentUser.id);
        const restored = restoreOnboardingStep(nav?.onboardingStep, local?.step, initialCompleted);
        setStep(restored);
        setWizardOpen(nav?.wizardOpen === true && restored === 4);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [partnerApi, currentUser?.id]);

  useEffect(() => {
    if (!ready || !currentUser?.id) return;
    const payload: StoredDraft = {
      ...draft,
      services: storeCategories.map((item) => item.name),
      materialCategories: storeCategories,
      crewServices,
      agreed,
      accurate,
      completed,
      step,
    };
    localStorage.setItem(storageKey(currentUser.id), JSON.stringify(payload));
  }, [ready, currentUser?.id, draft, storeCategories, crewServices, agreed, accurate, completed, step]);

  useEffect(() => {
    if (step !== 5) return;
    let cancelled = false;
    setPolicyLoading(true);
    setPolicyFailed(false);
    api
      .get<ApiResponse<PolicyDoc>>('/policies/active', {
        params: {
          type: 'TERMS_OF_SERVICE',
          language: locale,
        },
        silent: true,
      })
      .then(({ data }) => {
        if (!cancelled) setPolicy(data.data);
      })
      .catch(() => {
        if (!cancelled) {
          setPolicy(null);
          setPolicyFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setPolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, locale, policyNonce]);

  const documents = profile?.documents || [];
  const portfolioDocs = documents.filter((doc) => doc.type === 'PORTFOLIO' || doc.type === 'STORE_IMAGE');
  const requiredDocs: DocumentType[] = storeOwner
    ? ['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE']
    : ['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'CERTIFICATE'];
  const docByType = (type: DocumentType) => documents.find((doc) => doc.type === type);
  const cccdFrontOk = Boolean(docByType('CCCD_FRONT'));
  const cccdBackOk = Boolean(docByType('CCCD_BACK'));
  const licenseOk = Boolean(docByType('BUSINESS_LICENSE'));
  const certificateOk = Boolean(docByType('CERTIFICATE'));
  const providedDocs = requiredDocs.filter((type) => documents.some((doc) => doc.type === type)).length;

  const nameOk = draft.businessName.trim().length >= 2;
  const aboutOk = draft.description.trim().length >= 10;
  const repOk = draft.representativeName.trim().length >= 2;
  const descriptionOk = draft.description.trim().length >= 1;
  const yearsValue = Number(draft.yearsExperience);
  const yearsOk = draft.yearsExperience !== '' && Number.isInteger(yearsValue) && yearsValue >= 0 && yearsValue <= 80;
  const workersValue = Number(draft.workerCount);
  const workersOk = /^\d+$/.test(draft.workerCount) && workersValue >= 1 && workersValue <= 500;
  const phoneOk = Boolean(draft.contactPhone);
  const emailOk = Boolean(draft.contactEmail);
  const hoursOk = !weeklyHoursError(draft.weeklyHours);
  const crewOk = nameOk && repOk && phoneOk && emailOk && descriptionOk && yearsOk && workersOk && hoursOk;
  const rejectedCrewService = !storeOwner && crewServices.some((item) => item.status === 'REJECTED');
  const serviceOk = storeOwner ? storeCategories.length >= 1 && storeCategories.length <= 12 : crewServices.length >= 1 && !rejectedCrewService;
  const avatarOk = Boolean(profile?.portfolio?.avatar);
  const logoOk = Boolean(profile?.portfolio?.teamLogo);
  const workshopOk = Boolean(profile?.portfolio?.workshop);
  const registeredServices = profile?.services?.length ? profile.services : crewServices;
  const projectProblem = (profile?.portfolio?.projects || []).find((project) => {
    const known = registeredServices.some((item) => registeredServiceId(item) === project.serviceId);
    return !known || !project.description.trim() || project.images.length < 1 || project.images.length > 4;
  });
  const projectsOk = !projectProblem;
  const imagesOk = storeOwner ? portfolioDocs.length >= 1 : avatarOk && logoOk && workshopOk && projectsOk;
  const addressOk = draft.address.trim().length >= 4;
  const cityOk = draft.city.trim().length >= 2;
  const coordsOk = hasCoordinates(draft.lat, draft.lng);
  const locationConfirmedOk = draft.locationConfirmed === true;
  const locationStepOk = addressOk && cityOk && coordsOk && locationConfirmedOk;
  const verifyOk = requiredDocs.every((type) => documents.some((doc) => doc.type === type)) && ekyc?.status === 'SUBMITTED';
  const dataValid = useMemo(
    () => [
      storeOwner ? nameOk && aboutOk && hoursOk : crewOk,
      serviceOk,
      imagesOk,
      locationStepOk,
      verifyOk,
      agreed && accurate,
    ],
    [storeOwner, nameOk, aboutOk, hoursOk, crewOk, serviceOk, imagesOk, locationStepOk, verifyOk, agreed, accurate]
  );
  const settled = useMemo(() => recoverCompleted(completed, dataValid, step), [completed, dataValid, step]);

  useEffect(() => {
    if (!sameCompleted(completed, settled)) setCompleted(settled);
  }, [completed, settled]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    let cancelled = false;
    ekycApi.current()
      .then((row) => {
        if (!cancelled) setEkyc(row);
      })
      .catch(() => {
        if (!cancelled) setEkyc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, ekycNonce]);

  useEffect(() => {
    if (!ready || !profile) return;
    if (statusRef.current === 'SUBMITTED' || statusRef.current === 'APPROVED') return;
    if (draft.businessName.trim().length < 2) return;
    if (sameCompleted(normalizeCompleted(profile.completedSteps), settled)) return;
    const timer = window.setTimeout(() => {
      void persistPartialRef.current();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, profile, settled, draft.businessName]);

  useEffect(() => {
    if (!ready || !profile) return;
    const nav = currentUser?.id ? readPartnerNav(currentUser.id) : null;
    const max = Math.max(maxReachableStep(settled), nav?.onboardingStep ?? 0);
    if (step > max) setStep(max);
  }, [ready, profile, settled, step, currentUser?.id]);

  useEffect(() => {
    if (!ready || !currentUser?.id) return;
    const current = readPartnerNav(currentUser.id);
    writePartnerNav(currentUser.id, {
      onboardingStep: step,
      wizardOpen,
      ekycStep: current?.ekycStep || 1,
    });
  }, [ready, currentUser?.id, step, wizardOpen]);

  const persistPartialRef = useRef<() => Promise<boolean>>(async () => false);
  const projectSync = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!ready || storeOwner) return;
    if (statusRef.current === 'SUBMITTED' || statusRef.current === 'APPROVED') return;
    if (draft.businessName.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      void persistPartialRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [ready, storeOwner, draft, crewServices]);

  useEffect(() => {
    if (!ready || !storeOwner) return;
    if (statusRef.current === 'SUBMITTED' || statusRef.current === 'APPROVED') return;
    if (draft.businessName.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      void persistPartialRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [ready, storeOwner, storeCategories, draft.businessName]);

  if (currentUser?.profileStatus === 'APPROVED' || profile?.verificationStatus === 'APPROVED') {
    return <Navigate to={homeForUser({ ...currentUser, profileStatus: 'APPROVED' })} replace />;
  }

  const waiting =
    currentUser?.profileStatus === 'PENDING_APPROVAL' ||
    currentUser?.profileStatus === 'SUBMITTED' ||
    profile?.verificationStatus === 'SUBMITTED';

  if (waiting) {
    return <Navigate to="/partner/onboarding/status" replace />;
  }

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched((current) => ({ ...current, [key]: true }));
  }

  function unmetMessage() {
    if (step === 0 && storeOwner && !nameOk) return t('auth.onboardNameRequired');
    if (step === 0 && storeOwner && !aboutOk) return t('auth.onboardAboutRequired');
    if (step === 0 && !storeOwner && !nameOk) return t('auth.onboardTeamRequired');
    if (step === 0 && !storeOwner && !repOk) return t('auth.onboardRepresentativeRequired');
    if (step === 0 && !storeOwner && !phoneOk) return t('auth.phoneLength');
    if (step === 0 && !storeOwner && !emailOk) return t('auth.emailRequired');
    if (step === 0 && weeklyHoursError(draft.weeklyHours)) return t(weeklyHoursError(draft.weeklyHours));
    if (step === 0 && !storeOwner && !descriptionOk) return t('auth.onboardDescriptionRequired');
    if (step === 0 && !storeOwner && !yearsOk) return t('auth.onboardYearsRequired');
    if (step === 0 && !storeOwner && !workersOk) return t('auth.onboardWorkersRequired');
    if (step === 1 && !serviceOk) {
      return storeOwner ? t('auth.onboardServiceRequired') : rejectedCrewService ? t('auth.onboardCustomRejected') : t('auth.onboardServicePick');
    }
    if (step === 2 && storeOwner && !imagesOk) return t('auth.onboardImageRequired');
    if (step === 2 && !storeOwner && !avatarOk) return t('auth.onboardAvatarRequired');
    if (step === 2 && !storeOwner && !logoOk) return t('auth.onboardLogoRequired');
    if (step === 2 && !storeOwner && !workshopOk) return t('auth.onboardWorkshopRequired');
    if (step === 2 && !storeOwner && projectProblem) {
      const known = registeredServices.some((item) => registeredServiceId(item) === projectProblem.serviceId);
      if (!known) return t('auth.projectTypeRequired');
      if (!projectProblem.description.trim()) return t('auth.projectDescriptionRequired');
      if (projectProblem.images.length > 4) return t('auth.projectImageMax');
      return t('auth.projectImageRequired');
    }
    if (step === 3 && !addressOk) return t('auth.onboardAddressRequired');
    if (step === 3 && !cityOk) return t('auth.onboardCityRequired');
    if (step === 3 && !coordsOk) return t('auth.onboardCoordsRequired');
    if (step === 3 && !locationConfirmedOk) return t('auth.onboardLocationConfirmRequired');
    if (step === 4 && ekyc?.status !== 'SUBMITTED') return t('ekyc.needSubmit');
    if (step === 4 && !cccdFrontOk) return t('auth.onboardCccdFrontRequired');
    if (step === 4 && !cccdBackOk) return t('auth.onboardCccdBackRequired');
    if (step === 4 && !licenseOk) return t('auth.onboardLicenseRequired');
    if (step === 4 && !storeOwner && !certificateOk) return t('auth.onboardCertificateRequired');
    if (step === 5 && !settled.slice(0, 5).every(Boolean)) return t('auth.onboardFinishSteps');
    if (step === 5 && !agreed) return t('auth.onboardTermsRequired');
    if (step === 5 && !accurate) return t('auth.onboardAccurateRequired');
    return '';
  }

  function revealStep(index: number) {
    const keys =
      index === 0
        ? storeOwner
          ? ['businessName', 'description']
          : ['businessName', 'representativeName', 'contactPhone', 'contactEmail', 'description', 'yearsExperience', 'workerCount']
        : index === 1
          ? ['services']
          : index === 2
            ? ['images']
            : index === 3
              ? ['address', 'city']
              : index === 4
                ? ['documents']
                : ['agreed', 'accurate'];
    setTouched((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });
  }

  function focusInvalid(index: number) {
    const id =
      index === 0 && storeOwner
        ? !nameOk
          ? 'onboard-businessName'
          : 'onboard-description'
        : index === 0
          ? !nameOk
            ? 'onboard-businessName'
            : !repOk
              ? 'onboard-representativeName'
              : !phoneOk
                ? 'account-phone'
                : !emailOk
                  ? 'account-email'
                  : !hoursOk
                    ? 'hours-editor'
                    : !descriptionOk
                    ? 'onboard-description'
                    : !yearsOk
                      ? 'onboard-years'
                      : 'onboard-workers'
          : index === 1
            ? 'onboard-services'
            : index === 2
              ? storeOwner
                ? 'onboard-images'
                : !avatarOk
                  ? 'onboard-avatar'
                  : !logoOk
                    ? 'onboard-teamLogo'
                    : !workshopOk
                      ? 'onboard-workshop'
                      : projectProblem
                        ? `onboard-project-${projectProblem.id}`
                        : 'onboard-projects'
              : index === 3
                ? !addressOk
                  ? 'onboard-address'
                  : !cityOk
                    ? 'onboard-city'
                    : 'onboard-confirm-location'
                : index === 4
                  ? ekyc?.status !== 'SUBMITTED'
                    ? 'onboard-ekyc'
                    : !licenseOk
                      ? 'onboard-license'
                      : 'onboard-certificate'
                  : !agreed
                    ? 'onboard-terms'
                    : 'onboard-accurate';
    const node = document.getElementById(id);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (node instanceof HTMLElement) node.focus();
  }

  function profileBody(full: boolean, steps: boolean[] = settled) {
    const body: Partial<ContractorProfile> = {
      businessName: draft.businessName.trim(),
      taxCode: draft.taxCode.trim(),
      description: draft.description.trim(),
      representativeName: draft.representativeName.trim(),
      completedSteps: steps,
    };
    if (draft.yearsExperience !== '' && yearsOk) body.yearsExperience = yearsValue;
    body.weeklyHours = draft.weeklyHours;
    if (workersOk) body.workerCount = workersValue;
    if (storeOwner) {
      if (storeCategories.length || full) {
        const picks = storeCategories.slice(0, 12).map((item) => ({
          name: item.name,
          type: item.type,
          categoryId: item.categoryId || null,
          status: item.status,
        }));
        body.materialCategories = picks;
        body.serviceAreas = picks.map((item) => item.name);
      }
    } else {
      body.services = crewServices;
    }
    if (draft.city.trim()) body.city = draft.city.trim();
    if (full || addressOk) body.address = draft.address.trim();
    if (hasCoordinates(draft.lat, draft.lng)) {
      body.lat = Number(draft.lat);
      body.lng = Number(draft.lng);
      body.locationConfirmed = Boolean(draft.locationConfirmed);
      if (draft.locationSource) body.locationSource = draft.locationSource;
      if (draft.providerRefId) body.providerRefId = draft.providerRefId;
    }
    return body;
  }

  async function persistPartial(steps: boolean[] = settled) {
    if (draft.businessName.trim().length < 2) return false;
    if (weeklyHoursError(draft.weeklyHours)) return false;
    if (statusRef.current === 'SUBMITTED' || statusRef.current === 'APPROVED') return true;
    setAutoState('saving');
    try {
      const { data } = await partnerApi.saveProfile(profileBody(false, steps));
      setProfile(data.data);
      setError('');
      setAutoState('saved');
      return true;
    } catch (err) {
      setAutoState('idle');
      setError(getApiErrorMessage(err));
      return false;
    }
  }

  persistPartialRef.current = persistPartial;

  async function saveDraft(steps: boolean[] = settled) {
    const body = profileBody(true, steps);
    if ((body.businessName || '').length < 2 || (body.address || '').length < 4) {
      setError(t('auth.onboardRequired'));
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await partnerApi.saveProfile(body);
      setProfile(data.data);
      await refreshUser();
      pushToast({ kind: 'success', title: t('auth.onboardSaved') });
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function verificationFileError(file: File) {
    const name = file.name.toLowerCase();
    const type = file.type
      || (name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : '')
      || (name.endsWith('.png') ? 'image/png' : '')
      || (name.endsWith('.webp') ? 'image/webp' : '')
      || (name.endsWith('.pdf') ? 'application/pdf' : '');
    if (file.size > DOC_BYTES || !DOC_TYPES.has(type)) return t('auth.onboardFileInvalid');
    return '';
  }

  async function uploadFiles(list: FileList | null, type: DocumentType, imagesOnly: boolean) {
    const files = Array.from(list || []);
    if (!files.length) return;
    if (imagesOnly) {
      const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const invalid = files.some((file) => {
        const name = file.name.toLowerCase();
        const typeFromName = name.endsWith('.jpg') || name.endsWith('.jpeg')
          ? 'image/jpeg'
          : name.endsWith('.png')
            ? 'image/png'
            : name.endsWith('.webp')
              ? 'image/webp'
              : '';
        return file.size > DOC_BYTES || !imageMimeTypes.has(file.type || typeFromName);
      });
      if (invalid) {
        setError(t('auth.onboardFileInvalid'));
        return;
      }
      if (storeOwner && (profile?.documents.length || 0) + files.length > 8) {
        setError(t('auth.onboardDocumentLimit'));
        return;
      }
    } else {
      const invalid = files.map((file) => verificationFileError(file)).find(Boolean);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        const { data } = await partnerApi.uploadDocument(file, type);
        setProfile(data.data);
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: string) {
    setBusy(true);
    setError('');
    try {
      const { data } = await partnerApi.removeDocument(id);
      setProfile(data.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function continueStep() {
    if (busy || step >= steps.length - 1) return;
    if (!dataValid[step]) {
      revealStep(step);
      setError(unmetMessage());
      focusInvalid(step);
      return;
    }
    try {
      await projectSync.current?.();
    } catch {
      return;
    }
    const next = settled.slice();
    next[step] = true;
    const savedSteps = pruneCompleted(next, dataValid);
    setError('');
    if (draft.businessName.trim().length >= 2) {
      const saved = step === 3 ? await saveDraft(savedSteps) : await persistPartial(savedSteps);
      if (!saved) return;
    }
    setCompleted(savedSteps);
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function submit() {
    if (busy || !settled.every(Boolean)) {
      revealStep(step);
      setError(unmetMessage());
      focusInvalid(step);
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await partnerApi.submit();
      setProfile(data.data);
      if (currentUser?.id) localStorage.removeItem(storageKey(currentUser.id));
      await refreshUser();
      pushToast({ kind: 'success', title: t('auth.onboardSubmitted') });
      navigate('/partner/onboarding/status', { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const hint = unmetMessage();

  return (
<<<<<<< HEAD
    <div className="min-h-screen bg-paper-100">
      <header className="sticky top-0 z-20 border-b border-navy-800/8 bg-paper-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
=======
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-paper-100">
      <header className="z-20 shrink-0 border-b border-navy-800/8 bg-paper-100/90 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10 2xl:px-14">
>>>>>>> main
          <Logo to={getDefaultRouteByRole(currentUser)} />
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher variant="light" placement="auth-form" />
            <button type="button" className="text-sm font-semibold text-navy-800" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
              {t('auth.onboardLogout')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10 2xl:px-14">
        <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.onboardEyebrow')}</p>
        <h1 className="mt-2 font-display text-3xl text-navy-800 sm:text-4xl">{t('auth.onboardTitle')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-400">{t('auth.onboardLead')}</p>

        <div className="mt-6 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1">
            <nav aria-label={t('auth.onboardEyebrow')} className="lg:sticky lg:top-24 lg:self-start">
              <p className="mb-3 text-sm font-semibold text-navy-800 lg:hidden">
                {t('auth.onboardProgress', { current: step + 1, total: steps.length })}
              </p>
              <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
                {steps.map((item, index) => {
                  const status = stepStatus(index, step, settled);
                  const current = status === 'CURRENT';
                  const open = index <= maxReachableStep(settled);
                  return (
                    <li key={item.id} className="relative lg:pb-1">
                      {index < steps.length - 1 ? (
                        <span className="absolute left-[17px] top-9 hidden h-[calc(100%-8px)] w-px bg-navy-800/10 lg:block" />
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || !open}
                        aria-current={current ? 'step' : undefined}
                        onClick={() => {
                          if (open) setStep(index);
                        }}
                        className={cn(
                          'flex w-9 items-center justify-center text-left lg:w-full lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-2 lg:py-2',
                          current && 'lg:bg-white lg:shadow-card',
                          !open && 'cursor-default opacity-70'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                            status === 'COMPLETED' ? 'bg-emerald-600 text-white' : status === 'CURRENT' ? 'bg-navy-800 text-white' : 'border border-navy-800/15 bg-white text-ink-400',
                            current && 'ring-4 ring-copper-400/25'
                          )}
                        >
                          {status === 'COMPLETED' ? <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden /> : status === 'CURRENT' ? index + 1 : null}
                        </span>
                        <span className="hidden text-sm font-semibold text-navy-800 lg:block">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-navy-800/10 lg:hidden">
                <div className="h-full bg-copper-500 transition-all" style={{ width: `${(step / (steps.length - 1)) * 100}%` }} />
              </div>
            </nav>

            <section className="min-h-0 overflow-y-auto overscroll-contain rounded-[28px] border border-navy-800/8 bg-white p-5 shadow-card sm:p-8">
              {profile?.verificationStatus === 'REJECTED' && profile.rejectionReason ? (
                <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {t('auth.onboardRejected')}: {profile.rejectionReason}
                </p>
              ) : null}

              <h2 className="font-display text-2xl text-navy-800">{steps[step].label}</h2>
              <p className="mt-1 text-sm text-ink-400">
                {step === 0 && !storeOwner
                  ? t('auth.onboardCrewLead')
                  : step === 1 && !storeOwner
                    ? t('auth.onboardCrewServiceLead')
                    : step === 2 && !storeOwner
                      ? t('auth.onboardCrewPortfolioLead')
                      : steps[step].lead}
              </p>
              <p className="mt-2 text-xs text-ink-400">{t('auth.onboardRequiredNote')}</p>

              {step === 0 && !storeOwner ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <FormLabel required>{t('auth.onboardTeam')}</FormLabel>
                    <input
                      id="onboard-businessName"
                      className={inputClass(nameOk, Boolean(touched.businessName))}
                      maxLength={100}
                      value={draft.businessName}
                      onChange={(event) => patch('businessName', event.target.value)}
                    />
                    {touched.businessName && !nameOk ? <span className="mt-1 block text-xs font-normal text-red-600">{t('auth.onboardTeamRequired')}</span> : null}
                  </label>
                  <label className="block">
                    <FormLabel required>{t('auth.onboardRepresentative')}</FormLabel>
                    <input
                      id="onboard-representativeName"
                      className={inputClass(repOk, Boolean(touched.representativeName))}
                      maxLength={100}
                      value={draft.representativeName}
                      onChange={(event) => patch('representativeName', event.target.value)}
                    />
                    {touched.representativeName && !repOk ? <span className="mt-1 block text-xs font-normal text-red-600">{t('auth.onboardRepresentativeRequired')}</span> : null}
                  </label>
                  <div className="sm:col-span-2">
                    <LockedAccountFields phone={draft.contactPhone} email={draft.contactEmail} />
                  </div>
                  <label className="block sm:col-span-2">
                    <FormLabel required>{t('auth.onboardDescription')}</FormLabel>
                    <textarea
                      id="onboard-description"
                      className={inputClass(descriptionOk, Boolean(touched.description))}
                      rows={4}
                      maxLength={1200}
                      value={draft.description}
                      onChange={(event) => patch('description', event.target.value)}
                    />
                    {touched.description && !descriptionOk ? <span className="mt-1 block text-xs font-normal text-red-600">{t('auth.onboardDescriptionRequired')}</span> : null}
                  </label>
                  <label className="block">
                    <FormLabel required>{t('auth.onboardYears')}</FormLabel>
                    <input
                      id="onboard-years"
                      className={inputClass(yearsOk, Boolean(touched.yearsExperience))}
                      type="number"
                      min={0}
                      max={80}
                      inputMode="numeric"
                      value={draft.yearsExperience}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === '' || (/^\d+$/.test(raw) && Number(raw) <= 80)) patch('yearsExperience', raw);
                      }}
                    />
                    {touched.yearsExperience && !yearsOk ? <span className="mt-1 block text-xs font-normal text-red-600">{t('auth.onboardYearsRequired')}</span> : null}
                  </label>
                  <label className="block">
                    <FormLabel required>{t('auth.onboardWorkers')}</FormLabel>
                    <input
                      id="onboard-workers"
                      className={inputClass(workersOk, Boolean(touched.workerCount))}
                      type="number"
                      min={1}
                      max={500}
                      inputMode="numeric"
                      value={draft.workerCount}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === '' || (/^\d+$/.test(raw) && Number(raw) <= 500)) patch('workerCount', raw);
                      }}
                    />
                    {touched.workerCount && !workersOk ? <span className="mt-1 block text-xs font-normal text-red-600">{t('auth.onboardWorkersRequired')}</span> : null}
                  </label>
                  <OperatingHoursEditor
                    value={draft.weeklyHours}
                    onChange={(weeklyHours) => patch('weeklyHours', weeklyHours)}
                  />
                  {autoState !== 'idle' ? (
                    <p className="text-xs font-semibold text-ink-400 sm:col-span-2">
                      {autoState === 'saving' ? t('auth.onboardSaving') : t('auth.onboardAutoSaved')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 0 && storeOwner ? (
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <FormLabel required>{t('auth.onboardBusiness')}</FormLabel>
                    <input
                      id="onboard-businessName"
                      className={inputClass(nameOk, Boolean(touched.businessName))}
                      maxLength={100}
                      value={draft.businessName}
                      onChange={(event) => patch('businessName', event.target.value)}
                    />
                    {touched.businessName && !nameOk ? <span className="mt-1 block text-xs text-red-600">{t('auth.onboardNameRequired')}</span> : null}
                  </label>
                  <label className="block">
                    <FormLabel optional={t('auth.onboardOptionalMark')}>{t('auth.onboardTax')}</FormLabel>
                    <input className={inputClass(true, false)} maxLength={30} value={draft.taxCode} onChange={(event) => patch('taxCode', event.target.value)} />
                  </label>
                  <label className="block">
                    <FormLabel required>{t('auth.onboardAbout')}</FormLabel>
                    <textarea
                      id="onboard-description"
                      className={inputClass(aboutOk, Boolean(touched.description))}
                      rows={4}
                      maxLength={1200}
                      value={draft.description}
                      onChange={(event) => patch('description', event.target.value)}
                    />
                    {touched.description && !aboutOk ? <span className="mt-1 block text-xs text-red-600">{t('auth.onboardAboutRequired')}</span> : null}
                  </label>
                  <LockedAccountFields phone={draft.contactPhone} email={draft.contactEmail} />
                  <OperatingHoursEditor
                    value={draft.weeklyHours}
                    onChange={(weeklyHours) => patch('weeklyHours', weeklyHours)}
                  />
                </div>
              ) : null}

              {step === 1 && !storeOwner ? (
                <div id="onboard-services" className={cn('mt-5', touched.services && !serviceOk && 'rounded-xl ring-1 ring-red-400')}>
                <p className="mb-3">
                  <FormLabel required>{steps[1].label}</FormLabel>
                </p>
                <ContractorServiceSelector
                  selected={crewServices}
                  onChange={(next) => {
                    setTouched((current) => ({ ...current, services: true }));
                    setCrewServices(next);
                  }}
                />
                {touched.services && !serviceOk ? (
                  <p className="mt-3 text-xs text-red-600">
                    {rejectedCrewService ? t('auth.onboardCustomRejected') : t('auth.onboardServicePick')}
                  </p>
                ) : null}
                </div>
              ) : null}

              {step === 1 && storeOwner ? (
<<<<<<< HEAD
                <div className={cn('mt-5', touched.services && !serviceOk && 'rounded-xl ring-1 ring-red-400')}>
=======
                <div className="mt-5">
>>>>>>> main
                  <p className="mb-3">
                    <FormLabel required>{steps[1].label}</FormLabel>
                  </p>
                  <StoreCategorySelector
                    selected={storeCategories}
                    onChange={(next) => {
                      setTouched((current) => ({ ...current, services: true }));
                      setStoreCategories(next);
                    }}
                  />
                  {touched.services && !serviceOk ? <p className="mt-3 text-xs text-red-600">{t('auth.onboardServiceRequired')}</p> : null}
                </div>
              ) : null}

              {step === 2 && !storeOwner ? (
                <div id="onboard-images" tabIndex={-1}>
                <ContractorPortfolioUpload
                  profile={profile}
                  portfolio={profile?.portfolio}
                  services={registeredServices}
                  syncRef={projectSync}
                  disabled={busy}
                  showErrors={Boolean(touched.images)}
                  onProfile={setProfile}
                  onError={setError}
                  errors={{
                    avatar: touched.images && !avatarOk ? t('auth.onboardAvatarRequired') : '',
                    teamLogo: touched.images && !logoOk ? t('auth.onboardLogoRequired') : '',
                    workshop: touched.images && !workshopOk ? t('auth.onboardWorkshopRequired') : '',
                  }}
                />
                </div>
              ) : null}

              {step === 2 && storeOwner ? (
                <div id="onboard-images" tabIndex={-1} className="mt-5 space-y-4">
                  <div>
                  <FormLabel required>{t('auth.onboardPortfolio')}</FormLabel>
                  <p className="mt-1 text-xs text-ink-400">{t('auth.onboardImageHint')}</p>
                  <label className={cn('mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-paper-50 px-4 py-8 text-center text-sm font-medium text-navy-800', touched.images && !imagesOk ? 'border-red-500' : 'border-navy-800/20')}>
                    {t('auth.onboardPortfolio')}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy}
                      onChange={(event) => {
                        void uploadFiles(event.target.files, storeOwner ? 'STORE_IMAGE' : 'PORTFOLIO', true);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {portfolioDocs.map((doc) => (
                      <DocTile key={doc._id} doc={doc} busy={busy} onRemove={() => void removeDoc(doc._id)} removeLabel={t('common.remove')} />
                    ))}
                  </div>
                  {touched.images && !imagesOk ? <p className="text-xs text-red-600">{t('auth.onboardImageRequired')}</p> : null}
                </div>
              ) : null}

              {step === 3 ? (
                <PartnerOnboardingLocationStep
                  storeOwner={storeOwner}
                  address={draft.address}
                  city={draft.city}
                  lat={draft.lat}
                  lng={draft.lng}
                  locationConfirmed={draft.locationConfirmed}
                  locationSource={draft.locationSource}
                  providerRefId={draft.providerRefId}
                  touched={touched}
                  disabled={busy}
                  onChange={(patchData) => {
                    setDraft((current) => ({
                      ...current,
                      ...patchData,
                    }));
                    setTouched((current) => {
                      const next = { ...current };
                      if (patchData.address !== undefined) next.address = true;
                      if (patchData.city !== undefined) next.city = true;
                      return next;
                    });
                  }}
                  onConfirm={() => {
                    setDraft((current) => ({ ...current, locationConfirmed: true }));
                    pushToast({ kind: 'success', title: t('auth.onboardLocationConfirmed') });
                  }}
                />
              ) : null}

              {step === 4 ? (
                <div id="onboard-docs" tabIndex={-1} className="mt-5 space-y-6">
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-navy-800">{t('docType.ID_CARD')}</h3>
                    <div id="onboard-ekyc" tabIndex={-1} className="space-y-3 rounded-2xl border border-navy-800/10 p-4">
                      <p className="text-sm text-ink-500">{t('ekyc.intro')}</p>
                      <p className="text-sm font-semibold text-navy-800">
                        {t('ekyc.statusLabel')}: {t(`ekyc.aiStatus.${ekyc?.status || 'NOT_STARTED'}`)}
                      </p>
                      {ekyc?.retakeReason ? <p className="text-sm text-navy-800">{ekyc.retakeReason}</p> : null}
                      {touched.documents && ekyc?.status !== 'SUBMITTED' ? <p className="text-xs text-red-600">{t('ekyc.needSubmit')}</p> : null}
                      <button type="button" className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => setWizardOpen(true)}>
                        {t('ekyc.open')}
                      </button>
                    </div>
                  </section>
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-navy-800">{t('docType.BUSINESS_LICENSE')}</h3>
                    <VerifySlot
                      id="onboard-license"
                      kind={storeOwner ? 'store' : 'contractor'}
                      required
                      error={touched.documents && !licenseOk ? t('auth.onboardLicenseRequired') : ''}
                      title={t('docType.BUSINESS_LICENSE')}
                      doc={docByType('BUSINESS_LICENSE')}
                      busy={busy}
                      uploadLabel={t('auth.onboardDoc')}
                      uploadedLabel={t('auth.onboardDocUploaded')}
                      missingLabel={t('auth.onboardDocMissing')}
                      removeLabel={t('common.remove')}
                      onUpload={(list) => void uploadFiles(list, 'BUSINESS_LICENSE', false)}
                      onRemove={(id) => void removeDoc(id)}
                    />
                  </section>
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-navy-800">{t('docType.CERTIFICATE')}</h3>
                    {storeOwner ? <p className="text-xs text-ink-400">{t('auth.onboardOptionalCert')}</p> : null}
                    <VerifySlot
                      id="onboard-certificate"
                      kind={storeOwner ? 'store' : 'contractor'}
                      required={!storeOwner}
                      optional={storeOwner ? t('auth.onboardOptionalMark') : undefined}
                      error={touched.documents && !storeOwner && !certificateOk ? t('auth.onboardCertificateRequired') : ''}
                      title={t('docType.CERTIFICATE')}
                      doc={docByType('CERTIFICATE')}
                      busy={busy}
                      uploadLabel={t('auth.onboardDoc')}
                      uploadedLabel={t('auth.onboardDocUploaded')}
                      missingLabel={t('auth.onboardDocMissing')}
                      removeLabel={t('common.remove')}
                      onUpload={(list) => void uploadFiles(list, 'CERTIFICATE', false)}
                      onRemove={(id) => void removeDoc(id)}
                    />
                  </section>
                  <p className="text-sm font-semibold text-navy-800">
                    {t('auth.onboardDocProgress', { done: providedDocs, total: requiredDocs.length })}
                  </p>
                  {touched.documents && !verifyOk ? <p className="text-xs text-red-600">{unmetMessage()}</p> : null}
                </div>
              ) : null}

              {step === 5 ? (
                <div className="mt-5 space-y-4">
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-navy-800/8 bg-paper-50 p-4 text-sm text-navy-800 [&_p]:mb-3">
                    {policyLoading ? <p className="text-ink-400">{t('common.loading')}</p> : null}
                    {policyFailed ? (
                      <div className="space-y-2">
                        <p>{t('auth.policyLoadFail')}</p>
                        <button type="button" className="font-semibold text-copper-500" onClick={() => setPolicyNonce((value) => value + 1)}>
                          {t('feedback.retry')}
                        </button>
                      </div>
                    ) : null}
                    {!policy && !policyLoading && !policyFailed ? <p>{t('auth.policyEmpty')}</p> : null}
                    {policy ? (
                      <>
                        <p className="mb-2 font-semibold">{policy.title}</p>
                        <p className="mb-3 text-xs text-ink-400">{t('auth.policyVersion', { version: policy.version })}</p>
                        <div dangerouslySetInnerHTML={{ __html: policy.content }} />
                      </>
                    ) : null}
                  </div>
                  <label className="flex items-start gap-3 text-sm text-navy-800">
                    <input
                      type="checkbox"
                      id="onboard-terms"
                      className="mt-1 h-4 w-4 accent-navy-800"
                      checked={agreed}
                      onChange={(event) => {
                        setAgreed(event.target.checked);
                        setTouched((current) => ({ ...current, agreed: true }));
                      }}
                    />
                    <FormLabel required>{t('auth.onboardAgreeTerms')}</FormLabel>
                  </label>
                  {touched.agreed && !agreed ? <p className="text-xs text-red-600">{t('auth.onboardTermsRequired')}</p> : null}
                  <label className="flex items-start gap-3 text-sm text-navy-800">
                    <input
                      type="checkbox"
                      id="onboard-accurate"
                      className="mt-1 h-4 w-4 accent-navy-800"
                      checked={accurate}
                      onChange={(event) => {
                        setAccurate(event.target.checked);
                        setTouched((current) => ({ ...current, accurate: true }));
                      }}
                    />
                    <FormLabel required>{t('auth.onboardConfirmAccurate')}</FormLabel>
                  </label>
                  {touched.accurate && !accurate ? <p className="text-xs text-red-600">{t('auth.onboardAccurateRequired')}</p> : null}
                </div>
              ) : null}

              {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              {hint ? <p className="mt-4 text-sm text-ink-400">{hint}</p> : null}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
                {step === 0 ? (
                  <button
                    type="button"
                    className="h-12 flex-1 rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => goBackOrFallback(navigate, location, '/')}
                  >
                    {t('common.back')}
                  </button>
                ) : null}
                {step > 0 ? (
                  <button
                    type="button"
                    className="h-12 flex-1 rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => setStep((value) => value - 1)}
                  >
                    {t('auth.onboardBack')}
                  </button>
                ) : null}
                {step < steps.length - 1 ? (
                  <button
                    type="button"
                    className={cn(
                      'h-12 flex-1 rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60',
                      !dataValid[step] && 'opacity-60'
                    )}
                    disabled={busy || (step === 4 && !verifyOk)}
                    onClick={() => void continueStep()}
                  >
                    {t('auth.onboardNext')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      'h-12 flex-1 rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60',
                      !settled.every(Boolean) && 'opacity-60'
                    )}
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {t('auth.onboardSubmit')}
                  </button>
                )}
              </div>
            </section>
          </div>
      </main>
      {wizardOpen ? (
        <ContractorEkycWizard
          t={t}
          userId={currentUser?.id || ''}
          onboardingStep={step}
          onClose={() => {
            setWizardOpen(false);
            if (currentUser?.id) {
              writePartnerNav(currentUser.id, {
                onboardingStep: step,
                wizardOpen: false,
                ekycStep: readPartnerNav(currentUser.id)?.ekycStep || 1,
              });
            }
            setEkycNonce((value) => value + 1);
          }}
          onFinished={async (record) => {
            setWizardOpen(false);
            if (currentUser?.id) {
              writePartnerNav(currentUser.id, { onboardingStep: step, wizardOpen: false, ekycStep: 6 });
            }
            setEkyc(record);
            setEkycNonce((value) => value + 1);
            const res = await partnerApi.getProfile();
            setProfile(res.data.data);
          }}
        />
      ) : null}
    </div>
  );
}

function VerifySlot({
  id,
  kind,
  title,
  required,
  optional,
  error,
  doc,
  busy,
  uploadLabel,
  uploadedLabel,
  missingLabel,
  removeLabel,
  onUpload,
  onRemove,
}: {
  id: string;
  kind: 'contractor' | 'store';
  title: string;
  required?: boolean;
  optional?: string;
  error?: string;
  doc?: VerificationDocument;
  busy: boolean;
  uploadLabel: string;
  uploadedLabel: string;
  missingLabel: string;
  removeLabel: string;
  onUpload: (list: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div id={id} tabIndex={-1} className={cn('rounded-xl border p-3', error ? 'border-red-400' : 'border-navy-800/10')}>
      <FormLabel required={required} optional={optional}>{title}</FormLabel>
      <label className={cn('mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-paper-50 px-4 py-4 text-center text-sm font-medium text-navy-800', error ? 'border-red-500' : 'border-navy-800/20')}>
        {uploadLabel}
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
          disabled={busy}
          onChange={(event) => {
            onUpload(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        {doc ? <VerificationDocThumb doc={doc} kind={kind} className="h-12 w-12 rounded-xl object-cover" /> : null}
        <span className={`text-sm font-semibold ${doc ? 'text-emerald-700' : 'text-ink-400'}`}>
          {doc ? `✓ ${uploadedLabel}` : `○ ${missingLabel}`}
        </span>
        {doc ? (
          <button type="button" className="ml-auto text-sm font-semibold text-red-600" disabled={busy} onClick={() => onRemove(doc._id)}>
            {removeLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DocTile({
  doc,
  busy,
  onRemove,
  removeLabel,
}: {
  doc: VerificationDocument;
  busy: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-navy-800/8 bg-paper-50">
      <img src={mediaUrl(doc.url)} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-red-600"
      >
        {removeLabel}
      </button>
    </div>
  );
}
