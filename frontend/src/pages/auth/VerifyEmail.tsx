import { motion } from 'framer-motion';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/lib/api';
import { getOtpCooldown, setOtpCooldown } from '@/lib/otp-cooldown';
import { useI18n } from '@/locales';
import { authApi } from '@/services/auth.api';
import { useToastStore } from '@/store/toast.store';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm tracking-[0.4em] text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(() => getOtpCooldown(params.get('email') || ''));

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (email) {
      const remaining = getOtpCooldown(email);
      if (remaining > 0 && remaining !== countdown) {
        setCountdown(remaining);
      }
    }
  }, [email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await authApi.verifyEmail(email, code);
      pushToast({ kind: 'success', title: t('auth.verifiedTitle'), body: t('auth.verifiedBody') });
      navigate(`/login?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.otpInvalid'), body: message });
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (resending || countdown > 0 || !email) return;
    setError('');
    setInfo('');
    setResending(true);
    try {
      const { data } = await authApi.resendCode(email);
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : true;
      const body = sent === false ? t('auth.smtpMissing') : t('auth.checkMailbox');
      setInfo(body);
      pushToast({ kind: 'info', title: t('auth.resentTitle'), body });
      setOtpCooldown(email, 60);
      setCountdown(60);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.resendFail'), body: message });
      setOtpCooldown(email, 60);
      setCountdown(60);
    } finally {
      setResending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-navy-800/8 bg-white p-7 shadow-lift"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.verifyEyebrow')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.verifyTitle')}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('auth.verifyLead')}</p>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</p> : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-navy-800">
          Email
          <input
            className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm tracking-normal text-navy-800 outline-none focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-navy-800">
          OTP
          <input
            className={fieldClass}
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </label>
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60"
        >
          {loading ? t('auth.verifying') : t('auth.verifyBtn')}
        </button>
        <button
          type="button"
          disabled={resending || countdown > 0 || !email}
          onClick={() => void onResend()}
          className="flex h-11 w-full items-center justify-center rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {resending
            ? t('auth.resending')
            : countdown > 0
              ? t('auth.resendCooldown', { seconds: countdown })
              : t('auth.resend')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-400">
        <Link to="/login" className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </motion.div>
  );
}
