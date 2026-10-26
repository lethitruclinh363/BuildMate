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
          <p className="text-xs font-semibold uppercase tracking-wider text-[#2B6280]">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 font-display text-2xl lg:text-[1.75rem] font-bold leading-tight text-[#16283C]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-[#526477]">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
