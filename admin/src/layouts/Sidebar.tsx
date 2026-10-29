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
  Landmark,
  LayoutDashboard,
  Percent,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
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
  { to: '/material-orders', key: 'materialOrders', icon: ShoppingBag },
  { to: '/services', key: 'serviceCatalog', icon: Wrench },
  { to: '/payments', key: 'payments', icon: CreditCard },
  { to: '/escrow', key: 'escrow', icon: Landmark },
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
            'group relative flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[13px] font-medium leading-none text-[#C4D1DE] transition-all duration-150 hover:bg-white/10 hover:text-white',
            collapsed && 'justify-center px-2',
            isActive && 'bg-[#234E66] text-white font-semibold shadow-sm'
          )
        }
      >
        {() => (
          <>
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              <Icon className="h-4 w-4" />
            </span>
            {!collapsed ? <span className="truncate">{t(`nav.${item.key}`)}</span> : null}
          </>
        )}
      </NavLink>
    );
  }

  const nav = (
    <>
      <div className={cn('flex h-[72px] items-center gap-3 px-3', collapsed && 'justify-center px-2')}>
        <img src="/brand-logo.png" alt="BuildMate" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold tracking-tight text-white">{t('brand')}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#8FB1CA]">{t('tagline')}</p>
          </div>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded-md bg-white/8 p-1.5 text-[#C4D1DE] transition hover:bg-white/15 hover:text-white"
          onClick={() => (mobileOpen ? setMobileOpen(false) : toggleCollapsed())}
          aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {items.map((item) => renderNavItem(item))}
        <p className={cn('px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7E9DB5]', collapsed && 'px-1 text-center')}>
          {collapsed ? '•' : t('nav.partners')}
        </p>
        {partnerItems.map((item) => renderNavItem(item))}
        <p className={cn('px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7E9DB5]', collapsed && 'px-1 text-center')}>
          {collapsed ? '•' : t('nav.system')}
        </p>
        {systemItems.map((item) => renderNavItem(item))}
      </nav>
      <div className="mt-auto border-t border-white/10 p-2.5">
        {!collapsed && user ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-[#102D3D] border border-white/10 px-2.5 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2B6280] text-[11px] font-bold text-white shadow-inner shadow-white/10">
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
              <p className="truncate text-[10px] tracking-[0.12em] text-[#8FB1CA]">{roleLabel(user.role)}</p>
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
          'z-50 flex h-screen shrink-0 flex-col border-r border-white/10 bg-[var(--admin-sidebar)] text-white shadow-[8px_0_24px_rgba(15,23,42,0.12)] transition-[width,transform] duration-300',
          'fixed inset-y-0 left-0 lg:static lg:h-full',
          collapsed ? 'lg:w-[82px]' : 'lg:w-[232px]',
          mobileOpen ? 'w-[232px] translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {nav}
      </aside>
    </>
  );
}
