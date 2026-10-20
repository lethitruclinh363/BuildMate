import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { useI18n } from '@/locales';

export function AuthLayout() {
  const { t } = useI18n();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-navy-800 lg:flex">
        <img
          src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80"
          alt={t('auth.siteAlt')}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-hero-wash" />
        <div className="absolute inset-0 blueprint-frame" />
        <div className="relative z-10 flex w-full flex-col justify-between p-10 text-white">
          <div className="flex items-start justify-between gap-4">
            <Logo inverted />
            <LanguageSwitcher variant="dark" placement="auth-panel" />
          </div>
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.28em] text-copper-300">{t('brand.eyebrow')}</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">{t('auth.authPanelTitle')}</h1>
            <p className="mt-4 text-white/70">{t('auth.authPanelBody')}</p>
          </div>
          <p className="text-sm text-white/50">{t('auth.authPanelFoot')}</p>
        </div>
      </aside>
      <main className="flex min-h-screen flex-col overflow-y-auto bg-paper-100 px-4 py-10">
        <div className="m-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <Logo />
            <LanguageSwitcher variant="light" placement="auth-form" />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
