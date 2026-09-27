import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  Flag,
  LayoutDashboard,
  PanelLeftClose,
  Percent,
  ScrollText,
  Settings,
  ShieldAlert,
  Star,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/auth/auth.store';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui.store';

const items = [
  { to: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/users', key: 'users', icon: Users },
  { to: '/contractors', key: 'contractors', icon: Building2 },
  { to: '/material-stores', key: 'stores', icon: Store },
  { to: '/verification', key: 'verification', icon: BadgeCheck },
  { to: '/orders', key: 'orders', icon: ClipboardList },
  { to: '/payments', key: 'payments', icon: CreditCard },
  { to: '/commission', key: 'commission', icon: Percent },
  { to: '/reviews', key: 'reviews', icon: Star },
  { to: '/complaints', key: 'complaints', icon: ShieldAlert },
  { to: '/analytics', key: 'analytics', icon: BarChart3 },
  { to: '/audit', key: 'audit', icon: ScrollText },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = useUiStore((s) => s.collapsed);
  const mobileOpen = useUiStore((s) => s.mobileOpen);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const setMobileOpen = useUiStore((s) => s.setMobileOpen);

  const nav = (
    <>
      <div className={cn('flex items-center gap-3 px-4 py-6', collapsed && 'justify-center px-2')}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-copper-500 text-navy-950">
          <Flag className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-white">{t('brand')}</p>
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('tagline')}</p>
          </div>
        ) : null}
        <button type="button" className="ml-auto text-white/50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={t(`nav.${item.key}`)}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/6 hover:text-white',
                  collapsed && 'justify-center px-2',
                  isActive && 'bg-copper-500/15 text-copper-300'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-full bg-copper-400 shadow-[0_0_12px_#c89445]" /> : null}
                  <motion.span whileHover={{ scale: 1.12 }} className="grid place-items-center">
                    <Icon className="h-4 w-4" />
                  </motion.span>
                  {!collapsed ? t(`nav.${item.key}`) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/8">
        {!collapsed && user ? (
          <div className="px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/40">{user.email}</p>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 text-xs text-white/45 hover:text-white"
            >
              {t('common.logout')}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden w-full items-center gap-2 px-4 py-4 text-xs text-white/40 hover:text-white lg:flex"
        >
          <PanelLeftClose className="h-4 w-4" />
          {!collapsed ? t('shell.collapse') : null}
        </button>
      </div>
    </>
  );

  return (
    <>
      {mobileOpen ? (
        <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      ) : null}
      <aside
        className={cn(
          'z-50 flex h-screen shrink-0 flex-col border-r border-white/8 bg-navy-900 transition-[width,transform] duration-300',
          'fixed inset-y-0 left-0 lg:static lg:h-full',
          collapsed ? 'lg:w-[84px]' : 'lg:w-[260px]',
          mobileOpen ? 'w-[260px] translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {nav}
      </aside>
    </>
  );
}
