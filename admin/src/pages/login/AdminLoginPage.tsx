import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Globe, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { AdminForbiddenError } from '@/types/api';
import { getApiErrorMessage } from '@/services/api';
import { setAdminLanguage } from '@/locales/i18n';

export function AdminLoginPage() {
  const { t, i18n } = useTranslation();
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
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#F4F7FA] text-[#16283C] selection:bg-[#2B6280]/20">
      {/* Ambient Architectural Dot Grid Background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: 'radial-gradient(#94A3B8 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse 65% 55% at 50% 45%, black 60%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 50% 45%, black 60%, transparent 100%)',
        }}
      />

      {/* Atmospheric Soft Light Orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[860px] rounded-full bg-gradient-to-tr from-[#2B6280]/15 via-[#173B4F]/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-10 h-[380px] w-[380px] rounded-full bg-[#E07A5F]/05 blur-3xl" />

      {/* Top Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#173B4F] to-[#2B6280] text-white shadow-sm shadow-[#173B4F]/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <p className="font-display text-lg font-bold tracking-tight text-[#16283C]">BuildMate</p>
            <span className="rounded-md border border-[#E1E7ED] bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#2B6280]">
              ADMIN
            </span>
          </div>
        </div>

        {/* Language Switch Button */}
        <button
          type="button"
          onClick={() => setAdminLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5DFE7] bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#16283C] shadow-2xs backdrop-blur-xs transition-all hover:bg-white hover:border-[#2B6280]/40"
          title="Đổi ngôn ngữ / Switch language"
        >
          <Globe className="h-3.5 w-3.5 text-[#526477]" />
          <span>{i18n.language.toUpperCase()}</span>
        </button>
      </header>

      {/* Center Auth Card */}
      <main className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-6 py-6 sm:py-10">
        <div className="relative overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-8 sm:p-10 shadow-[0_20px_50px_-20px_rgba(23,59,79,0.14),0_1px_3px_0_rgba(0,0,0,0.04)]">
          {/* Top colored accent stripe */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#2B6280] via-[#3E85AB] to-[#173B4F]" />

          <div className="mb-8 text-center">
            {/* Dual-ring centered icon */}
            <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-[#EDF5F9] to-[#DFEDF5] border border-[#CDE1ED] text-[#2B6280] shadow-sm shadow-[#2B6280]/10 ring-4 ring-[#F4F9FC]">
              <ShieldCheck className="h-8 w-8 text-[#2B6280]" />
            </div>

            <h1 className="font-display text-2xl font-black tracking-tight text-[#16283C] sm:text-3xl">
              {t('auth.title')}
            </h1>
            <p className="mx-auto mt-2 text-sm leading-relaxed text-[#526477]">
              {t('auth.subtitle')}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4.5">
            {/* Email Field */}
            <div className="group space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#475569]" htmlFor="email">
                {t('auth.email')}
              </label>
              <div className="relative block">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8] transition-colors group-focus-within:text-[#2B6280]" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-10 py-3 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8] shadow-2xs transition-all hover:border-[#94A3B8] focus:border-[#2B6280] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2B6280]/15"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="group space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#475569]" htmlFor="password">
                {t('auth.password')}
              </label>
              <div className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8] transition-colors group-focus-within:text-[#2B6280]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-10 py-3 pr-11 text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8] shadow-2xs transition-all hover:border-[#94A3B8] focus:border-[#2B6280] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2B6280]/15"
                  autoComplete="current-password"
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowPassword((open) => !open)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#94A3B8] transition-colors hover:text-[#2B6280] disabled:opacity-40"
                  aria-label={showPassword ? t('errors.hidePassword') : t('errors.showPassword')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 animate-in fade-in duration-200">
                {error}
              </div>
            ) : null}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#173B4F] to-[#2B6280] px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#173B4F]/20 transition-all duration-200 hover:from-[#112E3E] hover:to-[#22536E] hover:shadow-lg hover:shadow-[#173B4F]/30 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none group"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Đang xác thực...</span>
                </span>
              ) : (
                <>
                  <span>{t('auth.submit')}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-relaxed text-[#64748B]">
          {t('auth.securityNotice')}
        </p>
      </main>

      {/* Clean Footer */}
      <footer className="relative z-10 py-5 text-center text-xs text-[#94A3B8]">
        © 2026 BuildMate Management System · Cổng vận hành nội bộ bảo mật
      </footer>
    </div>
  );
}
