import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-copper-400">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 font-display text-3xl font-semibold text-white">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-white/55">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
