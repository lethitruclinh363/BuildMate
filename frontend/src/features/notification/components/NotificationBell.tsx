import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationApi } from '@/features/chat/services/sprint4.api';
import { useSocket } from '@/providers/SocketProvider';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import { notificationTitle } from '@/features/notification/notificationLabel';
import { useAuthStore } from '@/store/auth.store';
import { roleHome } from '@/store/auth.store';

function inboxPath(role?: string | null) {
  if (!role) return '/login';
  const prefix = roleHome[role as keyof typeof roleHome]?.split('/')[1] || 'customer';
  return `/${prefix}/notifications`;
}

export function NotificationBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { notifications, unread, setNotifications } = useSocket();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notificationApi
      .list()
      .then((res) => setNotifications(res.data.data.items, res.data.data.unread))
      .catch(() => undefined);
  }, [setNotifications]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        className="relative rounded-full p-2 hover:bg-navy-800/5"
        aria-label={t('notify.aria')}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5 text-navy-800" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-copper-400 px-1 text-[10px] font-bold text-navy-900">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-navy-800/10 bg-white shadow-lift">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-display text-navy-800">{t('notify.title')}</p>
            <button
              type="button"
              className="text-xs font-semibold text-copper-600"
              onClick={() => {
                void notificationApi.readAll().then(() =>
                  setNotifications(
                    notifications.map((n) => ({ ...n, isRead: true })),
                    0
                  )
                );
              }}
            >
              {t('notify.markAll')}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink-400">{t('notify.empty')}</li>
            ) : (
              notifications.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left text-sm hover:bg-paper-100',
                      !n.isRead && 'bg-copper-50/60'
                    )}
                    onClick={() => {
                      void notificationApi.read(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <p className="font-semibold text-navy-800">{notificationTitle(t, n)}</p>
                    <p className="text-ink-400">{n.message}</p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            className="w-full border-t border-navy-800/8 py-3 text-center text-sm font-semibold text-navy-800 hover:bg-paper-100"
            onClick={() => {
              setOpen(false);
              navigate(inboxPath(role));
            }}
          >
            {t('notify.viewAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
