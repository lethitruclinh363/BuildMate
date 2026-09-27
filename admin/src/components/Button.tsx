import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50',
        variant === 'primary' && 'bg-copper-500 text-navy-950 hover:bg-copper-400',
        variant === 'ghost' && 'text-white/70 hover:bg-white/8 hover:text-white',
        variant === 'danger' && 'bg-red-500/15 text-red-300 hover:bg-red-500/25',
        variant === 'outline' && 'border border-white/15 text-white/80 hover:border-copper-500/50 hover:text-copper-300',
        className
      )}
      {...props}
    >
      {loading ? '…' : children}
    </button>
  );
}
