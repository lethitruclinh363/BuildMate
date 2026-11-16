import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { NotificationBell } from '@/features/notification/components/NotificationBell';
import { OrderRealtimeListener } from '@/features/orders/components/OrderRealtimeListener';
import { FinanceRealtimeListener } from '@/features/payments/components/FinanceRealtimeListener';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types/user';

export type DashboardVariant = 'customer' | 'contractor' | 'store';

export type DashboardNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  section?: string;
};

function navItemActive(to: string, end: boolean | undefined, pathname: string, search: string) {
  const url = new URL(to, 'http://local');
  if (pathname !== url.pathname && (end || !pathname.startsWith(`${url.pathname}/`))) return false;
  const expectedStep = url.searchParams.get('step');
  if (expectedStep) {
    const actualStep = new URLSearchParams(search).get('step') || 'info';
    return actualStep === expectedStep;
  }
  if (end) return !new URLSearchParams(search).get('step');
  return true;
}

const variantTheme: Record<
  DashboardVariant,
  { aside: string; activeNav: string; header: string; main: string; dense: boolean }
> = {
  customer: {
    aside: 'bg-navy-800',
    activeNav: 'bg-white/10 font-semibold text-white',
    header: 'bg-paper-50/90',
    main: 'bg-mist-100',
    dense: false,
  },
  contractor: {
    aside: 'bg-[#29404d]',
    activeNav: 'bg-white/10 font-semibold text-white',
    header: 'bg-paper-50/95',
    main: 'bg-[#f3f5f8]',
    dense: true,
  },
  // Same navy-gray family as contractor (#29404d); solid active for store identity
  store: {
    aside: 'bg-[#29404d]',
    activeNav: 'bg-[#3A5866] font-semibold text-white',
    header: 'bg-paper-50/95',
    main: 'bg-[#f3f5f8]',
    dense: true,
  },
};

function accountPath(role: UserRole) {
  if (role === 'MATERIAL_STORE_OWNER') return '/store/profile';
  if (role === 'CUSTOMER' || role === 'CONTRACTOR') {
    return `/${role.toLowerCase()}/profile`;
  }
  return '/login';
}

export function DashboardShell({
  variant,
  items,
  children,
}: {
  variant: DashboardVariant;
  items: DashboardNavItem[];
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentUser: user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const location = useLocation();
  const theme = variantTheme[variant];

  if (!user) return null;

  const dashboardPath = variant === 'customer' ? '/customer/dashboard' : user.role === 'MATERIAL_STORE_OWNER' ? '/store/dashboard' : '/contractor/dashboard';

  const sidebar = (
    <>
      <div className={cn('flex items-center justify-between px-4', theme.dense ? 'h-14' : 'h-16')}>
        <Logo inverted compact={collapsed && !mobileOpen} to={dashboardPath} />
        {mobileOpen || variant !== 'store' ? (
          <button
            type="button"
            onClick={() => (mobileOpen ? setMobileOpen(false) : setCollapsed((v) => !v))}
            className="rounded-full bg-white/10 p-1.5 hover:bg-white/15"
            aria-label={t('header.toggleSidebar')}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <nav className={cn('flex-1 space-y-1 overflow-y-auto px-3 py-3', theme.dense && 'py-2')}>
        {items.map((item, index) => {
          const showSection = Boolean(item.section) && item.section !== items[index - 1]?.section && (!collapsed || mobileOpen);
          const active = navItemActive(item.to, item.end, location.pathname, location.search);
          return (
            <div key={`${item.to}-${item.label}`}>
              {showSection ? (
                <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase text-white/45">{item.section}</p>
              ) : null}
              <NavLink
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={() =>
                  cn(
                    'flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 text-sm font-medium text-white/70 hover:bg-white/8 hover:text-white',
                    theme.dense ? 'py-2' : 'py-2.5',
                    active && theme.activeNav
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed || mobileOpen ? item.label : null}
              </NavLink>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          className={cn('flex w-full items-center gap-3 p-2 text-left', collapsed && !mobileOpen && 'justify-center')}
          onClick={() => {
            setMobileOpen(false);
            navigate(accountPath(user.role));
          }}
        >
          <Avatar name={user.name} src={mediaUrl(user.avatar)} size="sm" />
          {!collapsed || mobileOpen ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-[11px] tracking-wider text-white/50">{t(`role.${user.role}`)}</p>
            </div>
          ) : null}
        </button>
      </div>
    </>
  );

  return (
    <div className={cn('flex min-h-screen', theme.main)}>
      <motion.aside
        animate={{ width: collapsed ? 84 : theme.dense ? 244 : 268 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={cn('sticky top-0 hidden h-screen flex-col border-r border-navy-800/8 text-white md:flex', theme.aside)}
      >
        {sidebar}
      </motion.aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-navy-900/50" aria-label={t('common.close')} onClick={() => setMobileOpen(false)} />
          <aside className={cn('relative z-10 flex h-full w-[min(88vw,280px)] flex-col text-white shadow-lift', theme.aside)}>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-navy-800/8 px-3 backdrop-blur md:px-8',
            theme.header,
            theme.dense ? 'h-14' : 'h-16'
          )}
        >
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-navy-800/10 bg-white md:hidden"
            aria-label={t('header.openMenu')}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher variant="light" placement="dashboard" />
            <NotificationBell />
            <Dropdown
              trigger={
                <button type="button" className="rounded-full">
                  <Avatar name={user.name} src={mediaUrl(user.avatar)} />
                </button>
              }
              items={[
                { label: t('profile.menu'), onSelect: () => navigate(accountPath(user.role)) },
                {
                  label: t('common.logout'),
                  danger: true,
                  onSelect: () => {
                    void logout().then(() => navigate('/login', { replace: true }));
                  },
                },
              ]}
            />
            <button
              type="button"
              className="hidden items-center gap-2 rounded-full px-2 text-sm font-medium text-ink-600 md:flex"
              onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className={cn('flex-1', theme.dense ? 'p-3 md:p-6' : 'p-4 md:p-8')}>
          <OrderRealtimeListener />
          <FinanceRealtimeListener />
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
