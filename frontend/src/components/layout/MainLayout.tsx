import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { CartLink } from '@/features/material-cart/CartLink';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';
import { useAuth } from '@/context/AuthContext';

/** Nút landing theo role. Khách chưa đăng nhập không có nút này. */
const LANDING_ENTRY = {
  CUSTOMER: { to: '/customer/profile', labelKey: 'common.openProfile' },
  CONTRACTOR: { to: '/contractor/dashboard', labelKey: 'common.openDashboard' },
  MATERIAL_STORE_OWNER: { to: '/store/dashboard', labelKey: 'common.openDashboard' },
  STORE: { to: '/store/dashboard', labelKey: 'common.openDashboard' },
} as const;

function landingEntry(role?: string | null) {
  if (!role) return null;
  return LANDING_ENTRY[role as keyof typeof LANDING_ENTRY] ?? null;
}

export function MainLayout() {
  const { pathname } = useLocation();
  const { currentUser: user } = useAuth();
  const entry = landingEntry(user?.role);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <Link to="/explore" className="hover:text-white" onClick={() => setOpen(false)}>
        {t('nav.explore')}
      </Link>
      <a href="/#why" className="hover:text-white" onClick={() => setOpen(false)}>
        {t('nav.why')}
      </a>
      <a href="/#how" className="hover:text-white" onClick={() => setOpen(false)}>
        {t('nav.how')}
      </a>
      <a href="/#services" className="hover:text-white" onClick={() => setOpen(false)}>
        {t('nav.services')}
      </a>
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-800/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <Logo inverted />
          <nav className="hidden items-center gap-8 text-sm text-white/75 md:flex">{links}</nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="dark" placement="main" className="hidden sm:inline-flex" />
            <CartLink tone="dark" />
            {entry ? (
              <Button asChild variant="copper" size="sm">
                <Link to={entry.to}>{t(entry.labelKey)}</Link>
              </Button>
            ) : null}
            {!user ? (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden text-white hover:bg-white/10 sm:inline-flex">
                  <Link to="/login">{t('common.login')}</Link>
                </Button>
                {pathname !== '/register' ? (
                  <Button asChild variant="ghost" size="sm" className="hidden text-white hover:bg-white/10 sm:inline-flex">
                    <Link to="/register">{t('common.getStarted')}</Link>
                  </Button>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white md:hidden"
              aria-label={t('header.openMenu')}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-white/10 bg-navy-800 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3 text-sm text-white/80">{links}</nav>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <LanguageSwitcher variant="dark" placement="mobile" />
              {entry ? (
                <Button asChild variant="copper" size="sm">
                  <Link to={entry.to} onClick={() => setOpen(false)}>
                    {t(entry.labelKey)}
                  </Link>
                </Button>
              ) : null}
              {!user ? (
                <>
                  <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
                    <Link to="/login" onClick={() => setOpen(false)}>
                      {t('common.login')}
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
                    <Link to="/register" onClick={() => setOpen(false)}>
                      {t('common.getStarted')}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
      <Outlet />
    </div>
  );
}
