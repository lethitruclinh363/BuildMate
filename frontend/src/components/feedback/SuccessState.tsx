import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface SuccessStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  extra?: ReactNode;
}

export function SuccessState({ title, body, actionLabel, onAction, extra }: SuccessStateProps) {
  return (
    <div className="grid place-items-center rounded-[22px] border border-emerald-100 bg-white px-6 py-16 text-center shadow-card">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-2xl text-navy-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-400">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-6" variant="copper" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {extra}
    </div>
  );
}
