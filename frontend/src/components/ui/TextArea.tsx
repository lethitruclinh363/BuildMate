import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <label className="block space-y-1.5" htmlFor={id}>
      {label ? <span className="text-sm font-semibold text-ink-800">{label}</span> : null}
      <textarea
        id={id}
        ref={ref}
        className={cn(
          'min-h-[120px] w-full rounded-2xl border bg-white/90 px-4 py-3 text-sm text-ink-800 outline-none transition',
          'placeholder:text-ink-400 focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10',
          error ? 'border-red-400' : 'border-navy-800/10',
          className
        )}
        {...props}
      />
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </label>
  )
);

TextArea.displayName = 'TextArea';
