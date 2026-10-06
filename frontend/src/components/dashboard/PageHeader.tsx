import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase text-copper-500">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-semibold leading-tight text-navy-800">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-400">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
