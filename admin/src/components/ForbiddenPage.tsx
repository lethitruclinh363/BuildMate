import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-navy-950 p-6">
      <GlassCard className="max-w-md text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-copper-400" />
        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-copper-400">403</p>
        <h1 className="mt-2 font-display text-2xl text-white">{t('errors.forbiddenTitle')}</h1>
        <p className="mt-2 text-sm text-white/55">{t('errors.forbiddenBody')}</p>
        <Link
          to="/login"
          className="mt-6 inline-flex rounded-xl bg-copper-500 px-4 py-2.5 text-sm font-semibold text-navy-950"
        >
          {t('errors.backLogin')}
        </Link>
      </GlassCard>
    </div>
  );
}
