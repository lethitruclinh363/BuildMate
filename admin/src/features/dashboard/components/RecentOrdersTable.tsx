import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { GlassCard } from '@/components/GlassCard';
import { relativeTime } from '@/features/dashboard/lib/format';
import { orderStatusLabel, vnd } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';
import type { RecentOrderRow } from '@/features/dashboard/types/dashboard.types';

function statusTone(status: string): 'navy' | 'warn' | 'success' | 'danger' | 'copper' {
  if (status === 'CUSTOMER_ACCEPTED') return 'success';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'COMPLETED' || status === 'DEPOSIT_PAID') return 'warn';
  if (status === 'STARTED' || status === 'IN_PROGRESS') return 'copper';
  return 'navy';
}

export const RecentOrdersTable = memo(function RecentOrdersTable({ rows }: { rows: RecentOrderRow[] }) {
  const back = useReturnState();
  const { t } = useTranslation();
  return (
    <GlassCard>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.ops')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.recent')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#E1E7ED] text-xs font-semibold uppercase tracking-wider text-[#526477]">
            <tr>
              <th className="pb-3">{t('dash.orderCode')}</th>
              <th className="pb-3">{t('dash.customer')}</th>
              <th className="pb-3">{t('dash.contractor')}</th>
              <th className="pb-3">{t('dash.amount')}</th>
              <th className="pb-3">{t('common.status')}</th>
              <th className="pb-3">{t('dash.time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E1E7ED]">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-[#F8FAFC]">
                <td className="py-3">
                  <Link to={`/orders/${row.id}`} state={back} className="font-medium text-[#2B6280] hover:underline">
                    {row.orderCode}
                  </Link>
                </td>
                <td className="py-3 text-[#16283C]">{row.customer}</td>
                <td className="py-3 text-[#16283C]">{row.contractor}</td>
                <td className="py-3 font-medium text-[#16283C]">{vnd(row.amount)}</td>
                <td className="py-3">
                  <Badge
                    tone={
                      row.status === 'QUOTATION_ACCEPTED' || row.status === 'QUOTATION_SENT' || row.status === 'REQUEST_CREATED'
                        ? 'info'
                        : statusTone(row.status)
                    }
                  >
                    {orderStatusLabel(row.status)}
                  </Badge>
                </td>
                <td className="py-3 text-[#7E92A2]">{relativeTime(row.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[#7E92A2]">
                  {t('dash.noOrders')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
});
