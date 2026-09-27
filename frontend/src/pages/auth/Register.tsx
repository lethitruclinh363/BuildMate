import { motion } from 'framer-motion';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordInput } from '@/components/common/PasswordInput';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

const ROLE_IDS = ['CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER'] as const;

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { t } = useI18n();
  const pushToast = useToastStore((s) => s.push);
  const roles = [
    { id: ROLE_IDS[0], title: t('role.CUSTOMER'), desc: t('auth.roleCustomerCard') },
    { id: ROLE_IDS[1], title: t('role.CONTRACTOR'), desc: t('auth.roleContractorCard') },
    { id: ROLE_IDS[2], title: t('role.MATERIAL_STORE_OWNER'), desc: t('auth.roleStoreBody') },
  ];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!role) {
      setError(t('auth.pickRole'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      const data = await register({ name: fullName, email, password, role });
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : undefined;
      pushToast({
        kind: 'success',
        title: t('auth.accountCreated'),
        body: sent === false ? t('auth.smtpMissing') : t('auth.checkOtp'),
      });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.registerFailTitle'), body: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
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

      <form className="mt-5 space-y-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-navy-800">
          {t('auth.fullName')}
          <input className={fieldClass} required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-navy-800">
          Email
          <input className={fieldClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <PasswordInput
          id="register-password"
          label={t('auth.password')}
          required
          minLength={8}
          autoComplete="new-password"
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          id="register-confirm"
          label={t('auth.confirmPassword')}
          required
          minLength={8}
          autoComplete="new-password"
          disabled={loading}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 shadow-card transition hover:bg-navy-700 disabled:opacity-60"
        >
          {loading ? t('auth.registerLoading') : t('common.register')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-400">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.loginBtn')}
        </Link>
      </p>
    </motion.div>
  );
}
