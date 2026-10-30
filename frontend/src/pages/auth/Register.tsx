import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PolicyConsent } from '@/components/auth/PolicyConsent';
import { PasswordInput } from '@/components/common/PasswordInput';
import { BackButton } from '@/components/navigation/BackButton';
import { useAuth } from '@/context/AuthContext';
import { withNextParam } from '@/routes/ProtectedRoute';
import { getApiErrorMessage, getApiErrorPayload } from '@/lib/api';
import { isValidVnMobile, normalizeEmail, normalizeVnMobile } from '@/lib/identity';
import { setOtpCooldown } from '@/lib/otp-cooldown';
import { cn } from '@/lib/cn';
import { PASSWORD_RE } from '@/lib/password';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_IDS = ['CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER'] as const;

type FieldKey = 'name' | 'email' | 'phone' | 'password' | 'confirm';
type FieldStatus = 'idle' | 'error' | 'valid';

function fieldStatus(touched: boolean, message: string, hasValue: boolean): FieldStatus {
  if (!message && hasValue) return 'valid';
  if (touched && message) return 'error';
  return 'idle';
}

function controlClass(status: FieldStatus) {
  return cn(
    'mt-1.5 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:ring-4',
    status === 'error' && 'border-red-400 focus:border-red-400 focus:ring-red-400/20',
    status === 'valid' && 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-400/20',
    status === 'idle' && 'border-navy-800/12 focus:border-copper-400 focus:ring-copper-400/20'
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { register } = useAuth();
  const { t, locale } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const roles = [
    { id: ROLE_IDS[0], title: t('role.CUSTOMER'), desc: t('auth.roleCustomerCard') },
    { id: ROLE_IDS[1], title: t('role.CONTRACTOR'), desc: t('auth.roleContractorCard') },
    { id: ROLE_IDS[2], title: t('role.MATERIAL_STORE_OWNER'), desc: t('auth.roleStoreBody') },
  ];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneRejected, setPhoneRejected] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [role, setRole] = useState('');
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
    Boolean(role) && acceptedPolicy && !nameMessage && !emailMessage && !phoneMessage && !passwordMessage && !confirmMessage;

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
    if (!role) {
      setError(t('auth.pickRole'));
      return;
    }
    if (!acceptedPolicy || !formValid) return;

    setLoading(true);
    setEmailTaken('');
    setPhoneTaken('');
    try {
      const data = await register({
        name: fullName.trim(),
        email: normalizeEmail(email),
        phoneNumber: normalizeVnMobile(phoneNumber),
        password,
        role,
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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <BackButton fallback="/login" label={t('common.backToLogin')} />
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.join')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.registerHeading')}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('auth.registerLead')}</p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {roles.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRole(item.id)}
            className={`rounded-2xl border p-3 text-left transition ${
              role === item.id
                ? 'border-copper-400 bg-copper-50 ring-4 ring-copper-400/20'
                : 'border-navy-800/10 bg-white hover:border-navy-800/25'
            }`}
          >
            <p className="font-display text-navy-800">{item.title}</p>
            <p className="mt-1 text-xs text-ink-400">{item.desc}</p>
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <form className="mt-5 space-y-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card" onSubmit={onSubmit} noValidate>
        <label className="block text-sm font-medium text-navy-800" htmlFor="register-name">
          {t('auth.fullName')}
          <input
            id="register-name"
            className={controlClass(nameStatus)}
            autoComplete="name"
            aria-invalid={nameStatus === 'error' || undefined}
            aria-describedby={nameStatus === 'error' ? 'register-name-error' : undefined}
            value={fullName}
            onBlur={() => markTouched('name')}
            onChange={(e) => {
              setFullName(e.target.value);
              markTouched('name');
            }}
          />
          {nameStatus === 'error' ? (
            <span id="register-name-error" className="mt-1.5 block text-xs font-normal text-red-600">
              {nameMessage}
            </span>
          ) : null}
        </label>
        <label className="block text-sm font-medium text-navy-800" htmlFor="register-email">
          {t('auth.email')}
          <input
            id="register-email"
            className={controlClass(emailStatus)}
            type="email"
            autoComplete="email"
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
          {emailStatus === 'error' ? (
            <span id="register-email-error" className="mt-1.5 block text-xs font-normal text-red-600">
              {emailMessage}
            </span>
          ) : null}
        </label>
        <label className="block text-sm font-medium text-navy-800" htmlFor="register-phone">
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
          {phoneStatus === 'error' ? (
            <span id="register-phone-error" className="mt-1.5 block text-xs font-normal text-red-600">
              {phoneMessage}
            </span>
          ) : null}
        </label>
        <PasswordInput
          id="register-password"
          label={t('auth.password')}
          autoComplete="new-password"
          disabled={loading}
          value={password}
          error={passwordStatus === 'error' ? passwordMessage : undefined}
          valid={passwordStatus === 'valid'}
          onBlur={() => markTouched('password')}
          onChange={(e) => {
            setPassword(e.target.value);
            markTouched('password');
          }}
        />
        <PasswordInput
          id="register-confirm"
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          disabled={loading}
          value={confirm}
          error={confirmStatus === 'error' ? confirmMessage : undefined}
          valid={confirmStatus === 'valid'}
          onBlur={() => markTouched('confirm')}
          onChange={(e) => {
            setConfirm(e.target.value);
            markTouched('confirm');
          }}
        />
        <PolicyConsent accepted={acceptedPolicy} onAcceptedChange={setAcceptedPolicy} />
        <button
          type="submit"
          disabled={loading || !formValid}
          className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 shadow-card transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? t('auth.registerLoading') : t('common.register')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-400">
        {t('auth.hasAccount')}{' '}
        <Link to={withNextParam('/login', params.get('next'))} className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.loginBtn')}
        </Link>
      </p>
    </motion.div>
  );
}
