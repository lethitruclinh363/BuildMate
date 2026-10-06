import type { MouseEventHandler, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const itemListClass =
  'divide-y divide-navy-800/10 overflow-hidden rounded-xl border border-navy-800/10 bg-white';

export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('py-6 md:py-8', className)}>{children}</section>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase text-copper-500">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold text-navy-800">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** Compact bordered surface. No shadow. */
export function SoftCard({
  children,
  className,
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-navy-800/10 bg-white p-4 md:p-5',
        hover && 'transition-colors hover:border-navy-800/20',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Larger surface for maps, order detail, and verified info. */
export function DataPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-navy-800/10 bg-white p-5 md:p-6', className)}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-navy-800/10 bg-white p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-semibold text-navy-800">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function ListRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}
