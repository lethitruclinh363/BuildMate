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
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-[#173B4F] text-white shadow-sm hover:bg-[#102D3D] active:bg-[#0A1F2C]',
        variant === 'ghost' && 'text-[#526477] hover:bg-[#F1F5F9] hover:text-[#16283C]',
        variant === 'danger' && 'border border-[#FECACA] bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FCDAD7] active:bg-[#F8B4B4]',
        variant === 'outline' && 'border border-[#E1E7ED] bg-white text-[#16283C] shadow-sm hover:bg-[#F8FAFC] hover:border-[#CCD6E0] active:bg-[#F1F5F9]',
        className
      )}
      {...props}
    >
      {loading ? '…' : children}
    </button>
  );
}
