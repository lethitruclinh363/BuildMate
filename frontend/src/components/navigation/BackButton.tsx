import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { goBackOrFallback } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export type BackButtonProps = {
  fallback: string;
  label?: string;
  preserveContext?: boolean;
  className?: string;
};

export function BackButton({ fallback, label, className }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const text = label || t('common.back');

  return (
    <button
      type="button"
      aria-label={text}
      onClick={() => goBackOrFallback(navigate, location, fallback)}
      className={cn(
        'mb-5 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-navy-700 hover:text-navy-900 hover:underline',
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {text}
    </button>
  );
}
