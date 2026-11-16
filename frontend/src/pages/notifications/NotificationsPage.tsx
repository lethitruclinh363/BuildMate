import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { QueryState } from '@/components/feedback/QueryState';
import { Button } from '@/components/ui/Button';
import { notificationApi } from '@/features/chat/services/sprint4.api';
import { useI18n } from '@/locales';
import { notificationMessage, notificationTitle } from '@/features/notification/notificationLabel';
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (nextPage = 1) => {
    if (nextPage === 1) setLoading(true);
    else setMore(true);
    setError(null);
    notificationApi
      .list(nextPage)
      .then((res) => {
        const data = res.data.data;
        setItems((prev) => (nextPage === 1 ? data.items : [...prev, ...data.items]));
        setUnread(data.unread);
        setTotal(data.total || data.items.length);
        setPage(data.page || nextPage);
        if (nextPage === 1) setNotifications(data.items, data.unread);
      })
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => {
        setLoading(false);
        setMore(false);
      });
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
        onRetry={() => load(1)}
      >
        <ul className="divide-y divide-navy-800/8 overflow-hidden rounded-[22px] border border-navy-800/8 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-paper-100', !n.isRead && 'bg-copper-50/60')}
                onClick={() => {
                  const wasUnread = !n.isRead;
                  void notificationApi.read(n.id);
                  setItems((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
                  if (wasUnread) setUnread((count) => Math.max(0, count - 1));
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-ink-200' : 'bg-copper-400')} />
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-navy-800">{notificationTitle(t, n)}</span>
                  <span className="mt-1 block break-words text-sm text-ink-400">{notificationMessage(t, n)}</span>
                  <span className="mt-1 block text-xs text-ink-400">{new Date(n.createdAt).toLocaleString()}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {items.length < total ? (
          <Button className="mt-4" variant="outline" loading={more} onClick={() => load(page + 1)}>
            {t('notify.more')}
          </Button>
        ) : null}
      </QueryState>
    </PageTransition>
  );
}
