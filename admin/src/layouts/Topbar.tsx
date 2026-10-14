import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Menu, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/auth.store';
import { NotificationCenter } from '@/components/NotificationCenter';
import { roleLabel } from '@/lib/utils';
import { setAdminLanguage } from '@/locales/i18n';
import { useUiStore } from '@/stores/ui.store';

export function Topbar() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setMobileOpen = useUiStore((s) => s.setMobileOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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
    <header className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] bg-white/75 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" className="rounded-lg border border-[var(--admin-border)] bg-white/70 p-2 text-[var(--admin-text-soft)] lg:hidden" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--admin-text-soft)]">{t('shell.operations')}</p>
          <p className="truncate text-sm font-medium text-[var(--admin-text)]">{user?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <NotificationCenter />
        <button
          type="button"
          onClick={() => setAdminLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
          className="rounded-lg border border-[var(--admin-border)] bg-white/80 px-2.5 py-1.5 text-xs font-semibold uppercase text-[var(--admin-text-soft)]"
        >
          {i18n.language === 'vi' ? 'EN' : 'VI'}
        </button>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-white/80 px-2 py-1.5 text-left hover:bg-slate-100"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-copper-500/15 text-copper-600">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-xs font-semibold text-[var(--admin-text)]">{user?.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wider text-copper-600">{roleLabel(user?.role)}</span>
            </span>
          </button>
          {profileOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-navy-800/10 bg-white p-2 shadow-md">
              <div className="border-b border-navy-800/10 px-2 pb-2">
                <p className="truncate text-sm font-semibold text-navy-800">{user?.name}</p>
                <p className="truncate text-xs text-ink-400">{user?.email}</p>
              </div>
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-copper-600">
                {roleLabel(user?.role)}
              </p>
              <Link
                to="/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-600 hover:bg-paper-100 hover:text-navy-800"
              >
                <UserRound className="h-4 w-4" />
                {t('shell.profile')}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
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
