import type { ReactNode } from 'react';
import { GlassCard } from '@/components/GlassCard';

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <GlassCard className="grid min-h-[220px] place-items-center text-center">
      <div>
        {icon ? <div className="mx-auto mb-3 text-copper-400">{icon}</div> : null}
        <p className="font-display text-lg text-white">{title}</p>
        {body ? <p className="mt-1 text-sm text-white/50">{body}</p> : null}
      </div>
    </GlassCard>
  );
}
