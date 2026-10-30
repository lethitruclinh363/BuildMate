import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function PageHeader({ eyebrow, title, description, actions, className, compact }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', compact && 'mb-1.5 gap-1', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase text-copper-500">{eyebrow}</p> : null}
        <h1 className={cn('font-display text-3xl font-semibold leading-tight text-navy-800', compact && 'text-xl leading-none lg:text-2xl')}>
          {title}
        </h1>
        {description ? (
          <p className={cn('mt-1 max-w-2xl text-sm text-ink-400', compact && 'mt-0.5 max-w-3xl text-xs leading-snug lg:text-sm')}>{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
