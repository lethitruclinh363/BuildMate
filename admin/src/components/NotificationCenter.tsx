import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const ADMIN_ROOTS = [
  '/dashboard',
  '/users',
  '/contractors',
  '/material-stores',
  '/partners',
  '/verification',
  '/verifications',
  '/orders',
  '/services',
  '/payments',
  '/commission',
  '/reviews',
  '/complaints',
  '/audit',
  '/settings',
  '/policies',
  '/notifications',
];

function noticeTitle(item: AdminNotification, translate: (key: string) => string) {
  const key = LEGACY_WORKER_NOTICE[item.type] || LEGACY_WORKER_NOTICE[item.title];
  return key ? translate(key) : item.title;
}

export function adminNotificationHref(link?: string) {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  const path = link.split(/[?#]/)[0];
  if (path === '/analytics' || path.startsWith('/analytics/')) return '/dashboard';
  const allowed = ADMIN_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
  return allowed ? link : null;
}

function byNewest(items: AdminNotification[]) {
  return [...items].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
}

type AnchorBox = { right: number; width: number };

function placeDropdown(anchor: HTMLElement): AnchorBox {
  const rect = anchor.getBoundingClientRect();
  const gutter = 12;
  const width = Math.min(380, window.innerWidth - gutter * 2);
  let rightEdge = rect.right;
  if (rightEdge - width < gutter) rightEdge = gutter + width;
  if (rightEdge > window.innerWidth - gutter) rightEdge = window.innerWidth - gutter;
  return { right: rect.right - rightEdge, width };
}

export function AdminNotificationList({
  items,
  onOpen,
}: {
  items: AdminNotification[];
  onOpen: (item: AdminNotification) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {byNewest(items).map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`admin-notify__item${item.isRead ? '' : ' admin-notify__item--unread'}`}
            onClick={() => onOpen(item)}
          >
            <span className="admin-notify__dot" aria-hidden="true" />
            <span className="admin-notify__copy">
              <p className="admin-notify__title">{noticeTitle(item, t)}</p>
              {item.message ? <p className="admin-notify__body">{item.message}</p> : null}
              <p className="admin-notify__time">{relativeTime(item.createdAt)}</p>
            </span>
          </button>
        </li>
      ))}
    </>
  );
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<AnchorBox | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = async (force = false) => {
    try {
      if (force) invalidateCache('admin-notifications');
      const data = await adminApi.listNotifications();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
      setUnread(0);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!root.current) return;
      const next = placeDropdown(root.current);
      setBox((prev) => (prev && prev.right === next.right && prev.width === next.width ? prev : next));
    };
    update();
    const header = root.current?.closest('header');
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    if (header) observer.observe(header);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = () => {
    const previous = items;
    const previousUnread = unread;
    setItems((rows) => rows.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
    void adminApi.markNotificationsRead().catch(() => {
      setItems(previous);
      setUnread(previousUnread);
    });
  };

  const openItem = (item: AdminNotification) => {
    if (!item.isRead) {
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
      setUnread((count) => Math.max(0, count - 1));
      void adminApi.markNotificationRead(item.id).catch(() => {
        void load(true);
      });
    }
    setOpen(false);
    const href = adminNotificationHref(item.link);
    if (href) navigate(href);
  };

  const visible = byNewest(items).slice(0, 12);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-label={t('notify.aria')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (root.current) setBox(placeDropdown(root.current));
          setOpen((value) => !value);
        }}
        className="relative flex items-center justify-center rounded-lg border border-[#E1E7ED] bg-[#F8FAFC] p-2 text-[#2B6280] transition-colors hover:bg-[#EBF3F7] hover:text-[#173B4F] hover:border-[#2B6280]/40"
      >
        <Bell className="h-4 w-4 text-[#2B6280]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#E05252] px-1 text-[10px] font-bold text-white shadow-sm">
            {unread}
          </span>
        ) : null}
      </button>
      {open && box ? (
        <div
          className="admin-notify"
          role="dialog"
          aria-label={t('notify.title')}
          style={{ right: box.right, width: box.width }}
        >
          <div className="admin-notify__head">
            <p className="admin-notify__heading">{t('notify.title')}</p>
            <button type="button" className="admin-notify__mark" onClick={markAll}>
              {t('notify.markAll')}
            </button>
          </div>
          <ul className="admin-notify__list">
            {!ready ? (
              <li className="admin-notify__empty">…</li>
            ) : visible.length === 0 ? (
              <li className="admin-notify__empty">{t('notify.empty')}</li>
            ) : (
              <AdminNotificationList items={visible} onOpen={openItem} />
            )}
          </ul>
          <button
            type="button"
            className="admin-notify__all"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            {t('notify.viewAll')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
