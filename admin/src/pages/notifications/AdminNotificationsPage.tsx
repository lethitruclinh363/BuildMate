import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { AdminNotificationList, adminNotificationHref } from '@/components/NotificationCenter';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { invalidateCache } from '@/lib/cache';
import { adminApi } from '@/services/admin.api';
import type { AdminNotification } from '@/features/dashboard/types/dashboard.types';

export function AdminNotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      invalidateCache('admin-notifications');
      const data = await adminApi.listNotifications();
      setItems(data.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markAll = () => {
    const previous = items;
    setItems((rows) => rows.map((item) => ({ ...item, isRead: true })));
    void adminApi.markNotificationsRead().catch(() => setItems(previous));
  };

  const openItem = (item: AdminNotification) => {
    if (!item.isRead) {
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
      void adminApi.markNotificationRead(item.id).catch(() => {
        void load();
      });
    }
    const href = adminNotificationHref(item.link);
    if (href && href.split(/[?#]/)[0] !== '/notifications') navigate(href);
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('notify.title')}
        title={t('notify.title')}
        description={t('notify.pageDesc')}
        actions={
          <Button variant="outline" onClick={markAll} disabled={items.length === 0}>
            {t('notify.markAll')}
          </Button>
        }
      />
      {loading ? <Spinner /> : null}
      {!loading && error ? <ErrorState onRetry={() => void load()} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState icon={<Bell className="h-5 w-5" />} title={t('notify.empty')} />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="admin-inbox">
          <ul className="admin-inbox__list">
            <AdminNotificationList items={items} onOpen={openItem} />
          </ul>
        </div>
      ) : null}
    </div>
  );
}
