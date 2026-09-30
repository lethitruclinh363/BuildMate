import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/GlassCard';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[50vh] place-items-center p-6">
      <GlassCard className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-copper-400">404</p>
        <h1 className="mt-2 font-display text-2xl text-white">{t('errors.notFound')}</h1>
        <Link to="/dashboard" className="mt-5 inline-block text-sm text-copper-300">
          {t('errors.returnDash')}
        </Link>
      </GlassCard>
    </div>
  );
}
