import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Menu, Moon, Search, SunMedium, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { NotificationCenter } from '@/components/NotificationCenter';
import { roleLabel } from '@/lib/utils';
import { setAdminLanguage } from '@/locales/i18n';
import { applyAdminTheme, useUiStore } from '@/stores/ui.store';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'oled' : 'dark';
    setTheme(next);
    applyAdminTheme(next);
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-navy-900/40 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" className="rounded-lg border border-white/10 p-2 lg:hidden" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">{t('shell.operations')}</p>
          <p className="truncate text-sm text-white/80">{user?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          {t('shell.search')}
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>
        <button type="button" className="rounded-xl border border-white/10 p-2 md:hidden" onClick={() => setSearchOpen(true)}>
          <Search className="h-4 w-4" />
        </button>
        <NotificationCenter />
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? t('shell.oled') : t('shell.dark')}
          className="rounded-xl border border-white/10 p-2 text-white/70"
        >
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setAdminLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase text-white/60"
        >
          {i18n.language === 'vi' ? 'EN' : 'VI'}
        </button>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5 text-left"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-copper-500/15 text-copper-300">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-xs font-semibold text-white">{user?.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wider text-copper-400">{roleLabel(user?.role)}</span>
            </span>
          </button>
          {profileOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-white/10 bg-navy-900 p-3 shadow-xl">
              <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
              <p className="truncate text-xs text-white/50">{user?.email}</p>
              <p className="mt-2 inline-flex rounded-full border border-copper-500/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-copper-300">
                {roleLabel(user?.role)}
              </p>
              <Link
                to="/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-3 flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-white/70 hover:bg-white/6 hover:text-white"
              >
                <UserRound className="h-4 w-4" />
                {t('shell.profile')}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-red-300 hover:bg-white/6"
              >
                <LogOut className="h-4 w-4" />
                {t('common.logout')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
