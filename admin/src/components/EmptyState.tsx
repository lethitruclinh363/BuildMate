import type { ReactNode } from 'react';
import { GlassCard } from '@/components/GlassCard';

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <GlassCard className="grid place-items-center py-10 text-center">
      <div>
        {icon ? <div className="mx-auto mb-3 text-[#526477]">{icon}</div> : null}
        <p className="font-display text-base font-semibold text-[#16283C]">{title}</p>
        {body ? <p className="mt-1 text-sm text-[#526477]">{body}</p> : null}
      </div>
    </GlassCard>
  );
}
