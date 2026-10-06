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
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.top')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.topTitle')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-sm text-white/55">
            <tr>
              <th className="pb-3">{t('dash.rank')}</th>
              <th className="pb-3">{t('dash.business')}</th>
              <th className="pb-3">{t('dash.orders')}</th>
              <th className="pb-3">{t('dash.rating')}</th>
              <th className="pb-3">{t('dash.revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/6">
                <td className="py-3">{medals[row.rank - 1] || row.rank}</td>
                <td className="py-3">
                  <Link to="/contractors" className="text-white hover:text-copper-300">
                    {row.name || t('roles.CONTRACTOR')}
                  </Link>
                </td>
                <td className="py-3 text-white/70">{row.orders}</td>
                <td className="py-3 text-copper-300">{row.rating.toFixed(1)}</td>
                <td className="py-3">{compactVnd(row.revenue)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-white/40">
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
