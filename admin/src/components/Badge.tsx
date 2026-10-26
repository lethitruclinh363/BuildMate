import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  copper: 'bg-[#EBF3F7] text-[#173B4F] border-[#D0E2EC]',
  navy: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
  info: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]',
  success: 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]',
  danger: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]',
  warn: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  purple: 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]',
};

export function Badge({ children, tone = 'navy' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        tones[tone] || tones.navy
      )}
    >
      {children}
    </span>
  );
}
