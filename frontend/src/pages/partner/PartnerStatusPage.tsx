import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Clock3, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { useAuth } from '@/context/AuthContext';
import { contractorApi, materialStoreApi } from '@/lib/partner-api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { ContractorProfile } from '@/types/partner';

type Phase = 'review' | 'approved' | 'rejected' | 'draft';
type Mark = 'done' | 'current' | 'wait' | 'rejected';

function phaseOf(profileStatus?: string | null, verification?: string | null): Phase {
  if (verification === 'APPROVED' || profileStatus === 'APPROVED') return 'approved';
  if (verification === 'REJECTED' || profileStatus === 'REJECTED') return 'rejected';
  if (verification === 'SUBMITTED' || profileStatus === 'SUBMITTED' || profileStatus === 'PENDING_APPROVAL') {
    return 'review';
  }
  return 'draft';
}

function formatSubmitted(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'long' }).format(date);
}

export default function PartnerStatusPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { currentUser, logout, refreshUser } = useAuth();
  const { t, locale } = useI18n();
  const storeOwner = currentUser?.role === 'MATERIAL_STORE_OWNER';
  const partnerApi = storeOwner ? materialStoreApi : contractorApi;
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const profileRef = useRef<ContractorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const detail = params.get('view') === 'detail';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const profileRes = await partnerApi.getProfile();
        if (cancelled) return;
        profileRef.current = profileRes.data.data;
        setProfile(profileRes.data.data);
        setError('');
        await refreshUser();
      } catch {
        if (!cancelled && !profileRef.current) setError(t('errors.generic'));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [partnerApi, refreshUser, t]);

  const phase = phaseOf(currentUser?.profileStatus, profile?.verificationStatus);

  useEffect(() => {
    if (loaded && phase === 'draft') {
      navigate('/partner/onboarding', { replace: true });
    }
  }, [loaded, phase, navigate]);

  async function openDashboard() {
    const user = await refreshUser();
    const role = user?.role || currentUser?.role;
    navigate(role === 'MATERIAL_STORE_OWNER' ? '/store/dashboard' : '/contractor/dashboard');
  }

  const partnerLabel = storeOwner ? t('role.MATERIAL_STORE_OWNER') : t('role.CONTRACTOR');
  const submittedLabel = formatSubmitted(profile?.submittedAt, locale);

  return (
    <div className="min-h-screen bg-paper-100">
      <header className="sticky top-0 z-20 border-b border-navy-800/8 bg-paper-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher variant="light" placement="auth-form" />
            <button type="button" className="text-sm font-semibold text-navy-800" onClick={() => void logout()}>
              {t('auth.onboardLogout')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        {!loaded ? <div className="h-80 animate-pulse rounded-[28px] bg-white shadow-card" /> : null}
        {loaded && error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {loaded && phase === 'review' && !detail ? (
          <ReviewOverview onOpenDetail={() => setParams({ view: 'detail' })} />
        ) : null}

        {loaded && phase === 'review' && detail ? (
          <ReviewDetail
            partnerLabel={partnerLabel}
            submittedLabel={submittedLabel}
            onBack={() => setParams({})}
          />
        ) : null}

        {loaded && phase === 'approved' ? (
          <ApprovedState onOpen={() => void openDashboard()} />
        ) : null}

        {loaded && phase === 'rejected' ? (
          <RejectedState
            reason={profile?.rejectionReason || ''}
            profile={profile}
            open={showProfile}
            onToggle={() => setShowProfile((value) => !value)}
          />
        ) : null}
      </main>
    </div>
  );
}

function ReviewOverview({ onOpenDetail }: { onOpenDetail: () => void }) {
  const { t } = useI18n();
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.onboardEyebrow')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800 sm:text-4xl">{t('auth.statusReviewTitle')}</h1>
      <p className="mt-3 text-sm leading-6 text-ink-400">{t('auth.statusReviewBody')}</p>

      <article className="mt-6 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-copper-400/15 text-copper-500">
          <Clock3 className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-copper-500">{t('auth.statusReviewBadge')}</p>
        <h2 className="mt-2 font-display text-2xl text-navy-800">{t('auth.statusReviewCard')}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-400">{t('auth.statusReviewEmail')}</p>
        <StatusTimeline
          items={[
            { label: t('auth.statusStepComplete'), mark: 'done' },
            { label: t('auth.statusStepSent'), mark: 'done' },
            { label: t('auth.statusStepReview'), mark: 'current' },
            { label: t('auth.statusStepApproved'), mark: 'wait' },
          ]}
        />
        <p className="mt-2 text-xs leading-5 text-ink-400">{t('auth.statusReviewNote')}</p>
        <button
          type="button"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-navy-800 px-5 text-sm font-semibold text-paper-50"
          onClick={onOpenDetail}
        >
          {t('auth.statusViewCta')}
          <span aria-hidden>→</span>
        </button>
      </article>

      <article className="mt-4 rounded-[28px] border border-navy-800/8 bg-white px-6 py-5 shadow-card">
        <h2 className="text-sm font-semibold text-navy-800">{t('auth.statusLockedTitle')}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-400">{t('auth.statusLockedBody')}</p>
      </article>
    </section>
  );
}

