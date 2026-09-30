import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/DashboardShell';
import {
  BadgeDollarSign,
  Bell,
  ClipboardList,
  FileText,
  Layers,
  LayoutDashboard,
  Package,
  Send,
  Star,
  Store,
  UserRound,
  Wallet,
} from 'lucide-react';
import { materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

export function StoreLayout() {
  const { t } = useI18n();

  const profileGroup = t('nav.store.profileGroup');
  const materialsGroup = t('nav.store.materialsGroup');
  const items = [
    { to: '/store/dashboard', label: t('nav.store.overview'), icon: LayoutDashboard, end: true },
    { to: '/store/verification?step=info', label: t('nav.store.info'), icon: Store, section: profileGroup },
    { to: '/store/verification?step=documents', label: t('nav.store.documents'), icon: FileText, section: profileGroup },
    { to: '/store/verification?step=submit', label: t('nav.store.submit'), icon: Send, section: profileGroup },
    { to: '/store/materials', label: t('nav.store.catalog'), icon: Layers, section: materialsGroup, end: true },
    { to: '/store/products', label: t('nav.store.products'), icon: Package, section: materialsGroup },
    { to: '/store/prices', label: t('nav.store.prices'), icon: BadgeDollarSign, section: materialsGroup },
    { to: '/store/orders', label: t('nav.store.orders'), icon: ClipboardList },
    { to: '/store/earnings', label: t('nav.store.earnings'), icon: Wallet },
    { to: '/store/reviews', label: t('nav.store.reviews'), icon: Star },
    { to: '/store/notifications', label: t('nav.store.alerts'), icon: Bell },
    { to: '/store/profile', label: t('nav.store.account'), icon: UserRound },
  ];

  return <DashboardShell variant="contractor" items={items} />;
}

export default function StoreDashboard() {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    materialStoreApi
      .workspace()
      .then((res) => setWorkspace(res.data.data))
      .catch(() => setWorkspace(null));
  }, []);

  const store = workspace?.store;
  const approved = Boolean(workspace?.approved);

  return (
    <div className="rounded-[28px] border border-navy-800/8 bg-white p-8 shadow-card">
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('role.MATERIAL_STORE_OWNER')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{store?.name || t('verify.storeTitle')}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
        {approved ? t('verify.storeLiveHint') : t('verify.storeDescription')}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/store/verification?step=info" className="rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white">
          {t('nav.store.profileGroup')}
        </Link>
        {approved ? (
          <Link to="/store/materials" className="rounded-full border border-navy-800/15 px-5 py-2.5 text-sm font-semibold text-navy-800">
            {t('nav.store.catalog')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
