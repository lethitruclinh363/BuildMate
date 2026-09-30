import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { adminApi } from '@/services/admin.api';
import { invalidateCache } from '@/lib/cache';
import { relativeTime } from '@/features/dashboard/lib/format';
import type { AdminNotification } from '@/features/dashboard/types/dashboard.types';

const LEGACY_WORKER_NOTICE: Record<string, string> = {
  WORKER_ASSIGNED: 'notify.accepted',
  WORKER_ACCEPTED: 'notify.accepted',
  WORKER_STARTED: 'notify.started',
  WORKER_COMPLETED: 'notify.completed',
};

function noticeTitle(item: AdminNotification, translate: (key: string) => string) {
  const key = LEGACY_WORKER_NOTICE[item.type] || LEGACY_WORKER_NOTICE[item.title];
  return key ? translate(key) : item.title;
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async (force = false) => {
    try {
      if (force) invalidateCache('admin-notifications');
      const data = await adminApi.listNotifications();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl border border-white/10 p-2 text-white/70 hover:bg-white/8 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-copper-500 px-1 text-[10px] font-bold text-navy-950">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-navy-900/95 shadow-glass backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <p className="text-sm font-semibold">{t('notify.title')}</p>
            <button
              type="button"
              className="text-xs text-copper-300"
              onClick={() => void adminApi.markNotificationsRead().then(() => load(true))}
            >
              {t('notify.markAll')}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.slice(0, 12).map((item) => (
              <li key={item.id} className={`border-b border-white/6 px-4 py-3 ${item.isRead ? 'opacity-60' : ''}`}>
                <p className="text-sm text-white">{noticeTitle(item, t)}</p>
                <p className="mt-0.5 text-xs text-white/45">
                  {item.message} · {relativeTime(item.createdAt)}
                </p>
              </li>
            ))}
            {items.length === 0 ? <li className="px-4 py-6 text-sm text-white/40">{t('notify.empty')}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
