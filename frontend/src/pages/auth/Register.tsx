import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PolicyConsent } from '@/components/auth/PolicyConsent';
import { PasswordInput } from '@/components/common/PasswordInput';
import { useAuth } from '@/context/AuthContext';
import { withNextParam } from '@/routes/ProtectedRoute';
import { getApiErrorMessage, getApiErrorPayload } from '@/lib/api';
import { isValidVnMobile, normalizeEmail, normalizeVnMobile } from '@/lib/identity';
import { setOtpCooldown } from '@/lib/otp-cooldown';
import { cn } from '@/lib/cn';
import { PASSWORD_RE } from '@/lib/password';
import {
  parseRegisterRole,
  type RegisterableRole,
  withRegisterParams,
} from '@/lib/register-role';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = 'name' | 'email' | 'phone' | 'password' | 'confirm';
type FieldStatus = 'idle' | 'error' | 'valid';

function fieldStatus(touched: boolean, message: string, hasValue: boolean): FieldStatus {
  if (!message && hasValue) return 'valid';
  if (touched && message) return 'error';
  return 'idle';
}

function controlClass(status: FieldStatus) {
  return cn(
    'mt-0.5 h-9 w-full rounded-xl border bg-white px-3 text-sm text-navy-800 outline-none transition focus:ring-2',
    status === 'error' && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
    status === 'valid' && 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-400/20',
    status === 'idle' && 'border-navy-800/12 focus:border-navy-500 focus:ring-navy-500/10'
  );
}

function roleCopy(role: RegisterableRole, t: (key: string) => string) {
  if (role === 'CONTRACTOR') {
    return {
      heading: t('auth.registerHeadingContractor'),
      lead: t('auth.registerLeadContractor'),
    };
  }
  if (role === 'MATERIAL_STORE_OWNER') {
    return {
      heading: t('auth.registerHeadingStore'),
      lead: t('auth.registerLeadStore'),
    };
  }
  return {
    heading: t('auth.registerHeadingCustomer'),
    lead: t('auth.registerLeadCustomer'),
  };
}

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { register } = useAuth();
  const { t, locale } = useI18n();
  const pushToast = useToastStore((s) => s.push);

  const role = useMemo(() => parseRegisterRole(params.get('role')), [params]);
  const copy = roleCopy(role, t);

  useEffect(() => {
    const raw = params.get('role');
    if (raw === role) return;
    navigate(withRegisterParams(role, params.get('next')), { replace: true });
  }, [navigate, params, role]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneRejected, setPhoneRejected] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
<<<<<<< HEAD
=======
  const [submitAttempted, setSubmitAttempted] = useState(false);
