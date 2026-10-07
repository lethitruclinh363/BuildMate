import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUiStore } from '@/stores/ui.store';
import { loadAdminDirectory } from '@/hooks/useDirectory';
import { adminApi } from '@/services/admin.api';
import { vnd } from '@/lib/utils';
import type { SearchHit } from '@/features/dashboard/types/dashboard.types';

export function GlobalSearch() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.searchOpen);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(!useUiStore.getState().searchOpen);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([loadAdminDirectory(), adminApi.listCustomers().catch(() => [])]).then(([directory, customers]) => {
      const next: SearchHit[] = [
        ...customers.map((user) => ({
          id: user.id,
          kind: 'user' as const,
          title: user.name,
          subtitle: user.email,
          to: `/users/${user.id}`,
        })),
        ...directory.verifications
          .filter((row) => row.user?.role === 'CONTRACTOR' || row.user?.role === 'MATERIAL_STORE_OWNER')
          .map((row) => ({
            id: String(row.user?.id || row.userId || row.id),
            kind: 'contractor' as const,
            title: row.businessName || row.user?.name || t('search.partner'),
            subtitle: row.user?.email || row.user?.role || '',
            to: row.user?.role === 'MATERIAL_STORE_OWNER' ? '/material-stores' : '/contractors',
          })),
        ...directory.orders.map((order) => ({
          id: order.id,
          kind: 'order' as const,
          title: order.orderCode,
          subtitle: order.title,
          to: `/orders/${order.id}`,
        })),
        ...directory.payments.map((pay) => ({
          id: pay.id,
          kind: 'payment' as const,
          title: vnd(pay.amount),
          subtitle: pay.status,
          to: `/orders/${pay.orderId}`,
        })),
      ];
      setHits(next);
    });
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hits.slice(0, 12);
    return hits.filter((hit) => `${hit.title} ${hit.subtitle} ${hit.kind}`.toLowerCase().includes(q)).slice(0, 12);
  }, [hits, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-start bg-black/55 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
      <div
        className="glass-card w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <Search className="h-4 w-4 text-copper-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/40">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/6"
                onClick={() => {
                  setSearchOpen(false);
                  navigate(hit.to);
                }}
              >
                <span>
                  <span className="block text-sm text-white">{hit.title}</span>
                  <span className="text-xs text-white/40">{hit.subtitle}</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-copper-400">{t(`search.${hit.kind}`)}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-white/40">{t('search.empty')}</li> : null}
        </ul>
      </div>
    </div>
  );
}
