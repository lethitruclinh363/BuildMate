import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { QueryState } from '@/components/feedback/QueryState';
import { Button } from '@/components/ui/Button';
import { notificationApi } from '@/features/chat/services/sprint4.api';
import { useI18n } from '@/locales';
import { notificationTitle } from '@/features/notification/notificationLabel';
import { useSocket } from '@/providers/SocketProvider';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/lib/api';
import type { AppNotification } from '@/types/sprint4';

export function NotificationsPage() {
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const { setNotifications } = useSocket();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    notificationApi
      .list()
      .then((res) => {
        setItems(res.data.data.items);
        setUnread(res.data.data.unread);
        setNotifications(res.data.data.items, res.data.data.unread);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('notify.pageEyebrow')}
        title={t('notify.pageTitle')}
        description={t('notify.pageDesc')}
        actions={
          unread > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void notificationApi.readAll().then(() => {
                  setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
                  setUnread(0);
                  setNotifications(
                    items.map((n) => ({ ...n, isRead: true })),
                    0
                  );
                });
              }}
            >
              {t('notify.markAll')}
            </Button>
          ) : null
        }
      />
      <QueryState
        loading={loading}
        error={error}
        empty={items.length === 0}
        emptyTitle={t('notify.empty')}
        emptyBody={t('notify.pageDesc')}
        emptyIcon={<Bell className="h-5 w-5" />}
        onRetry={load}
      >
        <ul className="divide-y divide-navy-800/8 overflow-hidden rounded-[22px] border border-navy-800/8 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-paper-100', !n.isRead && 'bg-copper-50/60')}
                onClick={() => {
                  void notificationApi.read(n.id);
                  setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-ink-200' : 'bg-copper-400')} />
                <span>
                  <span className="block font-semibold text-navy-800">{notificationTitle(t, n)}</span>
                  <span className="mt-1 block text-sm text-ink-400">{n.message}</span>
                  <span className="mt-1 block text-xs text-ink-400">{new Date(n.createdAt).toLocaleString()}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </QueryState>
    </PageTransition>
  );
}
