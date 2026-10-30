import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { PartnerRegisterPanel } from '@/components/auth/PartnerRegisterPanel';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { parseRegisterRole } from '@/lib/register-role';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export function AuthLayout() {
  const { t } = useI18n();
  const location = useLocation();
  const [params] = useSearchParams();
  const isLogin = location.pathname === '/login';
  const isRegister = location.pathname === '/register';
  const registerRole = isRegister ? parseRegisterRole(params.get('role')) : null;

  const registerBlurb =
    registerRole === 'CONTRACTOR'
      ? t('auth.registerLeadContractor')
      : registerRole === 'MATERIAL_STORE_OWNER'
        ? t('auth.registerLeadStore')
        : registerRole === 'CUSTOMER'
          ? t('auth.registerLeadCustomer')
          : null;

  const wideHero = isLogin || isRegister;

  return (
    <div
      className={cn(
        'grid min-h-screen',
        // Login + Register ~60/40 (same split); other auth pages stay 50/50
        wideHero ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'lg:grid-cols-2'
      )}
    >
      <aside className="relative hidden overflow-hidden bg-navy-800 lg:flex">
        <img
          src="/images/auth-handshake.jpg"
          alt={t('auth.siteAlt')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover opacity-45',
            wideHero ? 'object-[46%_36%]' : 'object-[56%_38%]'
          )}
        />
        <div className="absolute inset-0 bg-hero-wash" />
        <div className="absolute inset-0 blueprint-frame" />
        <div
          className={cn(
            'relative z-10 flex w-full flex-col justify-between text-white',
            wideHero ? 'p-10 xl:px-12 xl:py-11' : 'p-10'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <Logo inverted />
            <LanguageSwitcher variant="dark" placement="auth-panel" />
          </div>

          {isLogin ? (
            <PartnerRegisterPanel variant="dark" />
          ) : (
            <div className={cn('max-w-md', isRegister && 'xl:max-w-lg')}>
              <p className="text-xs uppercase tracking-[0.28em] text-copper-300">{t('brand.eyebrow')}</p>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">{t('auth.authPanelTitle')}</h1>
              <p className="mt-4 text-white/70">{registerBlurb || t('auth.authPanelBody')}</p>
            </div>
          )}

          <p className="text-sm text-white/50">
            {isLogin ? t('auth.partnerPanelFoot') : t('auth.authPanelFoot')}
          </p>
        </div>
      </aside>
      <main
        className={cn(
          'flex min-h-screen flex-col overflow-y-auto bg-paper-100 px-4 sm:px-6',
          wideHero ? 'py-6 sm:py-8' : 'py-8 sm:py-10'
        )}
      >
        <div className={cn('m-auto w-full', wideHero ? 'max-w-[24rem]' : 'max-w-md')}>
          <div className="mb-6 flex items-center justify-between gap-4 lg:hidden">
            <Logo />
            <LanguageSwitcher variant="light" placement="auth-form" />
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
