import { useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { CartLink } from '@/features/material-cart/CartLink';
import { NotificationBell } from '@/features/notification/components/NotificationBell';
import { MaterialOrderLiveListener } from '@/features/material-orders/material-order-live';
import { OrderRealtimeListener } from '@/features/orders/components/OrderRealtimeListener';
import { FinanceRealtimeListener } from '@/features/payments/components/FinanceRealtimeListener';
import { customerNav } from '@/components/layout/roleNav';
import { useAuth } from '@/context/AuthContext';
import { mediaUrl } from '@/lib/partner-api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

const BOTTOM_PATHS = [
  '/customer/dashboard',
  '/customer/explore',
  '/customer/request/history',
  '/customer/orders',
  '/customer/profile',
];

/** Marketplace shell cho khách hàng: header trên desktop, thanh dưới trên mobile. */
export function CustomerLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser: user, logout } = useAuth();
  const items = useMemo(() => customerNav(t), [t]);
  const bottom = items.filter((item) => BOTTOM_PATHS.includes(item.to));

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f6f7f4]">
      <header className="sticky top-0 z-40 border-b border-navy-800/8 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <Logo to="/customer/dashboard" />
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher variant="light" placement="customer-header" className="hidden sm:inline-flex" />
            <CartLink />
            <NotificationBell />
            <Dropdown
              trigger={
                <button type="button" className="rounded-full" aria-label={t('profile.menu')}>
                  <Avatar name={user.name} src={mediaUrl(user.avatar)} />
                </button>
              }
              items={[
                { label: t('nav.customer.profile'), onSelect: () => navigate('/customer/profile') },
                { label: t('nav.customer.reviews'), onSelect: () => navigate('/customer/reviews') },
                { label: t('nav.customer.complaints'), onSelect: () => navigate('/customer/complaints') },
                { label: t('nav.customer.alerts'), onSelect: () => navigate('/customer/notifications') },
                {
                  label: t('common.logout'),
                  danger: true,
                  onSelect: () => {
                    void logout().then(() => navigate('/login'));
                  },
                },
              ]}
            />
            <button
              type="button"
              className="hidden items-center gap-1 rounded-full px-2 text-sm text-ink-600 md:inline-flex"
              onClick={() => void logout().then(() => navigate('/login'))}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 md:flex">
          {items
            .filter((item) => item.to !== '/customer/profile' && item.to !== '/customer/notifications')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-navy-800 text-white hover:bg-navy-800 hover:text-white'
                      : 'text-ink-600 hover:bg-paper-100 hover:text-navy-800'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-8">
        <OrderRealtimeListener />
        <MaterialOrderLiveListener />
        <FinanceRealtimeListener />
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-800/10 bg-white md:hidden">
        <ul className="grid grid-cols-5">
          {bottom.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium text-ink-400',
                    isActive && 'text-navy-800'
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
