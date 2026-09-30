import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => (
    <label className="block space-y-1.5" htmlFor={id}>
      {label ? <span className="text-sm font-semibold text-ink-800">{label}</span> : null}
      <select
        id={id}
        ref={ref}
        className={cn(
          'h-12 w-full rounded-2xl border bg-white/90 px-4 text-sm text-ink-800 outline-none transition',
          'focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10',
          error ? 'border-red-400' : 'border-navy-800/10',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  )
);

Select.displayName = 'Select';