>>>>>>> origin/main
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false,
    email: false,
    phone: false,
    password: false,
    confirm: false,
  });
  const [error, setError] = useState('');
  const [emailTaken, setEmailTaken] = useState('');
  const [phoneTaken, setPhoneTaken] = useState('');
  const [loading, setLoading] = useState(false);

  const nameMessage = fullName.trim() ? '' : t('auth.nameRequired');
  const emailMessage = emailTaken
    || (!email.trim()
      ? t('auth.emailRequired')
      : EMAIL_RE.test(email.trim())
        ? ''
        : t('auth.invalidEmail'));
  const normalizedPhone = normalizeVnMobile(phoneNumber);
  const phoneMessage = phoneTaken
    || (phoneRejected
      ? t('auth.phoneInvalid')
      : !phoneNumber
        ? t('auth.phoneLength')
        : isValidVnMobile(normalizedPhone)
          ? ''
          : phoneNumber.replace(/\D/g, '').length < 10
            ? t('auth.phoneLength')
            : t('auth.phoneInvalid'));
  const passwordMessage = !password
    ? t('auth.passwordRequired')
    : PASSWORD_RE.test(password)
      ? ''
      : t('auth.passwordRule');
  const confirmMessage = !confirm
    ? t('auth.confirmRequired')
    : confirm === password
      ? ''
      : t('auth.passwordMismatch');

  const formValid =
    acceptedPolicy && !nameMessage && !emailMessage && !phoneMessage && !passwordMessage && !confirmMessage;

  const nameStatus = fieldStatus(touched.name, nameMessage, Boolean(fullName.trim()));
  const emailStatus = fieldStatus(touched.email, emailMessage, Boolean(email.trim()));
  const phoneStatus = fieldStatus(touched.phone, phoneMessage, Boolean(phoneNumber));
  const passwordStatus = fieldStatus(touched.password, passwordMessage, Boolean(password));
  const confirmStatus = fieldStatus(touched.confirm, confirmMessage, Boolean(confirm));

  function markTouched(key: FieldKey) {
    setTouched((current) => ({ ...current, [key]: true }));
  }

  function onPhoneChange(raw: string) {
    const compact = raw.replace(/[^\d+]/g, '');
    const illegal = /[^\d+\s().-]/.test(raw);
    setPhoneRejected(illegal);
    setPhoneTaken('');
    setPhoneNumber(compact);
    markTouched('phone');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTouched({ name: true, email: true, phone: true, password: true, confirm: true });
<<<<<<< HEAD
    if (!acceptedPolicy || !formValid) return;
=======
    setSubmitAttempted(true);
    if (!formValid) {
      const firstInvalidId = [
        [nameMessage, 'register-name'],
        [emailMessage, 'register-email'],
        [phoneMessage, 'register-phone'],
        [passwordMessage, 'register-password'],
        [confirmMessage, 'register-confirm'],
        [!acceptedPolicy, 'register-policy-consent'],
      ].find(([invalid]) => Boolean(invalid))?.[1];
      if (typeof firstInvalidId === 'string') {
        document.getElementById(firstInvalidId)?.focus();
      }
      return;
    }

    const submitRole = parseRegisterRole(params.get('role'));
>>>>>>> origin/main

    const submitRole = parseRegisterRole(params.get('role'));

    setLoading(true);
    setEmailTaken('');
    setPhoneTaken('');
    try {
      const data = await register({
        name: fullName.trim(),
        email: normalizeEmail(email),
        phoneNumber: normalizeVnMobile(phoneNumber),
        password,
        role: submitRole,
        acceptedPolicy: true,
        policyLanguage: locale,
      });
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : undefined;
      pushToast({
        kind: 'success',
        title: t('auth.accountCreated'),
        body: sent === false ? t('auth.smtpMissing') : t('auth.checkOtp'),
      });
      setOtpCooldown(email.trim(), 60);
      navigate(withNextParam(`/verify-email?email=${encodeURIComponent(email.trim())}`, params.get('next')));
    } catch (err) {
      const payload = getApiErrorPayload(err);
      const message = payload.message || getApiErrorMessage(err);
      if (payload.fields.includes('email') || payload.code === 'EMAIL_ALREADY_EXISTS') {
        setEmailTaken(t('auth.emailTaken'));
        markTouched('email');
      }
      if (payload.fields.includes('phone') || payload.code === 'PHONE_ALREADY_EXISTS') {
        setPhoneTaken(t('auth.phoneTaken'));
        markTouched('phone');
      }
      if (!payload.fields.length) setError(message);
      pushToast({ kind: 'error', title: t('auth.registerFailTitle'), body: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-navy-800/10 bg-white p-5 shadow-sm sm:p-6">
      <Link
        to={withNextParam('/login', params.get('next'))}
        className="mb-2 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-navy-700 hover:text-navy-900 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('common.backToLogin')}
      </Link>
      <h1 className="mt-1 font-display text-2xl leading-tight text-navy-800">{copy.heading}</h1>
      <p className="mt-1 text-[13px] leading-snug text-ink-400">{copy.lead}</p>

      {error ? (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form className="mt-2.5 space-y-1.5" onSubmit={onSubmit} noValidate>
        <label className="block text-[13px] font-medium leading-tight text-navy-800" htmlFor="register-name">
          {t('auth.fullName')}
          <input
            id="register-name"
            className={controlClass(nameStatus)}
            autoComplete="name"
            placeholder={t('auth.registerNamePlaceholder')}
            aria-invalid={nameStatus === 'error' || undefined}
            aria-describedby={nameStatus === 'error' ? 'register-name-error' : undefined}
            value={fullName}
            onBlur={() => markTouched('name')}
            onChange={(e) => {
              setFullName(e.target.value);
              markTouched('name');
            }}
          />
          <span
            id="register-name-error"
            title={nameStatus === 'error' ? nameMessage : undefined}
            className={cn(
              'mt-1 block h-3 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 font-normal',
              nameStatus === 'error' ? 'text-red-600' : 'invisible'
            )}
          >
            {nameStatus === 'error' ? nameMessage : '\u00a0'}
          </span>
        </label>
        <label className="block text-[13px] font-medium leading-tight text-navy-800" htmlFor="register-email">
          {t('auth.email')}
          <input
            id="register-email"
            className={controlClass(emailStatus)}
            type="email"
            autoComplete="email"
            placeholder={t('auth.registerEmailPlaceholder')}
            aria-invalid={emailStatus === 'error' || undefined}
            aria-describedby={emailStatus === 'error' ? 'register-email-error' : undefined}
            value={email}
            onBlur={() => markTouched('email')}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailTaken('');
              markTouched('email');
            }}
          />
          <span
            id="register-email-error"
            title={emailStatus === 'error' ? emailMessage : undefined}
            className={cn(
              'mt-1 block h-3 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 font-normal',
              emailStatus === 'error' ? 'text-red-600' : 'invisible'
            )}
          >
            {emailStatus === 'error' ? emailMessage : '\u00a0'}
          </span>
        </label>
        <label className="block text-[13px] font-medium leading-tight text-navy-800" htmlFor="register-phone">
          {t('auth.phone')}
          <input
            id="register-phone"
            className={controlClass(phoneStatus)}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder={t('auth.phonePlaceholder')}
            aria-invalid={phoneStatus === 'error' || undefined}
            aria-describedby={phoneStatus === 'error' ? 'register-phone-error' : undefined}
            value={phoneNumber}
            onBlur={() => {
              markTouched('phone');
              const next = normalizeVnMobile(phoneNumber);
              if (next) setPhoneNumber(next);
            }}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          <span
            id="register-phone-error"
            title={phoneStatus === 'error' ? phoneMessage : undefined}
            className={cn(
              'mt-1 block h-3 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-3 font-normal',
              phoneStatus === 'error' ? 'text-red-600' : 'invisible'
            )}
          >
            {phoneStatus === 'error' ? phoneMessage : '\u00a0'}
          </span>
        </label>
        <PasswordInput
          id="register-password"
          label={t('auth.password')}
          className="h-9 rounded-xl"
<<<<<<< HEAD
=======
          placeholder={t('auth.registerPasswordPlaceholder')}
>>>>>>> origin/main
          autoComplete="new-password"
          disabled={loading}
          value={password}
          error={passwordStatus === 'error' ? passwordMessage : undefined}
          valid={passwordStatus === 'valid'}
          reserveErrorSpace
          onBlur={() => markTouched('password')}
          onChange={(e) => {
            setPassword(e.target.value);
            markTouched('password');
          }}
        />
        <PasswordInput
          id="register-confirm"
          label={t('auth.confirmPassword')}
          className="h-9 rounded-xl"
<<<<<<< HEAD
=======
          placeholder={t('auth.registerConfirmPlaceholder')}
>>>>>>> origin/main
          autoComplete="new-password"
          disabled={loading}
          value={confirm}
          error={confirmStatus === 'error' ? confirmMessage : undefined}
          valid={confirmStatus === 'valid'}
          reserveErrorSpace
          onBlur={() => markTouched('confirm')}
          onChange={(e) => {
            setConfirm(e.target.value);
            markTouched('confirm');
          }}
        />
        <PolicyConsent
          accepted={acceptedPolicy}
          onAcceptedChange={setAcceptedPolicy}
          error={submitAttempted && !acceptedPolicy ? t('auth.consentRequired') : undefined}
        />
        {!formValid ? (
          <p id="register-form-hint" className="text-[11px] leading-4 text-ink-400">
            {t('auth.registerCompleteFields')}
          </p>
        ) : null}
        <button
          type="submit"
<<<<<<< HEAD
          disabled={loading || !formValid}
          className="flex h-10 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 shadow-card transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
=======
          disabled={loading}
          aria-disabled={!formValid || undefined}
          aria-describedby={!formValid ? 'register-form-hint' : undefined}
          className={cn(
            'flex h-10 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 shadow-card transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60',
            !formValid && 'opacity-70'
          )}
>>>>>>> origin/main
        >
          {loading ? t('auth.registerLoading') : t('common.register')}
        </button>
      </form>

      <p className="mt-2.5 text-center text-[13px] text-ink-400">
        {t('auth.hasAccount')}{' '}
        <Link to={withNextParam('/login', params.get('next'))} className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.loginBtn')}
        </Link>
      </p>
    </div>
  );
}
