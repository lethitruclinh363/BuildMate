import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide',
  {
    variants: {
      tone: {
        navy: 'bg-navy-800 text-paper-50',
        copper: 'bg-copper-100 text-copper-700',
        mist: 'bg-mist-200 text-ink-600',
        success: 'bg-emerald-100 text-emerald-800',
        warn: 'bg-amber-100 text-amber-800',
        danger: 'bg-red-100 text-red-700',
      },
    },
    defaultVariants: { tone: 'mist' },
  }
);

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
