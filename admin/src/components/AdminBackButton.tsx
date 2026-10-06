import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { goBackOrFallback } from '@/lib/navigation';

export function AdminBackButton({ fallback, label }: { fallback: string; label?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const text = label || t('common.back');

  return (
    <button
      type="button"
      aria-label={text}
      onClick={() => goBackOrFallback(navigate, location, fallback)}
      className="mb-4 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm text-copper-300 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {text}
    </button>
  );
}
