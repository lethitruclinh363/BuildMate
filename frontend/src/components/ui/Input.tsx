import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    return (
      <label className="block space-y-1.5" htmlFor={id}>
        {label ? (
          <span className="text-sm font-semibold text-ink-800">{label}</span>
        ) : null}
        <input
          id={id}
          ref={ref}
          className={cn(
            'h-12 w-full rounded-2xl border bg-white/90 px-4 text-sm text-ink-800 outline-none transition',
            'placeholder:text-ink-400',
            'focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10 disabled:bg-paper-100 disabled:text-ink-400',
            error ? 'border-red-400' : 'border-navy-800/10',
            className
          )}
          {...props}
        />
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
        {!error && hint ? <span className="text-xs text-ink-400">{hint}</span> : null}
      </label>
    );
  }
);

Input.displayName = 'Input';
