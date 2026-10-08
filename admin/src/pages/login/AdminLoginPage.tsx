import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { Button } from '@/components/Button';
import { AdminForbiddenError } from '@/types/api';
import { getApiErrorMessage } from '@/services/api';

export function AdminLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('admin@buildmate.vn');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof AdminForbiddenError) {
        setError(t('auth.forbidden'));
      } else {
        setError(getApiErrorMessage(err) || t('auth.fail'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-slate-200 selection:bg-copper-500/30">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-copper-500/30 bg-navy-900 text-copper-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold tracking-tight text-white">BuildMate</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl justify-center px-6 pb-12 pt-10 sm:pt-16">
        <div className="w-full max-w-[480px]">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-copper-500/30 bg-navy-900 text-copper-400">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-copper-400">{t('auth.eyebrow')}</p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('auth.title')}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">{t('auth.subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="rounded-xl border border-white/10 bg-navy-900 p-6 sm:p-8">
            <div className="space-y-4">
              <label className="block space-y-1.5" htmlFor="email">
                <span className="text-xs font-semibold text-slate-300">{t('auth.email')}</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-navy-950 px-10 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-copper-500/70 focus:ring-2 focus:ring-copper-500/15"
                    autoComplete="username"
                    required
                  />
                </span>
              </label>

              <label className="block space-y-1.5" htmlFor="password">
                <span className="text-xs font-semibold text-slate-300">{t('auth.password')}</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-navy-950 px-10 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-copper-500/70 focus:ring-2 focus:ring-copper-500/15"
                    autoComplete="current-password"
                    disabled={busy}
                    required
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowPassword((open) => !open)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-copper-400 disabled:opacity-40"
                    aria-label={showPassword ? t('errors.hidePassword') : t('errors.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>
            </div>

            {error ? <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm leading-5 text-red-300">{error}</p> : null}
            <Button type="submit" loading={busy} className="mt-6 w-full rounded-lg py-3">
              {t('auth.submit')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mx-auto mt-6 max-w-md text-center text-xs leading-5 text-slate-500">{t('auth.securityNotice')}</p>
        </div>
      </main>
    </div>
  );
}
