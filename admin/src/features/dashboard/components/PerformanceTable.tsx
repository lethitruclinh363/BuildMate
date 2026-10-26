import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GlassCard } from '@/components/GlassCard';
import { compactVnd } from '@/features/dashboard/lib/format';
import type { TopContractorRow } from '@/features/dashboard/types/dashboard.types';

const medals = ['🥇', '🥈', '🥉', '4', '5'];

export const PerformanceTable = memo(function PerformanceTable({ rows }: { rows: TopContractorRow[] }) {
  const { t } = useTranslation();
  return (
    <GlassCard>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.top')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.topTitle')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-[#E1E7ED] text-xs font-semibold uppercase tracking-wider text-[#526477]">
            <tr>
              <th className="pb-3">{t('dash.rank')}</th>
              <th className="pb-3">{t('dash.business')}</th>
              <th className="pb-3">{t('dash.orders')}</th>
              <th className="pb-3">{t('dash.rating')}</th>
              <th className="pb-3">{t('dash.revenue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E1E7ED]">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-[#F8FAFC]">
                <td className="py-3 font-medium">{medals[row.rank - 1] || row.rank}</td>
                <td className="py-3">
                  <Link to="/contractors" className="font-medium text-[#2B6280] hover:underline">
                    {row.name || t('roles.CONTRACTOR')}
                  </Link>
                </td>
                <td className="py-3 text-[#16283C]">{row.orders}</td>
                <td className="py-3 font-semibold text-[#B45309]">{row.rating.toFixed(1)} ★</td>
                <td className="py-3 font-semibold text-[#16283C]">{compactVnd(row.revenue)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#7E92A2]">
                  {t('dash.noCrews')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
});
