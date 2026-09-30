import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  copper: 'bg-copper-500/15 text-copper-300 border-copper-500/25',
  navy: 'bg-white/8 text-white/70 border-white/10',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  danger: 'bg-red-500/15 text-red-300 border-red-500/20',
  warn: 'bg-amber-500/15 text-amber-200 border-amber-500/20',
};

export function Badge({ children, tone = 'navy' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}
