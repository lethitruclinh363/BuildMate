import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: FieldProps) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{label}</span>
      <input
        id={id}
        className={cn(
          'w-full rounded-lg border border-[#E1E7ED] bg-white px-3.5 py-2 text-sm text-[#16283C] outline-none placeholder:text-[#94A3B8] transition focus:border-[#2B6280] focus:ring-1 focus:ring-[#2B6280]',
          className
        )}
        {...props}
      />
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
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
      <span className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#E1E7ED] bg-white px-3.5 py-2.5 text-sm text-[#16283C] outline-none placeholder:text-[#94A3B8] transition focus:border-[#2B6280] focus:ring-1 focus:ring-[#2B6280]"
      />
    </label>
  );
}