function ReviewDetail({
  partnerLabel,
  submittedLabel,
  onBack,
}: {
  partnerLabel: string;
  submittedLabel: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <button type="button" className="text-sm font-semibold text-navy-800" onClick={onBack}>
        ← {t('auth.statusBack')}
      </button>
      <p className="mt-4 text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.onboardEyebrow')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800 sm:text-4xl">{t('auth.statusDetailTitle')}</h1>
      <span className="mt-4 inline-flex items-center rounded-full bg-copper-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-copper-500">
        {t('auth.statusReviewBadge')}
      </span>
      <p className="mt-3 text-sm leading-6 text-ink-400">{t('auth.statusDetailBody')}</p>

      <dl className="mt-6 divide-y divide-navy-800/8 rounded-[28px] border border-navy-800/8 bg-white px-6 shadow-card">
        <DetailRow label={t('auth.statusSubmittedOn')} value={submittedLabel} />
        <DetailRow label={t('auth.statusPartnerType')} value={partnerLabel} />
        <DetailRow label={t('auth.statusLabel')} value={t('auth.statusReviewBadge')} />
      </dl>

      <article className="mt-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card">
        <StatusTimeline
          items={[
            { label: t('auth.statusDetailStepComplete'), mark: 'done' },
            { label: t('auth.statusDetailStepSent'), mark: 'done' },
            { label: t('auth.statusDetailStepReview'), mark: 'current' },
            { label: t('auth.statusDetailStepResult'), mark: 'wait' },
          ]}
        />
      </article>
    </section>
  );
}

function ApprovedState({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.onboardEyebrow')}</p>
      <article className="mt-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <Check className="h-7 w-7" strokeWidth={2.75} aria-hidden />
        </div>
        <span className="mt-5 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
          {t('auth.statusApprovedBadge')}
        </span>
        <h1 className="mt-3 font-display text-3xl text-navy-800">{t('auth.statusApprovedTitle')}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-400">{t('auth.statusApprovedBody')}</p>
        <StatusTimeline
          items={[
            { label: t('auth.statusStepComplete'), mark: 'done' },
            { label: t('auth.statusStepSent'), mark: 'done' },
            { label: t('auth.statusStepReview'), mark: 'done' },
            { label: t('auth.statusStepApproved'), mark: 'done' },
          ]}
        />
        <button
          type="button"
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-navy-800 px-5 text-sm font-semibold text-paper-50"
          onClick={onOpen}
        >
          {t('auth.statusDashboardCta')}
          <span aria-hidden>→</span>
        </button>
      </article>
    </section>
  );
}

function RejectedState({
  reason,
  profile,
  open,
  onToggle,
}: {
  reason: string;
  profile: ContractorProfile | null;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.onboardEyebrow')}</p>
      <article className="mt-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <X className="h-7 w-7" strokeWidth={2.75} aria-hidden />
        </div>
        <span className="mt-5 inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
          {t('auth.statusRejectedBadge')}
        </span>
        <h1 className="mt-3 font-display text-3xl text-navy-800">{t('auth.statusRejectedTitle')}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-400">{t('auth.statusRejectedBody')}</p>
        <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">{t('auth.statusRejectReason')}</p>
          <p className="mt-1">{reason.trim() || t('auth.statusNoReason')}</p>
        </div>
        <StatusTimeline
          items={[
            { label: t('auth.statusStepComplete'), mark: 'done' },
            { label: t('auth.statusStepSent'), mark: 'done' },
            { label: t('auth.statusRejectedBadge'), mark: 'rejected' },
          ]}
        />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            to="/partner/onboarding"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-navy-800 px-5 text-sm font-semibold text-paper-50"
          >
            {t('auth.statusEditCta')}
          </Link>
          <button
            type="button"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-navy-800/15 px-5 text-sm font-semibold text-navy-800"
            onClick={onToggle}
          >
            {t('auth.statusReviewProfileCta')}
          </button>
        </div>
        {open && profile ? (
          <div className="mt-5 rounded-2xl border border-navy-800/8 bg-paper-50 px-4 py-4 text-sm text-navy-800">
            <p className="font-semibold">{profile.businessName || '—'}</p>
            <p className="mt-1 text-ink-400">{[profile.address, profile.city].filter(Boolean).join(', ') || '—'}</p>
            <ul className="mt-3 space-y-1">
              {(profile.documents || []).map((doc) => (
                <li key={doc._id}>{t(`docType.${doc.type}`)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <dt className="text-sm text-ink-400">{label}</dt>
      <dd className="text-right text-sm font-semibold text-navy-800">{value}</dd>
    </div>
  );
}

function StatusTimeline({ items }: { items: { label: string; mark: Mark }[] }) {
  return (
    <ol className="mt-6">
      {items.map((item, index) => (
        <li key={item.label} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 ? (
            <span className="absolute left-[15px] top-8 h-[calc(100%-18px)] w-px bg-navy-800/10" />
          ) : null}
          <span
            className={cn(
              'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              item.mark === 'done' && 'bg-emerald-600 text-white',
              item.mark === 'current' && 'bg-navy-800 text-white ring-4 ring-copper-400/25',
              item.mark === 'rejected' && 'bg-red-600 text-white',
              item.mark === 'wait' && 'border border-navy-800/15 bg-white'
            )}
          >
            {item.mark === 'done' ? <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden /> : null}
            {item.mark === 'current' ? <span className="h-2.5 w-2.5 rounded-full bg-copper-400" /> : null}
            {item.mark === 'rejected' ? <X className="h-4 w-4" strokeWidth={2.75} aria-hidden /> : null}
          </span>
          <span className={cn('pt-1 text-sm font-semibold', item.mark === 'wait' ? 'text-ink-400' : 'text-navy-800')}>
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
