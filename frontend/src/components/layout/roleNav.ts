import {
  BadgeCheck,
  Bell,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Package,
  Scale,
  Star,
  Store,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { DashboardNavItem } from './DashboardShell';

type Translate = (path: string) => string;

export function customerNav(t: Translate): DashboardNavItem[] {
  return [
    { to: '/customer/dashboard', label: t('nav.customer.home'), icon: LayoutDashboard, end: true },
    { to: '/customer/explore', label: t('nav.customer.search'), icon: MapPin },
    { to: '/customer/request/history', label: t('nav.customer.requests'), icon: Wrench },
    { to: '/customer/chat', label: t('nav.customer.messages'), icon: MessageSquare },
    { to: '/customer/orders', label: t('nav.customer.orders'), icon: ClipboardList },
    { to: '/customer/material-orders', label: t('nav.customer.materialOrders'), icon: Package },
    { to: '/customer/reviews', label: t('nav.customer.reviews'), icon: Star },
    { to: '/customer/complaints', label: t('nav.customer.complaints'), icon: Scale },
    { to: '/customer/notifications', label: t('nav.customer.alerts'), icon: Bell },
    { to: '/customer/profile', label: t('nav.customer.profile'), icon: UserRound },
  ];
}

export function contractorNav(t: Translate): DashboardNavItem[] {
  return [
    { to: '/contractor/dashboard', label: t('nav.contractor.overview'), icon: LayoutDashboard, end: true },
    { to: '/contractor/profile/edit', label: t('nav.contractor.publicProfile'), icon: Store },
    { to: '/contractor/verification', label: t('nav.contractor.profile'), icon: ClipboardCheck },
    { to: '/contractor/services', label: t('nav.contractor.services'), icon: Wrench },
    { to: '/contractor/requests', label: t('nav.contractor.requests'), icon: Inbox },
    { to: '/contractor/orders', label: t('nav.contractor.orders'), icon: ClipboardList },
    { to: '/contractor/earnings', label: t('nav.contractor.revenue'), icon: Wallet },
    { to: '/contractor/reviews', label: t('nav.contractor.reviews'), icon: Star },
    { to: '/contractor/reputation', label: t('nav.contractor.reputation'), icon: BadgeCheck },
    { to: '/contractor/notifications', label: t('nav.contractor.alerts'), icon: Bell },
    { to: '/contractor/account', label: t('nav.contractor.account'), icon: UserRound },
  ];
}
