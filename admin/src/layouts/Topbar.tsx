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
    <header className="relative z-30 flex items-center justify-between gap-3 border-b border-[#E1E7ED] bg-white px-4 py-3 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" className="rounded-lg border border-[#E1E7ED] bg-white p-2 text-[#526477] hover:bg-[#F8FAFC] lg:hidden" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#526477]">{t('shell.operations')}</p>
          <p className="truncate text-sm font-semibold text-[#16283C]">{user?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <NotificationCenter />
        <button
          type="button"
          onClick={() => setAdminLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
          className="rounded-lg border border-[#E1E7ED] bg-white px-2.5 py-1.5 text-xs font-semibold uppercase text-[#526477] hover:bg-[#F8FAFC] hover:text-[#16283C]"
        >
          {i18n.language === 'vi' ? 'EN' : 'VI'}
        </button>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-[#E1E7ED] bg-white px-2 py-1.5 text-left hover:bg-[#F8FAFC]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#EBF3F7] text-[#173B4F]">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-xs font-semibold text-[#16283C]">{user?.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wider text-[#526477]">{roleLabel(user?.role)}</span>
            </span>
          </button>
          {profileOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-[#E1E7ED] bg-white p-2 shadow-lg">
              <div className="border-b border-[#E1E7ED] px-2 pb-2">
                <p className="truncate text-sm font-semibold text-[#16283C]">{user?.name}</p>
                <p className="truncate text-xs text-[#526477]">{user?.email}</p>
              </div>
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#2B6280]">
                {roleLabel(user?.role)}
              </p>
              <Link
                to="/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#16283C] hover:bg-[#F1F5F9]"
              >
                <UserRound className="h-4 w-4 text-[#526477]" />
                {t('shell.profile')}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50"
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
