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
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold text-white">{value}</p>
          {hint ? <p className="mt-1 text-xs text-copper-300/80">{hint}</p> : null}
        </div>
        {icon ? <div className="rounded-xl border border-copper-500/20 bg-copper-500/10 p-2 text-copper-400">{icon}</div> : null}
      </div>
    </GlassCard>
  );
}
