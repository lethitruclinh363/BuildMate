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
    <div className="fixed inset-0 z-[70] grid place-items-start bg-black/40 p-4 pt-[12vh]" onClick={() => setSearchOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#E1E7ED] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#E1E7ED] px-4 py-3 bg-[#F8FAFC]">
          <Search className="h-4 w-4 text-[#2B6280]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-transparent text-sm text-[#16283C] outline-none placeholder:text-[#94A3B8]"
          />
          <kbd className="rounded border border-[#E1E7ED] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#526477]">ESC</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2 divide-y divide-[#E1E7ED]/50">
          {filtered.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-[#F8FAFC]"
                onClick={() => {
                  setSearchOpen(false);
                  navigate(hit.to);
                }}
              >
                <span>
                  <span className="block text-sm font-semibold text-[#16283C]">{hit.title}</span>
                  <span className="text-xs text-[#526477]">{hit.subtitle}</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-[0.14em] text-[#2B6280]">{t(`search.${hit.kind}`)}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-[#526477]">{t('search.empty')}</li> : null}
        </ul>
      </div>
    </div>
  );
}
