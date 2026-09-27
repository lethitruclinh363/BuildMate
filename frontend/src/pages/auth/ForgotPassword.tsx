import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordInput } from '@/components/common/PasswordInput';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { authApi } from '@/services/auth.api';
import { useToastStore } from '@/store/toast.store';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword(email);
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : true;
      const body =
        sent === false ? t('auth.smtpMissing') : t('auth.checkInbox');
      setInfo(body);
      pushToast({ kind: 'success', title: t('auth.codeSent'), body });
      setStep(2);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.sendCodeFail'), body: message });
    } finally {
      setLoading(false);
    }
  }

  async function checkCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.verifyResetCode(email, code);
      pushToast({ kind: 'success', title: t('auth.codeValid') });
      setStep(3);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.otpWrong'), body: message });
    } finally {
      setLoading(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(email, code, password);
      pushToast({ kind: 'success', title: t('auth.passwordUpdated'), body: t('auth.loginWithNew') });
      navigate(`/login?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.resetFail'), body: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-navy-800/8 bg-white p-7 shadow-lift"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">BuildMate</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.forgotTitle')}</h1>
      <p className="mt-2 text-sm text-ink-400">
        {t('auth.forgotStep', {
          step,
          label: step === 1 ? t('auth.stepEmail') : step === 2 ? t('auth.stepOtp') : t('auth.stepPassword'),
        })}
      </p>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</p> : null}

      {step === 1 ? (
        <form className="mt-6 space-y-4" onSubmit={sendCode}>
          <label className="block text-sm font-medium text-navy-800">
            Email
            <input className={fieldClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60"
          >
            {loading ? t('auth.sendingCode') : t('auth.sendOtp')}
          </button>
        </form>
      ) : null}

      {step === 2 ? (
        <form className="mt-6 space-y-4" onSubmit={checkCode}>
          <label className="block text-sm font-medium text-navy-800">
            {t('auth.otpLabel')}
            <input
              className={fieldClass}
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60"
          >
            {loading ? t('auth.checkingCode') : t('auth.confirmCode')}
          </button>
        </form>
      ) : null}

      {step === 3 ? (
        <form className="mt-6 space-y-4" onSubmit={savePassword}>
          <PasswordInput
            id="reset-password"
            label={t('auth.newPassword')}
            required
            minLength={8}
            disabled={loading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordInput
            id="reset-confirm"
            label={t('auth.confirmPassword')}
            required
            minLength={8}
            disabled={loading}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 disabled:opacity-60"
          >
            {loading ? t('auth.saving') : t('auth.resetPassword')}
          </button>
        </form>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-400">
        <Link to="/login" className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </motion.div>
  );
}
