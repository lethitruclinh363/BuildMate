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
    <div className="grid place-items-center px-4 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-navy-800/10 text-navy-800">{icon}</div>
      <h3 className="mt-3 text-lg font-semibold text-navy-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-400">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
