import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/DashboardShell';
import {
  Bell,
  ClipboardList,
  FileText,
  MessageSquare,
  Layers,
  LayoutDashboard,
  Package,
  Truck,
  BadgeCheck,
  Star,
  Store,
  UserRound,
  Wallet,
} from 'lucide-react';
import { ActivationPanel } from '@/components/partner/ActivationPanel';
import { materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

export function StoreLayout() {
  const { t } = useI18n();

  const profileGroup = t('nav.store.profileGroup');
  const materialsGroup = t('nav.store.materialsGroup');
  const reputationGroup = t('nav.store.reputationGroup');
  const accountGroup = t('nav.store.accountGroup');
  const items = [
    { to: '/store/dashboard', label: t('nav.store.overview'), icon: LayoutDashboard, end: true },
    { to: '/store/profile/edit', label: t('nav.store.publicProfile'), icon: Store, section: profileGroup },
    { to: '/store/verification', label: t('nav.store.verification'), icon: FileText, section: profileGroup },
    { to: '/store/materials', label: t('nav.store.catalog'), icon: Layers, section: materialsGroup, end: true },
    { to: '/store/products', label: t('nav.store.products'), icon: Package, section: materialsGroup },
    { to: '/store/delivery', label: t('nav.store.delivery'), icon: Truck, section: materialsGroup },
    { to: '/store/orders', label: t('nav.store.orders'), icon: ClipboardList, section: materialsGroup },
    { to: '/store/material-requests', label: t('nav.store.materialRequests'), icon: ClipboardList, section: materialsGroup },
    { to: '/store/chat', label: t('nav.store.messages'), icon: MessageSquare, section: materialsGroup },
    { to: '/store/reviews', label: t('nav.store.reviews'), icon: Star, section: reputationGroup },
    { to: '/store/reputation', label: t('nav.store.reputation'), icon: BadgeCheck, section: reputationGroup },
    { to: '/store/earnings', label: t('nav.store.earnings'), icon: Wallet, section: accountGroup },
    { to: '/store/notifications', label: t('nav.store.alerts'), icon: Bell, section: accountGroup },
    { to: '/store/profile', label: t('nav.store.account'), icon: UserRound, section: accountGroup },
  ];

  return <DashboardShell variant="store" items={items} />;
}

export default function StoreDashboard() {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState(null);

  function load() {
    materialStoreApi
      .workspace()
      .then((res) => setWorkspace(res.data.data))
      .catch(() => setWorkspace(null));
  }

  useEffect(() => {
    load();
  }, []);

  const store = workspace?.store;
  const approved = Boolean(workspace?.approved);

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-copper-500">{t('role.MATERIAL_STORE_OWNER')}</p>
      <h1 className="mt-2 text-3xl font-semibold text-navy-800">{store?.name || t('verify.storeTitle')}</h1>
      {approved ? <ActivationPanel activation={workspace?.activation} onChanged={load} /> : (
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">{t('verify.storeDescription')}</p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={approved ? '/store/profile/edit' : '/store/verification'} className="inline-flex h-10 items-center rounded-lg bg-navy-800 px-4 text-sm font-medium text-white">
          {approved ? t('nav.store.publicProfile') : t('nav.store.verification')}
        </Link>
        {approved ? (
          <Link to="/store/materials" className="inline-flex h-10 items-center rounded-lg border border-navy-800/15 bg-white px-4 text-sm font-medium text-navy-800">
            {t('nav.store.catalog')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
