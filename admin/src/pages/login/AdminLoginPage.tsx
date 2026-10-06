import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
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
    <div className="relative min-h-screen overflow-hidden bg-navy-950">
      <div className="relative grid min-h-screen place-items-center p-6">
        <form onSubmit={onSubmit} className="glass-card w-full max-w-md p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-copper-500/30 bg-copper-500/10 text-copper-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-copper-400">{t('auth.eyebrow')}</p>
              <h1 className="font-display text-2xl font-semibold text-white">{t('auth.title')}</h1>
            </div>
          </div>
          <p className="mb-6 text-sm text-white/50">{t('auth.subtitle')}</p>
          <div className="space-y-4">
            <Input
              id="email"
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="relative">
              <Input
                id="password"
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowPassword((open) => !open)}
                className="absolute bottom-2.5 right-3 text-white/45 hover:text-white disabled:opacity-40"
                aria-label={showPassword ? t('errors.hidePassword') : t('errors.showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
          <Button type="submit" loading={busy} className="mt-6 w-full">
            {t('auth.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
