import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="grid place-items-center rounded-[22px] border border-dashed border-navy-800/15 bg-white/60 px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-800 text-paper-50">{icon}</div>
      <h3 className="mt-4 font-display text-2xl text-navy-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-400">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
