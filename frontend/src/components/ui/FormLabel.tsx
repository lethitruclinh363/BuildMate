import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Label text with a red asterisk on the same line when the field is required. */
export function FormLabel({
  children,
  required = false,
  optional,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  optional?: string;
  className?: string;
}) {
  return (
    <span className={cn('text-sm font-medium text-navy-800', className)}>
      {children}
      {required ? (
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      ) : null}
      {!required && optional ? <span className="ml-1 text-xs font-normal text-ink-400">({optional})</span> : null}
    </span>
  );
}
