import type { ClipboardEvent, InputHTMLAttributes, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

function floorOf(min?: string | number) {
  if (min == null || min === '') return 0;
  const parsed = Number(min);
  return Number.isFinite(parsed) ? parsed : 0;
}

function guardKeyDown(event: KeyboardEvent<HTMLInputElement>, min?: string | number) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'e' || event.key === 'E' || event.key === '+') event.preventDefault();
  if (floorOf(min) >= 0 && (event.key === '-' || event.key === 'Minus')) event.preventDefault();
}

function guardPaste(event: ClipboardEvent<HTMLInputElement>, min?: string | number) {
  const text = event.clipboardData?.getData('text') ?? '';
  const parsed = Number(text.trim());
  if (text.trim() === '') return;
  if (!Number.isFinite(parsed) || parsed < floorOf(min)) event.preventDefault();
}

export function Input({ label, error, className, id, type, min, onKeyDown, onPaste, ...props }: FieldProps) {
  const resolvedMin = type === 'number' && (min === undefined || min === '') ? 0 : min;
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{label}</span>
      <input
        id={id}
        type={type}
        min={resolvedMin}
        className={cn(
          'w-full rounded-lg border border-[#E1E7ED] bg-white px-3.5 py-2 text-sm text-[#16283C] outline-none placeholder:text-[#94A3B8] transition focus:border-[#2B6280] focus:ring-1 focus:ring-[#2B6280]',
          className
        )}
        {...props}
        onKeyDown={(event) => {
          if (type === 'number') guardKeyDown(event, resolvedMin);
          onKeyDown?.(event);
        }}
        onPaste={(event) => {
          if (type === 'number') guardPaste(event, resolvedMin);
          onPaste?.(event);
        }}
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
