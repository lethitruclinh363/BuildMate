import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { guardNumberKeyDown, guardNumberPaste } from '@/lib/numeric-input';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type, min, onKeyDown, onPaste, ...props }, ref) => {
    const resolvedMin = type === 'number' && (min === undefined || min === '') ? 0 : min;
    return (
      <label className="block space-y-1.5" htmlFor={id}>
        {label ? (
          <span className="text-sm font-medium text-ink-800">{label}</span>
        ) : null}
        <input
          id={id}
          ref={ref}
          type={type}
          min={resolvedMin}
          className={cn(
            'h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink-800 outline-none transition',
            'placeholder:text-ink-400',
            'focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-ink-600 disabled:focus:border-slate-200 disabled:focus:ring-0',
            error ? 'border-red-400' : 'border-navy-800/10',
            className
          )}
          {...props}
          onKeyDown={(event) => {
            if (type === 'number') guardNumberKeyDown(event, resolvedMin);
            onKeyDown?.(event);
          }}
          onPaste={(event) => {
            if (type === 'number') guardNumberPaste(event, resolvedMin);
            onPaste?.(event);
          }}
        />
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
        {!error && hint ? <span className="text-xs text-ink-400">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = 'Input';
