import type { ReactNode } from 'react';
import { GlassCard } from '@/components/GlassCard';

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{label}</p>
          <p className="mt-1.5 font-display text-2xl lg:text-3xl font-bold text-[#16283C]">{value}</p>
          {hint ? <p className="mt-1 text-xs font-medium text-[#2B6280]">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-2.5 text-[#2B6280]">
            {icon}
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
