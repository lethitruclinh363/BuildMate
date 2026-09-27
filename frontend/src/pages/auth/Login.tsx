import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PasswordInput } from '@/components/common/PasswordInput';
import { ROLE_HOME, type RoleHomeKey, useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { AxiosError } from 'axios';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const { t } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await login(email, password);
      const next = params.get('next');
      const safeNext = Boolean(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\'));
      const roleKey = session.user.role;
      const dest =
        safeNext && next
          ? next
          : roleKey in ROLE_HOME
            ? ROLE_HOME[roleKey as RoleHomeKey]
            : '/';
      pushToast({ kind: 'success', title: t('auth.loginSuccess') });
      navigate(dest, { replace: true });
    } catch (err) {
      const ax = err as AxiosError;
      const message = ax.isAxiosError ? getApiErrorMessage(err) : err instanceof Error ? err.message : t('auth.loginFailTitle');
      setError(message);
      const status = (err as AxiosError)?.response?.status;
      if (status === 403 && String(message).toLowerCase().includes('verify')) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      pushToast({ kind: 'error', title: t('auth.loginFailTitle'), body: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[28px] border border-navy-800/8 bg-white p-7 shadow-lift"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">BuildMate</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.loginHeading')}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('auth.loginLead')}</p>

      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

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
          <Link to="/forgot-password" className="text-sm text-copper-600 hover:underline">
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

      <p className="mt-6 text-center text-sm text-ink-400">
        {t('auth.newHere')}{' '}
        <Link to="/register" className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.createAccount')}
        </Link>
      </p>
    </motion.div>
  );
}
