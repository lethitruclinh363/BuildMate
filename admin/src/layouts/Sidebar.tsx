import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Percent,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  Wrench,
  Star,
  Store,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/auth/auth.store';
import { cn, roleLabel } from '@/lib/utils';
import { useUiStore } from '@/stores/ui.store';

const items = [
  { to: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/users', key: 'users', icon: Users },
  { to: '/contractors', key: 'contractors', icon: Building2 },
  { to: '/material-stores', key: 'stores', icon: Store },
  { to: '/orders', key: 'orders', icon: ClipboardList },
  { to: '/services', key: 'serviceCatalog', icon: Wrench },
  { to: '/payments', key: 'payments', icon: CreditCard },
  { to: '/commission', key: 'commission', icon: Percent },
  { to: '/reviews', key: 'reviews', icon: Star },
  { to: '/complaints', key: 'complaints', icon: ShieldAlert },
  { to: '/analytics', key: 'analytics', icon: BarChart3 },
  { to: '/audit', key: 'audit', icon: ScrollText },
] as const;

const partnerItems = [
  { to: '/partners/contractors', key: 'contractorApplications', icon: BadgeCheck },
  { to: '/partners/stores', key: 'storeApplications', icon: Store },
] as const;

const systemItems = [
  { to: '/settings', key: 'settings', icon: Settings },
  { to: '/policies', key: 'policies', icon: Scale },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const collapsed = useUiStore((s) => s.collapsed);
  const mobileOpen = useUiStore((s) => s.mobileOpen);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const setMobileOpen = useUiStore((s) => s.setMobileOpen);

  function renderNavItem(item: (typeof items)[number] | (typeof systemItems)[number] | (typeof partnerItems)[number]) {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        title={t(`nav.${item.key}`)}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            'group relative flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/8 hover:text-white',
            collapsed && 'justify-center px-2',
            isActive && 'bg-white/10 font-semibold text-white'
          )
        }
      >
        {() => (
          <>
            <span className="grid place-items-center">
              <Icon className="h-4 w-4" />
            </span>
            {!collapsed ? t(`nav.${item.key}`) : null}
          </>
        )}
      </NavLink>
    );
  }

  const nav = (
    <>
      <div className={cn('flex h-14 items-center justify-between px-4', collapsed && 'justify-center px-2')}>
        <img src="/brand-logo.png" alt="BuildMate" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-bold tracking-tight text-white">{t('brand')}</p>
            <p className="truncate text-[11px] font-medium text-white/70">{t('tagline')}</p>
          </div>
        ) : null}
        <button
          type="button"
          className="rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/15"
          onClick={() => (mobileOpen ? setMobileOpen(false) : toggleCollapsed())}
          aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {items.map((item) => renderNavItem(item))}
        <p className={cn('px-3 pb-1 pt-4 text-xs font-semibold uppercase text-white/40', collapsed && 'px-2 text-center')}>
          {collapsed ? '·' : t('nav.partners')}
        </p>
        {partnerItems.map((item) => renderNavItem(item))}
        <p className={cn('px-3 pb-1 pt-4 text-xs font-semibold uppercase text-white/40', collapsed && 'px-2 text-center')}>
          {collapsed ? '·' : t('nav.system')}
        </p>
        {systemItems.map((item) => renderNavItem(item))}
      </nav>
      <div className="mt-auto border-t border-white/10 p-3">
        {!collapsed && user ? (
          <div className="flex items-center gap-3 px-1 py-1">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-800 text-sm font-bold text-white">
              {user.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-[11px] tracking-wider text-white/50">{roleLabel(user.role)}</p>
            </div>
          </div>
        ) : null}
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
          'z-50 flex h-screen shrink-0 flex-col border-r border-white/10 bg-[#29404d] transition-[width,transform] duration-300',
          'fixed inset-y-0 left-0 lg:static lg:h-full',
          collapsed ? 'lg:w-[84px]' : 'lg:w-[244px]',
          mobileOpen ? 'w-[244px] translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {nav}
      </aside>
    </>
  );
}
