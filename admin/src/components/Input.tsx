import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: FieldProps) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{label}</span>
      <input
        id={id}
        className={cn(
          'w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-copper-500/60 focus:shadow-copper',
          className
        )}
        {...props}
      />
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-copper-500/60"
      />
    </label>
  );
}
