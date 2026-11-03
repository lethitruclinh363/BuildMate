import { type FormEvent, useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PartnerRegisterPanel } from '@/components/auth/PartnerRegisterPanel';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { PolicyConsent } from '@/components/auth/PolicyConsent';
import { PasswordInput } from '@/components/common/PasswordInput';
import { getDefaultRouteByRole, isPartnerRole, useAuth } from '@/context/AuthContext';
import { safeReturnPath, withNextParam } from '@/routes/ProtectedRoute';
import { withRegisterParams } from '@/lib/register-role';
import { getApiErrorMessage } from '@/lib/api';
import { isValidVnMobile, normalizeVnMobile } from '@/lib/identity';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { AxiosError } from 'axios';
import type { AuthPayload } from '@/types/user';

const fieldClass =
  'mt-1.5 h-12 w-full rounded-2xl border border-navy-800/12 bg-white px-4 text-sm text-navy-800 outline-none transition focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, googleLogin } = useAuth();
  const { t, locale } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingGoogle, setPendingGoogle] = useState<{
    credential: string;
    nonce: string;
    email: string;
    name: string;
  } | null>(null);
  const [googlePhone, setGooglePhone] = useState('');
  const [googleAcceptedPolicy, setGoogleAcceptedPolicy] = useState(false);

  const finishLogin = useCallback((session: AuthPayload, successTitle: string) => {
    const next = safeReturnPath(params.get('next'));
    const home = getDefaultRouteByRole(session.user);
    const dest = isPartnerRole(session.user.role) ? home : next || home;
    pushToast({ kind: 'success', title: successTitle });
    navigate(dest === '/' ? home : dest, { replace: true });
  }, [navigate, params, pushToast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const session = await login(email, password);
      finishLogin(session, t('auth.loginSuccess'));
    } catch (err) {
      const ax = err as AxiosError;
      const message = ax.isAxiosError ? getApiErrorMessage(err) : err instanceof Error ? err.message : t('auth.loginFailTitle');
      const status = (err as AxiosError)?.response?.status;
      if (status === 403 && String(message).toLowerCase().includes('verify')) {
        navigate(withNextParam(`/verify-email?email=${encodeURIComponent(email)}`, params.get('next')));
        return;
      }
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: message, durationMs: 7000, prominent: true });
    } finally {
      setLoading(false);
    }
  }

  const onGoogleCredential = useCallback(async (credential: string, nonce: string) => {
    setGoogleLoading(true);
    try {
      const result = await googleLogin({ credential, nonce, policyLanguage: locale });
      if (result.requiresRegistration) {
        setPendingGoogle({ credential, nonce, email: result.email, name: result.name });
        setGooglePhone('');
        setGoogleAcceptedPolicy(false);
        return;
      }
      finishLogin(result, t('auth.loginSuccess'));
    } catch (err) {
      const message = err instanceof Error && !('isAxiosError' in err)
        ? err.message
        : getApiErrorMessage(err);
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: message, durationMs: 7000, prominent: true });
    } finally {
      setGoogleLoading(false);
    }
  }, [finishLogin, googleLogin, locale, pushToast, t]);

  async function onGoogleRegister(e: FormEvent) {
    e.preventDefault();
    if (!pendingGoogle) return;

    const phoneNumber = normalizeVnMobile(googlePhone);
    if (!isValidVnMobile(phoneNumber)) {
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: t('auth.phoneInvalid'), durationMs: 7000, prominent: true });
      return;
    }
    if (!googleAcceptedPolicy) {
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: t('auth.googleConsentRequired'), durationMs: 7000, prominent: true });
      return;
    }

    setGoogleLoading(true);
    try {
      const result = await googleLogin({
        credential: pendingGoogle.credential,
        nonce: pendingGoogle.nonce,
        phoneNumber,
        acceptedPolicy: true,
        policyLanguage: locale,
      });
      if (result.requiresRegistration) {
        pushToast({
          kind: 'error',
          title: t('auth.loginFailTitle'),
          body: t('auth.googleRegistrationIncomplete'),
          durationMs: 7000,
          prominent: true,
        });
        return;
      }
      finishLogin(result, t('auth.loginSuccess'));
    } catch (err) {
      const message = err instanceof Error && !('isAxiosError' in err)
        ? err.message
        : getApiErrorMessage(err);
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: message, durationMs: 7000, prominent: true });
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-navy-800/10 bg-white p-7 shadow-sm">
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-navy-700 hover:text-navy-900 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('common.backToHome')}
      </Link>
      <h1 className="mt-2 font-display text-3xl text-navy-800">
        {pendingGoogle ? t('auth.googleRegisterHeading') : t('auth.loginHeading')}
      </h1>
      <p className="mt-2 text-sm text-ink-400">
        {pendingGoogle ? t('auth.googleRegisterLead') : t('auth.loginLead')}
      </p>

      {pendingGoogle ? (
        <form className="mt-6 space-y-4" onSubmit={onGoogleRegister}>
          <div className="rounded-2xl bg-paper-50 px-4 py-3 text-sm text-navy-800">
            <p className="font-semibold">{pendingGoogle.name}</p>
            <p className="mt-0.5 text-ink-400">{pendingGoogle.email}</p>
          </div>
          <label className="block text-sm font-medium text-navy-800">
            {t('auth.phone')}
            <input
              className={fieldClass}
              type="tel"
              required
              value={googlePhone}
              onChange={(event) => setGooglePhone(event.target.value)}
              placeholder={t('auth.phonePlaceholder')}
              autoComplete="tel"
            />
          </label>
          <PolicyConsent accepted={googleAcceptedPolicy} onAcceptedChange={setGoogleAcceptedPolicy} />
          <button
            type="submit"
            disabled={googleLoading}
            className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 transition hover:bg-navy-700 disabled:opacity-60"
          >
            {googleLoading ? t('auth.loginLoading') : t('auth.googleRegisterContinue')}
          </button>
          <button
            type="button"
            disabled={googleLoading}
            onClick={() => {
              setPendingGoogle(null);
            }}
            className="w-full text-sm font-semibold text-navy-800 hover:underline disabled:opacity-60"
          >
            {t('auth.googleRegisterBack')}
          </button>
        </form>
      ) : (
        <>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-navy-800">
              Email
              <input
                className={fieldClass}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
              />
            </label>
            <PasswordInput
              id="login-password"
              label={t('auth.password')}
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-semibold text-navy-800 hover:text-navy-700 hover:underline">
                {t('auth.forgot')}
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 shadow-card transition hover:bg-navy-700 disabled:opacity-60"
            >
              {loading ? t('auth.loginLoading') : t('auth.loginBtn')}
            </button>
          </form>

          <div className="mt-5">
            <div className="mb-4 flex items-center gap-3 text-xs text-ink-400">
              <span className="h-px flex-1 bg-navy-800/10" />
              <span>{t('auth.googleDivider')}</span>
              <span className="h-px flex-1 bg-navy-800/10" />
            </div>
            <GoogleSignInButton
              disabled={loading || googleLoading}
              label={t('auth.google')}
              unavailableMessage={t('auth.googleUnavailable')}
              loadErrorMessage={t('auth.googleLoadError')}
              onCredential={onGoogleCredential}
            />
          </div>

          <p className="mt-6 text-center text-sm text-ink-400">
            {t('auth.newHere')}{' '}
            <Link
              to={withRegisterParams('CUSTOMER', params.get('next'))}
              className="font-semibold text-navy-800 hover:text-copper-500"
            >
              {t('auth.createAccount')}
            </Link>
          </p>
        </>
      )}

      <div className="mt-6 lg:hidden">
        <PartnerRegisterPanel variant="light" />
      </div>
    </div>
  );
}
